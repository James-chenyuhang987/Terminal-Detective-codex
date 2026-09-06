"""Dependency-free GLB/accessor/skin/animation and theater navigation validator."""
import argparse
from collections import deque
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[2]
COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def load_glb(path):
    raw = path.read_bytes()
    assert len(raw) >= 20, f'{path}: truncated GLB'
    magic, version, length = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and length == len(raw), f'{path}: invalid header'
    chunks, offset = [], 12
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        assert size % 4 == 0 and offset+8+size <= len(raw), f'{path}: invalid chunk'
        chunks.append((kind, raw[offset+8:offset+8+size]))
        offset += 8+size
    assert len(chunks) == 2 and chunks[0][0] == 0x4E4F534A and chunks[1][0] == 0x004E4942
    doc, binary = json.loads(chunks[0][1]), chunks[1][1]
    assert doc['asset']['version'] == '2.0'
    assert len(doc['scenes']) == 1, 'Export only the active asset scene, not the complete source library'
    assert not doc.get('cameras') and not doc.get('extensions', {}).get('KHR_lights_punctual')
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    assert doc['buffers'][0]['byteLength'] <= len(binary)
    assert not doc.get('images') and not doc.get('textures'), 'Assets must remain texture-free'
    assert not doc.get('extensionsRequired'), 'Assets must load without decoder dependencies'
    for view in doc.get('bufferViews', []):
        assert view['buffer'] == 0 and view.get('byteOffset', 0)+view['byteLength'] <= doc['buffers'][0]['byteLength']
    return doc, binary


def accessor(doc, binary, index):
    item = doc['accessors'][index]
    assert not item.get('sparse'), 'Sparse data not expected in the procedural library'
    view = doc['bufferViews'][item['bufferView']]
    fmt, width = COMPONENTS[item['componentType']]
    count = WIDTHS[item['type']]
    stride = view.get('byteStride', count*width)
    offset = view.get('byteOffset', 0)+item.get('byteOffset', 0)
    assert stride >= count*width
    assert item.get('byteOffset', 0)+(item['count']-1)*stride+count*width <= view['byteLength']
    result = [struct.unpack_from('<'+fmt*count, binary, offset+i*stride) for i in range(item['count'])]
    assert all(math.isfinite(value) for row in result for value in row)
    if 'min' in item:
        assert all(abs(min(row[j] for row in result)-v) < 1e-4 for j,v in enumerate(item['min']))
    if 'max' in item:
        assert all(abs(max(row[j] for row in result)-v) < 1e-4 for j,v in enumerate(item['max']))
    return result


def identity():
    return [[1 if i == j else 0 for j in range(4)] for i in range(4)]


def multiply(a, b):
    return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][j*4+i] for j in range(4)] for i in range(4)]
    x,y,z,w = node.get('rotation', [0,0,0,1])
    sx,sy,sz = node.get('scale', [1,1,1])
    tx,ty,tz = node.get('translation', [0,0,0])
    return [[(1-2*(y*y+z*z))*sx, 2*(x*y-z*w)*sy, 2*(x*z+y*w)*sz, tx],
            [2*(x*y+z*w)*sx, (1-2*(x*x+z*z))*sy, 2*(y*z-x*w)*sz, ty],
            [2*(x*z-y*w)*sx, 2*(y*z+x*w)*sy, (1-2*(x*x+y*y))*sz, tz], [0,0,0,1]]


def inspect_glb(path):
    doc, binary = load_glb(path)
    arrays = [accessor(doc, binary, i) for i in range(len(doc.get('accessors', [])))]
    triangles, points, skin_meshes = 0, [], 0
    def visit(index, parent, ancestors):
        nonlocal triangles, skin_meshes
        assert index not in ancestors, 'Node cycle'
        node = doc['nodes'][index]
        transform = multiply(parent, matrix(node))
        if 'mesh' in node:
            if 'skin' in node:
                skin_meshes += 1
                skin = doc['skins'][node['skin']]
                assert len(set(skin['joints'])) == len(skin['joints']) >= 15
                assert all(0 <= j < len(doc['nodes']) for j in skin['joints'])
                assert len(arrays[skin['inverseBindMatrices']]) == len(skin['joints'])
            for prim in doc['meshes'][node['mesh']]['primitives']:
                assert prim.get('mode', 4) == 4, 'Only triangle surfaces are supported'
                attrs = prim['attributes']
                vertices = arrays[attrs['POSITION']]
                indices = arrays[prim['indices']]
                assert len(indices)%3 == 0 and all(0 <= v[0] < len(vertices) for v in indices)
                triangles += len(indices)//3
                assert 'NORMAL' in attrs and len(arrays[attrs['NORMAL']]) == len(vertices)
                if 'skin' in node:
                    assert 'JOINTS_0' in attrs and 'WEIGHTS_0' in attrs
                    joints, weights = arrays[attrs['JOINTS_0']], arrays[attrs['WEIGHTS_0']]
                    assert len(joints) == len(weights) == len(vertices)
                    assert all(all(0 <= j < len(skin['joints']) for j in row) for row in joints)
                    assert all(abs(sum(row)-1) < 1e-4 and all(v >= 0 for v in row) for row in weights)
                for vertex in vertices:
                    p = (*vertex, 1)
                    points.append(tuple(sum(transform[i][j]*p[j] for j in range(4)) for i in range(3)))
        for child in node.get('children', []):
            visit(child, transform, ancestors | {index})
    for index in doc['scenes'][doc.get('scene', 0)]['nodes']:
        visit(index, identity(), set())
    assert points and triangles
    animations, durations = [], {}
    for animation in doc.get('animations', []):
        animations.append(animation['name'])
        durations[animation['name']] = 0
        changed = False
        for channel in animation['channels']:
            assert 0 <= channel['target']['node'] < len(doc['nodes'])
            assert channel['target']['path'] in {'translation','rotation','scale','weights'}
            sampler = animation['samplers'][channel['sampler']]
            times, values = arrays[sampler['input']], arrays[sampler['output']]
            assert len(times) == len(values) and len(times) >= 1
            assert all(a[0] < b[0] for a,b in zip(times,times[1:]))
            assert times[0][0] == 0, 'Authored clips must start at zero, not contain an exporter lead-in frame'
            durations[animation['name']] = max(durations[animation['name']], times[-1][0])
            if channel['target']['path'] == 'rotation':
                assert all(abs(sum(v*v for v in row)-1) < 1e-4 for row in values), 'Invalid rotation quaternion'
                error = min(max(abs(a-b) for a,b in zip(values[0],values[-1])),
                            max(abs(a+b) for a,b in zip(values[0],values[-1])))
            else:
                error = max(abs(a-b) for a,b in zip(values[0],values[-1]))
            assert error < 1e-5, f'{path.name}/{animation["name"]}: discontinuous loop endpoint'
            if len(values)>1 and any(any(abs(a-b)>1e-5 for a,b in zip(values[0], row)) for row in values[1:]):
                changed = True
        assert changed, f'{path.name}: {animation["name"]} is a static placeholder'
    return {'bytes':path.stat().st_size, 'triangles':triangles, 'meshes':len(doc['meshes']),
            'materials':len(doc.get('materials', [])), 'animations':animations,'durations':durations,'skinnedMeshes':skin_meshes,
            'bounds':{'min':[round(min(p[i] for p in points),5) for i in range(3)],
                      'max':[round(max(p[i] for p in points),5) for i in range(3)]}}


def validate_navigation(scene):
    boxes = scene['colliders']
    assert boxes and len({b['id'] for b in boxes}) == len(boxes)
    for box in boxes:
        assert len(box['min']) == len(box['max']) == 2
        assert all(math.isfinite(n) for n in box['min']+box['max'])
        assert all(a < b for a,b in zip(box['min'],box['max']))
    # Inflate by an avatar radius; prove each advertised spot connects to spawn.
    radius, step = .25, .1
    def blocked(x,z):
        return any(b['min'][0]-radius < x < b['max'][0]+radius and
                   b['min'][1]-radius < z < b['max'][1]+radius for b in boxes)
    def cell(position):
        return (round(position[0]/step),round(position[2]/step))
    spawn = scene['spawn']
    assert spawn == [0,0,3] and not blocked(spawn[0],spawn[2])
    reached = {cell(spawn)}
    queue = deque(reached)
    while queue:
        x,z = queue.popleft()
        for nx,nz in ((x-1,z),(x+1,z),(x,z-1),(x,z+1)):
            if (nx,nz) in reached or not (-55 <= nx <= 55 and -47 <= nz <= 46) or blocked(nx*step,nz*step):
                continue
            reached.add((nx,nz))
            queue.append((nx,nz))
    for spot in scene['doors']+scene['hotspots']+scene['npcs']:
        p=spot['position']
        assert p[1] == 0 and not blocked(p[0],p[2]), f'Blocked spot {spot}'
        assert cell(p) in reached, f'Unreachable spot {spot}'


def validate(directory):
    manifest = json.loads((directory/'manifest.json').read_text())
    assert manifest['version'] == 1 and manifest['units'] == 'meters'
    assert manifest['upAxis'] == 'Y' and manifest['forwardAxis'] == '+Z'
    assert set(manifest['scenes']) == {'office','datacenter','lobby','laboratory','balcony'}
    assert set(manifest['characters']) == {'detective','witness','security','scientist'}
    total=0
    for group in ('scenes','characters'):
        for name, entry in manifest[group].items():
            assert entry['file'] == name+'.glb'
            info=inspect_glb(directory/entry['file'])
            for key in ('bytes','triangles','bounds','meshes','materials'):
                assert entry[key] == info[key], f'{name}: manifest mismatch for {key}'
            assert info['bytes'] < 2_000_000, f'{name}: exceeds 2MB'
            total += info['bytes']
            lo,hi=info['bounds']['min'],info['bounds']['max']
            if group == 'scenes':
                assert lo[0] >= -6.001 and hi[0] <= 6.001 and lo[2] >= -5.001 and hi[2] <= 5.001, info['bounds']
                assert -.3 <= lo[1] <= 0 and hi[1] <= 3.5
                assert info['skinnedMeshes'] == 0 and not info['animations']
                validate_navigation(entry)
            else:
                assert abs(lo[1]) < .001 and 1.68 < hi[1] < 1.9, info['bounds']
                assert info['skinnedMeshes'] >= 1
                assert set(info['animations']) == {'Idle','Walk','Talk'} and len(info['animations']) == 3
                assert entry['animations'] == info['animations']
                assert entry['forward'] == '+Z' and entry['feetY'] == 0
                assert info['durations'] == {'Idle':2,'Walk':1,'Talk':2}
                assert entry['locomotion'] == {'speed':1.4,'duration':1}
                assert abs(entry['height']-(hi[1]-lo[1])) < .001
            print(f'{name:12} {info["bytes"]:8,d} bytes  {info["triangles"]:6,d} triangles  {", ".join(info["animations"])}')
    assert total == manifest['totalBytes'] and total < 8_000_000
    print(f'PASS: nine original GLBs, all navigation spots reachable, {total:,} total bytes')
    return manifest


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets-dir',type=Path,default=ROOT/'public/assets/theater')
    validate(parser.parse_args().assets_dir)
