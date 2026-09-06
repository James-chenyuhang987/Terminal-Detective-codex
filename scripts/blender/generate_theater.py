"""Original procedural Terminal Detective library. Run with Blender --background --python."""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
args = argparse.ArgumentParser()
args.add_argument('--preview-dir', type=Path)
args.add_argument('--skip-render', action='store_true')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
if not opts.skip_render and opts.preview_dir is None:
    args.error('--preview-dir must point to a session artifact directory, or use --skip-render')
sys.dont_write_bytecode = True
OUT = ROOT / 'public/assets/theater'
SOURCE = ROOT / 'art/theater'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
MAT = {}
CURRENT = None
PARTS = []


def material(name, color, metallic=0.0, rough=0.75, glow=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    if glow:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = glow
    MAT[name] = mat


for name, color, metal, rough, glow in [
    ('navy', (.027, .058, .099), .05, .82, 0),
    ('blue', (.068, .14, .205), .12, .7, 0),
    ('cream', (.72, .69, .57), 0, .88, 0),
    ('paper', (.92, .87, .69), 0, .88, 0),
    ('amber', (.95, .39, .055), .15, .45, .25),
    ('cyan', (.07, .66, .74), .1, .4, .6),
    ('screen', (.012, .075, .11), .15, .42, .2),
    ('light', (.18, .82, .88), 0, .5, 2),
    ('brass', (.38, .22, .085), .55, .4, 0),
    ('wood', (.20, .105, .065), 0, .85, 0),
    ('floor', (.115, .16, .195), .03, .92, 0),
    ('seam', (.036, .065, .088), 0, .95, 0),
    ('white', (.87, .91, .87), 0, .7, 0),
    ('ink', (.016, .027, .042), 0, .9, 0),
    ('skin-warm', (.62, .34, .20), 0, .9, 0),
    ('skin-peach', (.84, .52, .36), 0, .9, 0),
    ('skin-olive', (.56, .40, .24), 0, .9, 0),
    ('skin-pale', (.77, .65, .52), 0, .9, 0),
    ('hair-dark', (.028, .019, .031), 0, .93, 0),
    ('hair-brown', (.16, .074, .033), 0, .9, 0),
    ('hair-silver', (.51, .61, .63), .05, .85, 0),
    ('lip', (.31, .105, .074), 0, .9, 0),
    ('plant', (.07, .23, .19), 0, .9, 0),
    ('wine', (.24, .054, .073), 0, .8, 0),
]:
    material(name, color, metal, rough, glow)


def xyz(p):
    # Author in the runtime's right-handed Y-up space. Blender is Z-up.
    return (p[0], -p[2], p[1])


def new_scene(name):
    global CURRENT, PARTS
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    CURRENT = bpy.data.collections.new(name + '_LIBRARY')
    scene.collection.children.link(CURRENT)
    PARTS = []
    return scene


def finish(obj, name, mat, bone=None, bevel=0):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    CURRENT.objects.link(obj)
    obj.data.materials.append(MAT[mat])
    if obj.type == 'MESH':
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel:
            mod = obj.modifiers.new('Crafted edges', 'BEVEL')
            mod.width = bevel
            mod.segments = 1
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if bone:
            group = obj.vertex_groups.new(name=bone)
            group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    PARTS.append(obj)
    return obj


def box(name, p, size, mat='navy', bevel=.025, bone=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    return finish(obj, name, mat, bone, bevel)


def ellipsoid(name, p, size, mat, bone=None, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=xyz(p))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    finish(obj, name, mat, bone)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def rod(name, a, b, radius, mat='brass', bone=None, tip=None, vertices=12):
    av, bv = Vector(xyz(a)), Vector(xyz(b))
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if tip is None else tip,
                                   depth=(bv-av).length, location=(av+bv)*.5)
    obj = bpy.context.object
    obj.rotation_euler = (bv-av).to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat, bone)


def panel(name, verts, faces, mat, bone=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(p) for p in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    CURRENT.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return finish(obj, name, mat, bone)


def text(name, label, p, size=.18, mat='cream'):
    bpy.ops.object.text_add(location=xyz(p))
    obj = bpy.context.object
    obj.data.body = label
    obj.data.size = size
    obj.data.extrude = .001
    obj.data.align_x = 'CENTER'
    obj.rotation_euler = (math.pi/2, 0, 0)
    finish(obj, name, mat)
    bpy.ops.object.convert(target='MESH')
    return obj


def join_meshes(name):
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in PARTS if o.type == 'MESH']
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj


def collider(items, name, x, z, width, depth):
    items.append({'id': name, 'min': [round(x-width/2, 3), round(z-depth/2, 3)],
                  'max': [round(x+width/2, 3), round(z+depth/2, 3)]})


def monitor(x, y, z, label='TERMINAL'):
    box('Monitor plinth', (x, y+.03, z), (.5, .06, .28), 'blue')
    rod('Monitor neck', (x, y, z), (x, y+.34, z), .045)
    box('Monitor frame', (x, y+.52, z), (.91, .55, .12), 'navy', .045)
    box('Luminous display', (x, y+.52, z+.068), (.80, .43, .013), 'screen', .012)
    for j in range(4):
        box('Display trace', (x-.06+j*.03, y+.65-j*.08, z+.079), (.56-j*.08, .013, .008), 'cyan', .002)
    box('Status cursor', (x-.29, y+.65, z+.08), (.032, .028, .008), 'amber', .003)


def desk(x, z, kind='desk'):
    box(kind+' rounded top', (x, .84, z), (2.55, .13, 1.04), 'cream', .075)
    for side in (-1, 1):
        box(kind+' pedestal', (x+side*.87, .395, z), (.55, .79, .80), 'navy', .045)
        for j in range(3):
            box('Drawer face', (x+side*.87, .19+j*.23, z+.409), (.44, .19, .022), 'blue', .015)
            box('Drawer pull', (x+side*.87, .2+j*.23, z+.429), (.18, .025, .03), 'brass', .006)
    monitor(x-.30, .91, z-.15)
    box('Keyboard', (x-.3, .938, z+.26), (.64, .045, .23), 'blue', .02)
    for j in range(3):
        box('Keyboard rows', (x-.3, .965, z+.20+j*.058), (.54, .009, .022), 'cream', .001)
    rod('Ceramic cup', (x+.83, .91, z+.24), (x+.83, 1.07, z+.24), .075, 'amber', tip=.085)
    for i in range(3):
        obj = box('Case files', (x+.62, .925+i*.026, z-.18), (.37, .024, .42), 'paper', .005)
        obj.rotation_euler.z = .12*i


def plant(x, z, scale=1):
    rod('Planter', (x, 0, z), (x, .48*scale, z), .28*scale, 'cream', tip=.36*scale)
    for i in range(7):
        angle = i*2.399
        top = (x+math.sin(angle)*.36*scale, (.88+(i%3)*.16)*scale, z+math.cos(angle)*.28*scale)
        rod('Stem', (x, .4*scale, z), top, .017*scale, 'brass', vertices=6)
        leaf = ellipsoid('Sculptural leaf', top, (.14*scale, .32*scale, .07*scale), 'plant', segments=8, rings=4)
        leaf.rotation_euler.y = math.sin(angle)*.55


def evidence_table(x, z):
    box('Evidence island', (x, .42, z), (1.7, .84, 1.0), 'blue', .07)
    box('Evidence stone', (x, .90, z), (1.92, .13, 1.17), 'cream', .06)
    box('Inspection tray', (x, 1, z), (.92, .06, .61), 'navy', .018)
    ellipsoid('Recovered memory core', (x, 1.10, z), (.18, .09, .14), 'amber')
    rod('Evidence tag', (x+.55, .98, z+.2), (x+.55, 1.21, z+.2), .012)
    box('Tag face', (x+.55, 1.18, z+.2), (.2, .12, .026), 'paper', .008)
    for dx in (-.55, .55):
        box('Island light', (x+dx, .74, z+.512), (.24, .025, .016), 'cyan', .003)


def room_shell(scene_id, colliders):
    box('Floor foundation', (0, -.11, 0), (12, .22, 10), 'floor', .015)
    for x in range(-5, 6, 2):
        box('Floor inlay x', (x, .001, 0), (.014, .002, 9.8), 'seam', 0)
    for z in range(-4, 5, 2):
        box('Floor inlay z', (0, .001, z), (11.8, .002, .014), 'seam', 0)
    if scene_id == 'balcony':
        for x in (-5.86, 5.86):
            box('Parapet', (x, .39, 0), (.28, .78, 10), 'navy')
            rod('Handrail', (x, 1.16, -4.85), (x, 1.16, 4.85), .045)
            collider(colliders, 'side-parapet-'+str(x), x, 0, .28, 10)
        for x in (-3.37, 3.37):
            box('Rear parapet', (x, .39, -4.86), (5.26, .78, .28), 'navy')
            rod('Rear rail', (x-2.53, 1.16, -4.86), (x+2.53, 1.16, -4.86), .045)
            collider(colliders, 'rear-parapet-'+str(x), x, -4.86, 5.26, .28)
        for x in [-5.1, -4.1, -3.1, -2.1, 2.1, 3.1, 4.1, 5.1]:
            rod('Rail upright', (x, .65, -4.86), (x, 1.16, -4.86), .032)
    else:
        for x in (-5.86, 5.86):
            box('Cutaway side wall', (x, .75, 0), (.28, 1.5, 10), 'navy')
            box('Side cap', (x, 1.51, 0), (.28, .07, 10), 'brass', .012)
            collider(colliders, 'side-wall-'+str(x), x, 0, .28, 10)
        for x in (-3.37, 3.37):
            box('Back wall', (x, 1.65, -4.86), (5.26, 3.3, .28), 'blue')
            box('Back cream band', (x, 2.75, -4.7), (5.05, .50, .08), 'cream')
            collider(colliders, 'rear-wall-'+str(x), x, -4.67, 5.26, .66)
        for x in (-5.66, -3.9, -2.2, 2.2, 3.9, 5.66):
            box('Wall pilaster', (x, 1.64, -4.66), (.11, 3.22, .12), 'navy', .012)
            box('Pilaster insert', (x, 2.08, -4.58), (.026, .64, .022), 'amber', .004)
    for x in (-.82, .82):
        box('Portal jamb', (x, 1.35, -4.84), (.12, 2.7, .3), 'cream')
        box('Portal strip', (x, 1.37, -4.672), (.035, 2.4, .012), 'light', .004)
        collider(colliders, 'portal-jamb-'+str(x), x, -4.84, .12, .3)
    box('Portal lintel', (0, 2.70, -4.84), (1.76, .16, .3), 'cream')
    text('Exit sign', 'ACCESS / 2157', (0, 2.91, -4.67), .11, 'cyan')
    for x in (-1.05, 1.05):
        for z in (-3.9, -2.9, -1.9):
            box('Wayfinding inset', (x, .003, z), (.045, .006, .33), 'cyan', .004)


def make_room(scene_id):
    scene = new_scene('Scene_'+scene_id)
    colliders = []
    room_shell(scene_id, colliders)
    desk(-3.65, -2.75, 'Investigation console')
    collider(colliders, 'workstation', -3.65, -2.75, 2.65, 1.14)
    evidence_table(3.75, -2.85)
    collider(colliders, 'evidence-island', 3.75, -2.85, 2.02, 1.27)
    if scene_id == 'office':
        text('Room title', 'DETECTIVE BUREAU / 07', (-3.4, 2.85, -4.59), .17)
        box('Caseboard frame', (3.5, 1.98, -4.58), (3.05, 1.56, .14), 'brass')
        box('Caseboard', (3.5, 1.98, -4.48), (2.92, 1.43, .06), 'navy')
        pins = [(2.6, 2.25), (3.45, 2.4), (4.35, 2.12), (3.4, 1.68)]
        for i, (x, y) in enumerate(pins):
            box('Caseboard dossier', (x, y, -4.42), (.41, .39, .035), 'paper', .008)
            box('Dossier portrait', (x-.07, y+.055, -4.395), (.13, .13, .012), 'blue', .004)
            for row in range(3):
                box('Dossier rule', (x+.015, y-.04-row*.05, -4.393), (.23, .009, .009), 'brass', 0)
            if i:
                rod('Investigation thread', (*pins[i-1], -4.4), (x, y, -4.4), .008, 'amber', vertices=6)
        for j in range(3):
            box('Bookcase shelf', (-5.12, .36+j*.63, .65), (.95, .08, 2.05), 'wood')
            for i in range(7):
                box('Archive volume', (-5.14, .6+j*.63, -.18+i*.26), (.51, .39+(i%2)*.08, .19), ['cream', 'blue', 'wine'][i%3], .008)
        collider(colliders, 'archive-shelf', -5.1, .65, 1.07, 2.15)
        box('Waiting sofa', (4.8, .43, .65), (1.25, .72, 2.4), 'navy', .16)
        box('Sofa back', (5.27, .85, .65), (.32, .82, 2.4), 'blue', .12)
        for z in (-.17, .63, 1.43):
            box('Sofa cushion', (4.61, .79, z), (.93, .19, .72), 'cream', .09)
        collider(colliders, 'waiting-sofa', 4.8, .65, 1.35, 2.5)
    elif scene_id == 'datacenter':
        text('Room title', 'NEON BLOOD / DATA VAULT', (-3.37, 2.85, -4.59), .15)
        for x in (-4.8, -3.48, 2.42, 3.74, 5.06):
            box('Server cabinet', (x, 1.15, -4.0), (1.06, 2.3, 1.1), 'navy', .05)
            for i in range(7):
                box('Rack unit', (x, .24+i*.28, -3.43), (.92, .21, .04), 'blue', .015)
                for k in range(5):
                    box('Rack vent', (x-.28+k*.12, .24+i*.28, -3.401), (.04, .08, .015), 'ink', .002)
                ellipsoid('Rack LED', (x+.36, .24+i*.28, -3.393), (.018, .018, .011), 'cyan' if i%3 else 'amber', segments=8, rings=4)
            box('Rack header', (x, 2.13, -3.43), (.82, .04, .025), 'cyan', .006)
            collider(colliders, 'server-'+str(x), x, -4, 1.16, 1.2)
        for x in (-5.05, 5.05):
            box('Cooling column', (x, .9, .85), (.9, 1.8, 1.15), 'cream', .075)
            for y in (.53, 1.2):
                rod('Cooling fan', (x, y, 1.405), (x, y, 1.46), .27, 'navy', vertices=20)
                for j in range(5):
                    angle = j*math.tau/5
                    rod('Fan spoke', (x, y, 1.47), (x+math.cos(angle)*.23, y+math.sin(angle)*.23, 1.47), .025, 'blue', vertices=6)
            collider(colliders, 'cooling-'+str(x), x, .85, 1, 1.3)
    elif scene_id == 'lobby':
        text('Room title', 'AUREOLE / SKY RESIDENCE', (-3.37, 2.85, -4.59), .15)
        for x in (-4.3, -2.9, 2.9, 4.3):
            box('Surveillance frame', (x, 1.98, -4.61), (1.17, .79, .12), 'navy')
            box('Surveillance feed', (x, 1.98, -4.535), (1.04, .64, .02), 'screen')
            for i in range(3):
                box('Camera feed building', (x-.32+i*.3, 1.89, -4.516), (.20, .25+i*.075, .012), 'blue', .004)
            box('Camera recording', (x+.4, 2.21, -4.51), (.04, .04, .01), 'amber', .008)
        for x in (-4.95, 4.95):
            box('Lounge seat', (x, .47, .62), (1.06, .5, 2.22), 'cream', .13)
            box('Lounge back', (x+(.38 if x>0 else -.38), .84, .62), (.29, .87, 2.22), 'blue', .11)
            for z in (-.38, 1.62):
                box('Lounge arm', (x, .76, z), (1.03, .19, .20), 'brass', .06)
            collider(colliders, 'lounge-'+str(x), x, .62, 1.16, 2.32)
        rod('Sculpture pedestal', (3.85, 0, 3.08), (3.85, .58, 3.08), .47, 'cream', vertices=20)
        for i in range(3):
            obj = ellipsoid('Abstract orbit', (3.85, .98+i*.29, 3.08), (.37-i*.06, .22, .16), 'brass')
            obj.rotation_euler.y = i*.7
        collider(colliders, 'orbit-sculpture', 3.85, 3.08, 1.05, 1.05)
    elif scene_id == 'laboratory':
        text('Room title', 'VOSS / PRIVATE RESEARCH', (-3.37, 2.85, -4.59), .15)
        for x in (-4.45, -2.85, 2.85, 4.45):
            box('Lab wall locker', (x, 1.98, -4.39), (1.4, 1.04, .57), 'cream')
            box('Locker inset', (x, 1.98, -4.092), (1.13, .81, .022), 'blue')
            box('Locker pull', (x+.4, 1.93, -4.06), (.03, .28, .025), 'brass', .004)
            collider(colliders, 'lab-locker-'+str(x), x, -4.39, 1.5, .67)
        for x in (-5.0, 5.0):
            box('Lab equipment base', (x, .47, .8), (1.04, .94, 1.83), 'blue', .07)
            box('Lab equipment top', (x, .98, .8), (1.13, .09, 1.94), 'paper')
            collider(colliders, 'lab-bench-'+str(x), x, .8, 1.23, 2.04)
            for j in range(3):
                z = .12+j*.6
                rod('Specimen foot', (x, 1.03, z), (x, 1.13, z), .21, 'navy')
                rod('Specimen capsule', (x, 1.13, z), (x, 1.55, z), .13, 'cyan', tip=.09, vertices=16)
                rod('Specimen cap', (x, 1.54, z), (x, 1.63, z), .14, 'brass')
                ellipsoid('Capsule glow', (x, 1.36, z+.118), (.053, .12, .025), 'light')
        rod('Microscope stand', (3.22, 1, -2.7), (3.22, 1.43, -2.7), .046, 'cream')
        rod('Microscope ocular', (3.22, 1.43, -2.7), (3.42, 1.54, -2.6), .065, 'navy')
        box('Microscope stage', (3.22, 1.16, -2.55), (.25, .04, .25), 'navy')
    else:
        text('Room title', 'AUREOLE / ROOF GARDEN', (-3.35, .52, -4.695), .15)
        for x in (-4.75, 4.75):
            for z in (.05, 2.45):
                box('Roof raised planter', (x, .32, z), (1.43, .64, 1.85), 'navy', .09)
                box('Roof soil', (x, .655, z), (1.22, .05, 1.64), 'wood')
                for k in range(3):
                    ellipsoid('Topiary', (x, .86, z-.49+k*.48), (.49, .30+(k%2)*.19, .34), 'plant', segments=12, rings=6)
                collider(colliders, 'roof-planter-'+str(x)+'-'+str(z), x, z, 1.55, 1.95)
        for x in (-3.0, 3.0):
            rod('Weather mast', (x, 0, -4.24), (x, 2.85, -4.24), .045, 'brass')
            ellipsoid('Weather lantern', (x, 2.55, -4.24), (.16, .27, .16), 'amber')
            collider(colliders, 'weather-mast-'+str(x), x, -4.24, .42, .42)
        for x in (-2.9, 2.9):
            box('Deck inlay', (x, .003, .4), (.07, .006, 7.3), 'brass', .006)
    if scene_id != 'balcony':
        for x in (-4.8, 4.8):
            plant(x, 3.6, .95)
            collider(colliders, 'plant-'+str(x), x, 3.6, 1.25, 1.25)
    obj = join_meshes(scene_id+'_architecture')
    export(scene_id)
    return scene, obj, {
        'file': scene_id+'.glb', 'spawn': [0, 0, 3], 'colliders': colliders,
        'doors': [{'id': 'exit', 'position': [0, 0, -4.65], 'width': 1.6}],
        'hotspots': [{'id': 'workstation', 'position': [-3.6, 0, -1.55], 'radius': 1.15},
                     {'id': 'evidence', 'position': [3.7, 0, -1.7], 'radius': 1.15}],
        'npcs': [{'role': 'witness', 'position': [-2.1, 0, .25], 'rotationY': .25},
                 {'role': 'security', 'position': [2.1, 0, 1.35], 'rotationY': -.35},
                 {'role': 'scientist', 'position': [2.1, 0, -2.25], 'rotationY': -.25}],
    }


def export(name, armature=False):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in CURRENT.objects:
        if obj.type in {'MESH', 'ARMATURE'}:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / (name+'.glb')), export_format='GLB', use_selection=True, use_active_scene=True,
        export_yup=True, export_animations=armature, export_animation_mode='ACTIVE_ACTIONS',
        export_nla_strips_merged_animation_name='Idle', export_skins=True,
        export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_force_sampling=True, export_frame_range=False,
    )


def body_shell(name, rings, mat, bone='Spine'):
    vertices = []
    for height, rx, rz, zoffset in rings:
        for i in range(12):
            a = i*math.tau/12
            vertices.append((math.sin(a)*rx, height, math.cos(a)*rz+zoffset))
    faces = []
    for row in range(len(rings)-1):
        for i in range(12):
            a = row*12+i
            b = row*12+(i+1)%12
            faces.append((a, b, b+12, a+12))
    faces += [tuple(reversed(range(12))), tuple((len(rings)-1)*12+i for i in range(12))]
    return panel(name, vertices, faces, mat, bone)


def make_character(role):
    scene = new_scene('Character_'+role)
    skin = {'detective':'skin-warm', 'witness':'skin-peach', 'security':'skin-olive', 'scientist':'skin-pale'}[role]
    coat = {'detective':'cream', 'witness':'wine', 'security':'blue', 'scientist':'paper'}[role]
    hair = {'detective':'hair-dark', 'witness':'hair-dark', 'security':'hair-brown', 'scientist':'hair-silver'}[role]
    # Silhouettes use articulated volumes rather than a cube avatar; all pieces are skin-weighted.
    body_shell('Tailored torso', [(1.0,.185,.115,0), (1.15,.185,.125,0), (1.36,.24,.13,0), (1.41,.17,.10,0)], coat)
    ellipsoid('Pelvis', (0, .97, 0), (.20, .14, .125), 'navy', 'Hips')
    rod('Neck', (0, 1.37, 0), (0, 1.48, 0), .067, skin, 'Head')
    ellipsoid('Face', (0, 1.565, .012), (.145, .175, .128), skin, 'Head', segments=24, rings=12)
    ellipsoid('Chin', (0, 1.472, .04), (.097, .064, .083), skin, 'Head')
    for side in (-1, 1):
        ellipsoid('Ear', (side*.143, 1.565, .003), (.028, .044, .025), skin, 'Head')
        ellipsoid('Eye white', (side*.059, 1.591, .117), (.035, .021, .016), 'white', 'Head')
        ellipsoid('Iris', (side*.057, 1.591, .132), (.013, .017, .005), 'cyan' if role=='scientist' else 'brass', 'Head', segments=12, rings=6)
        ellipsoid('Pupil', (side*.057, 1.591, .136), (.007, .012, .003), 'ink', 'Head', segments=12, rings=6)
        ellipsoid('Eye glint', (side*.057-.004, 1.598, .139), (.004, .004, .002), 'white', 'Head', segments=8, rings=4)
        rod('Expressive eyebrow', (side*.025, 1.627, .127), (side*.089, 1.634 if role!='security' else 1.622, .117), .009, hair, 'Head', vertices=8)
        rod('Upper eyelid', (side*.027, 1.607, .125), (side*.092, 1.603, .12), .004, hair, 'Head', vertices=6)
    ellipsoid('Sculpted nose', (0, 1.557, .136), (.022, .034, .029), skin, 'Head', segments=12, rings=6)
    rod('Mouth left', (-.034, 1.515, .121), (0, 1.51, .131), .0045, 'lip', 'Jaw', vertices=8)
    rod('Mouth right', (0, 1.51, .131), (.034, 1.515, .121), .0045, 'lip', 'Jaw', vertices=8)
    # A partial scalp cap leaves a clean brow line instead of covering the expressive face.
    verts = [(0, 1.772, -.012)]
    for row in range(1, 5):
        for j in range(24):
            a = j*math.tau/24
            phi = row/4*(1.20 if math.cos(a)>.25 else 1.86)
            verts.append((math.sin(a)*math.sin(phi)*.153, 1.57+math.cos(phi)*.205, -.015+math.cos(a)*math.sin(phi)*.14))
    faces = [(0, 1+j, 1+(j+1)%24) for j in range(24)]
    for row in range(3):
        for j in range(24):
            a = 1+row*24+j
            b = 1+row*24+(j+1)%24
            faces.append((a, a+24, b+24, b))
    panel('Sculpted hair cap', verts, faces, hair, 'Head')
    for i in range(6):
        lock = ellipsoid('Swept hair lock', (-.105+i*.04, 1.725-abs(i-2)*.012, .025), (.049, .055, .10), hair, 'Head', segments=10, rings=6)
        lock.rotation_euler.y = -.4
    for side, suffix in [(-1, 'L'), (1, 'R')]:
        upper = 'UpperArm.'+suffix
        lower = 'Forearm.'+suffix
        hand = 'Hand.'+suffix
        thigh = 'Thigh.'+suffix
        shin = 'Shin.'+suffix
        foot = 'Foot.'+suffix
        ellipsoid('Shoulder '+suffix, (side*.24, 1.337, 0), (.078, .092, .10), coat, upper)
        rod('Upper sleeve '+suffix, (side*.255, 1.33, 0), (side*.308, 1.11, .012), .079, coat, upper, tip=.064)
        ellipsoid('Elbow '+suffix, (side*.308, 1.105, .012), (.066, .061, .065), coat, lower)
        rod('Fore sleeve '+suffix, (side*.308, 1.11, .012), (side*.325, .921, .048), .064, coat, lower, tip=.047)
        rod('Cuff '+suffix, (side*.325, .947, .043), (side*.327, .909, .05), .051, 'navy', lower)
        ellipsoid('Hand '+suffix, (side*.332, .866, .055), (.048, .066, .030), skin, hand)
        ellipsoid('Thumb '+suffix, (side*.29, .87, .07), (.022, .038, .025), skin, hand)
        for i in range(3):
            rod('Finger seam', (side*.313+i*.012, .833, .081), (side*.313+i*.012, .861, .084), .0018, 'lip', hand, vertices=4)
        rod('Trouser upper '+suffix, (side*.105, .96, 0), (side*.112, .56, .012), .098, 'navy', thigh, tip=.071)
        ellipsoid('Knee '+suffix, (side*.112, .54, .012), (.073, .075, .075), 'navy', shin)
        rod('Trouser lower '+suffix, (side*.112, .55, .012), (side*.112, .16, .0), .069, 'navy', shin, tip=.052)
        box('Boot '+suffix, (side*.112, .073, .057), (.145, .145, .265), 'ink', .045, foot)
        box('Boot sole '+suffix, (side*.112, .013, .057), (.151, .026, .273), 'blue', .01, foot)
        box('Boot facing '+suffix, (side*.112, .105, .121), (.114, .038, .117), 'brass' if role=='detective' else 'blue', .018, foot)
    box('Belt', (0, 1.012, .124), (.345, .041, .027), 'ink', .007, 'Hips')
    box('Belt buckle', (0, 1.012, .144), (.055, .045, .016), 'brass', .005, 'Hips')
    for side in (-1, 1):
        panel('Angular lapel', [(side*.045,1.39,.105),(side*.16,1.35,.124),(side*.11,1.20,.133),(side*.02,1.29,.14)], [(0,1,2,3)], 'navy' if role!='security' else 'cream', 'Spine')
    if role == 'detective':
        for side, suffix in [(-1,'L'), (1,'R')]:
            panel('Split coat tail '+suffix, [(side*.012,1.06,-.08),(side*.19,1.06,-.06),(side*.24,.63,-.025),(side*.035,.64,-.11),
                       (side*.01,1.06,.11),(side*.19,1.06,.08),(side*.23,.63,.085),(side*.034,.65,.05)],
                  [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(3,2,6,7)], 'cream', 'Coat.'+suffix)
            box('Coat pocket', (side*.148, 1.115, .133), (.073, .073, .016), 'brass', .008, 'Spine')
        panel('Amber scarf', [(-.038,1.42,.098),(.038,1.42,.098),(.048,1.29,.144),(.005,1.18,.145),(-.033,1.27,.145)], [(0,1,2,3,4)], 'amber', 'Spine')
        for side in (-1, 1):
            rod('Shoulder seam', (side*.17,1.396,0), (side*.28,1.361,0), .018, 'brass', 'Spine')
    elif role == 'witness':
        ellipsoid('Asymmetric bun', (.115, 1.71, -.105), (.103,.108,.10), hair, 'Head')
        rod('Hair clasp', (.112,1.64,-.155), (.194,1.73,-.084), .018, 'amber', 'Head')
        for side in (-1,1):
            ellipsoid('Earring', (side*.16,1.519,.015), (.013,.025,.012), 'brass', 'Head', segments=10, rings=6)
        box('Blouse inset', (0,1.31,.139), (.071,.16,.02), 'cream', .007, 'Spine')
        rod('Necklace', (-.035,1.391,.105), (0,1.343,.155), .006, 'brass', 'Spine')
        rod('Necklace', (0,1.343,.155), (.035,1.391,.105), .006, 'brass', 'Spine')
        box('Assistant badge', (.13,1.27,.136), (.044,.064,.015), 'cyan', .006, 'Spine')
        rod('Satchel strap', (-.17,1.36,.142), (.19,1.045,.141), .019, 'brass', 'Spine')
        box('Data satchel', (.225,.98,.017), (.08,.19,.17), 'cream', .035, 'Hips')
    elif role == 'security':
        box('Protective vest', (0,1.223,.11), (.32,.27,.078), 'navy', .04, 'Spine')
        for side in (-1,1):
            box('Vest piping', (side*.12,1.22,.155), (.023,.21,.013), 'cyan', .004, 'Spine')
            ellipsoid('Shoulder armor', (side*.25,1.365,.0), (.09,.07,.113), 'navy', 'UpperArm.'+('L' if side<0 else 'R'))
        box('Security badge', (-.071,1.27,.161), (.054,.061,.019), 'brass', .009, 'Spine')
        box('Duty radio', (.21,1.048,.028), (.063,.13,.075), 'ink', .012, 'Hips')
        rod('Radio antenna', (.22,1.11,.028), (.22,1.20,.028), .007, 'ink', 'Hips')
        ellipsoid('Earpiece', (-.17,1.579,.0), (.025,.033,.026), 'ink', 'Head')
        rod('Microphone', (-.17,1.56,.015), (-.095,1.516,.13), .006, 'brass', 'Head')
    else:
        for side, suffix in [(-1,'L'), (1,'R')]:
            box('Lab coat skirt', (side*.103,.893,-.005), (.187,.285,.243), 'paper', .038, 'Coat.'+suffix)
            box('Lab pocket', (side*.145,1.11,.137), (.061,.065,.012), 'cream', .007, 'Spine')
            for i in range(2):
                rod('Pocket pen', (side*.14+i*.016,1.13,.148), (side*.14+i*.016,1.19,.148), .006, 'cyan' if i else 'amber', 'Spine', vertices=6)
            for a,b in [((side*.023,1.616,.144),(side*.098,1.616,.133)),((side*.023,1.565,.144),(side*.098,1.565,.133)),((side*.023,1.565,.144),(side*.023,1.616,.144)),((side*.098,1.565,.133),(side*.098,1.616,.133))]:
                rod('Spectacle rim', a,b,.0045,'ink','Head',vertices=6)
        rod('Spectacle bridge', (-.023,1.601,.146), (.023,1.601,.146), .004,'ink','Head',vertices=6)
        for side in (-1,1):
            lock = ellipsoid('Silver side tuft', (side*.147,1.67,-.029), (.05,.09,.097), hair, 'Head', segments=10, rings=6)
            lock.rotation_euler.y = side*.45
        box('Research ID', (-.095,1.275,.145), (.048,.07,.014), 'cyan', .004, 'Spine')
    mesh = join_meshes(role+'_skinned_mesh')
    rig = make_rig(role, mesh)
    make_animations(rig)
    scene.frame_set(1)
    # NLA tracks deliberately preserve the public animation names across all four models.
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(OUT/(role+'.glb')), export_format='GLB', use_selection=True, use_active_scene=True,
        export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
        export_skins=True, export_force_sampling=True, export_frame_range=False,
        export_cameras=False, export_lights=False)
    return scene, mesh, rig


def make_rig(role, mesh):
    armature = bpy.data.armatures.new(role+'_skeleton')
    rig = bpy.data.objects.new(role+'_rig', armature)
    CURRENT.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, a, b, parent=None):
        item = armature.edit_bones.new(name)
        item.head, item.tail = xyz(a), xyz(b)
        if parent:
            item.parent = armature.edit_bones[parent]
        return item
    bone('Root',(0,0,0),(0,.15,0))
    bone('Hips',(0,.96,0),(0,1.08,0),'Root')
    bone('Spine',(0,1.05,0),(0,1.4,0),'Hips')
    bone('Head',(0,1.4,0),(0,1.73,0),'Spine')
    bone('Jaw',(0,1.515,.11),(0,1.49,.14),'Head')
    for side,suffix in [(-1,'L'),(1,'R')]:
        bone('UpperArm.'+suffix,(side*.24,1.35,0),(side*.308,1.11,.012),'Spine')
        bone('Forearm.'+suffix,(side*.308,1.11,.012),(side*.327,.923,.047),'UpperArm.'+suffix)
        bone('Hand.'+suffix,(side*.327,.923,.047),(side*.332,.83,.06),'Forearm.'+suffix)
        bone('Thigh.'+suffix,(side*.105,.96,0),(side*.112,.55,.012),'Hips')
        bone('Shin.'+suffix,(side*.112,.55,.012),(side*.112,.145,0),'Thigh.'+suffix)
        bone('Foot.'+suffix,(side*.112,.145,0),(side*.112,.07,.17),'Shin.'+suffix)
        bone('Coat.'+suffix,(side*.11,1.04,0),(side*.13,.65,0),'Hips')
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = rig
    mod = mesh.modifiers.new('Original character skin', 'ARMATURE')
    mod.object = rig
    rig.show_in_front = True
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    return rig


def make_animations(rig):
    scene = bpy.context.scene
    scene.render.fps = 24
    rig.animation_data_create()
    for clip, end in [('Idle',49),('Walk',25),('Talk',49)]:
        action = bpy.data.actions.new(clip)
        rig.animation_data.action = action
        for frame in range(1,end+1,3):
            phase = (frame-1)/(end-1)*math.tau
            for bone in rig.pose.bones:
                bone.location = (0,0,0)
                bone.rotation_euler = (0,0,0)
            p = rig.pose.bones
            if clip == 'Walk':
                for side,suffix in [(-1,'L'),(1,'R')]:
                    swing = math.sin(phase)*side
                    p['Thigh.'+suffix].rotation_euler.x = swing*.42
                    p['Shin.'+suffix].rotation_euler.x = -.45*max(0,-swing)
                    p['UpperArm.'+suffix].rotation_euler.x = -swing*.28
                    p['Forearm.'+suffix].rotation_euler.x = -.14
                    p['Coat.'+suffix].rotation_euler.x = swing*.19
                p['Hips'].location.y = abs(math.sin(phase))*.022
                p['Spine'].rotation_euler.y = math.sin(phase)*.045
            elif clip == 'Talk':
                p['Head'].rotation_euler.x = math.sin(phase)*.065
                p['Head'].rotation_euler.y = math.sin(phase)*.06
                p['UpperArm.R'].rotation_euler.z = -.32-.08*math.sin(phase)
                p['Forearm.R'].rotation_euler.x = -.75-.18*math.sin(phase)
                p['Hand.R'].rotation_euler.y = .3*math.sin(phase)
                p['Jaw'].rotation_euler.x = .14*max(0,math.sin(phase*4))
                p['UpperArm.L'].rotation_euler.x = -.08
            else:
                p['Spine'].rotation_euler.x = math.sin(phase)*.018
                p['Head'].rotation_euler.y = math.sin(phase)*.035
                p['UpperArm.L'].rotation_euler.z = math.sin(phase)*.012
                p['UpperArm.R'].rotation_euler.z = -math.sin(phase)*.012
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_euler', frame=frame, group=bone.name)
                bone.keyframe_insert('location', frame=frame, group=bone.name)
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 1, action)
        strip.name = clip
        track.mute = clip != 'Idle'
    scene.frame_start, scene.frame_end = 1,49


def lighting(scene):
    world = bpy.data.worlds.new(scene.name+'_world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.15,.21,.29,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .55
    scene.world = world
    def area(name, p, target, energy, color, size):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.color, data.shape, data.size = energy, color, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = xyz(p)
        obj.rotation_euler = (Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    area('Warm softbox', (0,7,5), (0,0,-1), 1800, (1,.82,.63), 7)
    area('Cyan rim', (-5,4,-2), (0,1,0), 1100, (.34,.78,1), 5)
    area('Cream fill', (5,5,3), (0,1,0), 1300, (1,.93,.82), 5)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'


def camera(scene, p, target, ortho):
    data = bpy.data.cameras.new('Preview camera')
    obj = bpy.data.objects.new('Preview camera', data)
    scene.collection.objects.link(obj)
    obj.location = xyz(p)
    obj.rotation_euler = (Vector(xyz(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    scene.camera = obj


def instance_collection(scene, collection, name, offset=(0,0,0), scale=1):
    obj = bpy.data.objects.new(name, None)
    obj.instance_type = 'COLLECTION'
    obj.instance_collection = collection
    obj.location = xyz(offset)
    obj.scale = (scale,)*3
    scene.collection.objects.link(obj)
    return obj


def render_previews(rooms, characters):
    directory = opts.preview_dir
    directory.mkdir(parents=True, exist_ok=True)
    scene = new_scene('Preview_Neon_Blood')
    instance_collection(scene, rooms['datacenter'][0].collection.children[0], 'Datacenter set')
    for role,p in [('detective',(0,0,1.3)),('witness',(-2.1,0,.25)),('security',(2.1,0,1.35)),('scientist',(2.1,0,-2.25))]:
        instance_collection(scene, characters[role][0].collection.children[0], role,p)
    lighting(scene)
    camera(scene,(11,11,16),(0,.65,-.35),16.3)
    scene.render.resolution_x,scene.render.resolution_y = 1500,1100
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(directory/'neon-blood-datacenter.png')
    bpy.ops.render.render(write_still=True)
    sheet = new_scene('Preview_Contact_Sheet')
    for i,(role,data) in enumerate(characters.items()):
        x = (i-1.5)*2.4
        instance_collection(sheet,data[0].collection.children[0],role,(x,.03,3.2),1.8)
        rod('Portrait plinth',(x,-.04,3.2),(x,0,3.2),.69,'blue',vertices=32)
        text('Character label',role.upper(),(x,-.30,3.73),.18,'cream')
    for i,(name,data) in enumerate(rooms.items()):
        x = (i-2)*2.43
        instance_collection(sheet,data[0].collection.children[0],name,(x,.05,-.60),.175)
        text('Room label',name.upper(),(x,-.24,.47),.14,'cyan')
    lighting(sheet)
    camera(sheet,(5.8,8.8,18),(0,.72,1.2),14.3)
    sheet.render.resolution_x,sheet.render.resolution_y = 1800,1200
    sheet.render.resolution_percentage = 100
    sheet.render.filepath = str(directory/'theater-contact-sheet.png')
    bpy.ops.render.render(write_still=True)


manifest = {
    'version':1,'units':'meters','upAxis':'Y','forwardAxis':'+Z',
    'coordinateConversion':{'authoring':'Blender Z-up','toBlender':'[x, -z, y]','gltf':'export_yup=True; runtime [x,y,z] in meters'},
    'spawn':[0,0,3], 'walkableBounds':{'min':[-5.5,-4.6],'max':[5.5,4.6]},
    'palette':'matte navy / warm cream / amber and cyan',
    'license':'Original procedural geometry and materials created for Terminal Detective; no third-party assets.',
    'scenes':{},'characters':{},
}
rooms={}
characters={}
for name in ['office','datacenter','lobby','laboratory','balcony']:
    print('BUILD ROOM',name,flush=True)
    rooms[name]=make_room(name)
    manifest['scenes'][name]=rooms[name][2]
for name in ['detective','witness','security','scientist']:
    print('BUILD CHARACTER',name,flush=True)
    characters[name]=make_character(name)
    manifest['characters'][name]={'file':name+'.glb','animations':['Idle','Walk','Talk'],
        'animationNotes':'In-place 24fps loops: 2s breathing Idle, 1s Walk, 2s Talk with right-hand gesture and moving mouth. Rigid segment skinning, 19 joints.',
        'forward':'+Z','feetY':0}
# Read actual exported data instead of estimating renderer budgets.
sys.path.insert(0,str(Path(__file__).parent))
from validate_assets import inspect_glb
for group in ('scenes','characters'):
    for name,entry in manifest[group].items():
        info=inspect_glb(OUT/entry['file'])
        entry.update({k:info[k] for k in ('bytes','triangles','bounds','meshes','materials')})
        if group=='characters':
            entry['animations']=info['animations']
            entry['height']=round(info['bounds']['max'][1]-info['bounds']['min'][1],4)
manifest['totalBytes']=sum(item['bytes'] for group in ('scenes','characters') for item in manifest[group].values())
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if not opts.skip_render:
    render_previews(rooms,characters)
bpy.context.window.scene=rooms['office'][0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'terminal-detective-library.blend'),compress=True)
print('THEATER GENERATION COMPLETE',manifest['totalBytes'],'bytes',flush=True)
