import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildCameraCollision, cameraClearance } from '../src/game/theaterCamera.js';
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
