import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCameraCollision, cameraClearance } from '../src/game/theaterCamera.js';
import { isWalkable, validateTheaterManifest } from '../src/game/theaterWorld.js';

// CPU-only, real Three GLTFLoader geometry, deterministic physical ray corpus; not a GPU/FPS test.
export async function benchmarkCamera({ timing = true } = {}) {
  const manifest = validateTheaterManifest(JSON.parse(readFileSync(new URL('../public/assets/theater/manifest.json', import.meta.url), 'utf8')));
  const results = [];
  for (const [name, room] of Object.entries(manifest.scenes)) {
    const buffer = readFileSync(new URL(`../public/assets/theater/${room.file}`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    gltf.scene.updateMatrixWorld(true);
    const started = performance.now();
    const collision = buildCameraCollision(gltf.scene);
    const buildMs = performance.now() - started;
    assert.equal(buildCameraCollision(gltf.scene), collision, 'cached, not rebuilt per frame');
    const rays = [];
    for (let x = -5; x <= 5; x += 1) for (let z = -4; z <= 4; z += 1) {
      if (!isWalkable([x, 0, z], room)) continue;
      for (let step = 0; step < 24; step++) {
        const yaw = step / 24 * Math.PI * 2;
        const origin = new Vector3(x, 1.1, z);
        const lens = new Vector3(
          Math.max(-5.6, Math.min(5.6, x + Math.sin(yaw) * Math.cos(0.55) * 5.2)),
          Math.min(room.bounds.max[1] - 0.18, 1.1 + Math.sin(0.55) * 5.2),
          Math.max(-4.6, Math.min(4.6, z + Math.cos(yaw) * Math.cos(0.55) * 5.2)),
        );
        rays.push({ origin, direction: lens.clone().sub(origin).normalize(), distance: lens.distanceTo(origin) });
      }
    }
    const ray = new Raycaster();
    const original = item => {
      ray.set(item.origin, item.direction); ray.far = item.distance;
      return ray.intersectObject(gltf.scene, true)[0]?.distance ?? item.distance;
    };
    const optimized = item => cameraClearance(collision, item.origin, item.direction, item.distance, 0);
    let hits = 0; let extraConservative = 0; let excess = 0; let maximumExcess = 0;
    for (const item of rays) {
      const old = original(item); const next = optimized(item);
      assert.ok(next <= old + 1e-5, `${name}: missed occluder ${next} > ${old}`);
      if (old < item.distance) hits++;
      if (next < old - 0.001) { extraConservative++; excess += old - next; maximumExcess = Math.max(maximumExcess, old - next); }
    }
    const portal = cameraClearance(collision, new Vector3(0, 1.1, -4), new Vector3(0, 0, -1), 2);
    assert.equal(portal, 2, `${name}: open portal was sealed`);
    const times = fn => {
      if (!timing) return null;
      for (const item of rays) fn(item);
      const samples = [];
      for (let run = 0; run < 5; run++) {
        const start = performance.now();
        for (const item of rays) fn(item);
        samples.push((performance.now() - start) * 1000 / rays.length);
      }
      samples.sort((a, b) => a - b);
      return samples[2];
    };
    const recursiveUs = times(original); const proxyUs = times(optimized);
    const lensUs = times(item => cameraClearance(collision, item.origin, item.direction, item.distance));
    results.push({ name, rays: rays.length, triangles: collision.triangleCount, buildMs, recursiveUs, proxyUs, lensUs, speedup: recursiveUs / lensUs, hits, extraConservative, meanExtraMeters: excess / rays.length, maxExtraMeters: maximumExcess, portalClearMeters: portal });
  }
  return results;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) console.log(JSON.stringify(await benchmarkCamera(), null, 2));
