import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { AnimationMixer, LoopOnce, Vector3, Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createAvatarAnimation, createSoleGrounding, soleGroundOffset, stepLocomotion, updateAvatarAnimation } from '../src/game/theaterMotion.js';
const manifest = JSON.parse(readFileSync('public/assets/theater/manifest.json'));
const report = {};
for (const [name, asset] of Object.entries(manifest.characters)) {
  const bytes = readFileSync(`public/assets/theater/${asset.file}`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  const model = clone(gltf.scene);
  const meshes = [];
  model.updateMatrixWorld(true);
  model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const points = [];
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const joints = mesh.geometry.attributes.skinIndex;
    const weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      const p = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
      if (p.y > 0.001) continue;
      const bone = mesh.skeleton.bones[joints.getX(i)];
      if (weights.getX(i) > .99 && /^Foot[LR]$/.test(bone.name)) points.push({ mesh, i, side: bone.name.slice(-1), rest: p.clone() });
    }
  }
  const clip = gltf.animations.find(a => a.name === 'Walk');
  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  let minimum = Infinity, maxStanceHeight = 0, maxSoleTilt = 0, maxSlide = 0, maxStepSlide = 0;
  const anchors = new Map();
  let first, last;
  for (let frame = 0; frame <= 480; frame++) {
    const t = clip.duration * frame / 480;
    mixer.setTime(t);
    model.updateMatrixWorld(true);
    meshes.forEach(m => m.skeleton.update());
    const bounds = new Box3().setFromObject(model, true);
    minimum = Math.min(minimum, bounds.min.y);
    const deformed = points.map(p => p.mesh.getVertexPosition(p.i, new Vector3()).applyMatrix4(p.mesh.matrixWorld));
    if (!frame) first = deformed.map(p => p.clone());
    last = deformed;
    for (const side of ['L', 'R']) {
      const phase = (t / clip.duration + (side === 'R' ? .5 : 0)) % 1;
      const stance = phase <= .52;
      const contact = deformed.filter((_, i) => points[i].side === side);
      if (stance && contact.length) {
        const ys = contact.map(p => p.y);
        maxStanceHeight = Math.max(maxStanceHeight, ...ys.map(Math.abs));
        maxSoleTilt = Math.max(maxSoleTilt, Math.max(...ys) - Math.min(...ys));
        contact.forEach((p, i) => {
          const key = `${side}/${i}`;
          const translated = p.clone().add(new Vector3(0, 0, 1.4 * t));
          const prior = anchors.get(key);
          if (prior && phase > prior.phase) {
            maxSlide = Math.max(maxSlide, translated.distanceTo(prior.start));
            maxStepSlide = Math.max(maxStepSlide, translated.distanceTo(prior.position));
            anchors.set(key, { ...prior, position: translated, phase });
          } else anchors.set(key, { start: translated, position: translated, phase });
        });
      } else contact.forEach((_, i) => anchors.delete(`${side}/${i}`));
    }
  }
  report[name] = { durations: Object.fromEntries(gltf.animations.map(a => [a.name, a.duration])), soleVertices: points.length,
    minAnimatedY: minimum, maxStanceSoleHeight: maxStanceHeight, maxStanceSoleTilt: maxSoleTilt,
    maxStanceSliding: maxSlide, maxSampleSliding: maxStepSlide,
    loopSoleDiscontinuity: Math.max(...last.map((p, i) => p.distanceTo(first[i]))) };
  if (name !== 'detective') continue;
  let before = 0, after = 0;
  const samples = [];
  for (const phase of [0, .125, .25, .375, .5, .625, .75, .875]) {
    const actor = clone(gltf.scene);
    const animation = createAvatarAnimation(new AnimationMixer(actor), gltf.animations);
    const grounding = createSoleGrounding(actor);
    animation.actions.Walk.time = phase;
    const state = { position: [0, 0, 3], rotationY: 0 };
    const room = { bounds: { min: [-6, 0, -5], max: [6, 4, 5] }, spawn: [0, 0, 3], colliders: [] };
    for (let frame = 0; frame < 150; frame++) {
      stepLocomotion(state, frame < 60 ? [0, -1] : [0, 0], 1 / 60, room);
      updateAvatarAnimation(animation, 1 / 60, { speed: state.speed });
      actor.position.y = 0;
      const start = performance.now();
      const lift = soleGroundOffset(grounding, actor);
      samples.push((performance.now() - start) * 1000);
      before = Math.min(before, -lift);
      actor.position.y = lift;
      actor.updateMatrixWorld(true);
      after = Math.min(after, new Box3().setFromObject(actor, true).min.y);
    }
  }
  samples.sort((a, b) => a - b);
  report[name].blendedStartStop = { samples: samples.length, minYBefore: before, minYAfter: after,
    groundingMedianUs: samples[Math.floor(samples.length / 2)], groundingP95Us: samples[Math.floor(samples.length * .95)] };
}
console.log(JSON.stringify(report, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
