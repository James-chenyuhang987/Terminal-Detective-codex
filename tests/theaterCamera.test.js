import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCameraCollision, cameraClearance } from '../src/game/theaterCamera.js';
import { fieldFraming } from '../src/game/theaterVisuals.js';
import { benchmarkCamera } from '../scripts/benchmark-theater-camera.mjs';

function box(scene, x, y, z, width, height, depth) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.set(x, y, z); scene.add(mesh);
  return mesh;
}

test('actual GLB broadphase matches all detailed center-ray hits without sealing portals', async () => {
  const results = await benchmarkCamera({ timing: false });
  for (const result of results) {
    assert.ok(result.rays > 1500);
    assert.equal(result.extraConservative, 0, result.name);
    assert.equal(result.portalClearMeters, 2);
  }
});

test('camera narrowphase preserves height clearance, doors, transformed meshes, and shared cache ownership', () => {
  const scene = new Group();
  const left = box(scene, -2, 1.5, -3, 2, 3, 0.2);
  box(scene, 2, 1.5, -3, 2, 3, 0.2);
  box(scene, 0, 2.8, -3, 2, 0.4, 0.2);
  const cabinet = box(scene, 3, 0.5, 0, 1, 1, 1);
  cabinet.rotation.y = Math.PI / 4;
  const oldBounds = cabinet.geometry.boundingBox;
  const collision = buildCameraCollision(scene);
  assert.equal(buildCameraCollision(scene), collision);
  assert.equal(cabinet.geometry.boundingBox, oldBounds, 'shared geometry must not be changed');
  const direction = new Vector3(0, 0, -1);
  assert.equal(cameraClearance(collision, new Vector3(0, 1.1, 0), direction, 5), 5, 'open door');
  assert.ok(cameraClearance(collision, new Vector3(0, 2.8, 0), direction, 5) < 3, 'lintel');
  assert.ok(cameraClearance(collision, new Vector3(-2, 1.1, 0), direction, 5) < 3, 'wall');
  assert.equal(cameraClearance(collision, new Vector3(3, 2, 2), direction, 4), 4, 'above cabinet, before back wall');
  const origin = new Vector3(3, 0.5, 2);
  const detailed = new Raycaster(origin, direction).intersectObject(cabinet)[0].distance;
  assert.ok(Math.abs(cameraClearance(collision, origin, direction, 5, 0) - detailed) < 1e-7, 'rotated cabinet must use exact triangles, not an inflated whole-object box');
  assert.ok(left.geometry.attributes.position.array.length > 0, 'shared buffers remain usable');
});

test('lens perimeter detects a grazing obstruction that a center-only ray misses', () => {
  const scene = new Group();
  box(scene, 0.13, 1.1, -2, 0.12, 1, 0.2);
  const collision = buildCameraCollision(scene);
  const origin = new Vector3(0, 1.1, 0); const direction = new Vector3(0, 0, -1);
  assert.equal(cameraClearance(collision, origin, direction, 3, 0), 3);
  assert.ok(cameraClearance(collision, origin, direction, 3) < 2);
  assert.equal(cameraClearance(collision, origin, direction, 0), 0);
});

test('prop inspection origins stay outside actual GLB evidence and console meshes on wide and portrait screens', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/assets/theater/manifest.json', import.meta.url), 'utf8'));
  for (const [name, room] of Object.entries(manifest.scenes)) {
    const bytes = readFileSync(new URL(`../public/assets/theater/${room.file}`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const collision = buildCameraCollision(gltf.scene);
    for (const spot of room.hotspots) for (const aspect of [.46, 1.6]) {
      const framing = fieldFraming({ position: spot.position, yaw: 0, pitch: .55, aspect, focus: spot.focusPosition });
      const origin = new Vector3().fromArray(framing.target);
      const direction = new Vector3(Math.sin(framing.yaw) * Math.cos(framing.pitch), Math.sin(framing.pitch), Math.cos(framing.yaw) * Math.cos(framing.pitch));
      const distance = cameraClearance(collision, origin, direction, framing.distance);
      assert.ok(distance > 2, `${name}/${spot.id}/${aspect}: inspection must not collapse into the prop (${distance}m)`);
    }
  }
});
