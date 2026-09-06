import { Box3, Ray, Vector3 } from 'three';

const cache = new WeakMap();
const AXES = ['x', 'y', 'z'];
const LENS_SAMPLES = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];

/** Static world-space broadphase; exact leaf triangles preserve doors and furniture gaps. */
export function buildCameraCollision(scene) {
  if (cache.has(scene)) return cache.get(scene);
  const triangles = [];
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const indices = geometry.index;
    const vertices = Array.from({ length: positions.count }, (_, index) => new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
    const indexAt = index => indices ? indices.getX(index) : index;
    const start = geometry.drawRange.start;
    const end = Math.min(indices?.count ?? positions.count, start + geometry.drawRange.count);
    for (let index = start; index < end; index += 3) {
      const a = vertices[indexAt(index)];
      const b = vertices[indexAt(index + 1)];
      const c = vertices[indexAt(index + 2)];
      triangles.push({ a, b, c, bounds: new Box3().expandByPoint(a).expandByPoint(b).expandByPoint(c) });
    }
  });
  const partition = items => {
    const bounds = new Box3();
    for (const triangle of items) bounds.union(triangle.bounds);
    if (items.length <= 8) return { bounds, triangles: items, left: null, right: null };
    const size = bounds.getSize(new Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    items.sort((a, b) => a.bounds.min[axis] + a.bounds.max[axis] - b.bounds.min[axis] - b.bounds.max[axis]);
    const middle = Math.floor(items.length / 2);
    return { bounds, triangles: null, left: partition(items.slice(0, middle)), right: partition(items.slice(middle)) };
  };
  const collision = {
    tree: triangles.length ? partition(triangles) : null, triangleCount: triangles.length,
    ray: new Ray(), hit: new Vector3(), horizontal: new Vector3(), vertical: new Vector3(),
  };
  cache.set(scene, collision);
  return collision;
}

function entryDistance(box, ray, maximum) {
  let near = 0;
  let far = maximum;
  for (const axis of AXES) {
    const low = box.min[axis];
    const high = box.max[axis];
    const velocity = ray.direction[axis];
    if (Math.abs(velocity) < 1e-10) {
      if (ray.origin[axis] < low || ray.origin[axis] > high) return Infinity;
    } else {
      let a = (low - ray.origin[axis]) / velocity;
      let b = (high - ray.origin[axis]) / velocity;
      if (a > b) { const swap = a; a = b; b = swap; }
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return near;
}

function nearest(node, ray, hit, maximum) {
  if (!node || entryDistance(node.bounds, ray, maximum) > maximum) return maximum;
  if (node.triangles) {
    for (const triangle of node.triangles) {
      if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) maximum = Math.min(maximum, hit.distanceTo(ray.origin));
    }
    return maximum;
  }
  const left = entryDistance(node.left.bounds, ray, maximum);
  const right = entryDistance(node.right.bounds, ray, maximum);
  const first = left <= right ? node.left : node.right;
  const second = left <= right ? node.right : node.left;
  maximum = nearest(first, ray, hit, maximum);
  return nearest(second, ray, hit, maximum);
}

/** Normalized center ray plus lens perimeter samples, without per-frame arrays or scene traversal. */
export function cameraClearance(collision, origin, direction, maximum, padding = 0.16) {
  if (!collision?.tree || maximum <= 0) return maximum;
  const { tree, ray, hit, horizontal, vertical } = collision;
  ray.set(origin, direction);
  let distance = nearest(tree, ray, hit, maximum);
  if (padding <= 0) return distance;
  horizontal.set(direction.z, 0, -direction.x);
  if (horizontal.lengthSq() < 1e-10) horizontal.set(1, 0, 0);
  horizontal.normalize();
  vertical.crossVectors(direction, horizontal).normalize();
  for (const [x, y] of LENS_SAMPLES) {
    ray.direction.copy(direction).multiplyScalar(maximum).addScaledVector(horizontal, x * padding).addScaledVector(vertical, y * padding);
    const length = ray.direction.length();
    ray.direction.divideScalar(length);
    distance = Math.min(distance, nearest(tree, ray, hit, length) * maximum / length);
  }
  return distance;
}
