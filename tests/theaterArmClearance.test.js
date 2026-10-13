import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3, Ray, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createAvatarAnimation, updateAvatarAnimation } from '../src/game/theaterMotion.js';

const bytes = readFileSync(new URL('../public/assets/theater/detective.glb', import.meta.url));
const detective = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
const positionKey = point => point.toArray().map(value => value.toFixed(5)).join(',');
const isArm = name => /^(UpperArm|Elbow|Forearm|Hand)[LR]$/.test(name);

function posedVertex({ mesh, index }) {
  const point = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index);
  mesh.applyBoneTransform(index, point);
  return mesh.localToWorld(point);
}

function armClearance(model) {
  model.updateMatrixWorld(true);
  const arms = [], armEdges = [], surfaces = [];
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const influences = Array.from({ length: position.count }, (_, index) =>
      Array.from({ length: 4 }, (_, component) => ({
        name: mesh.skeleton.bones[skinIndex.getComponent(index, component)].name,
        weight: skinWeight.getComponent(index, component),
      })).filter(({ weight }) => weight > .001).map(({ name }) => name));
    const rest = Array.from({ length: position.count }, (_, index) => posedVertex({ mesh, index }));
    const armIndices = new Map();
    for (let index = 0; index < position.count; index++) {
      // The sleeve cap is sewn into the torso. Test the freely moving arm
      // below that attachment, including the entire glove and cuff.
      if (!influences[index].some(isArm) || rest[index].y >= 1.28) continue;
      armIndices.set(index, arms.length);
      arms.push({ mesh, index });
    }
    const indices = mesh.geometry.index;
    const triangles = Array.from({ length: indices.count / 3 }, (_, index) =>
      [indices.getX(index * 3), indices.getX(index * 3 + 1), indices.getX(index * 3 + 2)]);
    const seenEdges = new Set(), neighbors = new Map();
    triangles.forEach((triangle, index) => {
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge], b = triangle[(edge + 1) % 3];
        const edgeKey = [a, b].sort((left, right) => left - right).join(',');
        if (armIndices.has(a) && armIndices.has(b) && !seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          armEdges.push([armIndices.get(a), armIndices.get(b)]);
        }
        const key = positionKey(rest[a]);
        if (!neighbors.has(key)) neighbors.set(key, []);
        neighbors.get(key).push(index);
      }
    });
    // Weld positions across hard-normal seams so the notebook, coat, legs,
    // lapels and every lens piece are independent physical surfaces.
    const seen = new Set();
    for (let index = 0; index < triangles.length; index++) {
      if (seen.has(index)) continue;
      const component = [index];
      seen.add(index);
      for (let cursor = 0; cursor < component.length; cursor++) {
        for (const vertex of triangles[component[cursor]]) {
          for (const neighbor of neighbors.get(positionKey(rest[vertex]))) {
            if (seen.has(neighbor)) continue;
            seen.add(neighbor);
            component.push(neighbor);
          }
        }
      }
      const vertices = [...new Set(component.flatMap(triangle => triangles[triangle]))];
      const bones = [...new Set(vertices.flatMap(vertex => influences[vertex]))];
      if (bones.some(isArm)) continue;
      const bounds = new Box3().setFromPoints(vertices.map(vertex => rest[vertex]));
      if (bounds.min.y > 1.45 || bounds.max.y < .55) continue;
      const edges = new Map();
      for (const triangle of component.map(vertex => triangles[vertex])) {
        for (let edge = 0; edge < 3; edge++) {
          const key = [positionKey(rest[triangle[edge]]), positionKey(rest[triangle[(edge + 1) % 3]])].sort().join('|');
          edges.set(key, (edges.get(key) || 0) + 1);
        }
      }
      surfaces.push({
        mesh, vertices, triangles: component.map(triangle => triangles[triangle]),
        closed: [...edges.values()].every(count => count === 2),
        label: `${mesh.material.name}/${bones.join(',')}`,
      });
    }
  });
  assert.ok(arms.length > 1500 && armEdges.length > 2000, 'Measure both complete exported sleeves and gloves');
  assert.ok(surfaces.some(surface => surface.label === 'wood/Hips' && surface.closed), 'Include the closed notebook surface');
  assert.ok(surfaces.filter(surface => surface.label === 'brass/Hips' && surface.closed).length >= 17, 'Include the lens rim and handle');
  assert.ok(surfaces.some(surface => surface.label === 'coat-noir/Spine' && surface.triangles.length > 500 && surface.closed), 'Include the actual closed coat torso');
  const ray = new Ray(), intersection = new Vector3(), closest = new Vector3();
  const triangle = new Triangle(), segmentBounds = new Box3();
  const direction = new Vector3(.173, .317, 1).normalize();
  return label => {
    model.updateMatrixWorld(true);
    const armPoints = arms.map(posedVertex);
    for (const surface of surfaces) {
      const points = new Map(surface.vertices.map(index => [index, posedVertex({ mesh: surface.mesh, index })]));
      const bounds = new Box3().setFromPoints([...points.values()]);
      const triangles = surface.triangles.map(vertices => vertices.map(index => points.get(index)));
      if (surface.closed) {
        for (const point of armPoints) {
          if (!bounds.containsPoint(point)) continue;
          ray.origin.copy(point);
          ray.direction.copy(direction);
          const hits = [];
          for (const [a, b, c] of triangles) {
            if (!ray.intersectTriangle(a, b, c, false, intersection)) continue;
            const distance = point.distanceTo(intersection);
            if (!hits.some(hit => Math.abs(hit - distance) < .000001)) hits.push(distance);
          }
          if (hits.length % 2 === 0) continue;
          const depth = Math.min(...triangles.map(([a, b, c]) =>
            point.distanceTo(triangle.set(a, b, c).closestPointToPoint(point, closest))));
          assert.ok(depth < .0002, `${label}: arm penetrates ${surface.label} by ${(depth * 1000).toFixed(2)} mm`);
        }
      }
      // Edge/triangle intersections also catch thin accessories and open
      // lapel/scarf panels that a vertex-inside-volume check would miss.
      for (const [startIndex, endIndex] of armEdges) {
        const start = armPoints[startIndex], end = armPoints[endIndex];
        segmentBounds.setFromPoints([start, end]);
        if (!segmentBounds.intersectsBox(bounds)) continue;
        const length = start.distanceTo(end);
        ray.origin.copy(start);
        ray.direction.subVectors(end, start).divideScalar(length);
        for (const [a, b, c] of triangles) {
          if (!ray.intersectTriangle(a, b, c, false, intersection)) continue;
          const distance = start.distanceTo(intersection);
          assert.ok(distance < .00001 || distance > length - .00001,
            `${label}: arm edge crosses ${surface.label} at ${intersection.toArray()}`);
        }
      }
    }
  };
}

test('detective sleeves and gloves clear the coat, legs and belt tools throughout Walk and Idle blends', () => {
  const model = clone(detective.scene), check = armClearance(model);
  const mixer = new AnimationMixer(model);
  const walk = mixer.clipAction(detective.animations.find(clip => clip.name === 'Walk')).play();
  const idle = mixer.clipAction(detective.animations.find(clip => clip.name === 'Idle')).play();
  walk.paused = true; idle.paused = true;
  for (let frame = 0; frame < 240; frame++) {
    walk.time = frame / 240;
    walk.setEffectiveWeight(1); idle.setEffectiveWeight(0);
    mixer.update(0);
    check(`Walk ${frame}/240`);
  }
  for (let phase = 0; phase < 24; phase++) {
    for (let step = 0; step <= 8; step++) {
      walk.time = phase / 24;
      walk.setEffectiveWeight(step / 8); idle.setEffectiveWeight(1 - step / 8);
      mixer.update(0);
      check(`Idle/Walk phase ${phase}/24, blend ${step}/8`);
    }
  }
});

test('actual conversation transitions keep the full arms clear of clothes and accessories at display frame rates', () => {
  for (const hz of [30, 60, 144]) {
    for (const startPhase of [0, .25, .5, .75]) {
      const model = clone(detective.scene), check = armClearance(model);
      const instance = createAvatarAnimation(new AnimationMixer(model), detective.animations);
      // Warm up from the real Idle pose before sampling stop-to-talk and
      // talk-to-walk. This also exercises the runtime's separate leg blend.
      for (let frame = 0; frame < hz; frame++) {
        updateAvatarAnimation(instance, 1 / hz, { speed: 1.4, distance: 1.4 / hz });
      }
      instance.actions.Walk.time = startPhase;
      for (let frame = 0; frame < hz * 3; frame++) {
        const walking = frame >= hz * 2;
        updateAvatarAnimation(instance, 1 / hz, {
          talking: !walking, speed: walking ? 1.4 : 0, distance: walking ? 1.4 / hz : 0,
        });
        if (frame % Math.max(1, Math.floor(hz / 30)) === 0) {
          check(`${hz} Hz, phase ${startPhase}, frame ${frame}`);
        }
      }
    }
  }
});
