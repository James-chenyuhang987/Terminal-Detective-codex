"""Original procedural Terminal Detective library. Run with Blender --background --python."""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
args = argparse.ArgumentParser()
args.add_argument('--preview-dir', type=Path)
args.add_argument('--skip-render', action='store_true')
args.add_argument('--characters-only', action='store_true', help='Preserve scene GLBs and their manifest entries')
args.add_argument('--source-output', type=Path, required=True, help='New .blend path; existing sources are never overwritten')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
if not bpy.app.background:
    args.error('Run in a separate --background process; interactive Blender data is protected')
source_output = opts.source_output.resolve()
if source_output.suffix != '.blend' or source_output.exists():
    args.error('--source-output must be a NEW .blend file (existing editable sources are protected)')
if source_output == ROOT / 'art/theater/terminal-detective-library.blend':
    args.error('The original editable library is protected; choose a new source filename')
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
WALK_SPEED = 1.4
WALK_DURATION = 1.0
FPS = 120
STANCE = .56
ANKLE_Y = .145
HIP_Y = .96
KNEE_Y = .55
KNEE_FORWARD = .020
WALK_HIP_DROP = .090
# The pelvis rises over the weight-bearing portion of each step. A 4 cm
# mid-stance lift straightens the supporting leg through the IK solve while
# preserving the bend in the recovering (swing) leg.
WALK_HIP_RISE = .040
WALK_SWING_CLEARANCE = .088


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
    ('floor', (.037, .050, .073), .10, .72, 0),
    ('seam', (.022, .029, .042), 0, .95, 0),
    ('coat-noir', (.034, .042, .055), .02, .78, 0),
    ('wear', (.070, .081, .093), .15, .62, 0),
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


def evidence_marker(x,z,number=1,y=0):
    # Numbered survey markers identify stations, never unrevealed case answers.
    panel('Folded survey marker',[(x-.105,y+.012,z-.065),(x+.105,y+.012,z-.065),(x+.105,y+.215,z),(x-.105,y+.215,z),
                                 (x-.105,y+.012,z+.09),(x+.105,y+.012,z+.09)],
          [(0,1,2,3),(3,2,5,4),(0,4,5,1)],'amber')
    text('Survey station number',str(number),(x,y+.075,z+.071),.10,'ink')


def field_case(x,z,y=.97):
    box('Forensics case shell',(x,y+.105,z),(.52,.20,.35),'ink',.035)
    box('Forensics case lid',(x,y+.215,z),(.54,.035,.37),'navy',.012)
    for side in (-1,1):
        box('Case corner guard',(x+side*.244,y+.105,z+.168),(.026,.16,.024),'brass',.006)
        box('Case latch',(x+side*.155,y+.195,z+.185),(.045,.06,.016),'brass',.005)
    for dx in (-.085,.085):
        rod('Case handle riser',(x+dx,y+.12,z+.2),(x+dx,y+.12,z+.27),.014,'ink')
    rod('Case handle',(x-.085,y+.12,z+.27),(x+.085,y+.12,z+.27),.016,'ink')
    box('Case label',(x,y+.237,z),(.15,.005,.095),'paper',.003)


def evidence_envelope(x,z,y=.978,angle=0):
    envelope=box('Sealed evidence envelope',(x,y,z),(.33,.012,.245),'paper',.003)
    envelope.rotation_euler.z=angle
    box('Envelope red seal',(x,y+.009,z-.09),(.32,.004,.025),'wine',.001)
    box('Evidence custody label',(x+.025,y+.009,z+.026),(.20,.004,.10),'cream',.001)
    for row in range(3):
        box('Custody writing',(x+.025,y+.012,z+.01+row*.021),(.14-row*.017,.001,.003),'ink',0)


def investigation_board(x,y,z,width=2.7):
    box('Investigation board frame',(x,y,z),(width,1.55,.12),'wood',.025)
    box('Cork board surface',(x,y,z+.071),(width-.11,1.43,.025),'cream',.01)
    pins=[(-.88,.34),(-.05,.43),(.78,.21),(-.55,-.28),(.48,-.31)]
    for i,(dx,dy) in enumerate(pins):
        px,py=x+dx,y+dy
        box('Pinned case file',(px,py,z+.094),(.38,.37,.014),'paper',.002)
        box('Document photo',(px-.075,py+.04,z+.104),(.15,.17,.007),'blue',0)
        ellipsoid('Anonymous photo silhouette',(px-.075,py+.064,z+.11),(.035,.040,.005),'ink',segments=8,rings=4)
        box('Photo shoulders',(px-.075,py+.010,z+.110),(.085,.044,.004),'ink',.005)
        for row in range(4):
            box('File text rule',(px+.095,py+.065-row*.040,z+.106),(.12-row%2*.024,.009,.004),'wood',0)
        ellipsoid('Red board pin',(px,py+.155,z+.116),(.015,.015,.014),'wine',segments=8,rings=4)
    for a,b in [(0,1),(1,2),(0,3),(3,4),(4,2),(1,4)]:
        rod('Red investigation thread',(x+pins[a][0],y+pins[a][1]+.155,z+.129),
            (x+pins[b][0],y+pins[b][1]+.155,z+.129),.004,'wine',vertices=6)
    text('Board heading','CASE REVIEW / OPEN FILE',(x,y+.61,z+.100),.093,'ink')


def blind_window(x,z):
    box('Window outer frame',(x,2.03,z),(2.63,1.72,.12),'wood',.015)
    box('Night window glass',(x,2.03,z+.072),(2.48,1.57,.014),'screen',.002)
    for column in (-1,0,1):
        box('Distant city silhouette',(x+column*.65,1.84,z+.083),(.40,.65+abs(column)*.17,.009),'navy',0)
    for row in range(11):
        slat=box('Venetian blind slat',(x,1.31+row*.142,z+.112),(2.52,.062,.085),'navy',.004)
        slat.rotation_euler.x=.38
    for dx in (-.90,.90):
        rod('Blind suspension cord',(x+dx,1.28,z+.161),(x+dx,2.78,z+.161),.004,'brass',vertices=6)
    box('Deep window sill',(x,1.20,z+.13),(2.77,.07,.26),'wood',.012)


def barrier(x,z,length=1.0):
    for side in (-1,1):
        rod('Scene cordon base',(x+side*length/2,0,z),(x+side*length/2,.045,z),.13,'ink')
        rod('Scene cordon post',(x+side*length/2,.04,z),(x+side*length/2,.91,z),.022,'brass')
    box('Scene cordon tape',(x,.79,z),(length,.085,.012),'amber',.002)
    for step in range(max(1,int(length/.18))):
        stripe=box('Cordon dark stripe',(x-length/2+.08+step*.18,.79,z+.009),(.055,.083,.008),'ink',0)
        stripe.rotation_euler.y=.35


def evidence_table(x, z, scene_id):
    box('Evidence island', (x, .42, z), (1.7, .84, 1.0), 'blue', .07)
    box('Evidence stone', (x, .90, z), (1.92, .13, 1.17), 'cream', .06)
    box('Forensic inspection mat',(x, .978,z), (1.62,.018,.88),'navy',.008)
    # Scene-specific public props replace the repeated anonymous gold sphere.
    if scene_id=='datacenter':
        box('Damaged drive casing',(x-.16,1.012,z-.10),(.30,.045,.22),'ink',.008)
        box('Exposed drive board',(x-.16,1.041,z-.10),(.24,.009,.17),'blue',.003)
        for i in range(4):
            box('Board contact',(x-.245+i*.047,1.047,z-.035),(.025,.004,.034),'brass',0)
        evidence_envelope(x+.44,z-.18)
    elif scene_id=='laboratory':
        box('Sample slide rack',(x+.37,1.005,z-.12),(.31,.035,.23),'cream',.006)
        for i in range(3):
            box('Labelled glass slide',(x+.275+i*.087,1.03,z-.12),(.063,.009,.18),'blue',.002)
        evidence_envelope(x+.42,z+.24)
    elif scene_id=='lobby':
        box('Visitor log',(x-.25,1.007,z-.05),(.42,.045,.32),'wood',.008)
        box('Open visitor page',(x-.25,1.034,z-.05),(.38,.008,.28),'paper',.002)
        for i in range(4):
            box('Log writing',(x-.25,1.04,z-.12+i*.048),(.28,.002,.004),'ink',0)
        evidence_envelope(x+.36,z-.14)
    elif scene_id=='balcony':
        field_case(x-.34,z-.10)
        evidence_envelope(x+.34,z-.12)
    else:
        field_case(x-.35,z-.1)
        evidence_envelope(x+.36,z-.1)
    evidence_marker(x+.62,z+.26,1,y=.98)
    # A metric scale is a modelling detail, not a puzzle clue.
    box('Forensic metric scale',(x-.28,1.003,z+.30),(.62,.008,.065),'paper',.001)
    for i in range(13):
        box('Scale tick',(x-.565+i*.047,1.008,z+.30),(.008,.001,.04 if i%2 else .025),'ink',0)
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
            box('Architectural accent band', (x, 2.75, -4.7), (5.05, .16, .08), 'brass' if scene_id in ('office','lobby') else 'navy')
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
    layouts = {
        'office':((-3.1,-2.6),(3.75,-2.85)),
        'datacenter':((-3.65,-2.5),(3.1,-.7)),
        'lobby':((-2.7,-3.1),(3.3,-2.8)),
        'laboratory':((-3.2,-2.7),(3.2,-1.8)),
        'balcony':((-3.1,-2.75),(2.85,-2.9)),
    }
    (wx,wz),(ex,ez) = layouts[scene_id]
    desk(wx, wz, 'Investigation console')
    collider(colliders, 'workstation', wx, wz, 2.65, 1.14)
    evidence_table(ex, ez, scene_id)
    collider(colliders, 'evidence-island', ex, ez, 2.02, 1.27)
    # Small physical seams/wear are intentional close-up details, not another download.
    for i in range(9):
        x = -4.5 + (i*1.73)%9
        z = -3.8 + (i*2.11)%7.5
        box('Worn floor seam', (x,.004,z), (.08+(i%3)*.05,.003,.008), 'wear', 0)
    if scene_id == 'office':
        text('Room title', 'DETECTIVE BUREAU / 07', (-3.4, 2.85, -4.59), .17)
        investigation_board(3.5,1.98,-4.58,3.05)
        blind_window(-3.30,-4.56)
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
        rod('Desk lamp base',(wx-.82,.94,wz),(wx-.82,1.06,wz),.12,'brass')
        rod('Desk lamp stem',(wx-.82,1.05,wz),(wx-.67,1.55,wz),.028,'brass')
        rod('Desk lamp shade',(wx-.67,1.47,wz),(wx-.67,1.61,wz),.18,'amber',tip=.095)
        for i in range(3):
            box('Open case file',(wx+.62+i*.035,.926+i*.007,wz+.16),(.38,.006,.24),'paper',.004)
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
        # Public opening: EMP damage and scattered chips; no clue IDs or answer encoding.
        box('Damaged rack panel',(-3.48,1.06,-3.39),(.83,.24,.018),'ink',.015)
        for i in range(5):
            rod('EMP scorch',(-3.83+i*.12,.95,-3.37),(-3.79+i*.12,1.13,-3.37),.007,'wear',vertices=5)
        for i in range(6):
            chip = box('Scattered public chip',(ex-.5+i*.19,1.082,ez+math.sin(i*1.7)*.18),(.12,.014,.09),'brass' if i%2 else 'ink',.006)
            chip.rotation_euler.z = i*.57
        for x in (-3.0,3.0):
            box('Overhead cable tray',(x,3.05,-2.0),(.30,.10,4.4),'navy')
            for k in range(4):
                rod('Bundled cable',(x-.09+k*.06,3.01,-3.95),(x-.09+k*.06,3.01,.02),.013,'blue')
        box('Service panel',(-5.60,1.20,2.0),(.035,1.50,1.0),'blue',.015)
        barrier(-3.48,-3.29,.92)
        # This cordon sits in the existing server footprint.
        field_case(-4.85,2.42,y=0)
        collider(colliders,'forensics-transit-case',-4.85,2.42,.60,.50)
        for dx in (-.11,.11):
            rod('Portable worklight leg',(-4.68+dx,0,2.15),(-4.68,.62,2.15),.013,'ink')
        box('Portable worklight housing',(-4.68,.76,2.15),(.31,.24,.08),'ink',.015)
        box('Portable worklight face',(-4.68,.76,2.20),(.26,.18,.012),'paper',.004)
        collider(colliders,'portable-worklight',-4.68,2.15,.37,.28)

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
        box('Lobby rug',(0,.006,.95),(3.4,.009,2.6),'wine',.02)
        for x in (-1.7,1.7):
            box('Rug edging',(x,.012,.95),(.035,.004,2.6),'brass',.005)
        # A pair of seized storage boxes makes the temporary search station legible.
        for i in range(2):
            box('Archive custody carton',(4.9,.18+i*.35,-2.57),(.62,.33,.47),'cream',.012)
            box('Carton seal',(4.9,.18+i*.35,-2.326),(.07,.31,.009),'wine',0)
            box('Carton label',(4.75,.20+i*.35,-2.32),(.18,.11,.01),'paper',.002)
        collider(colliders,'custody-cartons',4.9,-2.57,.72,.57)

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
        rod('Microscope stand', (ex-.3,1.075,ez), (ex-.3,1.43,ez), .046, 'cream')
        rod('Microscope ocular', (ex-.3,1.43,ez), (ex-.1,1.54,ez+.1), .065, 'navy')
        box('Microscope stage', (ex-.3,1.16,ez+.15), (.25,.04,.25), 'navy')
        box('Suspended lab luminaire',(0,3.08,-1.8),(2.6,.12,.34),'navy',.025)
        box('Lab light diffuser',(0,3.011,-1.8),(2.35,.008,.27),'light',.008)
        for i in range(3):
            evidence_envelope(-5.0,.13+i*.51,y=1.04)
        box('Glove dispenser',(5.0,1.115,1.39),(.44,.17,.26),'paper',.014)
        box('Glove dispenser opening',(5.0,1.206,1.39),(.24,.012,.09),'ink',.025)

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
        for i in range(3):
            box('Wet deck sheen',(-2.2+i*2,.006,1.7-i*.8),(1.4,.006,.3+i*.07),'blue',.06)
        # A packed field station and survey light distinguish this from an indoor desk.
        barrier(4.05,-3.6,1.05)
        collider(colliders,'roof-cordon',4.05,-3.6,1.34,.30)
        field_case(-4.3,-2.38,y=0)
        collider(colliders,'roof-field-case',-4.3,-2.38,.64,.52)

    if scene_id != 'balcony':
        for x in (-4.8, 4.8):
            plant(x, 3.6, .95)
            collider(colliders, 'plant-'+str(x), x, 3.6, 1.25, 1.25)
    obj = join_meshes(scene_id+'_architecture')
    export(scene_id)
    return scene, obj, {
        'file': scene_id+'.glb', 'spawn': [0, 0, 3], 'colliders': colliders,
        'doors': [{'id': 'exit', 'position': [0, 0, -4.65], 'width': 1.6}],
        'hotspots': [{'id':'workstation','position':[wx,0,round(wz+1.05,3)],'radius':1.15,'focusPosition':[wx,1.34,wz]},
                     {'id':'evidence','position':[ex,0,round(ez+1.10,3)],'radius':1.15,'focusPosition':[ex,1.075,ez]}],
        'npcs': [{'role':'witness','position':[-1.8 if scene_id=='datacenter' else -2.1,0,.25],'rotationY':.25},
                 {'role':'security','position':[2.0,0,1.8 if scene_id=='datacenter' else 1.35],'rotationY':-.35},
                 {'role':'scientist','position':[1.35 if scene_id=='balcony' else 1.85 if scene_id in ('datacenter','laboratory') else 1.8,0,-2.25],'rotationY':-.25}],
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


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t*t*t*(10+t*(-15+6*t))


def septic_segment(start, end, start_velocity, end_velocity, t):
    """C3 stage easing for baked gait keys and skin-deformed sole motion."""
    t = max(0.0, min(1.0, t))
    t2, t3 = t*t, t*t*t
    t4 = t2*t2
    t5 = t3*t2
    t6 = t3*t3
    t7 = t3*t4
    h00 = 1 - 35*t4 + 84*t5 - 70*t6 + 20*t7
    h10 = t - 20*t4 + 45*t5 - 36*t6 + 10*t7
    h01 = 35*t4 - 84*t5 + 70*t6 - 20*t7
    h11 = -15*t4 + 39*t5 - 34*t6 + 10*t7
    return start*h00 + start_velocity*h10 + end*h01 + end_velocity*h11


def tailored_leg(side, suffix):
    # Shared rings, not disconnected rigid cylinders: blend through knee and ankle.
    # The bind silhouette follows a nearly straight hip-to-ankle centerline;
    # the IK pole creates the visible knee bend only during the swing phase.
    sections = [(.985,.092,0),(.93,.097,.005),(.82,.09,.011),(.69,.081,.017),
                (.60,.075,.019),(.55,.075,KNEE_FORWARD),(.50,.073,.019),
                (.43,.069,.016),(.32,.062,.011),(.22,.056,.006),(.16,.053,.002),(.115,.052,0)]
    vertices = []
    for y, radius, z in sections:
        vertices.extend((side*.112+radius*math.sin(i*math.tau/16), y,
                         z+radius*math.cos(i*math.tau/16)) for i in range(16))
    faces = []
    for row in range(len(sections)-1):
        for i in range(16):
            a, b = row*16+i, row*16+(i+1)%16
            faces.append((a,b,b+16,a+16))
    faces += [tuple(reversed(range(16))), tuple((len(sections)-1)*16+i for i in range(16))]
    obj = panel('Continuous tailored leg '+suffix, vertices, faces, 'navy')
    groups = {name:obj.vertex_groups.new(name=name+'.'+suffix) for name in ('Thigh','Shin','Foot')}
    for row,(y,_,_) in enumerate(sections):
        foot = 1-smoothstep((y-.125)/.10)
        thigh = smoothstep((y-.47)/.16)
        for name, weight in [('Thigh',thigh),('Shin',(1-thigh)*(1-foot)),('Foot',(1-thigh)*foot)]:
            if weight:
                groups[name].add(list(range(row*16,(row+1)*16)),weight,'REPLACE')
    for face in obj.data.polygons:
        face.use_smooth = True


def sculpted_head(skin):
    # One continuous jaw/cheek/brow surface, rather than stacked face/chin spheres.
    rings = [(1.448,.044,.047,.024),(1.474,.080,.064,.023),(1.512,.108,.083,.014),
             (1.559,.133,.105,.007),(1.604,.136,.107,0),(1.655,.128,.103,-.008),
             (1.704,.101,.081,-.012),(1.735,.057,.048,-.012),(1.746,.008,.008,-.012)]
    vertices=[]
    for y,rx,rz,offset in rings:
        for i in range(24):
            angle=i*math.tau/24
            vertices.append((rx*math.sin(angle),y,offset+rz*math.cos(angle)))
    faces=[]
    for row in range(len(rings)-1):
        for i in range(24):
            a,b=row*24+i,row*24+(i+1)%24
            faces.append((a,b,b+24,a+24))
    faces += [tuple(reversed(range(24))),tuple((len(rings)-1)*24+i for i in range(24))]
    obj=panel('Continuous sculpted face',vertices,faces,skin)
    head=obj.vertex_groups.new(name='Head')
    jaw=obj.vertex_groups.new(name='Jaw')
    for row,(y,_,_,_) in enumerate(rings):
        weight=.65*(1-smoothstep((y-1.47)/.055))
        indices=list(range(row*24,(row+1)*24))
        head.add(indices,1-weight,'REPLACE')
        if weight: jaw.add(indices,weight,'REPLACE')
    for face in obj.data.polygons: face.use_smooth=True


def tailored_sleeve(side,suffix,coat):
    sections=[(.213,1.39,0,.059,.075),(.244,1.35,0,.077,.087),(.270,1.29,.002,.074,.081),
              (.286,1.21,.007,.068,.073),(.304,1.13,.011,.061,.064),(.310,1.09,.016,.058,.062),
              (.317,1.03,.028,.053,.058),(.325,.95,.043,.046,.051),(.327,.914,.05,.044,.049)]
    vertices=[]
    for x,y,z,rx,rz in sections:
        vertices.extend((side*x+rx*math.sin(i*math.tau/16),y,z+rz*math.cos(i*math.tau/16)) for i in range(16))
    faces=[]
    for row in range(len(sections)-1):
        for i in range(16):
            a,b=row*16+i,row*16+(i+1)%16
            faces.append((a,b,b+16,a+16))
    faces += [tuple(reversed(range(16))),tuple((len(sections)-1)*16+i for i in range(16))]
    obj=panel('Continuous tailored sleeve '+suffix,vertices,faces,coat)
    upper=obj.vertex_groups.new(name='UpperArm.'+suffix)
    lower=obj.vertex_groups.new(name='Forearm.'+suffix)
    for row,(_,y,_,_,_) in enumerate(sections):
        weight=smoothstep((y-1.064)/.096)
        indices=list(range(row*16,(row+1)*16))
        if weight: upper.add(indices,weight,'REPLACE')
        if weight<1: lower.add(indices,1-weight,'REPLACE')
    for face in obj.data.polygons: face.use_smooth=True


def trench_skirt(side,suffix,coat,hem=.60):
    # Flare the front edges outside the thigh's swept volume. A tight closed
    # ellipse cuts through the knees when the actor stands or strides forward.
    sections=[(1.064,.199,.145,.16),(.985,.217,.167,.35),(.91,.238,.186,.72),
              (.83,.260,.202,1.05),(hem,.275,.215,1.16)]
    vertices=[]
    for y,rx,rz,opening in sections:
        for i in range(13):
            angle=opening+(math.pi-.13-opening)*i/12
            vertices.append((side*rx*math.sin(angle),y,rz*math.cos(angle)-.002))
    faces=[]
    for row in range(len(sections)-1):
        for i in range(12):
            a=row*13+i
            faces.append((a,a+1,a+14,a+13) if side<0 else (a,a+13,a+14,a+1))
    obj=panel('Continuous vented coat '+suffix,vertices,faces,coat)
    hips=obj.vertex_groups.new(name='Hips')
    tail=obj.vertex_groups.new(name='Coat.'+suffix)
    for row,(y,_,_,_) in enumerate(sections):
        weight=smoothstep((1.06-y)/.20)
        indices=list(range(row*13,(row+1)*13))
        if weight<1: hips.add(indices,1-weight,'REPLACE')
        if weight: tail.add(indices,weight,'REPLACE')
    for face in obj.data.polygons: face.use_smooth=True
    # The lining gives thin cloth an actual edge, without rigid overlapping blocks.
    bpy.context.view_layer.objects.active=obj
    solid=obj.modifiers.new('Coat cloth thickness','SOLIDIFY');solid.thickness=.007
    bpy.ops.object.modifier_apply(modifier=solid.name)


def refine_head_proportions(role):
    # All head accessories follow the same adult-scale transform, including the hat and glasses.
    for obj in PARTS:
        if obj.type!='MESH' or obj.name.startswith('Neck'): continue
        groups={group.name for group in obj.vertex_groups}
        if not groups or not groups.issubset({'Head','Jaw'}): continue
        inverse=obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            point=obj.matrix_world @ vertex.co
            point.x *= .86 * {'detective':1,'witness':.96,'security':1.045,'scientist':.98}[role]
            point.y *= .88
            point.z = 1.4+(point.z-1.4)*.84+.045
            vertex.co=inverse @ point


def make_character(role):
    scene = new_scene('Character_'+role)
    skin = {'detective':'skin-warm', 'witness':'skin-peach', 'security':'skin-olive', 'scientist':'skin-pale'}[role]
    coat = {'detective':'coat-noir', 'witness':'wine', 'security':'blue', 'scientist':'paper'}[role]
    hair = {'detective':'hair-dark', 'witness':'hair-dark', 'security':'hair-brown', 'scientist':'hair-silver'}[role]
    build={'detective':(1,1),'witness':(.93,.90),'security':(1.075,1.08),'scientist':(.96,.95)}[role]
    torso=[(1.0,.181,.112,0),(1.12,.181,.119,0),(1.27,.205,.125,0),(1.355,.232,.126,0),(1.398,.18,.095,0),(1.416,.083,.070,0)]
    body_shell('Tailored torso',[(y,rx*build[0],rz*build[1],z) for y,rx,rz,z in torso],coat)
    ellipsoid('Pelvis', (0,.974,-.007), (.176,.102,.117), 'navy', 'Hips')
    rod('Neck', (0,1.388,0), (0,1.514,0), .057, skin, 'Head')
    sculpted_head(skin)
    for side in (-1,1):
        ellipsoid('Ear', (side*.137,1.565,-.006), (.020,.039,.018), skin, 'Head')
        ellipsoid('Eye white', (side*.055,1.594,.102), (.027,.012,.009), 'white', 'Head')
        ellipsoid('Iris', (side*.055,1.594,.111), (.010,.010,.004), 'hair-brown' if role!='scientist' else 'blue', 'Head', segments=12,rings=6)
        ellipsoid('Pupil', (side*.055,1.594,.115), (.005,.008,.002), 'ink', 'Head', segments=10,rings=6)
        ellipsoid('Eye glint', (side*.053,1.598,.117), (.0025,.0025,.001), 'white','Head',segments=8,rings=4)
        rod('Expressive eyebrow', (side*.027,1.618,.111), (side*.082,1.622 if role!='security' else 1.613,.095), .006,hair,'Head',vertices=8)
        rod('Upper eyelid', (side*.029,1.604,.111), (side*.080,1.601,.10), .003,skin,'Head',vertices=6)
        rod('Lower eyelid', (side*.031,1.583,.109), (side*.077,1.584,.101), .0025,skin,'Head',vertices=6)
    panel('Nose bridge',[(-.011,1.61,.105),(.011,1.61,.105),(.019,1.545,.132),(-.019,1.545,.132),(0,1.551,.154)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],skin,'Head')
    ellipsoid('Nose tip',(0,1.548,.141),(.019,.014,.020),skin,'Head',segments=12,rings=6)
    for side in (-1,1):
        rod('Mouth line',(0,1.511,.104),(side*.032,1.514,.098),.0027,'lip','Jaw',vertices=6)
        rod('Cheek plane',(side*.080,1.555,.092),(side*.102,1.542,.076),.002,skin,'Head',vertices=6)
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
        foot = 'Foot.'+suffix
        tailored_sleeve(side,suffix,coat)
        rod('Tailored cuff '+suffix,(side*.326,.946,.043),(side*.327,.909,.05),.048,coat,lower,tip=.046)
        box('Cuff button '+suffix,(side*.327,.931,.097),(.012,.013,.007),'brass',.002,lower)
        glove='ink' if role in ('detective','security') else 'cream' if role=='scientist' else skin
        ellipsoid('Hand '+suffix,(side*.332,.868,.055),(.039,.065,.026),glove,hand)
        thumb=ellipsoid('Thumb '+suffix,(side*.298,.882,.076),(.017,.037,.017),glove,hand)
        thumb.rotation_euler.y=side*.32
        for i in range(3):
            rod('Finger seam',(side*.317+i*.010,.835,.078),(side*.317+i*.010,.863,.081),.0013,'wear' if glove!=skin else 'lip',hand,vertices=4)
        tailored_leg(side, suffix)
        box('Boot '+suffix, (side*.112, .073, .057), (.145, .145, .265), 'ink', .045, foot)
        box('Boot sole '+suffix, (side*.112, .013, .057), (.151, .026, .273), 'blue', .01, foot)
        for i in range(3):
            rod('Boot lacing '+suffix,(side*.112-.037,.148,.047+i*.022),(side*.112+.037,.148,.047+i*.022),.0028,'navy',foot,vertices=6)
    box('Belt', (0, 1.012, .124), (.345, .041, .027), 'ink', .007, 'Hips')
    box('Belt buckle', (0, 1.012, .144), (.055, .045, .016), 'brass', .005, 'Hips')
    for side in (-1, 1):
        panel('Angular lapel', [(side*.045,1.39,.105),(side*.16,1.35,.124),(side*.11,1.20,.133),(side*.02,1.29,.14)], [(0,1,2,3)], 'navy' if role!='security' else 'cream', 'Spine')
    if role == 'detective':
        for side, suffix in [(-1,'L'), (1,'R')]:
            trench_skirt(side,suffix,coat)
            box('Welt coat pocket',(side*.151,1.112,.130),(.086,.018,.010),'navy',.004,'Spine')
            panel('Storm collar',[(side*.02,1.42,.047),(side*.087,1.436,-.004),(side*.167,1.387,.107),(side*.077,1.316,.142)],[(0,1,2,3)],'navy','Spine')
        panel('Shirt collar',[(-.04,1.406,.072),(0,1.37,.124),(.04,1.406,.072),(.055,1.34,.143),(-.055,1.34,.143)],[(0,1,4),(1,2,3)],'paper','Spine')
        for y in (1.25,1.17,1.095):
            for x in (-.065,.065):
                ellipsoid('Horn coat button',(x,y,.129),(.009,.009,.006),'brass','Spine',segments=8,rings=4)
        box('Leather notebook',(.223,1.04,-.012),(.062,.18,.12),'wood',.012,'Hips')
        for x in (-.018,.018):
            box('Storm flap seam',(x,1.32,-.131),(.010,.105,.008),'navy',.002,'Spine')
        panel('Amber scarf', [(-.038,1.42,.098),(.038,1.42,.098),(.048,1.29,.144),(.005,1.18,.145),(-.033,1.27,.145)], [(0,1,2,3,4)], 'amber', 'Spine')
        for side in (-1, 1):
            rod('Shoulder seam', (side*.17,1.396,0), (side*.28,1.361,0), .005, 'navy', 'Spine')
        brim=rod('Fedora felt brim',(0,1.731,0),(0,1.748,0),.182,'coat-noir','Head',vertices=32)
        brim.scale.x=1.13; brim.scale.y=.95
        body_shell('Pinched fedora crown',[(1.747,.144,.130,-.006),(1.784,.140,.126,-.006),(1.833,.116,.111,-.009),
                                         (1.819,.077,.058,-.009),(1.800,.013,.049,-.009)],'coat-noir','Head')
        body_shell('Fedora grosgrain band',[(1.754,.147,.132,-.006),(1.774,.145,.131,-.006)],'navy','Head')
        box('Hat band pin',(-.127,1.766,.063),(.026,.012,.012),'brass',.002,'Head')
        for i in range(16):
            a,b = i*math.tau/16,(i+1)*math.tau/16
            rod('Field lens rim',(-.215+.05*math.cos(a),1.04+.05*math.sin(a),.147),(-.215+.05*math.cos(b),1.04+.05*math.sin(b),.147),.004,'brass','Hips',vertices=6)
        rod('Field lens handle',(-.245,.997,.147),(-.287,.940,.147),.009,'brass','Hips')
    elif role == 'witness':
        ellipsoid('Asymmetric bun', (.115, 1.71, -.105), (.103,.108,.10), hair, 'Head')
        rod('Hair clasp', (.112,1.64,-.155), (.194,1.73,-.084), .018, 'amber', 'Head')
        for side in (-1,1):
            ellipsoid('Earring', (side*.16,1.519,.015), (.013,.025,.012), 'brass', 'Head', segments=10, rings=6)
        box('Blouse inset', (0,1.31,.139), (.071,.16,.02), 'cream', .007, 'Spine')
        rod('Necklace', (-.035,1.391,.105), (0,1.343,.155), .006, 'brass', 'Spine')
        rod('Necklace', (0,1.343,.155), (.035,1.391,.105), .006, 'brass', 'Spine')
        box('Assistant badge', (.13,1.27,.136), (.038,.053,.010), 'paper', .006, 'Spine')
        rod('Satchel strap', (-.17,1.36,.142), (.19,1.045,.141), .011, 'wood', 'Spine')
        box('Data satchel', (.225,.98,.017), (.08,.19,.17), 'cream', .035, 'Hips')
    elif role == 'security':
        box('Protective vest', (0,1.223,.11), (.32,.27,.078), 'navy', .04, 'Spine')
        for side in (-1,1):
            box('Vest piping', (side*.12,1.22,.155), (.010,.21,.008), 'cream', .004, 'Spine')
            box('Uniform epaulette',(side*.237,1.38,.002),(.091,.012,.077),'navy',.006,'UpperArm.'+('L' if side<0 else 'R'))
        box('Security badge', (-.071,1.27,.161), (.054,.061,.019), 'brass', .009, 'Spine')
        box('Duty radio', (.21,1.048,.028), (.063,.13,.075), 'ink', .012, 'Hips')
        rod('Radio antenna', (.22,1.11,.028), (.22,1.20,.028), .007, 'ink', 'Hips')
        ellipsoid('Earpiece', (-.17,1.579,.0), (.025,.033,.026), 'ink', 'Head')
        rod('Microphone', (-.17,1.56,.015), (-.095,1.516,.13), .006, 'brass', 'Head')
    else:
        for side, suffix in [(-1,'L'), (1,'R')]:
            trench_skirt(side,suffix,'paper',hem=.69)
            box('Lab pocket', (side*.145,1.11,.137), (.061,.065,.012), 'cream', .007, 'Spine')
            for i in range(2):
                rod('Pocket pen', (side*.14+i*.016,1.13,.148), (side*.14+i*.016,1.19,.148), .006, 'cyan' if i else 'amber', 'Spine', vertices=6)
            for a,b in [((side*.023,1.616,.144),(side*.098,1.616,.133)),((side*.023,1.565,.144),(side*.098,1.565,.133)),((side*.023,1.565,.144),(side*.023,1.616,.144)),((side*.098,1.565,.133),(side*.098,1.616,.133))]:
                rod('Spectacle rim', a,b,.0045,'ink','Head',vertices=6)
        rod('Spectacle bridge', (-.023,1.601,.146), (.023,1.601,.146), .004,'ink','Head',vertices=6)
        for side in (-1,1):
            lock = ellipsoid('Silver side tuft', (side*.147,1.67,-.029), (.05,.09,.097), hair, 'Head', segments=10, rings=6)
            lock.rotation_euler.y = side*.45
        box('Research ID', (-.095,1.275,.145), (.042,.065,.01), 'paper', .004, 'Spine')
    refine_head_proportions(role)
    mesh = join_meshes(role+'_skinned_mesh')
    rig = make_rig(role, mesh)
    make_animations(rig)
    scene.frame_set(0)
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
    bone('Jaw',(0,1.5416,.0968),(0,1.5206,.1232),'Head')
    for side,suffix in [(-1,'L'),(1,'R')]:
        bone('UpperArm.'+suffix,(side*.24,1.35,0),(side*.308,1.11,.012),'Spine')
        bone('Forearm.'+suffix,(side*.308,1.11,.012),(side*.327,.923,.047),'UpperArm.'+suffix)
        bone('Hand.'+suffix,(side*.327,.923,.047),(side*.332,.83,.06),'Forearm.'+suffix)
        bone('Thigh.'+suffix,(side*.112,HIP_Y,0),(side*.112,KNEE_Y,KNEE_FORWARD),'Hips')
        shin = bone('Shin.'+suffix,(side*.112,KNEE_Y,KNEE_FORWARD),(side*.112,ANKLE_Y,0),'Thigh.'+suffix)
        shin.use_connect = True
        foot = bone('Foot.'+suffix,(side*.112,ANKLE_Y,0),(side*.112,.07,.17),'Shin.'+suffix)
        foot.use_connect = True
        bone('Coat.'+suffix,(side*.11,1.04,0),(side*.13,.65,0),'Hips')
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = rig
    mod = mesh.modifiers.new('Original character skin', 'ARMATURE')
    mod.object = rig
    rig.show_in_front = True
    for item in rig.pose.bones:
        item.rotation_mode = 'XYZ'
    return rig


def walk_target(phase):
    stride = WALK_SPEED*WALK_DURATION
    if phase <= STANCE:
        return stride*(STANCE/2-phase), 0
    u = (phase-STANCE)/(1-STANCE)
    # The swing is deliberately split into three C3-smooth stages. The first
    # stage brings the ankle under the hip while it rises, loading the knee
    # before the foot starts its visible forward step. The middle stage then
    # advances it monotonically, and the final stage finishes the step while
    # the ankle falls for heel contact. Each segment has zero velocity and
    # acceleration at its boundaries, so the baked 120 Hz keys stay smooth.
    start_z = -stride*STANCE/2
    bend_z = -.27
    stride_z = .15
    end_z = stride*STANCE/2
    # Match the planted-foot velocity at toe-off and at the loop seam. The
    # derivative is expressed in normalized swing time (u), hence the
    # (1-STANCE) factor; all interior stage boundaries settle to zero speed.
    contact_velocity = -stride*(1-STANCE)
    # Hold the toe-off velocity through the first .08 of swing before easing
    # into the bend. This preserves planted-foot speed over the first baked
    # frame, then settles at a clear pre-step bend by .20.
    hold_end = .08
    bend_end = .20
    if u <= hold_end:
        z = start_z + contact_velocity*u
    elif u <= bend_end:
        span = bend_end - hold_end
        z = septic_segment(start_z + contact_velocity*hold_end, bend_z,
                           contact_velocity*span, 0, (u-hold_end)/span)
    elif u <= .72:
        z = septic_segment(bend_z, stride_z, 0, 0, (u-bend_end)/(.72-bend_end))
    else:
        span = .28
        # Compensate for the final IK/heel-roll transform, which amplifies the
        # deformed boot derivative slightly at the seam. The resulting baked
        # foot stays within the planted stance speed without a visible cusp.
        z = septic_segment(stride_z, end_z, 0, contact_velocity*.27, (u-.72)/span)
    bend = smoothstep((u-.08)/.12)
    recover = smoothstep((u-.52)/.48)
    lift = .068*bend*(1-recover)
    return z, lift


def foot_pitch(phase):
    # Heel contact, flat mid-stance, toe-off, then a low relaxed recovery.
    if phase <= .10:
        return .16 * (1-smoothstep(phase/.10))
    if phase <= .40:
        return 0
    if phase <= STANCE:
        return -.21 * smoothstep((phase-.40)/(STANCE-.40))
    u = (phase-STANCE)/(1-STANCE)
    # Keep the toe-off roll through the initial knee-loading stage. This
    # prevents the lifted foot's contact edge from drifting backward while
    # the ankle is intentionally held close to its take-off position.
    if u <= .22:
        return -.21
    if u <= .55:
        return -.21 * (1-smoothstep((u-.22)/.33))
    return .16 * smoothstep((u-.55)/.45)


def stance_support_rise(phase, amplitude=WALK_HIP_RISE):
    """Return a smooth pelvis lift from the two alternating support legs."""
    def bump(cycle):
        # Hold the lift through the middle support window, then settle before
        # toe-off so the authored IK reach remains available for the next step.
        rise_start = .08
        rise_end = .16
        plateau_end = .35
        support_end = .42
        if cycle <= rise_start:
            return 0.0
        if cycle <= rise_end:
            return smoothstep((cycle - rise_start) / (rise_end - rise_start))
        if cycle <= plateau_end:
            return 1.0
        if cycle > support_end:
            return 0.0
        return smoothstep((support_end - cycle) / (support_end - plateau_end))

    left = bump(phase % 1.0)
    right = bump((phase + .5) % 1.0)
    # An even-power norm is a smooth maximum that remains exactly zero when
    # both support curves are zero, avoiding a seam step at phase 0/1.
    return amplitude * (left**6 + right**6) ** (1/6)


def smooth_lift_cap(value, cap=WALK_SWING_CLEARANCE, softness=.0015):
    """Limit swing clearance without introducing a velocity cusp."""
    if value <= 0:
        return 0.0
    scaled = (value - cap) / softness
    if scaled > 40:
        return cap
    if scaled < -40:
        return value
    return value - softness * math.log1p(math.exp(scaled))


def solve_leg(rig, side, suffix, phase):
    z, lift = walk_target(phase)
    if phase > STANCE:
        global_phase = phase if suffix == 'L' else (phase - .5) % 1.0
        lift = smooth_lift_cap(lift + stance_support_rise(global_phase))
    pitch = foot_pitch(phase)
    roll = Matrix.Rotation(-pitch, 4, 'X')
    edge = -.0695 if pitch >= 0 else .1835
    contact = roll @ Vector(xyz((0,-ANKLE_Y,edge)))
    thigh, shin, foot = [rig.pose.bones[name+'.'+suffix] for name in ('Thigh','Shin','Foot')]
    hips = rig.pose.bones['Hips']
    hip = hips.matrix @ hips.bone.matrix_local.inverted() @ thigh.bone.head_local
    # The lowest heel/toe edge remains at its world-space plant while the boot rolls.
    ankle = Vector(xyz((side*.112,-contact.z+lift,z+edge+contact.y)))
    a, b = thigh.bone.length, shin.bone.length
    delta = ankle-hip
    distance = delta.length
    assert distance < a+b, f'Foot target outside authored two-bone reach: {suffix} phase={phase:.4f} distance={distance:.6f} reach={a+b:.6f}'
    direction = delta.normalized()
    forward = Vector(xyz((0,0,1)))
    pole = (forward-direction*forward.dot(direction)).normalized()
    projection = (a*a-b*b+distance*distance)/(2*distance)
    knee = hip+direction*projection+pole*math.sqrt(max(0,a*a-projection*projection))
    for bone, start, end in [(thigh,hip,knee),(shin,knee,ankle)]:
        rest = bone.bone.matrix_local.to_quaternion()
        rest_axis = bone.bone.tail_local-bone.bone.head_local
        rotation = rest_axis.rotation_difference(end-start) @ rest
        bone.matrix = Matrix.LocRotScale(start,rotation,Vector((1,1,1)))
        bpy.context.view_layer.update()
    foot.matrix = Matrix.LocRotScale(ankle,roll.to_quaternion() @ foot.bone.matrix_local.to_quaternion(),Vector((1,1,1)))
    bpy.context.view_layer.update()


def make_animations(rig):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    rig.animation_data.use_nla = False
    leg_names = {name+'.'+suffix for name in ('Thigh','Shin','Foot') for suffix in ('L','R')}
    for name in leg_names:
        rig.pose.bones[name].rotation_mode = 'QUATERNION'
    for clip, duration in [('Idle',2),('Walk',WALK_DURATION),('Talk',2)]:
        action = bpy.data.actions.new(clip)
        rig.animation_data.action = action
        end = round(duration*FPS)
        for frame in range(end+1):
            phase = frame/end*math.tau
            for bone in rig.pose.bones:
                bone.location = (0,0,0)
                bone.rotation_euler = (0,0,0)
                bone.rotation_quaternion = (1,0,0,0)
            p = rig.pose.bones
            if clip == 'Walk':
                # Weight transfers toward the planted leg; the chest counters the pelvis.
                p['Hips'].location.x = -.021*math.sin(phase)
                p['Hips'].location.y = (
                    -WALK_HIP_DROP-.011*math.cos(phase*2)
                    + stance_support_rise(frame/end)
                )
                p['Hips'].rotation_euler.y = .055*math.sin(phase)
                p['Hips'].rotation_euler.z = .022*math.sin(phase+.35)
                bpy.context.view_layer.update()
                for side,suffix in [(-1,'L'),(1,'R')]:
                    cycle = (frame/end+(0 if suffix=='L' else .5)) % 1
                    solve_leg(rig,side,suffix,cycle)
                    z,_ = walk_target(cycle)
                    arm = math.sin(phase+(0 if suffix=='L' else math.pi)-.20)
                    p['UpperArm.'+suffix].rotation_euler.x = -.23*arm-.025
                    p['UpperArm.'+suffix].rotation_euler.z = side*.035
                    p['Forearm.'+suffix].rotation_euler.x = -.19-.055*math.sin(phase+(0 if suffix=='L' else math.pi)-.55)
                    p['Hand.'+suffix].rotation_euler.x = .028*arm
                    p['Coat.'+suffix].rotation_euler.x = -z*.17+.018*math.sin(phase-.45)
                    p['Coat.'+suffix].rotation_euler.z = side*.012*math.sin(phase*2-.5)
                p['Spine'].rotation_euler.x = -.025+.012*math.cos(phase*2-.3)
                p['Spine'].rotation_euler.y = -.040*math.sin(phase)
                p['Spine'].rotation_euler.z = -.016*math.sin(phase+.35)
                p['Head'].rotation_euler.y = -.015*math.sin(phase)
                p['Head'].rotation_euler.x = .014*math.cos(phase*2-.3)
            elif clip == 'Talk':
                p['Head'].rotation_euler.x = math.sin(phase)*.065
                p['Head'].rotation_euler.y = math.sin(phase)*.06
                gesture = {'detective':1, 'witness':.70, 'security':.45, 'scientist':.85}[rig.name.split('_')[0]]
                p['UpperArm.R'].rotation_euler.z = (-.26-.07*math.sin(phase))*gesture
                p['Forearm.R'].rotation_euler.x = (-.65-.15*math.sin(phase-.35))*gesture
                p['Hand.R'].rotation_euler.y = .3*math.sin(phase)
                p['Jaw'].rotation_euler.x = .065*(1-math.cos(phase*4))/2
                p['UpperArm.L'].rotation_euler.x = -.08
                p['Spine'].rotation_euler.y = .025*math.sin(phase-.25)
            else:
                p['Spine'].rotation_euler.x = math.sin(phase)*.018
                attention = {'detective':.028, 'witness':.045, 'security':.065, 'scientist':.020}[rig.name.split('_')[0]]
                p['Head'].rotation_euler.y = math.sin(phase)*attention
                p['UpperArm.L'].rotation_euler.z = math.sin(phase)*.012
                p['UpperArm.R'].rotation_euler.z = -math.sin(phase)*.012
            if clip != 'Walk':
                # Stand on the same planted soles with relaxed, nearly straight knees.
                # The bent bind pose gives the walking IK reach; it is not the idle pose.
                p['Hips'].location.y = 0
                bpy.context.view_layer.update()
                for side,suffix in [(-1,'L'),(1,'R')]:
                    solve_leg(rig,side,suffix,STANCE/2)
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_quaternion' if bone.name in leg_names else 'rotation_euler', frame=frame, group=bone.name)
                bone.keyframe_insert('location', frame=frame, group=bone.name)
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 0, action)
        strip.name = clip
        strip.mute = False
        track.mute = clip != 'Idle'
    rig.animation_data.use_nla = True
    scene.frame_start, scene.frame_end = 0,2*FPS


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


def render_character_previews(characters):
    directory = opts.preview_dir
    directory.mkdir(parents=True, exist_ok=True)
    snapshots = []
    for phase in (0,.125,.25,.375):
        source, mesh, rig = characters['detective']
        bpy.context.window.scene = source
        for track in rig.animation_data.nla_tracks:
            track.mute = track.name != 'Walk'
        source.frame_set(round(phase*FPS))
        bpy.context.view_layer.update()
        evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        data = bpy.data.meshes.new_from_object(evaluated)
        snapshots.append((phase,data))
    for source,_,rig in characters.values():
        for track in rig.animation_data.nla_tracks:
            track.mute = track.name != 'Idle'
        source.frame_set(0)
    sheet = new_scene('Preview_Planted_Gait')
    for index,(phase,data) in enumerate(snapshots):
        obj = bpy.data.objects.new('Walk phase '+str(phase),data)
        sheet.collection.objects.link(obj)
        obj.location = xyz(((index-1.5)*1.1,0,0))
        text('Phase label',str(phase)+'s',((index-1.5)*1.1,-.16,.48),.10,'cream')
    box('Contact floor',(0,-.022,0),(5.2,.04,2.2),'floor',.005)
    for z in (-.4,0,.4):
        box('Ground reference',(0,-.0008,z),(5.1,.001,.008),'cyan',0)
    lighting(sheet)
    sheet.cycles.samples = 16
    camera(sheet,(5,2.5,8),(0,.82,0),5.5)
    sheet.render.resolution_x,sheet.render.resolution_y = 1400,700
    sheet.render.resolution_percentage = 100
    sheet.render.filepath = str(directory/'walk-contact-sheet.png')
    bpy.ops.render.render(write_still=True)
    # A close profile exposes knee/ankle continuity and foot clearance.
    for obj in list(sheet.objects):
        if obj.name.startswith('Walk phase '):
            obj.hide_render = obj.name != 'Walk phase 0.25'
    camera(sheet,(5,.95,.9),(.55,.86,0),2.05)
    sheet.render.resolution_x,sheet.render.resolution_y = 600,600
    sheet.render.filepath = str(directory/'walk-profile-mid-swing.png')
    bpy.ops.render.render(write_still=True)
    cast = new_scene('Preview_Character_Cast')
    for index,(role,(source,_,_)) in enumerate(characters.items()):
        x=(index-1.5)*1.05
        instance_collection(cast,source.collection.children[0],role,(x,0,0))
        text('Role label',role.upper(),(x,-.18,.45),.095,'cream')
    box('Cast floor',(0,-.022,0),(5.2,.04,2.2),'floor',.005)
    lighting(cast)
    cast.cycles.samples = 16
    camera(cast,(3,2.3,9),(0,.80,0),5.0)
    cast.render.resolution_x,cast.render.resolution_y = 1200,700
    cast.render.resolution_percentage = 100
    cast.render.filepath = str(directory/'character-cast.png')
    bpy.ops.render.render(write_still=True)


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
if opts.characters_only:
    manifest = json.loads((OUT/'manifest.json').read_text())
else:
    for name in ['office','datacenter','lobby','laboratory','balcony']:
        print('BUILD ROOM',name,flush=True)
        rooms[name]=make_room(name)
        manifest['scenes'][name]=rooms[name][2]
for name in ['detective','witness','security','scientist']:
    print('BUILD CHARACTER',name,flush=True)
    characters[name]=make_character(name)
    manifest['characters'][name]={'file':name+'.glb','animations':['Idle','Walk','Talk'],
        'animationNotes':'120fps exact loops: planted relaxed Idle 2s, analytic two-bone IK Walk 1s at 1.4m/s, role-specific standing Talk 2s. Continuous face, sleeve and trouser surfaces with blended jaw/elbow/knee/ankle weights, vented cloth, 19 joints. Left stance [0,.56], right phase +.5. Heel-to-toe roll, planted mid-stance, 6.8cm recovery, 4cm support-phase pelvis rise, lateral weight transfer, pelvis/chest counterrotation, delayed arms and coat.',
        'locomotion':{'speed':WALK_SPEED,'duration':WALK_DURATION},
        'gait':{'stance':STANCE,'heelEnd':.10,'toeStart':.40,'swingLift':.068,'pelvisRise':WALK_HIP_RISE},
        'forward':'+Z','feetY':0}
# Read actual exported data instead of estimating renderer budgets.
sys.path.insert(0,str(Path(__file__).parent))
from validate_assets import inspect_glb
for group in (('characters',) if opts.characters_only else ('scenes','characters')):
    for name,entry in manifest[group].items():
        info=inspect_glb(OUT/entry['file'])
        entry.update({k:info[k] for k in ('bytes','triangles','bounds','meshes','materials')})
        if group=='characters':
            entry['animations']=info['animations']
            entry['height']=round(info['bounds']['max'][1]-info['bounds']['min'][1],4)
manifest['totalBytes']=sum(item['bytes'] for group in ('scenes','characters') for item in manifest[group].values())
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if not opts.skip_render:
    if opts.characters_only:
        render_character_previews(characters)
    else:
        render_previews(rooms,characters)
        render_character_previews(characters)
bpy.context.window.scene=characters['detective'][0] if opts.characters_only else rooms['office'][0]
source_output.parent.mkdir(parents=True,exist_ok=True)
if source_output.exists():
    raise FileExistsError('Refusing to overwrite source created during generation: '+str(source_output))
bpy.ops.wm.save_as_mainfile(filepath=str(source_output),compress=True)
print('THEATER GENERATION COMPLETE',manifest['totalBytes'],'bytes',flush=True)
