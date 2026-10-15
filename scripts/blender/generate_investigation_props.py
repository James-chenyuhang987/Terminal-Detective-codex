"""Small original, texture-free investigation prop library; never modifies character sources."""
import argparse
import json
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-output', type=Path, required=True)
opts = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
source = opts.source_output.resolve()
if not bpy.app.background or source.suffix != '.blend' or source.exists() or ROOT / 'art' in source.parents:
    parser.error('Use background mode and a NEW .blend outside the original art directory')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
OUT = ROOT / 'public/assets/theater'
materials = {}
for name, color, rough, metal in [('paper', (.80, .74, .60), .85, 0), ('housing', (.07, .12, .16), .6, .4),
                                 ('glass', (.15, .46, .48), .3, .2), ('screen', (.025, .18, .22), .4, .15),
                                 ('mark', (.22, .70, .70), .6, .1), ('seal', (.66, .34, .14), .7, 0),
                                 ('ink', (.09, .11, .12), .9, 0)]:
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    materials[name] = material


def point(p):
    return (p[0], -p[2], p[1])


def box(name, p, size, material, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(p))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    if bevel:
        modifier = obj.modifiers.new('Rounded manufactured edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def cylinder(name, p, radius, height, material):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=height, location=point(p))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(materials[material])
    bevel = obj.modifiers.new('Rounded vessel lip', 'BEVEL')
    bevel.width = .003
    bevel.segments = 1
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


roots = {}
for kind, name in [('document', 'DocumentProp'), ('terminal', 'TerminalProp'), ('sample', 'SampleProp'), ('device', 'DeviceProp')]:
    before = set(bpy.data.objects)
    if kind == 'document':
        box('Case folder cover', (0, .018, 0), (.36, .036, .28), 'housing')
        box('Loose paper stack', (0, .047, .008), (.31, .022, .23), 'paper', .003)
        box('Custody seal', (.115, .06, .052), (.054, .006, .084), 'seal', .001)
        for line in range(6):
            box('Visible printed line', (-.036, .06, -.072 + line * .024), (.13 if line % 2 else .18, .002, .003), 'ink', 0)
        box('Folder tab', (-.108, .032, -.149), (.105, .014, .032), 'paper', .003)
    elif kind == 'terminal':
        box('Console base', (0, .022, .02), (.39, .044, .26), 'housing')
        box('Display enclosure', (0, .181, -.063), (.34, .274, .046), 'housing')
        box('Display glass', (0, .183, -.036), (.294, .224, .007), 'screen', .003)
        for row in range(4):
            box('Public data row', (-.028, .252 - row * .036, -.031), (.20 - row * .02, .006, .003), 'mark', .001)
        for column in range(5):
            box('Key', (-.104 + column * .05, .048, .062), (.03, .008, .046), 'paper', .002)
    elif kind == 'sample':
        box('Sample rack', (0, .025, 0), (.32, .05, .22), 'housing')
        for index in range(3):
            x = -.09 + index * .09
            cylinder('Sealed specimen vial', (x, .116, 0), .026, .14, 'glass')
            cylinder('Tamper-proof cap', (x, .196, 0), .031, .024, 'seal')
            box('Specimen label', (x, .118, .027), (.032, .037, .002), 'paper', .001)
        box('Rack label', (0, .031, .113), (.15, .021, .006), 'paper', .001)
    else:
        box('Portable analyser chassis', (0, .063, 0), (.32, .126, .24), 'housing')
        box('Status display', (-.046, .129, -.024), (.15, .004, .096), 'screen', .002)
        for index in range(3):
            box('Meter segment', (-.095 + index * .04, .132, -.024), (.016, .003, .043), 'mark', .001)
        cylinder('Probe connector', (.104, .146, .024), .025, .044, 'seal')
        box('Visible sensor rail', (0, .018, .147), (.35, .033, .035), 'glass')
    parts = [obj for obj in bpy.data.objects if obj not in before]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = name + 'Mesh'
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    mesh.parent = root
    roots[kind] = name

source.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source))
output = OUT / 'investigation-props.glb'
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=False,
                         export_animations=False, export_cameras=False, export_lights=False,
                         export_yup=True, export_extras=False, export_apply=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from validate_assets import inspect_glb
info = inspect_glb(output)
metadata = {'version': 1, 'file': output.name, 'nodes': roots, **info}
(OUT / 'investigation-props.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(f'Investigation props: {info["bytes"]:,} bytes, {info["triangles"]:,} triangles; source {source}')
