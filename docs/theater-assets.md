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
| `detective.glb` | Warm complexion, cream split-tail coat, amber scarf | 442,720 | 6,931 |
| `witness.glb` | Wine jacket, asymmetric bun, earrings, satchel | 475,564 | 7,464 |
| `security.glb` | Navy protective vest, shoulder armor, headset/radio | 484,244 | 7,712 |
| `scientist.glb` | Pale lab coat, silver hair, glasses, pocket instruments | 485,516 | 7,412 |

Total GLB payload: **6,101,248 bytes**. Each scene is a joined architectural mesh
with 12–14 material primitives. Each character is one skinned mesh with 10–12
material primitives and 19 joints. Materials are matte navy/cream with amber/cyan
accents. Flat surfaces, rounded edges, organic foliage, and detailed faces keep
the style readable without texture downloads. All scenes have a case workstation
and evidence island plus scene-specific perimeter furnishings.

`public/assets/theater/manifest.json` is the authoritative generated inventory;
read its actual metrics rather than hardcoding the table. The single compressed
editable source is `art/theater/terminal-detective-library.blend` (~1.5 MB), with
`Scene_*` and `Character_*` scenes and their corresponding `*_LIBRARY` collections.
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

### Animation contract

Every character has exact public clip names `Idle`, `Walk`, `Talk`:

- `Idle`: two-second breathing and head/arm movement.
- `Walk`: one-second in-place opposing arms/legs, knee flex, body bob, coat sway.
- `Talk`: two-second head motion, raised right forearm/hand gesture, animated mouth.

Blender samples at 24 fps; the glTF exporter includes a final sample, giving clip
durations ~2.042 s / 1.042 s / 2.042 s. Loop using the actual clip duration. Root
translation is not locomotion: the runtime moves the avatar. All visible parts,
including face, hands, hair, and clothes, have normalized skin weights. This is
stylized rigid-segment skinning with articulated volumes, not a production facial
blendshape or IK rig. A sampled walk can dip the sole by approximately 1.2 cm;
the runtime may apply a small presentation-only ground clearance if desired.

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

From the repository root, choose a session artifact directory outside the repo:

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/generate_theater.py -- \
  --preview-dir /absolute/path/to/session/files/theater-previews
python3 scripts/blender/validate_assets.py
node --test tests/theaterAssets.test.js
npx --no-install eslint tests/theaterAssets.test.js --quiet
```

The generator overwrites only the owned GLBs, manifest, and compressed `.blend`
source. It suppresses `.blend1` backups and bytecode caches. It exports only the
active asset scene, an important distinction when a source library contains many
scenes. Use `--skip-render` instead of `--preview-dir` for an export-only rebuild.
Blender 5.2.1 is the tested authoring version; exporter-dependent byte ordering may
change in another version. Node tests use the project's existing Three.js and
Node test runner; the Python validator needs only Python's standard library.

Two genuine Cycles renders are written to the requested artifact directory:

- `theater-contact-sheet.png`: four characters and all five environments.
- `neon-blood-datacenter.png`: a scene-wide set preview with the original cast.

They are Blender renders, not fabricated browser screenshots. They are not
committed or part of the browser payload. Open them for art inspection; use the
Blender scene selector to inspect each set and the armatures/NLA tracks. `Idle`
is enabled in the editable source, while `Walk` and `Talk` tracks are muted for
preview and exported separately under their own names.

Validation covers GLB chunks, buffer/accessor ranges and finite values, indices,
world bounds, mesh/triangle/material budgets, skin joints and normalized weights,
non-static animation channels, exact filenames and metrics, and grid connectivity
from spawn to all doors/hotspots/NPC points with inflated obstacles. The Node suite
also loads every GLB with the project's actual `GLTFLoader`, clones skeletons,
and samples every animation for finite, stable deformed bounds.
