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
| `office.glb` | Detective bureau, caseboard/threaded dossiers, archive, sofa | 706,016 | 11,728 |
| `datacenter.glb` | Neon Blood data vault, detailed server racks, cooling fans | 1,401,552 | 21,908 |
| `lobby.glb` | Aureole penthouse surveillance feeds, seating, abstract sculpture | 719,576 | 12,644 |
| `laboratory.glb` | Voss research lockers, specimen capsules, microscope | 766,416 | 14,064 |
| `balcony.glb` | Roof garden, parapets/rails, weather lanterns, raised planters | 619,644 | 11,788 |
| `detective.glb` | Warm complexion, cream split-tail coat, amber scarf | 460,540 | 7,291 |
| `witness.glb` | Wine jacket, asymmetric bun, earrings, satchel | 493,384 | 7,824 |
| `security.glb` | Navy protective vest, shoulder armor, headset/radio | 502,064 | 8,072 |
| `scientist.glb` | Pale lab coat, silver hair, glasses, pocket instruments | 503,336 | 7,772 |

Total GLB payload: **6,172,528 bytes**. Each scene is a joined architectural mesh
with 12–14 material primitives. Each character is one skinned mesh with 10–12
material primitives and 19 joints. Materials are matte navy/cream with amber/cyan
accents. Flat surfaces, rounded edges, organic foliage, and detailed faces keep
the style readable without texture downloads. All scenes have a case workstation
and evidence island plus scene-specific perimeter furnishings.

`public/assets/theater/manifest.json` is the authoritative generated inventory;
read its actual metrics rather than hardcoding the table. The original compressed
editable source is `art/theater/terminal-detective-library.blend` (~1.5 MB), with
`Scene_*` and `Character_*` scenes and their corresponding `*_LIBRARY` collections.
The motion revision does not modify it, including during regeneration. Existing
user saves and `.blend1` backups must be preserved; baseline source/scene hashes
for this isolated revision are recorded in its validation artifacts.
The improved characters and gait previews have a separate editable source,
`art/theater/terminal-detective-motion-v2.blend`. No room meshes, scene layout,
colliders, or scene manifest records changed in the motion revision.
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
- Characters are 1.778 m tall; the witness's bun makes the silhouette 1.818 m.
- Rooms occupy X `[-6,6]`, Z `[-5,5]`; the top floor surface is Y=0 (foundation
  extends down 0.22 m). There is no ceiling and no foreground +Z wall.
- Side walls are cut down to 1.5 m for readable third-person camera composition.
  The balcony uses 0.78 m parapets and 1.16 m handrails. Rear interior walls reach
  3.3 m. All geometry, including the floor, stays inside the promised X/Z bounds.
- Spawn: `[0,0,3]`. Clamp avatar center to X `[-5.5,5.5]`, Z `[-4.6,4.6]`.
- Back portal: `[0,0,-4.65]`, nominal width 1.6 m, clear jamb-to-jamb width 1.52 m.
  The doorway is open; the runtime owns the scene transition.

The runtime should supply hemisphere/ambient fill and soft directional light.
Use an sRGB output and a filmic tone mapping appropriate to the rest of the app;
small emissive strips do not illuminate adjacent surfaces by themselves. Bloom
is optional. Cycles preview lighting is for art inspection and is not exported.

Clone NPC models with `SkeletonUtils.clone`, not just `Object3D.clone`, so each
instance has its own skeleton. Share immutable geometry/materials where possible;
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

Nonlinear Idle/Walk skin blending temporarily sank soles by 26.086 mm before
correction, despite the authored full-weight Walk contacts being accurate. The
runtime caches the 64 sole vertices once, samples their deformed local height,
and applies only the necessary upward **model-only** offset. It never changes the
actor's navigation root, mesh buffers, clip phase or game state. The eight-phase
start/stop regression checks the entire deformed model remains above the floor
(with a 0.01 mm numerical tolerance), including during crossfades. This prevents
sinking, not perfect foot locking while turning or crossfading. A local 1,200-frame
CPU measurement took 8.6 µs median / 23.6 µs p95 for the grounding query.

Camera collision builds a cached world-space triangle-bounds BVH once per loaded
static room; exact double-sided leaf tests preserve doorway/lintel and furniture
gaps. The center plus eight lens-perimeter rays avoid per-frame scene traversal,
raycast-result arrays and whole-room bounding boxes. The camera boom contracts
immediately at an obstruction and recovers at 5/s independently of orbit smoothing.
The rendering quality presets, antialiasing and shadows are unchanged.

Reproduce CPU-only measurements with `node scripts/benchmark-theater-camera.mjs`.
A local Node run on 8,304 deterministic camera rays across five actual GLBs found
no center-ray occlusion misses or conservative false hits; every open portal retained
2 m clearance. Datacenter (21,908 triangles) took 72 ms to build once, then 525 µs
per original recursive raycast versus 16.6 µs for a BVH center ray or 146 µs for all
nine runtime lens rays (**3.6× faster with additional lens coverage**). Timings vary
with machine/load; these are CPU costs, not browser/GPU or device-FPS claims.
At 30/60/144 Hz, two seconds of acceleration travels 2.683333333 m, release travel
is zero, and a held datacenter furniture collision has zero subsequent jitter.

### Animation contract

Every character has exact public clip names `Idle`, `Walk`, `Talk`:

- `Idle`: exactly two seconds of breathing and head/arm movement.
- `Walk`: exactly one second, in place, authored for **1.4 m/s** forward travel.
- `Talk`: exactly two seconds of head motion, right-arm gesture, and a small jaw
  articulation shared by the chin, lower muzzle and lips (not floating mouth rods).

The Blender actions start at frame **0**, not 1, and include the matching terminal
sample at frame 60/120 (60 fps). This removes the old exporter lead-in frame and
~1.042/2.042-second durations. NLA evaluation is disabled while baking actions so
Idle cannot contaminate the first Walk key. Every exported channel closes at its
true endpoint; tests do not hide discontinuities by sampling a wrapped mixer.

Walk uses a connected two-bone leg chain with an analytically solved forward knee.
Each trouser leg is one connected ring surface with normalized blended weights
through the knee and ankle, overlapping the foot's ankle cuff. The rest pose has
soft knees to provide adequate reach. Stance occupies phase `[0, 0.52]` on the
left, with the right shifted by half a cycle. Its sole travels backward at exactly
1.4 m/s in model space; runtime forward translation cancels that movement. Swing
uses quintic horizontal recovery matching stance velocity and acceleration at
both contacts, and a sixth-degree 10.5 cm lift with zero velocity/acceleration at
lift-off and touchdown. The ankle counter-rotates to keep the whole boot flat.
Hips compress by a **constant 5.5 cm** while walking: no `abs(sin)` body bob or
sinusoidal thigh/shin swing. Arms and coat follow the authored foot trajectory.

`characters[role].locomotion = { speed: 1.4, duration: 1 }` is optional runtime
metadata in meters/second and seconds. The runtime owns translation and heading;
for other speeds, scale playback rate by actual speed / authored speed. Rotate
both the actor and its travel direction together; there is no root-motion offset
or extra 90-degree asset correction. These contacts assume flat ground and a
fully weighted Walk clip. Crossfades, acceleration, blocked translation, abrupt
turning, stairs and uneven terrain need runtime handling, not a blanket sole
clearance. This remains compact stylized skinning, not cloth simulation, foot
roll/toe articulation, runtime IK, or a production facial blendshape rig.

### Measured motion revision

Actual Three.js `GLTFLoader` + `SkeletonUtils.clone` + `AnimationMixer`, 481 samples
per loop, measuring all 64 lowest sole vertices across both feet. All four models
share the gait and produce the same results:

| Metric | Original | Motion v2 |
| --- | ---: | ---: |
| Walk duration | 1.041666627 s | 1.000000000 s |
| Worst deformed floor penetration | 11.686 mm | **0.229 mm** |
| Worst stance sole height / tilt | 389.093 / 194.037 mm* | **0.501 / 0.501 mm** |
| Worst world-space stance drift at 1.4 m/s | 1,116.870 mm* | **0.232 mm** |
| Whole-character loop endpoint difference | — | < 0.01 mm (test bound) |
| Total GLB payload | 6,101,248 bytes | 6,172,528 bytes (+1.17%) |

\*The old sinusoidal gait had no authored stance interval; these values use the
new left/right contact windows as a regression comparison, not a claim that the
old feet were actually planted. The floor-penetration measurement is independent
of that convention. Run `node scripts/benchmark-theater-motion.mjs` from the
repository root to reproduce contacts and eight-phase blended start/stop grounding
measurements using the existing Three.js without additional packages. The
`comparison.json` and `source-safety.json` artifacts preserve the actual before/
after results and protected hashes. Residual sub-millimeter errors are from 60 fps quaternion
interpolation between baked IK poses. Tests allow at most 2 mm sinking, height,
and whole-stance drift; flatness is checked throughout swing as well.

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
      hotspots: [{ id, position: [x, 0, z], radius: 1.15 }],
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

Every room uses these reachable ground positions:

| Use | Position | Y rotation |
| --- | --- | --- |
| Workstation hotspot | `[-3.6,0,-1.55]` | — |
| Evidence hotspot | `[3.7,0,-1.7]` | — |
| Witness | `[-2.1,0,0.25]` | `0.25` |
| Security | `[2.1,0,1.35]` | `-0.35` |
| Scientist | `[2.1,0,-2.25]` | `-0.25` |

Positions are interaction/standing points in front of props, **not prop centers**.
The physical islands sit farther back, leaving the center corridor accessible.
These are presentation coordinates only, never authoritative game-state actions.

## Reproduce, inspect, validate

From the repository root, choose a **new** source filename and an artifact
folder. A normal character-only rebuild is:

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/generate_theater.py -- \
  --characters-only --source-output art/theater/terminal-detective-motion-v3.blend \
  --preview-dir .theater-motion-artifacts/previews
python3 scripts/blender/validate_assets.py
node --test tests/theaterAssets.test.js
npx --no-install eslint tests/theaterAssets.test.js --quiet
```

`--source-output` is required. The generator refuses **every existing source
path**, and always refuses the original library path, before changing assets.
It never opens or closes the interactive Blender application, never loads unsaved
GUI data, and never overwrites either editable source. Keep
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
swing clearance, sole flatness/ground contact, <2 mm stance drift after authored
translation in four headings, +Z boot direction, and independent cloned poses.
