import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3, LoopOnce, Vector3 } from 'three';
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
    assert.equal(character.forward, '+Z');
    assert.deepEqual(character.locomotion, { speed: 1.4, duration: 1 });
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

function updateSkin(model) {
  model.updateMatrixWorld(true);
  model.traverse((object) => { if (object.isSkinnedMesh) object.skeleton.update(); });
}

function posedVertex({ mesh, index }, target = new Vector3()) {
  return mesh.getVertexPosition(index, target).applyMatrix4(mesh.matrixWorld);
}

for (const [name, asset] of Object.entries(manifest.characters)) {
  test(`${name} has continuous planted IK soles, exact loops and independent poses in Three.js`, async () => {
    const { buffer } = glb(asset.file);
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
    const model = clone(gltf.scene);
    const other = clone(gltf.scene);
    updateSkin(model);
    updateSkin(other);
    const vertices = [];
    const soles = { L: [], R: [] };
    const jointBlends = new Set();
    const continuousLegs = new Set();
    model.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const parent = Array.from({ length: position.count }, (_, i) => i);
      const root = (i) => {
        while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
        return i;
      };
      const indices = mesh.geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        parent[root(indices.getX(i + 1))] = root(indices.getX(i));
        parent[root(indices.getX(i + 2))] = root(indices.getX(i));
      }
      const components = new Map();
      for (let index = 0; index < position.count; index += 1) {
        const point = { mesh, index };
        vertices.push(point);
        const influences = Array.from({ length: 4 }, (_, component) => ({
          bone: mesh.skeleton.bones[skinIndex.getComponent(index, component)].name,
          weight: skinWeight.getComponent(index, component),
        })).filter(({ weight }) => weight > 0.001);
        const component = root(index);
        if (!components.has(component)) components.set(component, new Set());
        influences.forEach(({ bone }) => components.get(component).add(bone));
        for (const side of ['L', 'R']) {
          if (influences.some((i) => i.bone === `Shin${side}`) && influences.some((i) => i.bone === `Thigh${side}`)) jointBlends.add(`knee${side}`);
          if (influences.some((i) => i.bone === `Shin${side}`) && influences.some((i) => i.bone === `Foot${side}`)) jointBlends.add(`ankle${side}`);
          if (influences.length === 1 && influences[0].bone === `Foot${side}` && posedVertex(point).y < 0.001) soles[side].push(point);
        }
      }
      for (const bones of components.values()) {
        for (const side of ['L', 'R']) {
          if (['Thigh', 'Shin', 'Foot'].every((joint) => bones.has(joint + side))) continuousLegs.add(side);
        }
      }
    });
    assert.deepEqual([...jointBlends].sort(), ['ankleL', 'ankleR', 'kneeL', 'kneeR']);
    assert.deepEqual([...continuousLegs].sort(), ['L', 'R'], 'Each leg is a connected surface through hip, knee and ankle, not floating segments');
    for (const side of ['L', 'R']) {
      assert.ok(soles[side].length >= 8, 'Measure actual deformed sole vertices, not just bone origins');
      const zs = soles[side].map((point) => posedVertex(point).z);
      assert.ok(Math.max(...zs) > 0.18 && Math.min(...zs) > -0.09, 'The boot toe points +Z');
    }
    const otherBones = [];
    other.traverse((bone) => { if (bone.isBone) otherBones.push([bone, bone.matrixWorld.clone()]); });
    const mixer = new AnimationMixer(model);
    let activeAction;
    const sample = (time) => {
      activeAction.paused = false;
      mixer.setTime(time);
      updateSkin(model);
    };
    for (const clip of gltf.animations) {
      mixer.stopAllAction();
      assert.equal(clip.duration, clip.name === 'Walk' ? asset.locomotion.duration : 2);
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      activeAction = action;
      sample(0);
      const start = vertices.map((point) => posedVertex(point));
      sample(clip.duration);
      assert.ok(vertices.every((point, i) => posedVertex(point).distanceTo(start[i]) < 0.00001), `${name}/${clip.name}: seamless true endpoint (not wrapped time)`);
      const h = 1 / 600;
      sample(h);
      const nearStart = vertices.map((point) => posedVertex(point));
      sample(clip.duration - h);
      assert.ok(vertices.every((point, i) => {
        const incoming = start[i].clone().sub(posedVertex(point)).divideScalar(h);
        const outgoing = nearStart[i].clone().sub(start[i]).divideScalar(h);
        return incoming.distanceTo(outgoing) < 0.25;
      }), `${name}/${clip.name}: no velocity cusp at loop seam`);
      for (let frame = 0; frame <= 120; frame += 1) {
        sample(clip.duration * frame / 120);
        const bounds = new Box3().setFromObject(model, true);
        assert.ok(bounds.min.y >= -0.002 && bounds.max.y < 1.9, `${name}/${clip.name}: tight deformed ground bounds`);
        assert.ok(bounds.min.x > -1 && bounds.max.x < 1 && Number.isFinite(bounds.max.z));
      }
      if (clip.name !== 'Walk') continue;
      for (const side of ['L', 'R']) {
        for (const boundary of (side === 'L' ? [0, 0.52] : [0.02, 0.5])) {
          const h = 1 / 2400;
          const values = [-h, 0, h].map((offset) => {
            sample((boundary + offset + clip.duration) % clip.duration);
            return posedVertex(soles[side][0]);
          });
          const incoming = values[1].clone().sub(values[0]).divideScalar(h);
          const outgoing = values[2].clone().sub(values[1]).divideScalar(h);
          assert.ok(incoming.distanceTo(outgoing) < 0.12, 'Touchdown/lift-off has no sharp foot-velocity cusp');
        }
      }
      const anchors = new Map();
      const maxLift = { L: 0, R: 0 };
      for (let frame = 0; frame <= 480; frame += 1) {
        const time = frame / 480;
        sample(time);
        for (const side of ['L', 'R']) {
          const phase = (time / clip.duration + (side === 'R' ? 0.5 : 0)) % 1;
          const contact = soles[side].map((point) => posedVertex(point));
          const ys = contact.map((point) => point.y);
          assert.ok(Math.max(...ys) - Math.min(...ys) < 0.001, 'Counter-rotated boot stays flat during stance and swing');
          assert.ok(Math.min(...ys) > -0.002, 'Sole penetration must stay below 2mm');
          maxLift[side] = Math.max(maxLift[side], Math.min(...ys));
          if (phase > 0.52) {
            anchors.delete(side);
            continue;
          }
          assert.ok(ys.every((y) => Math.abs(y) < 0.002), 'Every planted sole vertex contacts the floor');
          const translated = contact.map((point) => point.add(new Vector3(0, 0, asset.locomotion.speed * time)));
          const prior = anchors.get(side);
          if (!prior || phase < prior.phase) anchors.set(side, { phase, points: translated });
          else translated.forEach((point, i) => {
            assert.ok(point.distanceTo(prior.points[i]) < 0.002, `${name}/${side}: world-space stance sliding exceeds 2mm`);
          });
        }
      }
      assert.ok(maxLift.L > 0.10 && maxLift.R > 0.10, 'Both feet must visibly clear the floor during recovery');
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        model.rotation.y = yaw;
        const heading = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        let reference;
        for (const time of [0.05, 0.15, 0.30, 0.45]) {
          model.position.copy(heading).multiplyScalar(asset.locomotion.speed * time);
          sample(time);
          const contact = soles.L.map((point) => posedVertex(point));
          reference ??= contact;
          assert.ok(contact.every((point, i) => point.distanceTo(reference[i]) < 0.002), `Actor transformed to heading ${yaw} must retain world-space foot plants`);
        }
      }
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
    }
    updateSkin(other);
    for (const [bone, matrix] of otherBones) assert.deepEqual(bone.matrixWorld.elements, matrix.elements, 'Animating one clone cannot pose another');
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
  });
}

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
