import * as THREE from 'three';

// ---------- Island shape ----------

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

// Coastline radius at angle th (th = atan2(z, x); north is -z).
export function islandR(th) {
  let r = 76 + 5 * Math.sin(3 * th + 0.5) + 3 * Math.cos(5 * th - 1.2) + 2 * Math.sin(7 * th);
  r += 12 * Math.exp(-(angleDiff(th, -Math.PI / 2) ** 2) / (2 * 0.1 ** 2)); // lighthouse point
  return r;
}

const HILLS = [
  { x: -36, z: -28, h: 10, s: 13 }, // summit
  { x: 30, z: -40, h: 4, s: 10 },
  { x: -58, z: 34, h: 3, s: 9 },
  { x: 55, z: 12, h: 2.5, s: 8 },
];

function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  const t = d / islandR(Math.atan2(z, x));
  const inland = 1 - smoothstep(0.72, 0.95, t);
  let h = 2.2 - 5 * smoothstep(0.82, 1.08, t);
  h += inland * (0.55 * Math.sin(x * 0.11) + 0.45 * Math.cos(z * 0.13) + 0.3 * Math.sin((x + z) * 0.21));
  for (const hl of HILLS) {
    h += inland * hl.h * Math.exp(-((x - hl.x) ** 2 + (z - hl.z) ** 2) / (2 * hl.s ** 2));
  }
  return h;
}

// Sites flatten the ground around them; set with setFlatten() once the layout is resolved.
let flats = [];
export function setFlatten(list) {
  flats = list.map((f) => ({ ...f, y: f.y ?? rawHeight(f.x, f.z), cos: Math.cos(f.rot || 0), sin: Math.sin(f.rot || 0) }));
}

export function terrainHeight(x, z) {
  let h = rawHeight(x, z);
  for (const f of flats) {
    const dx = x - f.x, dz = z - f.z;
    const lx = dx * f.cos - dz * f.sin, lz = dx * f.sin + dz * f.cos;
    const q = Math.hypot(lx / f.fx, lz / f.fz);
    if (q < 1.2) h = mix(h, f.y, 1 - smoothstep(0.7, 1.15, q));
  }
  return h;
}

export const coastT = (x, z) => Math.hypot(x, z) / islandR(Math.atan2(z, x));

// ---------- Paths ----------

let segments = [];
export function setPaths(list) { segments = list; }

export function distToPaths(x, z) {
  let best = Infinity;
  for (const [a, b] of segments) {
    const abx = b.x - a.x, abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(x - a.x - abx * t, z - a.z - abz * t));
  }
  return best;
}

let sandZones = [];
export function setSand(list) { sandZones = list; }
const sandAmount = (x, z) => sandZones.reduce((m, s) => Math.max(m, 1 - smoothstep(s.r * 0.6, s.r, Math.hypot(x - s.x, z - s.z))), 0);

// ---------- Meshes ----------

const C = {
  sand: new THREE.Color('#f3dfb2'),
  wetSand: new THREE.Color('#e3c996'),
  grass: new THREE.Color('#a6d98f'),
  grass2: new THREE.Color('#93cf85'),
  hill: new THREE.Color('#bcd98a'),
  rock: new THREE.Color('#c8c2b4'),
  path: new THREE.Color('#e8d3a6'),
  seabed: new THREE.Color('#d9c38f'),
};

export function buildTerrain() {
  const size = 220, seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));

  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const t = coastT(cx, cz);
    if (cy < 0.2) c.copy(C.seabed);
    else if (cy < 1.0 || t > 0.9) c.copy(C.wetSand).lerp(C.sand, smoothstep(0.2, 1.2, cy));
    else if (sandAmount(cx, cz) > 0.5) c.copy(C.sand);
    else if (distToPaths(cx, cz) < 1.7) c.copy(C.path);
    else if (cy > 7.5) c.copy(C.hill).lerp(C.rock, smoothstep(9, 12, cy));
    else c.copy(C.grass).lerp(C.grass2, (Math.sin(cx * 0.3) * Math.cos(cz * 0.27) + 1) / 2).lerp(C.hill, smoothstep(3.5, 7.5, cy));
    // small per-face jitter for a hand-made low-poly look
    const j = ((Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1) * 0.04;
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r + j; colors[(i + k) * 3 + 1] = c.g + j; colors[(i + k) * 3 + 2] = c.b + j;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(900, 900, 1, 1).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#7fcbe0', transparent: true, opacity: 0.82 }));
  water.position.y = 0.35;

  // A soft foam ring hugging the coastline.
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const th = (i / 128) * Math.PI * 2 - Math.PI;
    let r = islandR(th);
    // walk inward until we hit the waterline
    for (let k = 0; k < 40 && rawHeight(Math.cos(th) * r, Math.sin(th) * r) < 0.35; k++) r -= 0.5;
    pts.push(new THREE.Vector2(Math.cos(th) * r, Math.sin(th) * r));
  }
  const ringGeo = new THREE.BufferGeometry();
  const verts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const na = a.clone().normalize().multiplyScalar(2.2), nb = b.clone().normalize().multiplyScalar(2.2);
    verts.push(a.x, 0, a.y, b.x + nb.x, 0, b.y + nb.y, b.x, 0, b.y);
    verts.push(a.x, 0, a.y, a.x + na.x, 0, a.y + na.y, b.x + nb.x, 0, b.y + nb.y);
  }
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const foam = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  foam.position.y = 0.38;

  const group = new THREE.Group();
  group.add(water, foam);
  group.userData.update = (t) => {
    water.position.y = 0.35 + Math.sin(t * 0.8) * 0.06;
    foam.position.y = water.position.y + 0.03;
    foam.material.opacity = 0.4 + Math.sin(t * 1.3) * 0.15;
    foam.scale.setScalar(1 + Math.sin(t * 0.8) * 0.004);
  };
  return group;
}
