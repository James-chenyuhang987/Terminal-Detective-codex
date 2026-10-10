# Original theater asset library

Nine texture-free GLBs for the optional third-person story theater. All geometry,
materials, clothing, facial features, and animation are original procedural work,
generated and rendered locally with Blender 5.2.1 LTS. No external assets, online
generation services, copyrighted character designs, or runtime decoder packages
are used. These are deliberately compact stylized characters, not high-budget
cinematic or photorealistic models.

## Files and visual direction

| Public filename | Contents | Approx. bytes | Triangles |
| --- | --- | ---: | ---: |
| `office.glb` | Bureau, red-thread dossier board, night blinds, forensic case | 980,604 | 16,410 |
| `datacenter.glb` | Data vault, damaged drive, cordon, worklight, transit case | 1,555,424 | 23,994 |
| `lobby.glb` | Surveillance feeds, visitor register, sealed custody cartons | 780,012 | 13,294 |
| `laboratory.glb` | Sample rack, slides, envelopes, gloves, microscope | 855,988 | 15,102 |
| `balcony.glb` | Roof garden, investigation cordon, field case, planters | 733,484 | 13,262 |
| `detective.glb` | Sculpted face, vented noir coat, pinched fedora, notebook/lens | 591,940 | 8,045 |
| `witness.glb` | Slim wine jacket, continuous sleeves, bun, earrings, satchel | 505,732 | 6,968 |
| `security.glb` | Broad uniform, vest/epaulettes, headset/radio | 502,524 | 6,856 |
| `scientist.glb` | Vented lab coat, silver hair, glasses, smaller ID/instruments | 521,536 | 7,340 |

Total GLB payload: **7,027,244 bytes**. Each scene is a joined architectural mesh
with 15–16 material primitives. Each character is one skinned mesh with 10–14
material primitives and 19 joints. Materials are matte navy/cream with amber/cyan
accents. Flat surfaces, rounded edges, organic foliage, and detailed faces keep
the style readable without texture downloads. All scenes have a case workstation
and evidence island plus scene-specific perimeter furnishings.

`public/assets/theater/manifest.json` is the authoritative generated inventory;
read its actual metrics rather than hardcoding the table. The original compressed
editable source is `art/theater/terminal-detective-library.blend` (~1.5 MB), with
`Scene_*` and `Character_*` scenes and their corresponding `*_LIBRARY` collections.
The current full-library model revision has its own editable source,
`art/theater/terminal-detective-model-v4.blend`. The original library,
`terminal-detective-library.blend1` backup, `terminal-detective-motion-v2.blend`,
and `terminal-detective-polish-v3.blend` remain unchanged. The v4 generator adds
continuous facial, sleeve and coat geometry, adult head proportions, distinct
role builds and investigation-specific props; it does not load an existing
source or unsaved Blender GUI data.
Objects are joined by asset to reduce node overhead; mesh material/vertex groups
and armatures remain editable. The generator is the source for editing individual
procedural furnishings. Preview scenes instance the same collections, not copies
of imported external geometry.

## Runtime coordinates and integration

Load using `import.meta.env.BASE_URL + 'assets/theater/' + asset.file`. The files
are binary glTF 2.0 with embedded buffers, no textures, no external URIs, no Draco
or Meshopt requirement, no camera, and no exported lights.

- Units: meters. Runtime Y-up, +Z forward. Character feet start at Y=0.
- Generator accepts runtime `[x,y,z]`, converts to Blender `[x,-z,y]`, then exports
  with `export_yup=True`; **do not rotate the loaded models another 90 degrees**.
- The exported standing detective is 1.809 m including the hat; security/scientist are 1.763 m tall; the witness's bun makes the silhouette 1.796 m.
- Rooms occupy X `[-6,6]`, Z `[-5,5]`; the top floor surface is Y=0 (foundation
  extends down 0.22 m). There is no ceiling and no foreground +Z wall.
- Side walls are cut down to 1.5 m for readable third-person camera composition.
  The balcony uses 0.78 m parapets and 1.16 m handrails. Rear interior walls reach
  3.3 m. All geometry, including the floor, stays inside the promised X/Z bounds.
- Spawn: `[0,0,3]`. Clamp avatar center to X `[-5.5,5.5]`, Z `[-4.6,4.6]`.
- Back portal: `[0,0,-4.65]`, nominal width 1.6 m, clear jamb-to-jamb width 1.52 m.
  The doorway is open; the runtime owns the scene transition.

`FieldAtmosphere.jsx` supplies scene-specific hemisphere fill, directional keys,
local point lights, a generated reflection environment and lightweight contact
shadows. Low quality omits shadow maps; auto uses 512px and high uses 1024px.
The balcony has a deterministic city backdrop. Materials use owned clones with
subtle procedural grain, preserving loader caches and avoiding texture downloads.
Cycles preview lighting remains art inspection data and is not exported.

Clone NPC models with `SkeletonUtils.clone`, not just `Object3D.clone`, so each
instance has its own skeleton. Share immutable geometry and clone materials for owned surface/color finishing;
use an independent `AnimationMixer` per character and crossfade actions. Avoid
rebuilding the loader scene or mixer on each frame. Dispose only resources owned
by an instance, not a shared loader cache. The four role names map generically to
all cases; in Neon Blood, witness → Mei Lin, security → Kenji Mori, scientist →
Dr. Voss. They are not identity-locked likenesses.

### Runtime movement and camera cost

The player approaches the authored speed with an analytically integrated
exponential acceleration (12/s), and turns toward actual travel (18/s). Normal
release, cancellation, blur, pause and Home suspension stop translation immediately;
there is no coasting or held-key restart. Walk phase advances by collision-resolved
distance divided by authored speed, rather than restarting on every press. A blocked
player blends to Idle without walking in place. Walk/Idle/Talk weights blend at 18/s.
Reduced motion disables clip playback; background/suspended frames freeze it.

Nonlinear Idle/Walk skin blending temporarily sank soles by 21.780 mm before
correction, despite the authored full-weight Walk contacts being accurate. The
runtime caches the 64 sole vertices once, samples their deformed local height,
and applies only the necessary upward **model-only** offset. It never changes the
actor's navigation root, mesh buffers, clip phase or game state. The eight-phase
start/stop regression checks the entire deformed model remains above the floor
(with a 0.01 mm numerical tolerance), including during crossfades. This prevents
sinking, not perfect foot locking while turning or crossfading. A local 1,200-frame
v4 CPU measurement took 7.25 µs median / 22.33 µs p95 for the grounding query.

Camera collision builds a cached world-space triangle-bounds BVH once per loaded
static room; exact double-sided leaf tests preserve doorway/lintel and furniture
gaps. The center plus eight lens-perimeter rays avoid per-frame scene traversal,
raycast-result arrays and whole-room bounding boxes. The camera boom contracts
immediately at an obstruction and recovers at 5/s independently of orbit smoothing.
The lens can use the open cutaway front rather than being clamped inside the
room. Arrival, exploration, prop inspection and dialogue have separate framing;
portrait panel framing shifts the projection upward without moving collision
origins. Closing the panel restores exploration projection and input focus.

Reproduce CPU-only measurements with `node scripts/benchmark-theater-camera.mjs`.
On the final v4 meshes, 8,280 deterministic rays across all five rooms matched
the original center-ray geometry checks without misses or conservative false hits;
each portal retained 2 m clearance. The 23,994-triangle datacenter took 52.8 ms to
build once, 914.5 µs per recursive raycast, 13.9 µs per BVH center ray and 149.9 µs for
nine runtime lens rays. These are local CPU measurements; machine/load affects
timings, and they do not establish browser GPU performance or mobile FPS.
At 30/60/144 Hz, two seconds of acceleration travels 2.683333333 m, release travel
is zero, and a held datacenter furniture collision has zero subsequent jitter.

Portrait prop inspection now uses a higher, more oblique view and a 26% vertical
projection shift so the detective's head does not cover the evidence tray above
the bottom sheet. Arrival/dialogue retain their 20% shift. The room setup effect
also resets the published nearby-target cache: an early Fiber frame can otherwise
publish a target before setup clears it, leaving a stationary resumed player's
interaction button disabled. A deferred-effect regression reproduces that order.

### Animation contract

Every character has exact public clip names `Idle`, `Walk`, `Talk`:

- `Idle`: exactly two seconds of breathing and head/arm movement, with relaxed
  standing legs and both soles planted.
- `Walk`: exactly one second, in place, authored for **1.4 m/s** forward travel.
- `Talk`: exactly two seconds of head motion, right-arm gesture, and a small jaw
  articulation blended through the continuous face and lips, with the same
  planted standing legs.

The Blender actions start at frame **0**, not 1, and include the matching terminal
sample at frame 120/240 (120 fps). This removes the old exporter lead-in frame and
~1.042/2.042-second durations. NLA evaluation is disabled while baking actions so
Idle cannot contaminate the first Walk key. Every exported channel closes at its
true endpoint; tests do not hide discontinuities by sampling a wrapped mixer.

Walk uses a connected two-bone leg chain with an analytically solved forward knee.
Each trouser leg is one connected ring surface with normalized blended weights
through the knee and ankle, overlapping the foot's ankle cuff. The rest pose has
soft knees to provide adequate reach. Idle/Talk solve the legs separately instead
of holding the crouched bind pose: the hip-to-ankle extension is tested between
97.5% and 99.9% of chain length, with both soles within 2 mm of the floor.
Stance occupies phase `[0, 0.56]` on the
left, with the right shifted by half a cycle. The weight-bearing heel/toe edge
travels backward at exactly 1.4 m/s, cancelled by runtime translation. Heel roll
settles to flat by phase .10, mid-stance remains flat through .40, and toe-off
completes at .56. Swing uses quintic horizontal recovery matching stance velocity
and acceleration, with 6.8 cm lift and zero velocity/acceleration at both contacts.

Sleeves use a connected rounded surface with blended elbow weights. The face is
one jaw/cheek/brow surface; all hair, glasses and hat geometry follows the same
head proportion transform. Detective and scientist coats use thin solidified
shells with a rear vent and front edges flared outside the moving thighs. The
standing and walking previews expose cloth/leg overlap before shipping.

The pelvis shifts laterally by 2.1 cm each side with subtle vertical transfer.
Pelvis/chest counterrotation, delayed opposing arm swing, elbow/wrist motion and
coat follow-through replace rigid synchronized movement. The head stays steadier.
Idle attention and Talk gesture amplitudes differ by role. Runtime public NPC IDs
select bounded coat colors, stature and animation phase; public emotion levels
add a small guarded/shaken/broken posture change without asserting guilt.

`characters[role].locomotion = { speed: 1.4, duration: 1 }` is optional runtime
metadata in meters/second and seconds. The runtime owns translation and heading;
for other speeds, scale playback rate by actual speed / authored speed. Rotate
both the actor and its travel direction together; there is no root-motion offset
or extra 90-degree asset correction. These contacts assume flat ground and a
fully weighted Walk clip. Crossfades, acceleration, blocked translation, abrupt
turning, stairs and uneven terrain need runtime handling, not a blanket sole
clearance. This remains compact stylized skinning, not cloth simulation, independently articulated toes, runtime terrain IK, or a
production facial blendshape rig.

### Measured v4 motion

Actual Three.js `GLTFLoader`, independent skeleton clones and `AnimationMixer`,
481 samples per loop, using all 64 sole vertices. For heel and toe rolling phases,
measure the supporting edge rather than treating intended boot roll as sliding.
All four models share the gait:

| Metric | V4 |
| --- | ---: |
| Walk duration | 1.000000000 s |
| Worst deformed floor penetration | 0.065 mm |
| Worst supporting sole height | 0.500 mm |
| Worst world-space supporting-edge drift at 1.4 m/s | 0.067 mm |
| Maximum recovery lift | 67.953 mm |
| Whole-character loop endpoint difference | < 0.01 mm (test bound) |
| Runtime corrected blended floor penetration | < 0.01 mm |
| Total GLB payload | 7,027,244 bytes |

Run `node scripts/benchmark-theater-motion.mjs` to reproduce contacts and the
1,200-sample blended start/stop grounding check. A full-stance Walk clip still has
up to 0.5 mm contact clearance, with residual interpolation error from the baked
120 fps poses. Tests allow at most 2 mm sinking, supporting contact height and
sliding; flatness applies to mid-stance, while rolling heel/toe support and the
low swing recovery are checked independently. Crossfades and rapid turning do
not claim perfectly locked feet.

### Manifest schema

```js
{
  version: 1,
  units: 'meters', upAxis: 'Y', forwardAxis: '+Z',
  coordinateConversion: { authoring, toBlender, gltf },
  spawn: [0, 0, 3],
  walkableBounds: { min: [-5.5, -4.6], max: [5.5, 4.6] },
  totalBytes,
  scenes: {
    datacenter: {
      file: 'datacenter.glb', spawn: [0, 0, 3],
      bounds: { min: [x, y, z], max: [x, y, z] },
      colliders: [{ id, min: [x, z], max: [x, z] }],
      doors: [{ id: 'exit', position: [0, 0, -4.65], width: 1.6 }],
      hotspots: [{ id, position: [x, 0, z], focusPosition: [x, y, z], radius: 1.15 }],
      npcs: [{ role, position: [x, 0, z], rotationY }],
      bytes, triangles, meshes, materials
    }
  },
  characters: {
    detective: {
      file: 'detective.glb', animations: ['Idle', 'Walk', 'Talk'],
      bounds: { min: [x, y, z], max: [x, y, z] },
      height, feetY: 0, forward: '+Z', animationNotes,
      locomotion: { speed: 1.4, duration: 1 }, // Optional, meters/second and seconds
      gait: { stance: .56, heelEnd: .10, toeStart: .40, swingLift: .068 },
      bytes, triangles, meshes, materials
    }
  }
}
```

Colliders are conservative axis-aligned **X/Z** rectangles (not Three.js XYZ
`Box3` values). Inflate them by the avatar's approximately 0.25 m radius. They
cover furniture, plinths, plants, wall details, jambs, and perimeter barriers;
floor decoration does not collide, and overhead lintels do not block the doorway.
NPC separation is a runtime concern. Do not create colliders from whole scene
bounds: doing so would block the entire floor.

Interaction and NPC positions now differ by scene. Use each room's manifest
records rather than assuming identical islands. `position` is a reachable ground
interaction point in front of the prop; `focusPosition` is the visible surface
used by inspection cameras and presentation markers. It is separately validated
inside room bounds and must not be used as the player's movement target.
All coordinates are presentation-only; the server action engine owns travel.

Confirmed clue IDs produce preservation tags; confirmed terminal actions produce
a status light. Inspecting a prop only displays clues already in `unlocked_clues`.
These effects never acquire evidence, disclose a formal answer, spend resources
or write player profiles. The actual action cinematic uses cloned rigged detective
models with owned materials/mixers instead of floating wireframe body parts.

## Reproduce, inspect, validate

From the repository root, choose a **new** source filename and an artifact
folder. A normal character-only rebuild is:

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/generate_theater.py -- \
  --characters-only --source-output art/theater/terminal-detective-next-motion.blend \
  --preview-dir .theater-motion-artifacts/previews
python3 scripts/blender/validate_assets.py
node --test tests/theaterAssets.test.js
npx --no-install eslint tests/theaterAssets.test.js --quiet
```

`--source-output` is required. The generator refuses **every existing source
path**, and always refuses the original library path, before changing assets.
It never opens or closes the interactive Blender application, never loads unsaved
GUI data, and never overwrites an existing editable source. Keep
`--characters-only` to preserve all scene GLBs and scene manifest records; only
the four characters, their manifest metadata and `totalBytes` are regenerated.
Omitting it is an explicit full-library rebuild and should not be used for gait
work. Source outputs are new-only even during a full rebuild. It suppresses
`.blend1` backups and bytecode caches and exports only the active asset scene.
Use `--skip-render` instead of `--preview-dir` for an export-only rebuild.
Blender 5.2.1 is the tested authoring version; exporter-dependent byte ordering may
change in another version. Node tests use the project's existing Three.js and
Node test runner; the Python validator needs only Python's standard library.

Character-only generation writes genuine Cycles renders:

- `walk-contact-sheet.png`: four sampled detective walk poses over a reference floor.
- `walk-profile-mid-swing.png`: a close side view exposing the continuous leg joints.
- `character-cast.png`: all four preserved character identities.

The full-library option additionally supports the original
`theater-contact-sheet.png` and `neon-blood-datacenter.png` room previews. These are
Blender renders, not browser screenshots, and are not committed or part of the
browser payload. Session artifacts contain the before/after motion JSON,
source/scene hashes, an original-source read-only baseline render, the sampling
script, and the revised previews. `Idle` is enabled in the editable source;
`Walk` and `Talk` NLA tracks remain muted for preview and export separately under
their exact public names.

Validation covers GLB chunks, buffer/accessor ranges and finite values, indices,
world bounds, mesh/triangle/material budgets, skin joints and normalized weights,
non-static animation channels, exact filenames and metrics, and grid connectivity
from spawn to all doors/hotspots/NPC points with inflated obstacles. The Node suite
also loads every GLB with the project's actual `GLTFLoader`, clones skeletons,
and samples every animation for finite, stable deformed bounds. It verifies exact
clip durations, real endpoint position and loop velocity continuity, connected
leg topology with blended knee/ankle weights, normalized skin weights, visible
swing clearance, heel/flat/toe support, <2 mm supporting-edge drift after authored
translation in four headings, +Z boot direction, and independent cloned poses.
