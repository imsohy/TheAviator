import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Legacy r75 BoxGeometry modified vertices[4..7] on the +X face — replicated for BufferGeometry.
 */
export function mergeBoxAndDeformMaxXFace(boxGeom, halfX, halfY, halfZ, deltas) {
  let g = mergeVertices(boxGeom);
  const eps = 0.02;
  const pos = g.attributes.position;
  const arr = pos.array;
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    const x = arr[i * 3];
    const y = arr[i * 3 + 1];
    const z = arr[i * 3 + 2];
    if (Math.abs(x - halfX) > eps) continue;
    const sy = y >= 0 ? 1 : -1;
    const sz = z >= 0 ? 1 : -1;
    const d = deltas.find((t) => t.sy === sy && t.sz === sz);
    if (d) {
      arr[i * 3 + 1] += d.dy;
      arr[i * 3 + 2] += d.dz;
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export function deformCabinGeometry(boxGeom) {
  return mergeBoxAndDeformMaxXFace(boxGeom, 40, 25, 25, [
    { sy: -1, sz: 1, dy: -10, dz: 20 },
    { sy: -1, sz: -1, dy: -10, dz: -20 },
    { sy: 1, sz: 1, dy: 30, dz: 20 },
    { sy: 1, sz: -1, dy: 30, dz: -20 },
  ]);
}

export function propellerTipDeform(boxGeom) {
  return mergeBoxAndDeformMaxXFace(boxGeom, 10, 5, 5, [
    { sy: -1, sz: 1, dy: -5, dz: 5 },
    { sy: -1, sz: -1, dy: -5, dz: -5 },
    { sy: 1, sz: 1, dy: 5, dz: 5 },
    { sy: 1, sz: -1, dy: 5, dz: -5 },
  ]);
}

export function applyTranslationToBufferGeometry(geometry, x, y, z) {
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
}

export { mergeVertices };
