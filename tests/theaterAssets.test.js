import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Box3, LoopOnce, Quaternion, Ray, Triangle, Vector3 } from 'three';
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
    assert.ok(character.gait && Number.isFinite(character.gait.stance), `${name}: gait metadata is required`);
    for (const key of ['heelEnd', 'toeStart', 'swingLift', 'pelvisRise']) {
      assert.ok(Number.isFinite(character.gait[key]), `${name}: gait.${key} metadata is required`);
    }
    assert.ok(character.gait.pelvisRise >= .035 && character.gait.pelvisRise <= .045, `${name}: gait.pelvisRise should describe the authored 4cm support lift`);
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

// GLTFLoader removes dots from authored names for animation bindings:
// `Thigh.L` in the GLB becomes `ThighL` in Three.js. Compare both consistently.
function canonicalBoneName(name) {
  const match = /^(Thigh|Shin|Foot|UpperArm|Elbow|Forearm|Hand)\.?([LR])$/.exec(name);
  return match ? `${match[1]}.${match[2]}` : name;
}

function getLimbBone(model, joint, side) {
  return model.getObjectByName(`${joint}.${side}`) || model.getObjectByName(`${joint}${side}`);
}

function limbPose(model, side) {
  const [hip, knee, ankle] = ['Thigh', 'Shin', 'Foot']
    .map((joint) => getLimbBone(model, joint, side).getWorldPosition(new Vector3()));
  const upper = hip.distanceTo(knee);
  const lower = knee.distanceTo(ankle);
  return {
    hip,
    knee,
    ankle,
    extension: hip.distanceTo(ankle) / (upper + lower),
    // The manifest declares +Z as the forward axis. Keep the sign out of
    // this standing-pose check so a tiny IK overshoot behind the hip is also
    // treated as a straight-leg violation.
    kneeForwardOffset: Math.abs(knee.z - hip.z),
  };
}

function nearestSample(samples, u) {
  return samples.reduce((nearest, sample) =>
    Math.abs(sample.u - u) < Math.abs(nearest.u - u) ? sample : nearest);
}

function correlation(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0, varianceA = 0, varianceB = 0;
  for (let index = 0; index < a.length; index++) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }
  return covariance / Math.sqrt(varianceA * varianceB);
}

for (const [name, asset] of Object.entries(manifest.characters)) {
  test(`${name} walks with opposite arm and leg swings, a gentle forward lean and a steady head`, async () => {
    const { buffer } = glb(asset.file);
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
    const model = clone(gltf.scene);
    model.updateMatrixWorld(true);
    const head = model.getObjectByName('Head');
    const spine = model.getObjectByName('Spine');
    // Convert world up into the bind head's local space, so this measures the
    // exported head attitude without assuming Blender's local bone axes.
    const headLocalUp = new Vector3(0, 1, 0)
      .applyQuaternion(head.getWorldQuaternion(new Quaternion()).invert());
    const mixer = new AnimationMixer(model);
    const walk = gltf.animations.find(clip => clip.name === 'Walk');
    mixer.clipAction(walk).play();
    const samples = Array.from({ length: 120 }, (_, frame) => {
      mixer.setTime(walk.duration * frame / 120);
      model.updateMatrixWorld(true);
      const limbs = Object.fromEntries(['L', 'R'].map(side => {
        const hand = getLimbBone(model, 'Hand', side).getWorldPosition(new Vector3());
        const shoulder = getLimbBone(model, 'UpperArm', side).getWorldPosition(new Vector3());
        const { hip, ankle } = limbPose(model, side);
        return [side, { arm: hand.z - shoulder.z, leg: ankle.z - hip.z }];
      }));
      const torsoUp = head.getWorldPosition(new Vector3()).sub(spine.getWorldPosition(new Vector3()));
      const headUp = headLocalUp.clone().applyQuaternion(head.getWorldQuaternion(new Quaternion()));
      const shoulderCenter = getLimbBone(model, 'UpperArm', 'L').getWorldPosition(new Vector3())
        .add(getLimbBone(model, 'UpperArm', 'R').getWorldPosition(new Vector3())).multiplyScalar(.5);
      const pelvis = model.getObjectByName('Hips').getWorldPosition(new Vector3());
      return {
        limbs,
        torsoPitch: Math.atan2(torsoUp.z, torsoUp.y) * 180 / Math.PI,
        headPitch: Math.atan2(headUp.z, headUp.y) * 180 / Math.PI,
        shoulderLead: shoulderCenter.z - pelvis.z,
      };
    });
    for (const side of ['L', 'R']) {
      const arm = samples.map(sample => sample.limbs[side].arm);
      const leg = samples.map(sample => sample.limbs[side].leg);
      assert.ok(Math.max(...arm) - Math.min(...arm) > .12, `${name}/${side}: arm swing must be visible`);
      assert.ok(correlation(arm, leg) < -.85, `${name}/${side}: the hand must swing opposite its same-side foot throughout the cycle`);
    }
    const armSeparation = samples.map(sample => sample.limbs.L.arm - sample.limbs.R.arm);
    const legSeparation = samples.map(sample => sample.limbs.L.leg - sample.limbs.R.leg);
    assert.ok(correlation(armSeparation, legSeparation) < -.90, `${name}: arm and leg coordination must not drift a quarter-cycle out of phase`);
    for (const [frame, contactSide] of [[0, 'L'], [60, 'R']]) {
      const opposite = contactSide === 'L' ? 'R' : 'L';
      const { limbs } = samples[frame];
      assert.ok(limbs[contactSide].arm < limbs[opposite].arm - .10, `${name}/${contactSide}: the opposite arm leads when the foot lands`);
    }
    assert.ok(samples.every(sample => sample.torsoPitch > 8 && sample.torsoPitch < 10), `${name}: Walk should visibly lean forward by about 9 degrees`);
    assert.ok(samples.every(sample => sample.shoulderLead > .045 && sample.shoulderLead < .065), `${name}: the shoulder silhouette should lead the pelvis by about 5cm, not just rotate the neck`);
    const headPitches = samples.map(sample => sample.headPitch);
    assert.ok(headPitches.every(pitch => Math.abs(pitch) < 2), `${name}: the head should counter the torso lean to keep the gaze level`);
    assert.ok(Math.max(...headPitches) - Math.min(...headPitches) < 1.5, `${name}: walking should not make the head nod with each step`);
    for (const clipName of ['Idle', 'Talk']) {
      mixer.stopAllAction();
      const clip = gltf.animations.find(item => item.name === clipName);
      mixer.clipAction(clip).play();
      for (let frame = 0; frame < 24; frame++) {
        mixer.setTime(clip.duration * frame / 24);
        model.updateMatrixWorld(true);
        const standingUp = head.getWorldPosition(new Vector3()).sub(spine.getWorldPosition(new Vector3()));
        assert.ok(Math.abs(Math.atan2(standingUp.z, standingUp.y)) < .03, `${name}/${clipName}: the walking lean must clear when standing or talking`);
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
  });
}

test('detective Talk holds one bent arm just below the chin with a relaxed free arm and planted feet', async () => {
  const { buffer } = glb(manifest.characters.detective.file);
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
  const model = clone(gltf.scene);
  updateSkin(model);
  const hand = [], chin = [], faceTriangles = [], soles = [];
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const faceIndices = new Set();
    for (let index = 0; index < position.count; index++) {
      const vertex = { mesh, index };
      const rest = posedVertex(vertex);
      const influences = Array.from({ length: 4 }, (_, component) => ({
        bone: canonicalBoneName(mesh.skeleton.bones[skinIndex.getComponent(index, component)].name),
        weight: skinWeight.getComponent(index, component),
      })).filter(({ weight }) => weight > .001);
      if (influences.every(({ bone }) => bone === 'Hand.R')) hand.push(vertex);
      if (influences.every(({ bone }) => ['Foot.L', 'Foot.R'].includes(bone)) && rest.y < .001) soles.push(vertex);
      if (mesh.material.name === 'skin-warm' && influences.every(({ bone }) => ['Head', 'Jaw'].includes(bone))) {
        faceIndices.add(index);
        // The lower jaw includes the actual chin surface, rather than the
        // Head bone origin, which sits below it at the base of the neck.
        if (influences.some(({ bone }) => bone === 'Jaw') && rest.y < 1.51 && rest.z > .035) chin.push(vertex);
      }
    }
    const indices = mesh.geometry.index;
    for (let index = 0; index < indices.count; index += 3) {
      const triangle = [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)];
      if (triangle.every(vertex => faceIndices.has(vertex))) faceTriangles.push(triangle.map(vertex => ({ mesh, index: vertex })));
    }
  });
  assert.ok(hand.length > 100 && chin.length >= 16 && faceTriangles.length > 100 && soles.length > 16, 'Measure the exported glove, chin and soles');
  const mixer = new AnimationMixer(model);
  const talk = gltf.animations.find(clip => clip.name === 'Talk');
  mixer.clipAction(talk).play();
  const samples = [];
  let referenceSoles;
  for (let frame = 0; frame < 120; frame++) {
    mixer.setTime(talk.duration * frame / 120);
    updateSkin(model);
    const handPoints = hand.map(vertex => posedVertex(vertex));
    const chinPoints = chin.map(vertex => posedVertex(vertex));
    const handBounds = new Box3().setFromPoints(handPoints);
    const chinBounds = new Box3().setFromPoints(chinPoints);
    let chinGap = Infinity;
    for (const finger of handPoints) for (const jaw of chinPoints) chinGap = Math.min(chinGap, finger.distanceTo(jaw));
    assert.ok(chinGap < .025, 'The raised glove must visibly reach the chin, not merely gesture at chest height');
    assert.ok(handBounds.max.y < chinBounds.max.y + .003, 'Fingertips remain below the mouth');
    assert.ok(handBounds.getCenter(new Vector3()).y < chinBounds.min.y - .035, 'The palm stays below the chin');
    const shoulder = getLimbBone(model, 'UpperArm', 'R').getWorldPosition(new Vector3());
    const elbow = getLimbBone(model, 'Forearm', 'R').getWorldPosition(new Vector3());
    const wrist = getLimbBone(model, 'Hand', 'R').getWorldPosition(new Vector3());
    const elbowAngle = shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)) * 180 / Math.PI;
    assert.ok(elbowAngle > 35 && elbowAngle < 85, 'The thinking arm has a comfortable, visible elbow bend');
    assert.ok(elbow.y < wrist.y - .10 && elbow.z > shoulder.z + .12, 'The elbow is lowered in front of the torso');
    assert.ok(getLimbBone(model, 'Hand', 'L').getWorldPosition(new Vector3()).y < 1.02, 'Only one arm is raised');
    const planted = soles.map(vertex => posedVertex(vertex));
    referenceSoles ??= planted;
    assert.ok(planted.every((point, index) => point.distanceTo(referenceSoles[index]) < .001), 'The thinking gesture does not shift either foot');
    // Check the actual skinned glove against the facial surface throughout
    // the loop, not just a wrist-to-head distance that can hide penetration.
    if (frame % 10 === 0) {
      const triangles = faceTriangles.map(vertices => new Triangle(...vertices.map(vertex => posedVertex(vertex))));
      const ray = new Ray(new Vector3(), new Vector3(0, 0, 1));
      const intersection = new Vector3();
      for (const finger of handPoints) {
        ray.origin.copy(finger);
        const hits = [];
        for (const triangle of triangles) {
          if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, intersection)) continue;
          const distance = finger.distanceTo(intersection);
          if (!hits.some(hit => Math.abs(hit - distance) < .00001)) hits.push(distance);
        }
        assert.equal(hits.length % 2, 0, 'The thinking glove must remain outside the closed face and neck surfaces');
      }
    }
    samples.push({ wrist, elbow, chinGap });
  }
  for (let index = 0; index < samples.length; index++) {
    const next = samples[(index + 1) % samples.length];
    assert.ok(samples[index].wrist.distanceTo(next.wrist) < .003, 'The held hand moves smoothly through the loop seam');
    assert.ok(samples[index].elbow.distanceTo(next.elbow) < .003, 'The thinking elbow does not snap or flip');
  }
  const gaps = samples.map(sample => sample.chinGap);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < .005, 'The hand follows subtle head motion without drifting away from the chin');
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
});

test('detective thinking sleeve preserves elbow volume and bends without folded-over faces', async () => {
  const { buffer } = glb(manifest.characters.detective.file);
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
  const model = clone(gltf.scene);
  updateSkin(model);
  const sections = new Map(), facePairs = [];
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const sleeve = new Map();
    for (let index = 0; index < position.count; index++) {
      const influences = Array.from({ length: 4 }, (_, component) => ({
        bone: canonicalBoneName(mesh.skeleton.bones[skinIndex.getComponent(index, component)].name),
        weight: skinWeight.getComponent(index, component),
      })).filter(({ weight }) => weight > .001);
      if (!influences.every(({ bone }) => ['UpperArm.R', 'Elbow.R', 'Forearm.R'].includes(bone))) continue;
      const vertex = { mesh, index }, rest = posedVertex(vertex);
      if (rest.y < 1.0 || rest.y > 1.23) continue;
      sleeve.set(index, { vertex, rest });
      // The exported sleeve uses horizontal cross sections in its bind pose.
      // Weld duplicate export vertices so split normals do not bias thickness.
      const row = rest.y.toFixed(4);
      if (!sections.has(row)) sections.set(row, new Map());
      sections.get(row).set(rest.toArray().map(value => value.toFixed(5)).join('/'), { vertex, rest });
    }
    const edges = new Map(), indices = mesh.geometry.index;
    for (let index = 0; index < indices.count; index += 3) {
      const ids = [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)];
      if (!ids.every(id => sleeve.has(id))) continue;
      const face = ids.map(id => sleeve.get(id).vertex);
      const normal = new Triangle(...ids.map(id => sleeve.get(id).rest)).getNormal(new Vector3());
      for (let edge = 0; edge < 3; edge++) {
        const key = [ids[edge], ids[(edge + 1) % 3]].sort((a, b) => a - b).join('/');
        if (!edges.has(key)) edges.set(key, []);
        edges.get(key).push({ face, normal });
      }
    }
    for (const neighbors of edges.values()) {
      // Only compare faces that were nearly coplanar before deformation;
      // this excludes the sleeve's intentional radial facets and seams.
      if (neighbors.length === 2 && neighbors[0].normal.angleTo(neighbors[1].normal) < Math.PI / 12) {
        facePairs.push(neighbors.map(({ face }) => face));
      }
    }
  });
  const sectionShape = points => {
    const center = points.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / points.length);
    const radial = points.map(point => point.clone().sub(center));
    const areaVector = new Vector3();
    radial.forEach((point, index) => areaVector.add(new Vector3().crossVectors(point, radial[(index + 1) % radial.length])));
    const area = areaVector.length() / 2;
    const normal = areaVector.normalize(), axis = radial[0].clone().normalize();
    let minorRadius = Infinity;
    for (let angle = 0; angle < 32; angle++) {
      const direction = axis.clone().applyAxisAngle(normal, Math.PI * angle / 32);
      const projections = radial.map(point => point.dot(direction));
      minorRadius = Math.min(minorRadius, (Math.max(...projections) - Math.min(...projections)) / 2);
    }
    return { area, minorRadius };
  };
  const rings = [...sections.values()].filter(section => section.size >= 12).map(section => {
    const points = [...section.values()];
    const center = points.reduce((sum, { rest }) => sum.add(rest), new Vector3()).multiplyScalar(1 / points.length);
    points.sort((a, b) => Math.atan2(a.rest.z - center.z, a.rest.x - center.x) - Math.atan2(b.rest.z - center.z, b.rest.x - center.x));
    return { points, rest: sectionShape(points.map(({ rest }) => rest)) };
  });
  assert.ok(rings.length >= 4 && facePairs.length >= 24, 'Measure the actual exported elbow sleeve, not only joint angles');
  const mixer = new AnimationMixer(model);
  const idle = mixer.clipAction(gltf.animations.find(clip => clip.name === 'Idle')).play();
  const talkClip = gltf.animations.find(clip => clip.name === 'Talk');
  const talk = mixer.clipAction(talkClip).play();
  const checkSleeve = label => {
    updateSkin(model);
    for (const { points, rest } of rings) {
      const posed = sectionShape(points.map(({ vertex }) => posedVertex(vertex)));
      assert.ok(posed.area >= rest.area * .80, `${label}: elbow sleeve retains at least 80% of its cross-section area`);
      assert.ok(posed.minorRadius >= rest.minorRadius * .80, `${label}: elbow sleeve must not pinch into a thin hinge`);
    }
    for (const faces of facePairs) {
      const normals = faces.map(face => new Triangle(...face.map(vertex => posedVertex(vertex))).getNormal(new Vector3()));
      assert.ok(normals[0].angleTo(normals[1]) < 100 * Math.PI / 180, `${label}: neighboring sleeve faces must not fold back over each other`);
    }
  };
  // Check the whole held gesture and its interpolation from/to Idle: a good
  // endpoint can still pinch halfway through raising or lowering the arm.
  idle.setEffectiveWeight(0);
  talk.setEffectiveWeight(1);
  for (let frame = 0; frame < 24; frame++) {
    mixer.setTime(talkClip.duration * frame / 24);
    checkSleeve(`Talk frame ${frame}`);
  }
  for (let step = 0; step <= 8; step++) {
    idle.setEffectiveWeight(1 - step / 8);
    talk.setEffectiveWeight(step / 8);
    mixer.setTime(.3);
    checkSleeve(`Idle/Talk blend ${step}/8`);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
});

test('NPC Talk keeps speaking gestures distinct from the detective thinking pose', async () => {
  for (const name of ['witness', 'security', 'scientist']) {
    const { buffer } = glb(manifest.characters[name].file);
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
    const model = clone(gltf.scene);
    const mixer = new AnimationMixer(model);
    const talk = gltf.animations.find(clip => clip.name === 'Talk');
    mixer.clipAction(talk).play();
    let initialJaw, jawMotion = 0;
    for (let frame = 0; frame < 24; frame++) {
      mixer.setTime(talk.duration * frame / 24);
      model.updateMatrixWorld(true);
      const wrist = getLimbBone(model, 'Hand', 'R').getWorldPosition(new Vector3());
      assert.ok(wrist.y < 1.2, `${name}: retain the NPC's lower speaking gesture`);
      const jaw = model.getObjectByName('Jaw').quaternion;
      initialJaw ??= jaw.clone();
      jawMotion = Math.max(jawMotion, initialJaw.angleTo(jaw));
    }
    assert.ok(jawMotion > .03, `${name}: the speaker's mouth still animates`);
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
  }
});

for (const [name, asset] of Object.entries(manifest.characters)) {
  test(`${name} has heel-to-toe contacts, continuous limbs, exact loops and independent poses in Three.js`, async () => {
    const { buffer } = glb(asset.file);
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
    const model = clone(gltf.scene);
    const other = clone(gltf.scene);
    updateSkin(model);
    updateSkin(other);
    const vertices = [];
    const soles = { L: [], R: [] };
    const jointBlends = new Set();
    const elbowBlends = { L: new Set(), R: new Set() };
    const continuousLegs = new Set();
    const continuousArms = new Set();
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
          bone: canonicalBoneName(mesh.skeleton.bones[skinIndex.getComponent(index, component)].name),
          weight: skinWeight.getComponent(index, component),
        })).filter(({ weight }) => weight > 0.001);
        const component = root(index);
        if (!components.has(component)) components.set(component, new Set());
        influences.forEach(({ bone }) => components.get(component).add(bone));
        for (const side of ['L', 'R']) {
          if (influences.some((i) => i.bone === `Shin.${side}`) && influences.some((i) => i.bone === `Thigh.${side}`)) jointBlends.add(`knee${side}`);
          if (influences.some((i) => i.bone === `Shin.${side}`) && influences.some((i) => i.bone === `Foot.${side}`)) jointBlends.add(`ankle${side}`);
          for (const [upper, lower] of [['UpperArm', 'Forearm'], ['UpperArm', 'Elbow'], ['Elbow', 'Forearm']]) {
            if (influences.some(i => i.bone === `${upper}.${side}`) && influences.some(i => i.bone === `${lower}.${side}`)) {
              elbowBlends[side].add(`${upper}/${lower}`);
            }
          }
          if (influences.length === 1 && influences[0].bone === `Foot.${side}` && posedVertex(point).y < 0.001) soles[side].push({ ...point, restZ: posedVertex(point).z });
        }
      }
      for (const bones of components.values()) {
        for (const side of ['L', 'R']) {
          if (['Thigh', 'Shin', 'Foot'].every((joint) => bones.has(`${joint}.${side}`))) continuousLegs.add(side);
          if (['UpperArm', 'Forearm'].every((joint) => bones.has(`${joint}.${side}`))) continuousArms.add(side);
        }
      }
    });
    for (const side of ['L', 'R']) {
      const links = elbowBlends[side];
      if (links.has('UpperArm/Forearm') || (links.has('UpperArm/Elbow') && links.has('Elbow/Forearm'))) jointBlends.add(`elbow${side}`);
    }
    assert.deepEqual([...jointBlends].sort(), ['ankleL', 'ankleR', 'elbowL', 'elbowR', 'kneeL', 'kneeR']);
    assert.deepEqual([...continuousLegs].sort(), ['L', 'R'], 'Each leg is a connected surface through hip, knee and ankle, not floating segments');
    assert.deepEqual([...continuousArms].sort(), ['L', 'R'], 'Cloth must bend continuously through the elbow without separating sleeve pieces');
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
      const hasSupportRise = clip.name === 'Walk';
      const supportExtensions = { L: [], R: [] };
      const swingExtensions = { L: [], R: [] };
      const swingSamples = { L: [], R: [] };
      for (let frame = 0; frame <= 120; frame += 1) {
        sample(clip.duration * frame / 120);
        const bounds = new Box3().setFromObject(model, true);
        assert.ok(bounds.min.y >= -0.002 && bounds.max.y < 1.9, `${name}/${clip.name}: tight deformed ground bounds`);
        assert.ok(bounds.min.x > -1 && bounds.max.x < 1 && Number.isFinite(bounds.max.z));
        for (const side of ['L', 'R']) {
          const pose = limbPose(model, side);
          if (hasSupportRise) {
            const phase = (frame / 120 + (side === 'R' ? .5 : 0)) % 1;
            const u = phase > asset.gait.stance
              ? (phase - asset.gait.stance) / (1 - asset.gait.stance)
              : null;
            if (u !== null) swingSamples[side].push({
              u,
              extension: pose.extension,
              forward: pose.ankle.z,
            });
            // Check the loaded support middle, where the authored pelvis rise
            // is expected to straighten the weight-bearing leg. Heel strike
            // and toe-off intentionally retain a small natural bend.
            if (phase >= asset.gait.heelEnd + .10 && phase <= asset.gait.toeStart - .05) supportExtensions[side].push(pose.extension);
            if (phase >= asset.gait.stance + .16 && phase <= asset.gait.stance + .28) swingExtensions[side].push(pose.extension);
          }
          if (clip.name !== 'Walk') {
            assert.ok(pose.extension >= .99 && pose.extension <= .9995, `${name}/${clip.name}: relaxed standing knees should be nearly straight`);
            assert.ok(pose.kneeForwardOffset <= .022, `${name}/${clip.name}: standing knee should stay within 2cm of the hip's forward line`);
            assert.ok(soles[side].every(point => Math.abs(posedVertex(point).y) < .002), `${name}/${clip.name}: both standing soles stay planted`);
          }
        }
      }
      if (hasSupportRise) {
        for (const side of ['L', 'R']) {
          assert.ok(swingSamples[side].length >= 20, `${name}/${side}: Walk swing samples are present`);
          assert.ok(Math.min(...supportExtensions[side]) >= .94 && Math.max(...supportExtensions[side]) <= .96, `${name}/${side}: Walk support knee extension should stay near .94-.96`);
          assert.ok(Math.min(...swingExtensions[side]) >= .82 && Math.max(...swingExtensions[side]) <= .88, `${name}/${side}: Walk swing knee should retain a natural .82-.88 bend`);

          const earlyBend = swingSamples[side].filter(({ u }) => u >= .04 && u <= .22);
          const stride = swingSamples[side].filter(({ u }) => u >= .22 && u <= .72);
          const recovery = swingSamples[side].filter(({ u }) => u >= .72 && u <= .98);
          assert.ok(earlyBend.length > 0 && stride.length > 0 && recovery.length > 0, `${name}/${side}: Walk has bend, stride and recovery phases`);
          const swingPeak = swingSamples[side].reduce((min, sample) => sample.extension < min.extension ? sample : min);
          const bendPeak = earlyBend.reduce((min, sample) => sample.extension < min.extension ? sample : min);
          const strideBend = stride.reduce((min, sample) => sample.extension < min.extension ? sample : min);
          const recoveryEnd = nearestSample(recovery, .96);
          assert.ok(swingPeak.u <= .30, `${name}/${side}: knee bend peaks before the forward step`);
          // A 120 Hz key can place the deepest knee angle one sample into the
          // stride boundary; the pre-step bend must still be within 2cm of it.
          assert.ok(bendPeak.extension <= strideBend.extension + .020, `${name}/${side}: the pre-step bend is visible before the stride`);
          assert.ok(recoveryEnd.extension >= .94, `${name}/${side}: knee extends again during late swing recovery`);
          assert.ok(recoveryEnd.extension - nearestSample(recovery, .80).extension > .06, `${name}/${side}: late recovery visibly unfolds the knee`);
          assert.ok(recovery.every(({ extension }) => extension < .999), `${name}/${side}: swing recovery must not lock the knee before heel contact`);

          // Once the knee has loaded, the ankle travels forward in one smooth
          // direction through the stride window. Tiny interpolation noise is
          // tolerated, but a visible reversal is a gait regression.
          for (let index = 1; index < stride.length; index += 1) {
            assert.ok(stride[index].forward >= stride[index - 1].forward - .002, `${name}/${side}: forward step should not reverse direction`);
          }
          assert.ok(stride[stride.length - 1].forward - stride[0].forward > .20, `${name}/${side}: stride must cover visible forward distance`);
        }
      }
      if (clip.name !== 'Walk') continue;
      const authoredFrames = Math.max(...clip.tracks.map(track => track.times.length)) - 1;
      for (const side of ['L', 'R']) {
        for (const boundary of [0, asset.gait.heelEnd, asset.gait.toeStart, asset.gait.stance].map(time => (time + (side === 'R' ? .5 : 0)) % 1)) {
          const h = 1 / 2400;
          const values = [-h, 0, h].map((offset) => {
            sample((boundary + offset + clip.duration) % clip.duration);
            return posedVertex(soles[side][0]);
          });
          const incoming = values[1].clone().sub(values[0]).divideScalar(h);
          const outgoing = values[2].clone().sub(values[1]).divideScalar(h);
          // Role-specific leg scaling amplifies this one deformed-sole sample
          // slightly at the loop seam; the authored ankle and full-mesh
          // continuity checks above cover the underlying curve separately.
          assert.ok(incoming.distanceTo(outgoing) < 0.15, 'Touchdown/lift-off has no sharp foot-velocity cusp');
        }
      }
      // The three gait stages use smoothstep/septic transitions. Probe the
      // ankle on each side of every stage boundary so a keyframe change
      // cannot introduce a hidden velocity or acceleration pop.
      for (const side of ['L', 'R']) {
        const sideOffset = side === 'R' ? .5 : 0;
        for (const u of [0, .22, .72, 1]) {
          // Compare adjacent authored keys. Sampling tiny subframe
          // offsets would only measure Three.js' linear interpolation rather
          // than continuity of the baked gait curve.
          const phase = asset.gait.stance + (1 - asset.gait.stance) * u;
          const boundaryFrame = Math.round((phase - sideOffset + 1) % 1 * authoredFrames);
          const boundary = boundaryFrame / authoredFrames;
          const h = 1 / authoredFrames;
          const points = [-2, -1, 0, 1, 2].map((offset) => {
            sample((boundary + offset * h + 1) % 1);
            return getLimbBone(model, 'Foot', side).getWorldPosition(new Vector3());
          });
          const incomingVelocity = points[2].clone().sub(points[1]).divideScalar(h);
          const outgoingVelocity = points[3].clone().sub(points[2]).divideScalar(h);
          const incomingAcceleration = points[2].clone().sub(points[1].clone().multiplyScalar(2)).add(points[0]).divideScalar(h * h);
          const outgoingAcceleration = points[4].clone().sub(points[3].clone().multiplyScalar(2)).add(points[2]).divideScalar(h * h);
          assert.ok(incomingVelocity.distanceTo(outgoingVelocity) < .50, `${name}/${side}: stage ${u} velocity is continuous`);
          // The authored curve is C2 continuous; the baked samples
          // and two-bone IK add a small finite-difference residual at the
          // .72 boundary, so allow that sub-frame measurement headroom.
          assert.ok(incomingAcceleration.distanceTo(outgoingAcceleration) < 140, `${name}/${side}: stage ${u} acceleration is continuous`);
        }
      }
      // Probe the actual baked keys around toe-off. Checking only phase=.56
      // can fall between keys and miss a discontinuous swing-foot lift.
      const toeOffFrame = Math.round(asset.gait.stance * authoredFrames);
      const keyH = 1 / 2400;
      for (const side of ['L', 'R']) {
        const offset = side === 'R' ? .5 : 0;
        for (let frame = toeOffFrame - 2; frame <= toeOffFrame + 3; frame += 1) {
          const key = (frame / authoredFrames + offset) % 1;
          const values = [-keyH, 0, keyH].map((delta) => {
            sample((key + delta + clip.duration) % clip.duration);
            return posedVertex(soles[side][0]);
          });
          const incoming = values[1].clone().sub(values[0]).divideScalar(keyH);
          const outgoing = values[2].clone().sub(values[1]).divideScalar(keyH);
          assert.ok(incoming.length() < 3 && outgoing.length() < 3, `${name}/${side}: toe-off key ${frame} has an excessive foot velocity`);
          assert.ok(incoming.distanceTo(outgoing) < .25, `${name}/${side}: toe-off key ${frame} has a foot velocity cusp`);
        }
      }
      // Stage endpoints alone missed the old stop-and-kick inside early
      // swing (8.3 m/s and 560 m/s²). Bound the entire evaluated trajectory
      // at display rates and at the bake rate, including the loop seam.
      for (const hz of [30, 60, 144, authoredFrames]) {
        const poses = Array.from({ length: hz }, (_, frame) => {
          sample(frame / hz);
          return ['FootL', 'FootR', 'Hips'].map(bone => model.getObjectByName(bone).getWorldPosition(new Vector3()));
        });
        const velocities = poses.map((pose, frame) => pose.map((point, bone) =>
          poses[(frame + 1) % hz][bone].clone().sub(point).multiplyScalar(hz)));
        for (let frame = 0; frame < hz; frame++) {
          for (let bone = 0; bone < 3; bone++) {
            const velocity = velocities[frame][bone];
            const acceleration = velocities[(frame + 1) % hz][bone].clone().sub(velocity).multiplyScalar(hz);
            assert.ok(velocity.length() < (bone === 2 ? .95 : 4), `${name}/${hz}Hz: ${bone === 2 ? 'pelvis' : 'ankle'} speed spike at ${frame / hz}`);
            assert.ok(acceleration.length() < (bone === 2 ? 30 : 180), `${name}/${hz}Hz: ${bone === 2 ? 'pelvis' : 'ankle'} acceleration spike at ${frame / hz}`);
          }
        }
      }
      const anchors = new Map();
      const maxLift = { L: 0, R: 0 };
      const hips = model.getObjectByName('Hips');
      let minHipX = Infinity, maxHipX = -Infinity, maxTilt = 0;
      for (let frame = 0; frame <= 480; frame += 1) {
        const time = frame / 480;
        sample(time);
        minHipX = Math.min(minHipX, hips.position.x); maxHipX = Math.max(maxHipX, hips.position.x);
        for (const side of ['L', 'R']) {
          const phase = (time / clip.duration + (side === 'R' ? 0.5 : 0)) % 1;
          const contact = soles[side].map((point) => posedVertex(point));
          const ys = contact.map((point) => point.y);
          maxTilt = Math.max(maxTilt, Math.max(...ys) - Math.min(...ys));
          assert.ok(Math.min(...ys) > -0.002, 'Sole penetration must stay below 2mm');
          maxLift[side] = Math.max(maxLift[side], Math.min(...ys));
          if (phase > asset.gait.stance) {
            anchors.delete(side);
            continue;
          }
          const section = phase < asset.gait.heelEnd ? 'heel' : phase > asset.gait.toeStart ? 'toe' : 'flat';
          const selected = soles[side].map((point, i) => ({ point, posed: contact[i] })).filter(({point}) => section === 'flat' || (section === 'heel' ? point.restZ < -.065 : point.restZ > .18));
          assert.ok(selected.length >= 2, 'Measure physical heel/toe vertices');
          assert.ok(selected.every(({posed}) => Math.abs(posed.y) < .002), 'The weight-bearing edge remains grounded while the boot rolls');
          if (section === 'flat') assert.ok(Math.max(...ys) - Math.min(...ys) < .001, 'Mid-stance supports the entire sole');
          const translated = selected.map(({posed}) => posed.add(new Vector3(0, 0, asset.locomotion.speed * time)));
          const prior = anchors.get(side);
          if (!prior || phase < prior.phase || prior.section !== section) anchors.set(side, { phase, section, points: translated });
          else translated.forEach((point, i) => {
            assert.ok(point.distanceTo(prior.points[i]) < 0.002, `${name}/${side}: world-space stance sliding exceeds 2mm`);
          });
        }
      }
      assert.ok(maxLift.L > .06 && maxLift.R > .06 && maxLift.L < .09 && maxLift.R < .09, 'Relaxed walking clears the floor without an exaggerated high step');
      assert.ok(maxTilt > .035 && maxTilt < .065, 'Boots visibly roll through contact rather than remaining rigidly horizontal');
      assert.ok(maxHipX - minHipX > .035 && maxHipX - minHipX < .065, 'The pelvis transfers weight between legs without excessive swaying');
      for (const [time, rising] of [[0, 'toe'], [.53, 'heel']]) {
        sample(time);
        const heel = soles.L.filter(point => point.restZ < -.065).map(point => posedVertex(point).y);
        const toe = soles.L.filter(point => point.restZ > .18).map(point => posedVertex(point).y);
        assert.ok(rising === 'toe' ? Math.min(...toe) > Math.max(...heel) + .03 : Math.min(...heel) > Math.max(...toe) + .03, 'Heel strike and toe-off rotate in opposite directions');
      }
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        model.rotation.y = yaw;
        const heading = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        let reference;
        for (const time of [.15, .23, .30, .38]) {
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
