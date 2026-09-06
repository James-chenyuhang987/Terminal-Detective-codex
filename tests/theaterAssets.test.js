import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const assetRoot = new URL('../public/assets/theater/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));

function glb(filename) {
  const buffer = readFileSync(new URL(filename, assetRoot));
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  const size = buffer.readUInt32LE(12);
  const document = JSON.parse(buffer.toString('utf8', 20, 20 + size));
  const binOffset = 20 + size;
  assert.equal(buffer.readUInt32LE(binOffset + 4), 0x004e4942);
  const binary = buffer.subarray(binOffset + 8);
  assert.equal(buffer.readUInt32LE(binOffset), binary.length);
  return { buffer, document, binary };
}

function floats(document, binary, index) {
  const accessor = document.accessors[index];
  assert.equal(accessor.componentType, 5126);
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  assert.ok(width);
  const view = document.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? width * 4;
  return Array.from({ length: accessor.count }, (_, i) =>
    Array.from({ length: width }, (_, j) => binary.readFloatLE(start + i * stride + j * 4)));
}

test('theater manifest preserves the public filenames and mobile budget', () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.units, 'meters');
  assert.equal(manifest.upAxis, 'Y');
  assert.equal(manifest.forwardAxis, '+Z');
  assert.deepEqual(manifest.spawn, [0, 0, 3]);
  assert.deepEqual(Object.keys(manifest.scenes).sort(), ['balcony', 'datacenter', 'laboratory', 'lobby', 'office']);
  assert.deepEqual(Object.keys(manifest.characters).sort(), ['detective', 'scientist', 'security', 'witness']);
  let total = 0;
  for (const [name, asset] of Object.entries({ ...manifest.scenes, ...manifest.characters })) {
    assert.equal(asset.file, `${name}.glb`);
    const { buffer, document, binary } = glb(asset.file);
    assert.equal(document.asset.version, '2.0');
    assert.equal(document.scenes.length, 1, 'Export only the active asset scene');
    assert.equal(buffer.length, asset.bytes);
    assert.ok(buffer.length < 2_000_000, `${name} exceeds 2MB`);
    assert.ok(!document.images?.length && !document.textures?.length, 'No external or embedded textures');
    assert.ok(!document.extensionsRequired?.length, 'No decoder dependency');
    assert.ok(!document.cameras?.length, 'Runtime owns cameras');
    assert.ok(!document.extensions?.KHR_lights_punctual, 'Runtime owns lighting');
    assert.equal(document.buffers.length, 1);
    assert.equal(document.buffers[0].uri, undefined);
    assert.ok(document.buffers[0].byteLength <= binary.length);
    for (const view of document.bufferViews) {
      assert.equal(view.buffer, 0);
      assert.ok((view.byteOffset ?? 0) + view.byteLength <= binary.length);
    }
    let triangles = 0;
    for (const mesh of document.meshes) {
      for (const primitive of mesh.primitives) {
        assert.equal(primitive.mode ?? 4, 4);
        const accessor = document.accessors[primitive.indices];
        assert.equal(accessor.count % 3, 0);
        triangles += accessor.count / 3;
      }
    }
    assert.equal(triangles, asset.triangles);
    total += buffer.length;
  }
  assert.equal(total, manifest.totalBytes);
  assert.ok(total < 8_000_000);
});

for (const [name, character] of Object.entries(manifest.characters)) {
  test(`${name} has a real skin and changing Idle, Walk, Talk skeletal animation`, () => {
    const { document, binary } = glb(character.file);
    assert.ok(document.skins.length > 0);
    assert.deepEqual(document.animations.map((clip) => clip.name).sort(), ['Idle', 'Talk', 'Walk']);
    assert.ok(Math.abs(character.bounds.min[1]) < 0.001);
    assert.ok(character.height > 1.68 && character.height < 1.9);
    for (const node of document.nodes.filter((item) => item.skin !== undefined)) {
      const skin = document.skins[node.skin];
      assert.ok(skin.joints.length >= 15);
      assert.equal(document.accessors[skin.inverseBindMatrices].count, skin.joints.length);
      for (const primitive of document.meshes[node.mesh].primitives) {
        assert.ok(primitive.attributes.JOINTS_0 !== undefined);
        assert.ok(primitive.attributes.WEIGHTS_0 !== undefined);
        const weights = floats(document, binary, primitive.attributes.WEIGHTS_0);
        assert.ok(weights.every((row) => Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 0.0001));
      }
    }
    for (const clip of document.animations) {
      const movingChannels = clip.channels.filter((channel) => {
        const sampler = clip.samplers[channel.sampler];
        const times = floats(document, binary, sampler.input);
        assert.ok(times.every((row, i) => i === 0 || row[0] > times[i - 1][0]));
        const values = floats(document, binary, sampler.output);
        assert.equal(values.length, times.length);
        return values.some((row) => row.some((value, j) => Math.abs(value - values[0][j]) > 0.00001));
      });
      assert.ok(movingChannels.length > 0, `${clip.name} must not be a static placeholder`);
    }
  });
}

test('all assets load in the existing Three.js GLTFLoader and cloned skins animate independently', async () => {
  const loader = new GLTFLoader();
  for (const [name, asset] of Object.entries({ ...manifest.scenes, ...manifest.characters })) {
    const bytes = readFileSync(new URL(asset.file, assetRoot));
    const result = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
    const bounds = new Box3().setFromObject(result.scene, true);
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
      assert.ok(Math.abs(bounds.min[axis] - asset.bounds.min[index]) < 0.001, `${name} min ${axis}`);
      assert.ok(Math.abs(bounds.max[axis] - asset.bounds.max[index]) < 0.001, `${name} max ${axis}`);
    }
    if (!asset.animations) continue;
    const character = clone(result.scene);
    const originalSkeletons = [];
    result.scene.traverse((object) => { if (object.isSkinnedMesh) originalSkeletons.push(object.skeleton); });
    character.traverse((object) => {
      if (object.isSkinnedMesh) assert.ok(!originalSkeletons.includes(object.skeleton));
    });
    const mixer = new AnimationMixer(character);
    for (const clip of result.animations) {
      mixer.stopAllAction();
      mixer.clipAction(clip).play();
      assert.ok(clip.duration >= 1 && clip.duration < 2.1);
      for (let frame = 0; frame <= 24; frame += 1) {
        mixer.setTime(clip.duration * frame / 24);
        character.updateMatrixWorld(true);
        character.traverse((object) => {
          if (!object.isSkinnedMesh) return;
          object.skeleton.update();
          object.computeBoundingBox();
          const box = object.boundingBox;
          assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.y));
          assert.ok(box.min.y >= -0.02 && box.max.y < 1.9, `${name}/${clip.name}: stable floor/head bounds`);
          assert.ok(box.min.x > -1 && box.max.x < 1, `${name}/${clip.name}: no exploding skin`);
        });
      }
    }
  }
});

for (const [name, scene] of Object.entries(manifest.scenes)) {
  test(`${name} keeps avatar spawn and every advertised interaction reachable`, () => {
    assert.deepEqual(scene.spawn, [0, 0, 3]);
    assert.ok(scene.bounds.min[0] >= -6.001 && scene.bounds.max[0] <= 6.001);
    assert.ok(scene.bounds.min[2] >= -5.001 && scene.bounds.max[2] <= 5.001);
    assert.equal(new Set(scene.colliders.map((box) => box.id)).size, scene.colliders.length);
    const blocked = (x, z) => scene.colliders.some(({ min, max }) =>
      x > min[0] - 0.25 && x < max[0] + 0.25 && z > min[1] - 0.25 && z < max[1] + 0.25);
    const key = (x, z) => `${x},${z}`;
    const visited = new Set([key(0, 30)]);
    const queue = [[0, 30]];
    for (let index = 0; index < queue.length; index += 1) {
      const [x, z] = queue[index];
      for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
        if (nx < -55 || nx > 55 || nz < -47 || nz > 46 || visited.has(key(nx, nz)) || blocked(nx / 10, nz / 10)) continue;
        visited.add(key(nx, nz));
        queue.push([nx, nz]);
      }
    }
    for (const spot of [...scene.doors, ...scene.hotspots, ...scene.npcs]) {
      const [x, y, z] = spot.position;
      assert.equal(y, 0);
      assert.equal(blocked(x, z), false, `${spot.id ?? spot.role} is blocked`);
      assert.ok(visited.has(key(Math.round(x * 10), Math.round(z * 10))), `${spot.id ?? spot.role} is unreachable`);
    }
  });
}
