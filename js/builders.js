import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Shared geometry ----------

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  prism: (() => {
    // Unit roof prism: 1 wide (x), 1 tall (y, base at 0), 1 deep (z), centred.
    const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  })(),
  wedge: (() => {
    // Ramp: rises along +x from 0 to 1, 1 deep (z).
    const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.5, 1)]);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  })(),
};

const matCache = new Map();
export function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return matCache.get(key);
}

// Build a transform: position, yaw, scale (+ optional x/z tilt).
export function T(x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, sx, sy, sz, order = 'XYZ' } = {}) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)),
    new THREE.Vector3(sx ?? s, sy ?? s, sz ?? s),
  );
}

// ---------- Static batching: merges everything per colour into one mesh ----------

export class Batcher {
  constructor() { this.byColor = new Map(); }

  add(geo, color, matrix, { shadow = true } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.attributes.position.clone());
    clean.applyMatrix4(matrix);
    const key = color + (shadow ? '' : '|ns');
    if (!this.byColor.has(key)) this.byColor.set(key, []);
    this.byColor.get(key).push(clean);
  }

  build() {
    const group = new THREE.Group();
    for (const [key, geos] of this.byColor) {
      const [color, ns] = key.split('|');
      const merged = mergeGeometries(geos);
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, mat(color));
      mesh.castShadow = !ns;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

// A scoped view of the batcher: adds relative to a site's transform.
export function scoped(batch, parent) {
  return (geo, color, local, opts) => batch.add(geo, color, parent.clone().multiply(local), opts);
}

// ---------- Canvas text ----------

export function textTexture(lines, { w = 512, h = 256, bg = '#fffaf2', fg = '#2d3142', font = 64, border = null, align = 'center' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 14; ctx.strokeRect(7, 7, w - 14, h - 14); }
  ctx.fillStyle = fg; ctx.textAlign = align; ctx.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((line, i) => {
    const size = typeof line === 'object' ? line.size : font;
    const text = typeof line === 'object' ? line.text : line;
    ctx.font = `700 ${size}px Fredoka, Nunito, sans-serif`;
    let fs = size;
    while (ctx.measureText(text).width > w - 40 && fs > 10) { fs -= 2; ctx.font = `700 ${fs}px Fredoka, Nunito, sans-serif`; }
    const x = align === 'center' ? w / 2 : 24;
    ctx.fillText(text, x, (h / (arr.length + 1)) * (i + 1));
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A two-post signboard with text on both faces.
export function signboard(text, { w = 4, h = 1.6, bg, fg, border, postColor = '#8a6a4a', font = 90, lift = 1.4 } = {}) {
  const g = new THREE.Group();
  const tex = textTexture(text, { w: 512, h: Math.round(512 * (h / w)), bg, fg, border, font });
  const face = new THREE.MeshBasicMaterial({ map: tex });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), [mat(postColor), mat(postColor), mat(postColor), mat(postColor), face, mat(postColor)]);
  board.position.y = lift + h / 2;
  board.castShadow = true;
  g.add(board);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(G.box, mat(postColor));
    post.scale.set(0.18, lift + h, 0.18);
    post.position.set(sx * (w / 2 - 0.25), (lift + h) / 2, -0.12);
    post.castShadow = true;
    g.add(post);
  }
  return g;
}

// ---------- Characters ----------

export function makePerson({ shirt = '#ef7a6a', pants = '#4a5170', skin = '#f1c7a5', hair = '#5a3b2a', hat = null, hatColor = '#ffd24a', prop = null } = {}) {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, sx, sy, sz, parent = g) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z); m.scale.set(sx, sy ?? sx, sz ?? sx);
    m.castShadow = true; parent.add(m); return m;
  };

  const legs = [-0.15, 0.15].map((x) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.62, 0); g.add(pivot);
    add(G.box, pants, 0, -0.3, 0, 0.22, 0.62, 0.24, pivot);
    add(G.box, '#3a3a48', 0, -0.58, 0.05, 0.24, 0.1, 0.32, pivot);
    return pivot;
  });
  const body = add(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8), shirt, 0, 1.02, 0, 1);
  const arms = [-0.43, 0.43].map((x) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.34, 0); g.add(pivot);
    add(G.cyl6, shirt, 0, -0.25, 0, 0.16, 0.5, 0.16, pivot);
    add(G.sphere, skin, 0, -0.55, 0, 0.17, 0.17, 0.17, pivot);
    return pivot;
  });
  const head = new THREE.Group(); head.position.y = 1.78; g.add(head);
  add(G.sphere, skin, 0, 0, 0, 0.66, 0.66, 0.66, head);
  add(new THREE.SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.04, -0.03, 0.7, 0.7, 0.72, head);
  add(G.sphere, '#2d3142', -0.12, 0.02, 0.3, 0.07, 0.09, 0.05, head);
  add(G.sphere, '#2d3142', 0.12, 0.02, 0.3, 0.07, 0.09, 0.05, head);
  add(G.sphere, '#f59a8b', -0.2, -0.08, 0.27, 0.08, 0.05, 0.03, head);
  add(G.sphere, '#f59a8b', 0.2, -0.08, 0.27, 0.08, 0.05, 0.03, head);
  if (hat === 'cap') { add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hatColor, 0, 0.12, 0, 0.74, 0.6, 0.74, head); add(G.box, hatColor, 0, 0.14, 0.34, 0.5, 0.05, 0.3, head); }
  if (hat === 'grad') { add(G.box, '#2d3142', 0, 0.36, 0, 0.8, 0.06, 0.8, head); add(G.cyl, '#2d3142', 0, 0.26, 0, 0.5, 0.18, 0.5, head); }
  if (hat === 'bucket') add(new THREE.CylinderGeometry(0.3, 0.45, 0.25, 10), hatColor, 0, 0.3, 0, 1, 1, 1, head);
  if (hat === 'hard') add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hatColor, 0, 0.1, 0, 0.72, 0.6, 0.72, head);
  if (hat === 'captain') { add(G.cyl, '#ffffff', 0, 0.28, 0, 0.66, 0.2, 0.66, head); add(G.box, '#2d3142', 0, 0.2, 0.3, 0.5, 0.05, 0.25, head); }
  if (prop === 'backpack') add(G.box, '#3fae7a', 0, 1.05, -0.38, 0.5, 0.6, 0.25);
  if (prop === 'book') add(G.box, '#7c5cc4', 0, -0.62, 0.12, 0.3, 0.38, 0.08, arms[1]);
  if (prop === 'surfboard') { const b = add(G.sphere, '#ffb454', -0.75, 1.2, -0.25, 0.35, 2.4, 0.08); b.rotation.z = 0.15; }
  if (prop === 'clipboard') add(G.box, '#c49a6c', 0, -0.62, 0.14, 0.34, 0.42, 0.05, arms[1]);
  if (prop === 'lantern') { add(G.box, '#ffd24a', 0, -0.72, 0, 0.2, 0.26, 0.2, arms[1]); }

  g.userData = { legs, arms, head, body, walk: 0 };
  return g;
}

export function animatePerson(p, t, moving, speed = 1) {
  const u = p.userData;
  if (moving) {
    u.walk += 0.16 * speed;
    const s = Math.sin(u.walk);
    u.legs[0].rotation.x = s * 0.7; u.legs[1].rotation.x = -s * 0.7;
    u.arms[0].rotation.x = -s * 0.6; u.arms[1].rotation.x = s * 0.6;
    u.body.position.y = 1.02 + Math.abs(Math.cos(u.walk)) * 0.05;
  } else {
    for (const l of [...u.legs, ...u.arms]) l.rotation.x *= 0.8;
    u.body.position.y = 1.02 + Math.sin(t * 2) * 0.015;
    u.head.position.y = 1.78 + Math.sin(t * 2) * 0.02;
  }
}

export function makeKiwi() {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, sx, sy, sz, r) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (r) m.rotation.set(...r);
    m.castShadow = true; g.add(m); return m;
  };
  add(G.ico1, '#8a6a47', 0, 0.75, 0, 1.0, 0.85, 1.25);
  const head = add(G.ico1, '#7a5c3d', 0, 1.15, 0.55, 0.5, 0.48, 0.5);
  add(G.cone, '#e8d7a0', 0, 1.02, 1.12, 0.08, 0.85, 0.08, [Math.PI / 2 + 0.35, 0, 0]);
  add(G.sphere, '#1d1d24', -0.16, 1.22, 0.74, 0.07, 0.07, 0.07);
  add(G.sphere, '#1d1d24', 0.16, 1.22, 0.74, 0.07, 0.07, 0.07);
  for (const x of [-0.2, 0.2]) {
    add(G.cyl6, '#e0b44a', x, 0.2, 0.05, 0.07, 0.45, 0.07);
    add(G.box, '#e0b44a', x, 0.02, 0.15, 0.18, 0.04, 0.3);
  }
  g.userData = { head };
  return g;
}

export function makeSheep() {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m);
  };
  add(G.ico1, '#fbf7ee', 0, 0.85, 0, 1.3, 0.95, 1.7);
  add(G.ico, '#3a3440', 0, 1.0, 0.95, 0.5, 0.55, 0.6);
  for (const [x, z] of [[-0.35, -0.5], [0.35, -0.5], [-0.35, 0.5], [0.35, 0.5]]) add(G.cyl6, '#3a3440', x, 0.25, z, 0.14, 0.5, 0.14);
  return g;
}

// ---------- Scenery (batched) ----------

export function pohutukawa(add, x, y, z, s, rnd) {
  add(G.cyl6, '#8a6a4a', T(x, y + 1.2 * s, z, { sx: 0.45 * s, sy: 2.4 * s, sz: 0.45 * s }));
  const blobs = 4;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const bx = x + Math.cos(a) * 1.1 * s, bz = z + Math.sin(a) * 1.1 * s, by = y + (2.6 + rnd() * 0.6) * s;
    add(G.ico, '#4e8f55', T(bx, by, bz, { s: (2.0 + rnd() * 0.5) * s, ry: rnd() * 3 }));
    // crimson summer flowers
    for (let k = 0; k < 3; k++) {
      add(G.ico, '#e2463f', T(bx + (rnd() - 0.5) * 1.4 * s, by + 0.7 * s + rnd() * 0.3, bz + (rnd() - 0.5) * 1.4 * s, { s: 0.35 * s }), { shadow: false });
    }
  }
  add(G.ico, '#58995d', T(x, y + 3.5 * s, z, { s: 2.2 * s }));
}

export function cabbageTree(add, x, y, z, s, rnd) {
  const h = (3 + rnd() * 1.5) * s;
  add(G.cyl6, '#a08466', T(x, y + h / 2, z, { sx: 0.25 * s, sy: h, sz: 0.25 * s, rz: (rnd() - 0.5) * 0.12 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(G.cone, '#86b765', T(x + Math.cos(a) * 0.35 * s, y + h + 0.1, z + Math.sin(a) * 0.35 * s, { sx: 0.18 * s, sy: 1.5 * s, sz: 0.18 * s, rx: Math.sin(a) * 0.9, rz: -Math.cos(a) * 0.9 }));
  }
  add(G.cone, '#98c874', T(x, y + h + 0.5 * s, z, { sx: 0.2 * s, sy: 1.3 * s, sz: 0.2 * s }));
}

export function ponga(add, x, y, z, s, rnd) {
  const h = (2 + rnd()) * s;
  add(G.cyl6, '#5b4636', T(x, y + h / 2, z, { sx: 0.35 * s, sy: h, sz: 0.35 * s }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd();
    add(G.box, '#5f9e4f', T(x + Math.cos(a) * 0.8 * s, y + h - 0.25 * s, z + Math.sin(a) * 0.8 * s, { sx: 0.45 * s, sy: 0.06, sz: 1.8 * s, ry: -a + Math.PI / 2, rx: 0.45, order: 'YXZ' }));
  }
}

export function rock(add, x, y, z, s, rnd) {
  add(G.dodeca, rnd() > 0.5 ? '#c9c3b6' : '#b8b2a6', T(x, y + 0.2 * s, z, { sx: s * (1 + rnd() * 0.6), sy: s * 0.7, sz: s, ry: rnd() * 6 }));
}

export function flax(add, x, y, z, s, rnd) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd();
    add(G.cone, '#6f9c52', T(x + Math.cos(a) * 0.15, y + 0.7 * s, z + Math.sin(a) * 0.15, { sx: 0.15 * s, sy: 1.6 * s, sz: 0.06 * s, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35, ry: a }));
  }
}

// A simple gabled house (local origin at ground centre, front faces +z).
export function house(add, x, z, { w = 4, h = 3, d = 4, wall = '#f7e3c3', roof = '#ef7a6a', door = '#8a6a4a', ry = 0 } = {}) {
  const P = T(x, 0, z, { ry });
  const a = (geo, c, m) => add(geo, c, P.clone().multiply(m));
  a(G.box, wall, T(0, h / 2, 0, { sx: w, sy: h, sz: d }));
  a(G.prism, roof, T(0, h, 0, { sx: w + 0.6, sy: h * 0.55, sz: d + 0.6 }));
  a(G.box, door, T(0, 0.8, d / 2 + 0.02, { sx: 0.9, sy: 1.6, sz: 0.1 }));
  for (const sx of [-1, 1]) a(G.box, '#bfe6f5', T(sx * w * 0.3, h * 0.6, d / 2 + 0.03, { sx: 0.8, sy: 0.7, sz: 0.08 }));
}
