import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader ||= NodeFileReader;

const outputRoot = resolve('public/assets/cinematics');
const exporter = new GLTFExporter();

function material(color, emissive = color) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.28,
    metalness: 0.72,
    roughness: 0.3,
  });
}

function addBox(group, size, position, color, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  group.add(mesh);
}

function terminalConsole() {
  const group = new THREE.Group();
  addBox(group, [1.9, 0.18, 1.05], [0, 0.12, 0], '#152b3c');
  addBox(group, [0.18, 1.15, 0.18], [0, 0.72, -0.25], '#203b4d');
  addBox(group, [1.55, 0.92, 0.12], [0, 1.25, -0.18], '#18384b', [-0.12, 0, 0]);
  addBox(group, [1.3, 0.68, 0.035], [0, 1.25, -0.105], '#22c9e6', [-0.12, 0, 0]);
  addBox(group, [1.45, 0.12, 0.62], [0, 0.32, 0.12], '#214355', [-0.06, 0, 0]);
  return group;
}

function evidenceScanner() {
  const group = new THREE.Group();
  addBox(group, [1.7, 0.2, 1.1], [0, 0.12, 0], '#183446');
  addBox(group, [1.25, 0.08, 0.72], [0, 0.29, 0], '#31d9b2');
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 28, Math.PI), material('#2ca6bd'));
  arch.position.set(0, 0.4, -0.25);
  arch.rotation.set(0, 0, Math.PI);
  group.add(arch);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 18), material('#9fffea'));
  lens.position.set(0, 1.05, -0.25);
  lens.rotation.set(Math.PI / 2, 0, 0);
  group.add(lens);
  return group;
}

function securityCamera() {
  const group = new THREE.Group();
  addBox(group, [0.26, 1.45, 0.26], [0, 0.72, 0], '#273746');
  addBox(group, [1.25, 0.62, 0.68], [0, 1.55, 0.22], '#1f4052', [0.08, -0.2, 0]);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.32, 18), material('#39d2ed'));
  lens.position.set(0.66, 1.55, 0.35);
  lens.rotation.set(0, 0, Math.PI / 2);
  group.add(lens);
  addBox(group, [0.78, 0.11, 0.12], [-0.45, 1.22, -0.08], '#324e5d', [0, 0, -0.55]);
  return group;
}

async function save(name, object) {
  const scene = new THREE.Scene();
  scene.add(object);
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });
  const target = resolve(outputRoot, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(result));
}

await Promise.all([
  save('terminal-console.glb', terminalConsole()),
  save('evidence-scanner.glb', evidenceScanner()),
  save('security-camera.glb', securityCamera()),
]);
