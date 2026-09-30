import * as THREE from 'three';
import { islandR, terrainHeight, setFlatten, setPaths, setSand, distToPaths, coastT, buildTerrain, buildWater } from './terrain.js';
import {
  G, T, mat, Batcher, scoped, signboard, textTexture, makePerson, makeKiwi, makeSheep,
  pohutukawa, cabbageTree, ponga, rock, flax, house,
} from './builders.js';

export const MAIN = ['campus', 'market', 'tower', 'highway', 'summit'];
export const SIDE = ['library', 'hall', 'beach'];

// Place names are generic on purpose: anything identifying comes from the encrypted content.
export const PLACES = {
  wharf: { en: 'The Wharf', mi: 'Te Wāpu' },
  campus: { en: 'Campus', mi: 'Whare Wānanga' },
  market: { en: 'Market Village', mi: 'Mākete' },
  tower: { en: 'The Tower', mi: 'Pourewa' },
  highway: { en: 'The Highway', mi: 'Huarahi Matua' },
  summit: { en: 'The Summit', mi: 'Te Tihi' },
  library: { en: 'Tool Library', mi: 'Whare Pukapuka' },
  hall: { en: 'Community Hall', mi: 'Whare Hapori' },
  beach: { en: 'The Beach', mi: 'Tātahi' },
  lighthouse: { en: 'Lighthouse', mi: 'Whare Rama' },
};

const OBJECT_NAMES = {
  gradcap: 'Graduation cap', robot: 'OCR robot', blocks: 'Compose blocks', ramp: 'Accessibility ramp',
  catalog: 'Component catalog', houses: 'Two houses', monitor: 'Dashboard', campervan: 'Campervan',
  led: 'LED art', frisbee: 'Frisbee', basket: 'Disc golf basket', pooltable: 'Pool table', track: 'Hiking track',
};

const NPC_LOOKS = {
  guide: null,
  campus: { shirt: '#9a86d6', hat: 'grad', prop: 'book', hair: '#d9d2c3' },
  market: { shirt: '#2f5d62', hat: 'cap', hatColor: '#ffd24a', hair: '#2d2a32' },
  tower: { shirt: '#6fae5a', prop: 'clipboard', hair: '#7a4b2a', skin: '#c68f6a' },
  highway: { shirt: '#ff8a3d', hat: 'hard', hatColor: '#ffd24a', skin: '#8d5a3b' },
  summit: { shirt: '#5b6c8f', hat: 'captain', hair: '#3a2a22' },
  library: { shirt: '#c49a6c', prop: 'book', hair: '#1f1b22', skin: '#e0ac86' },
  hall: { shirt: '#ef7a6a', prop: 'clipboard', hair: '#a0522d' },
  beach: { shirt: '#3fa7d6', hat: 'bucket', hatColor: '#ffd24a', prop: 'surfboard', skin: '#b87a55' },
  lighthouse: { shirt: '#2f7fb5', hat: 'bucket', hatColor: '#ffb454', prop: 'lantern', hair: '#eeeeee' },
};

// ---------- Layout ----------

function polar(th, inset) {
  const r = islandR(th) - inset;
  return { x: Math.cos(th) * r, z: Math.sin(th) * r };
}
const faceCentre = (s) => ({ ...s, rot: Math.atan2(0 - s.x, 8 - s.z) });

function resolveLayout() {
  const wharf = polar(Math.PI / 2 + 0.08, 7);
  const L = {
    wharf: { ...wharf, rot: Math.atan2(wharf.x, wharf.z), fx: 5, fz: 4, r: 9 },
    campus: faceCentre({ x: -30, z: 40, fx: 12, fz: 11, r: 13 }),
    market: faceCentre({ x: 27, z: 42, fx: 12, fz: 10, r: 13 }),
    hall: faceCentre({ x: -5, z: 10, fx: 9, fz: 9, r: 11 }),
    tower: faceCentre({ x: 44, z: -4, fx: 10, fz: 10, r: 12 }),
    beach: faceCentre({ ...polar(0.52, 16), fx: 14, fz: 10, r: 14 }),
    highway: faceCentre({ x: 8, z: -32, fx: 19, fz: 8, r: 14 }),
    summit: faceCentre({ x: -36, z: -28, fx: 9, fz: 8, r: 12 }),
    library: faceCentre({ x: -55, z: 5, fx: 8, fz: 7, r: 10 }),
    lighthouse: faceCentre({ ...polar(-Math.PI / 2, 12), fx: 7, fz: 7, r: 9 }),
  };
  setFlatten(Object.values(L));
  for (const s of Object.values(L)) s.y = terrainHeight(s.x, s.z);
  const edges = [
    ['wharf', 'campus'], ['wharf', 'market'], ['campus', 'hall'], ['market', 'hall'], ['market', 'beach'],
    ['beach', 'tower'], ['market', 'tower'], ['tower', 'highway'], ['hall', 'highway'], ['highway', 'summit'],
    ['summit', 'library'], ['library', 'campus'], ['highway', 'lighthouse'],
  ];
  setPaths(edges.map(([a, b]) => [L[a], L[b]]));
  setSand([{ x: L.beach.x, z: L.beach.z, r: 17 }, { x: L.wharf.x, z: L.wharf.z, r: 8 }]);
  return L;
}

// ---------- Helpers ----------

class Site {
  constructor(id, s, batch, scene) {
    this.id = id; this.s = s;
    this.M = T(s.x, s.y, s.z, { ry: s.rot });
    this.a = scoped(batch, this.M);
    this.dyn = new THREE.Group();
    this.dyn.position.set(s.x, s.y, s.z); this.dyn.rotation.y = s.rot;
    scene.add(this.dyn);
    this.colliders = []; this.objects = []; this.updaters = [];
  }
  world(x, z, y = 0) { return new THREE.Vector3(x, y, z).applyMatrix4(this.M); }
  box(x, z, hw, hd, ry = 0) { this.colliders.push({ type: 'box', local: [x, z], hw, hd, ry }); }
  circle(x, z, r) { this.colliders.push({ type: 'circle', local: [x, z], r }); }
  object(id, x, z, radius = 3) { this.objects.push({ id, pos: [x, z], radius }); }
  put(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; this.dyn.add(obj); return obj; }
}

function stonePedestal(site, x, z) {
  site.a(G.cyl6, '#b8b2a6', T(x, 0.45, z, { sx: 1.1, sy: 0.9, sz: 1.1 }));
  site.a(G.cyl6, '#d0cabe', T(x, 0.95, z, { sx: 1.3, sy: 0.12, sz: 1.3 }));
  site.circle(x, z, 0.8);
  site.stoneAt = [x, z];
}

function glowMaterial(color, opacity = 0.25) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// ---------- Sites ----------

function buildWharf(site) {
  const { a } = site;
  const deckY = Math.max(site.s.y + 0.35, 1.25) - site.s.y;
  for (let z = -3; z <= 16; z += 0.6) {
    a(G.box, Math.round(z / 0.6) % 2 ? '#c49a6c' : '#b98d5f', T(0, deckY - 0.1, z, { sx: 3.6, sy: 0.2, sz: 0.55 }));
  }
  for (let z = 0; z <= 16; z += 4) for (const x of [-1.9, 1.9]) a(G.cyl6, '#7a5c3d', T(x, deckY - 1.2, z, { sx: 0.35, sy: 3, sz: 0.35 }));
  for (const x of [-1.9, 1.9]) a(G.box, '#a07852', T(x, deckY + 0.5, 8, { sx: 0.12, sy: 0.12, sz: 16 }));
  site.platform = { local: [0, 6.5], hw: 1.7, hd: 9.8, y: site.s.y + deckY };

  const sign = signboard(['Haere mai!', { text: 'Welcome', size: 56 }], { w: 3.2, h: 1.6, bg: '#fffaf2', border: '#3fae7a', font: 84 });
  site.put(sign, 3.4, 0, -4, -0.4);
  site.circle(3.4, -4, 1.2);

  // bobbing boat at the end of the wharf
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(G.box, mat('#fffaf2')); hull.scale.set(2, 0.9, 3.6); hull.position.y = 0.45; boat.add(hull);
  const bow = new THREE.Mesh(G.prism, mat('#fffaf2')); bow.scale.set(2, 1.2, 0.9); bow.rotation.set(-Math.PI / 2, 0, 0); bow.position.set(0, 0.45, 1.8); bow.rotation.z = Math.PI; boat.add(bow);
  const stripe = new THREE.Mesh(G.box, mat('#7cc6de')); stripe.scale.set(2.05, 0.2, 3.62); stripe.position.y = 0.7; boat.add(stripe);
  const mast = new THREE.Mesh(G.cyl6, mat('#8a6a4a')); mast.scale.set(0.12, 3.5, 0.12); mast.position.y = 2.6; boat.add(mast);
  const sail = new THREE.Mesh(G.prism, mat('#ffd24a')); sail.scale.set(1.6, 2.6, 0.05); sail.rotation.y = Math.PI / 2; sail.position.set(0, 1.2, 0.4); boat.add(sail);
  boat.traverse((m) => { m.castShadow = true; });
  site.put(boat, 3.8, 0, 14, 0.1);
  boat.position.y = 0.35 - site.s.y - 0.3;
  const by = boat.position.y;
  site.updaters.push((t) => { boat.position.y = by + Math.sin(t * 1.4) * 0.12; boat.rotation.z = Math.sin(t * 1.1) * 0.05; });

  site.npcAt = [-2.6, -4.5, 0.4];
  site.spawn = { local: [0, 9], y: site.platform.y };
}

function buildCampus(site, cv) {
  const { a } = site;
  a(G.box, '#f3e6c8', T(0, 3, -6, { sx: 16, sy: 6, sz: 8 }));
  a(G.prism, '#d98a6c', T(0, 6, -6, { sx: 17, sy: 2.6, sz: 9 }));
  a(G.box, '#fffaf2', T(0, 5.4, -1.6, { sx: 14, sy: 0.4, sz: 2.2 }));
  a(G.prism, '#fffaf2', T(0, 5.6, -1.6, { sx: 14, sy: 1.4, sz: 2.2 }));
  for (const x of [-6, -3.6, -1.2, 1.2, 3.6, 6]) a(G.cyl, '#ffffff', T(x, 2.7, -1.2, { sx: 0.7, sy: 5.4, sz: 0.7 }));
  a(G.box, '#e7dccb', T(0, 0.15, -0.6, { sx: 13.5, sy: 0.3, sz: 1.8 }));
  a(G.box, '#8a6a4a', T(0, 1.5, -1.95, { sx: 1.8, sy: 3, sz: 0.1 }));
  for (const x of [-5, -2.5, 2.5, 5]) a(G.box, '#bfe6f5', T(x, 3.4, -1.95, { sx: 1.1, sy: 1.3, sz: 0.1 }));
  site.box(0, -6, 8.3, 4.3);

  site.put(signboard(cv.sites.campus.sign, { bg: '#2d3142', fg: '#ffffff', w: 3.6, h: 1.4, font: 110 }), 6.5, 0, 3.5, -0.4);
  site.circle(6.5, 3.5, 1.4);

  // graduation cap sculpture
  a(G.box, '#d9d2c3', T(-5.5, 0.6, 2.5, { sx: 1.2, sy: 1.2, sz: 1.2 }));
  const cap = new THREE.Group();
  const board = new THREE.Mesh(G.box, mat('#2d3142')); board.scale.set(1.8, 0.12, 1.8); board.rotation.y = Math.PI / 4; board.position.y = 0.55; cap.add(board);
  const crown = new THREE.Mesh(G.cyl, mat('#2d3142')); crown.scale.set(1, 0.5, 1); crown.position.y = 0.25; cap.add(crown);
  const tassel = new THREE.Mesh(G.box, mat('#ffd24a')); tassel.scale.set(0.08, 0.7, 0.08); tassel.position.set(0.8, 0.25, 0); cap.add(tassel);
  cap.traverse((m) => { m.castShadow = true; });
  site.put(cap, -5.5, 1.3, 2.5);
  site.updaters.push((t) => { cap.rotation.y = t * 0.6; cap.position.y = 1.35 + Math.sin(t * 1.5) * 0.1; });
  site.circle(-5.5, 2.5, 0.9);
  site.object('gradcap', -5.5, 2.5);

  site.npcAt = [0.5, 3, 0];
  stonePedestal(site, 2.8, 2.4);
}

function stall(a, x, z, ry, c1, rnd) {
  const S = T(x, 0, z, { ry });
  const b = (geo, c, m) => a(geo, c, S.clone().multiply(m));
  b(G.box, '#c49a6c', T(0, 0.5, 0, { sx: 3, sy: 1, sz: 1.4 }));
  for (const px of [-1.4, 1.4]) for (const pz of [-0.6, 0.6]) b(G.box, '#a07852', T(px, 1.45, pz, { sx: 0.14, sy: 2.9, sz: 0.14 }));
  for (let i = 0; i < 6; i++) b(G.box, i % 2 ? '#fffaf2' : c1, T(-1.375 + i * 0.55, 2.95, 0, { sx: 0.55, sy: 0.12, sz: 2, rx: -0.18 }));
  const goods = ['#ef7a6a', '#ffd24a', '#a6d98f', '#7cc6de', '#c3a6f0', '#ffb454'];
  for (let i = 0; i < 5; i++) {
    const geo = rnd() > 0.5 ? G.sphere : G.box;
    b(geo, goods[Math.floor(rnd() * goods.length)], T(-1.1 + i * 0.55, 1.2, (rnd() - 0.5) * 0.6, { s: 0.35 + rnd() * 0.15 }));
  }
}

function buildMarket(site, cv, rnd) {
  const { a } = site;
  const stalls = [[-6.5, -2.5, 0.4, '#ffd24a'], [-2.3, -4.6, 0.12, '#7cc6de'], [2.3, -4.6, -0.12, '#ef7a6a'], [6.5, -2.5, -0.4, '#a6d98f']];
  for (const [x, z, ry, c] of stalls) { stall(a, x, z, ry, c, rnd); site.box(x, z, 1.7, 1.1, ry); }

  site.put(signboard(cv.sites.market.sign, { bg: '#ffd24a', fg: '#2d3142', w: 3.8, h: 1.4, font: 100 }), -7.5, 0, 3.5, 0.35);
  site.circle(-7.5, 3.5, 1.4);
  site.put(signboard(['UI Testing', { text: 'Workshop today!', size: 52 }], { w: 2.6, h: 1.6, bg: '#fffaf2', border: '#7cc6de', font: 80, lift: 0.6 }), -3.4, 0, 3.2, 0.25);
  site.circle(-3.4, 3.2, 1);

  // OCR robot
  const robot = new THREE.Group();
  const part = (geo, c, x, y, z, sx, sy, sz, basic) => {
    const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color: c }) : mat(c));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; robot.add(m); return m;
  };
  part(G.box, '#3a3a48', 0, 0.2, 0, 1.0, 0.4, 0.9);
  part(G.box, '#c8ccd6', 0, 0.95, 0, 0.9, 1.0, 0.7);
  part(G.box, '#7cc6de', 0, 1.0, 0.36, 0.5, 0.4, 0.02, true);
  const head = new THREE.Group(); head.position.y = 1.75; robot.add(head);
  const h = new THREE.Mesh(G.box, mat('#dfe2ea')); h.scale.set(0.75, 0.55, 0.6); h.castShadow = true; head.add(h);
  for (const x of [-0.17, 0.17]) { const e = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: '#39e1ff' })); e.scale.setScalar(0.16); e.position.set(x, 0.03, 0.31); head.add(e); }
  const ant = new THREE.Mesh(G.cyl6, mat('#9aa0a8')); ant.scale.set(0.05, 0.4, 0.05); ant.position.y = 0.45; head.add(ant);
  const bulb = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: '#ef4a4a' })); bulb.scale.setScalar(0.16); bulb.position.y = 0.7; head.add(bulb);
  site.put(robot, 4.6, 0, 2.6, -0.5);
  site.updaters.push((t) => {
    head.rotation.y = Math.sin(t * 0.9) * 0.7;
    robot.position.y = Math.abs(Math.sin(t * 3)) * 0.06;
    bulb.material.color.setHSL(0, 0.8, 0.45 + 0.2 * Math.sin(t * 6));
  });
  site.circle(4.6, 2.6, 0.9);
  site.object('robot', 4.6, 2.6);

  site.npcAt = [0, 1.5, 0];
  stonePedestal(site, 2.2, 1.0);
}

function buildTower(site, cv) {
  const { a } = site;
  a(G.box, '#a9dcf2', T(0, 8, -6, { sx: 7, sy: 16, sz: 7 }));
  for (let y = 2.5; y < 16; y += 3) a(G.box, '#fffaf2', T(0, y, -6, { sx: 7.25, sy: 0.3, sz: 7.25 }));
  for (const x of [-2.2, 0, 2.2]) a(G.box, '#6fb7d8', T(x, 9, -2.45, { sx: 1.0, sy: 12, sz: 0.1 }));
  a(G.cyl, '#fffaf2', T(0, 16.3, -6, { sx: 8.5, sy: 0.6, sz: 8.5 }));
  a(G.cyl6, '#9aa0a8', T(0, 18, -6, { sx: 0.15, sy: 3, sz: 0.15 }));
  a(G.box, '#2d3142', T(0, 1.3, -2.45, { sx: 2, sy: 2.6, sz: 0.1 }));
  a(G.box, '#fffaf2', T(0, 2.8, -1.8, { sx: 3.2, sy: 0.2, sz: 1.5 }));
  site.box(0, -6, 3.8, 3.8);

  site.put(signboard(cv.sites.tower.sign, { bg: '#13b5ea', fg: '#ffffff', w: 3.4, h: 1.4, font: 110 }), -6.8, 0, 3.5, 0.4);
  site.circle(-6.8, 3.5, 1.4);

  // Compose blocks
  const colors = ['#ef7a6a', '#ffd24a', '#7cc6de', '#a6d98f', '#c3a6f0', '#ffb454'];
  let i = 0;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 3 - row; k++) {
      a(G.box, colors[i++ % colors.length], T(5.2 + (k - (2 - row) / 2) * 1.05, 0.5 + row * 1.02, 1.2, { s: 1, ry: (row % 2) * 0.08 }));
    }
  }
  site.box(5.2, 1.2, 1.7, 0.7);
  site.object('blocks', 5.2, 1.2);

  // E2E test lab dome
  a(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#dff3ea', T(-5.5, 0, -0.5, { s: 2.3 }));
  a(G.box, '#3fae7a', T(-5.5, 0.8, 1.75, { sx: 0.9, sy: 1.6, sz: 0.1 }));
  site.circle(-5.5, -0.5, 2.4);
  site.put(signboard('E2E Test Lab', { w: 2.4, h: 0.7, bg: '#3fae7a', fg: '#ffffff', font: 70, lift: 0.9 }), -3.2, 0, 1.8, 0.3);

  site.npcAt = [0, 2, 0];
  stonePedestal(site, 2.2, 1.6);
}

function catalogTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 340;
  const c = cv.getContext('2d');
  c.fillStyle = '#fffaf2'; c.fillRect(0, 0, 512, 340);
  c.fillStyle = '#2d3142'; c.font = '700 40px Fredoka, sans-serif'; c.fillText('Component Catalog', 24, 52);
  const pill = (x, y, w, h, fill, text, fg = '#fff') => {
    c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill();
    if (text) { c.fillStyle = fg; c.font = '700 22px Nunito, sans-serif'; c.fillText(text, x + 16, y + h / 2 + 8); }
  };
  pill(24, 80, 150, 46, '#3fae7a', 'Primary'); pill(190, 80, 150, 46, '#e3f4ea', 'Tonal', '#1f6b48'); pill(356, 80, 130, 46, '#ef7a6a', 'Error');
  c.fillStyle = '#f4ecdf'; c.beginPath(); c.roundRect(24, 146, 300, 170, 18); c.fill();
  c.fillStyle = '#7cc6de'; c.beginPath(); c.roundRect(40, 162, 268, 80, 12); c.fill();
  c.fillStyle = '#2d3142'; c.fillRect(40, 256, 180, 14); c.fillStyle = '#9aa0a8'; c.fillRect(40, 282, 230, 10);
  pill(344, 150, 70, 34, '#c3a6f0'); pill(420, 150, 70, 34, '#ffd24a'); pill(344, 196, 90, 34, '#a6d98f');
  c.fillStyle = '#3fae7a'; c.beginPath(); c.roundRect(350, 256, 90, 44, 22); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(418, 278, 17, 0, Math.PI * 2); c.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function makeCar(color) {
  const car = new THREE.Group();
  const p = (geo, c, x, y, z, sx, sy, sz, rx = 0) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; m.castShadow = true; car.add(m); };
  p(G.box, color, 0, 0.6, 0, 2.4, 0.7, 1.2);
  p(G.box, '#bfe6f5', -0.1, 1.2, 0, 1.3, 0.55, 1.05);
  for (const x of [-0.8, 0.8]) for (const z of [-0.6, 0.6]) p(G.cyl, '#2d3142', x, 0.32, z, 0.6, 0.25, 0.6, Math.PI / 2);
  return car;
}

function buildHighway(site, cv) {
  const { a } = site;
  a(G.box, '#70757f', T(0, 0.08, -3, { sx: 36, sy: 0.16, sz: 6 }), { shadow: false });
  for (const z of [-5.7, -0.3]) a(G.box, '#fffaf2', T(0, 0.17, z, { sx: 36, sy: 0.02, sz: 0.18 }), { shadow: false });
  for (let x = -16.5; x <= 16.5; x += 3) a(G.box, '#ffd24a', T(x, 0.17, -3, { sx: 1.6, sy: 0.02, sz: 0.2 }), { shadow: false });

  // road signs
  a(G.cyl6, '#9aa0a8', T(-11, 1.3, 0.8, { sx: 0.12, sy: 2.6, sz: 0.12 }));
  a(G.cyl, '#e2463f', T(-11, 2.8, 0.8, { rx: Math.PI / 2, sx: 1.3, sy: 0.08, sz: 1.3 }));
  a(G.cyl, '#fffaf2', T(-11, 2.8, 0.85, { rx: Math.PI / 2, sx: 0.95, sy: 0.08, sz: 0.95 }));
  a(G.cyl6, '#9aa0a8', T(11, 1.3, 0.8, { sx: 0.12, sy: 2.6, sz: 0.12 }));
  a(G.box, '#ffd24a', T(11, 2.9, 0.8, { rz: Math.PI / 4, sx: 1, sy: 1, sz: 0.08 }));
  site.circle(-11, 0.8, 0.5); site.circle(11, 0.8, 0.5);
  for (const x of [-15, -13.5, 13.5, 15]) {
    a(G.cone, '#ff8a3d', T(x, 0.4, 0.4, { sx: 0.6, sy: 0.8, sz: 0.6 }));
    a(G.box, '#ff8a3d', T(x, 0.05, 0.4, { sx: 0.7, sy: 0.1, sz: 0.7 }));
  }

  const dir = signboard(cv.sites.highway.sign, { w: 6, h: 1.6, bg: '#2f7d4f', fg: '#ffffff', border: '#ffffff', font: 100, lift: 2.4, postColor: '#9aa0a8' });
  site.put(dir, 0, 0, -7.2);
  site.circle(-2.75, -7.3, 0.4); site.circle(2.75, -7.3, 0.4);

  // accessibility ramp
  a(G.wedge, '#d9d2c3', T(-6.5, 0, 3.6, { sx: 4, sy: 0.9, sz: 1.8 }));
  a(G.box, '#d9d2c3', T(-3.9, 0.45, 3.6, { sx: 1.2, sy: 0.9, sz: 1.8 }));
  for (const z of [2.8, 4.4]) a(G.box, '#7cc6de', T(-5.9, 1.25, z, { sx: 5, sy: 0.08, sz: 0.08, rz: 0.18 }));
  const a11y = signboard('♿', { w: 0.9, h: 0.9, bg: '#2f6db5', fg: '#ffffff', font: 300, lift: 1, postColor: '#9aa0a8' });
  site.put(a11y, -3.6, 0, 4.9);
  site.box(-5.6, 3.6, 2.8, 1.1);
  site.object('ramp', -5.6, 3.6);

  // component catalog board
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.25, 0.15), [mat('#8a6a4a'), mat('#8a6a4a'), mat('#8a6a4a'), mat('#8a6a4a'), new THREE.MeshBasicMaterial({ map: catalogTexture() }), mat('#8a6a4a')]);
  board.position.set(6.4, 2.0, 3.6); board.rotation.y = -0.25; board.castShadow = true; site.dyn.add(board);
  for (const dx of [-1.4, 1.4]) a(G.box, '#8a6a4a', T(6.4 + dx * Math.cos(0.25), 1.0, 3.6 + dx * Math.sin(0.25) - 0.1, { sx: 0.15, sy: 2, sz: 0.15 }));
  site.box(6.4, 3.6, 1.8, 0.5, -0.25);
  site.object('catalog', 6.4, 3.6);

  // traffic
  const cars = [[makeCar('#ef7a6a'), -4.4, 1], [makeCar('#7cc6de'), -1.6, -1], [makeCar('#ffd24a'), -4.4, 1]];
  cars.forEach(([car, z, d], i) => { site.put(car, 0, 0.15, z, d > 0 ? 0 : Math.PI); car.userData.offset = i * 12; });
  site.updaters.push((t) => {
    for (const [car, , d] of cars) car.position.x = d * ((((t * 6 + car.userData.offset) % 36) + 36) % 36 - 18);
  });

  site.npcAt = [0.2, 3.2, 0];
  stonePedestal(site, 2.4, 2.6);
}

function dashboardTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320;
  const c = cv.getContext('2d');
  c.fillStyle = '#1f2433'; c.fillRect(0, 0, 512, 320);
  c.fillStyle = '#e8ecf5'; c.font = '700 34px Fredoka, sans-serif'; c.fillText('App health', 24, 50);
  c.strokeStyle = '#3a4258'; c.lineWidth = 2;
  for (let y = 100; y <= 280; y += 45) { c.beginPath(); c.moveTo(24, y); c.lineTo(488, y); c.stroke(); }
  const line = (color, pts) => { c.strokeStyle = color; c.lineWidth = 6; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
  line('#7fe0a8', [[24, 250], [100, 230], [170, 236], [240, 190], [310, 170], [380, 140], [488, 110]]);
  line('#ffd24a', [[24, 200], [120, 210], [200, 180], [290, 200], [380, 185], [488, 190]]);
  c.fillStyle = '#7fe0a8'; c.font = '700 26px Nunito, sans-serif'; c.fillText('Crashes  ✓', 24, 305); c.fillText('Analytics  ✓', 190, 305); c.fillText('SLOs  ✓', 380, 305);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function buildSummit(site, cv) {
  const { a } = site;
  house(a, -4.2, -4, { wall: '#f7c59f', roof: '#ef7a6a' });
  house(a, 4.2, -4, { wall: '#bfe3cf', roof: '#3fae7a' });
  a(G.box, '#ffd24a', T(0, 1.4, -4, { sx: 4.6, sy: 2.4, sz: 2.2 }));
  a(G.prism, '#ffb454', T(0, 2.6, -4, { sx: 4.6, sy: 0.9, sz: 2.6, ry: 0 }));
  a(G.box, '#fffaf2', T(0, 1.2, -2.85, { sx: 1.8, sy: 0.25, sz: 0.1 }));
  site.box(0, -4, 6.4, 2.3);
  site.object('houses', 0, -1.2, 3.2);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 0.2), [mat('#2d3142'), mat('#2d3142'), mat('#2d3142'), mat('#2d3142'), new THREE.MeshBasicMaterial({ map: dashboardTexture() }), mat('#2d3142')]);
  screen.position.set(-6.6, 2.1, 2.2); screen.rotation.y = 0.45; screen.castShadow = true; site.dyn.add(screen);
  a(G.box, '#2d3142', T(-6.6, 0.55, 2.2, { sx: 0.3, sy: 1.1, sz: 0.3 }));
  site.box(-6.6, 2.2, 1.8, 0.5, 0.45);
  site.object('monitor', -6.6, 2.2);

  // flag
  a(G.cyl6, '#fffaf2', T(7, 3, -0.5, { sx: 0.14, sy: 6, sz: 0.14 }));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 6, 1), new THREE.MeshLambertMaterial({ color: '#ffd24a', side: THREE.DoubleSide }));
  flag.position.set(7.95, 5.4, -0.5); site.dyn.add(flag);
  const fp = flag.geometry.attributes.position; const base = fp.array.slice();
  site.updaters.push((t) => {
    for (let i = 0; i < fp.count; i++) { const x = base[i * 3] + 0.9; fp.setZ(i, Math.sin(x * 3 - t * 5) * 0.12 * x); }
    fp.needsUpdate = true;
  });
  site.circle(7, -0.5, 0.4);

  site.put(signboard(cv.sites.summit.sign, { bg: '#ffd24a', fg: '#2d3142', w: 3.8, h: 1.4, font: 100 }), 6.2, 0, 3.8, -0.4);
  site.circle(6.2, 3.8, 1.4);

  site.npcAt = [0, 2, 0];
  stonePedestal(site, 2.3, 1.4);
}

function buildLibrary(site, rnd) {
  const { a } = site;
  a(G.box, '#d8c3a0', T(0, 0.15, -1, { sx: 11, sy: 0.3, sz: 8 }));
  for (const x of [-5, 5]) for (const z of [-4.5, 2.5]) a(G.box, '#a07852', T(x, 2.2, z, { sx: 0.35, sy: 4.4, sz: 0.35 }));
  a(G.prism, '#9a86d6', T(0, 4.4, -1, { sx: 12.4, sy: 2.4, sz: 9 }));
  const books = ['#ef7a6a', '#ffd24a', '#7cc6de', '#a6d98f', '#c3a6f0', '#ffb454', '#3fae7a', '#f59a8b'];
  for (const sx of [-3.4, 0, 3.4]) {
    a(G.box, '#a07852', T(sx, 1.95, -4.2, { sx: 3, sy: 3.3, sz: 0.9 }));
    for (let row = 0; row < 3; row++) {
      a(G.box, '#8a6a4a', T(sx, 0.62 + row * 1.05, -3.72, { sx: 2.9, sy: 0.08, sz: 0.2 }));
      let x = sx - 1.3;
      while (x < sx + 1.25) {
        const w = 0.18 + rnd() * 0.12, h = 0.6 + rnd() * 0.3;
        a(G.box, books[Math.floor(rnd() * books.length)], T(x + w / 2, 0.66 + row * 1.05 + h / 2, -3.62, { sx: w * 0.92, sy: h, sz: 0.5 }), { shadow: false });
        x += w;
      }
    }
  }
  a(G.box, '#c49a6c', T(2.6, 0.95, 0.4, { sx: 2.4, sy: 0.12, sz: 1.2 }));
  a(G.box, '#a07852', T(2.6, 0.5, 0.4, { sx: 0.2, sy: 0.9, sz: 0.2 }));
  a(G.box, '#ef7a6a', T(2.2, 1.06, 0.4, { sx: 0.7, sy: 0.1, sz: 0.5, ry: 0.3 }));
  site.box(0, -4.2, 5.2, 0.6); site.box(2.6, 0.4, 1.3, 0.7);
  for (const x of [-5, 5]) for (const z of [-4.5, 2.5]) site.circle(x, z, 0.35);
  site.put(signboard('Tool Library', { w: 3.2, h: 0.9, bg: '#9a86d6', fg: '#ffffff', font: 90 }), -4, 0, 4.6, 0.2);
  site.circle(-4, 4.6, 1.2);
  site.npcAt = [-0.8, 0.6, 0];
}

function buildHall(site, cv) {
  const { a } = site;
  a(G.box, '#c49a6c', T(0, 0.35, -4, { sx: 9, sy: 0.7, sz: 4 }));
  for (const x of [-4.5, 4.5]) for (const z of [-5.8, -2.2]) a(G.box, '#8a6a4a', T(x, 2.3, z, { sx: 0.3, sy: 4.6, sz: 0.3 }));
  a(G.prism, '#ef7a6a', T(0, 4.6, -4, { sx: 10, sy: 1.8, sz: 5 }));
  const screenTex = textTexture([{ text: 'Community Hall', size: 60 }, ...cv.sites.hall.screen.map((s) => ({ text: s, size: 30 }))], { w: 1024, h: 440, bg: '#2d3142', fg: '#fffaf2' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.75), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 2.6, -5.85); site.dyn.add(screen);
  a(G.box, '#2d3142', T(0, 2.6, -5.95, { sx: 6.7, sy: 3, sz: 0.1 }));
  a(G.box, '#8a6a4a', T(2.9, 1.25, -3.3, { sx: 0.9, sy: 1.1, sz: 0.7 }));
  a(G.cyl6, '#2d3142', T(2.9, 2.0, -3.1, { sx: 0.06, sy: 0.5, sz: 0.06, rx: 0.4 }));
  for (const z of [0.2, 2, 3.8]) for (const x of [-2.3, 2.3]) {
    a(G.box, '#a07852', T(x, 0.45, z, { sx: 3, sy: 0.18, sz: 0.7 }));
    a(G.box, '#8a6a4a', T(x, 0.2, z, { sx: 2.6, sy: 0.4, sz: 0.2 }));
    site.box(x, z, 1.5, 0.4);
  }
  // bunting
  const cols = ['#ef7a6a', '#ffd24a', '#7cc6de', '#a6d98f', '#c3a6f0'];
  for (let i = 0; i < 12; i++) a(G.cone, cols[i % cols.length], T(-4.2 + i * 0.76, 3.55 - Math.sin((i / 11) * Math.PI) * 0.35, -2.1, { sx: 0.4, sy: 0.5, sz: 0.05, rx: Math.PI }), { shadow: false });
  site.box(0, -4, 4.6, 2.1);
  site.npcAt = [-3.6, -1, 0.3];
}

function buildBeach(site, rnd) {
  const { a } = site;
  // campervan
  const V = T(-6.5, 0, 1.5, { ry: 0.3 });
  const v = (geo, c, m, o) => a(geo, c, V.clone().multiply(m), o);
  v(G.box, '#e9f3f0', T(0, 1.65, 0, { sx: 5, sy: 2.3, sz: 2.3 }));
  v(G.box, '#3fae7a', T(0, 1.0, 0, { sx: 5.05, sy: 0.5, sz: 2.35 }));
  v(G.box, '#e9f3f0', T(3.0, 1.3, 0, { sx: 1.3, sy: 1.6, sz: 2.2 }));
  v(G.box, '#bfe6f5', T(3.66, 1.65, 0, { sx: 0.05, sy: 0.7, sz: 1.9 }));
  for (const x of [-1.5, 0, 1.5]) v(G.box, '#bfe6f5', T(x, 2.1, 1.16, { sx: 1, sy: 0.6, sz: 0.05 }));
  for (const x of [-1.6, 2.6]) for (const z of [-1.15, 1.15]) v(G.cyl, '#2d3142', T(x, 0.45, z, { rx: Math.PI / 2, sx: 0.9, sy: 0.3, sz: 0.9 }));
  v(G.box, '#9aa0a8', T(-0.5, 2.95, 0, { sx: 3.6, sy: 0.12, sz: 2 }));
  v(G.box, '#ffb454', T(-0.5, 3.25, 0, { sx: 3, sy: 0.4, sz: 0.7 }));
  site.box(-6.5, 1.5, 3.9, 1.4, 0.3);
  site.object('campervan', -6.5, 1.5, 3.6);

  // LED art pieces
  const leds = [];
  const ledGeos = [new THREE.TorusGeometry(0.7, 0.13, 8, 24), new THREE.OctahedronGeometry(0.7), new THREE.TorusKnotGeometry(0.45, 0.12, 48, 8)];
  ledGeos.forEach((geo, i) => {
    const x = -10 + i * 1.9, z = 5.2 - i * 0.3;
    a(G.cyl6, '#2d3142', T(x, 0.6, z, { sx: 0.1, sy: 1.2, sz: 0.1 }));
    a(G.cyl6, '#2d3142', T(x, 0.05, z, { sx: 0.6, sy: 0.1, sz: 0.6 }));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff5d8f' }));
    site.put(m, x, 1.9, z); leds.push(m);
    site.circle(x, z, 0.5);
  });
  site.updaters.push((t) => leds.forEach((m, i) => { m.material.color.setHSL((t * 0.15 + i * 0.3) % 1, 0.85, 0.62); m.rotation.y = t * (0.6 + i * 0.2); }));
  site.object('led', -8.1, 5, 2.6);

  // frisbee field
  for (const x of [2.5, 13]) for (const z of [3, 7]) a(G.cone, '#ff8a3d', T(x, 0.3, z, { sx: 0.45, sy: 0.6, sz: 0.45 }));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16), mat('#ff5d8f'));
  disc.castShadow = true; site.dyn.add(disc);
  site.updaters.push((t) => {
    const p = (Math.sin(t * 0.9) + 1) / 2;
    disc.position.set(3.5 + p * 8.5, 1.3 + Math.sin(p * Math.PI) * 2.2, 5 + Math.sin(t * 1.8) * 0.8);
    disc.rotation.set(0.25, t * 12, Math.cos(t * 0.9) * 0.2);
  });
  site.object('frisbee', 7.8, 5, 3.6);

  // disc golf basket
  a(G.cyl6, '#9aa0a8', T(10.5, 1.1, -2, { sx: 0.12, sy: 2.2, sz: 0.12 }));
  a(new THREE.CylinderGeometry(0.62, 0.5, 0.4, 12, 1, true), '#ffd24a', T(10.5, 0.85, -2, {}));
  a(G.cyl, '#ffd24a', T(10.5, 2.15, -2, { sx: 1.3, sy: 0.08, sz: 1.3 }));
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    a(G.box, '#c9ccd2', T(10.5 + Math.cos(ang) * 0.42, 1.55, -2 + Math.sin(ang) * 0.42, { sx: 0.03, sy: 1.1, sz: 0.03 }), { shadow: false });
  }
  site.circle(10.5, -2, 0.7);
  site.object('basket', 10.5, -2);

  // pool table
  a(G.box, '#7a4f2e', T(3.2, 1.0, -3, { sx: 3.1, sy: 0.3, sz: 1.8 }));
  a(G.box, '#2e8b57', T(3.2, 1.08, -3, { sx: 2.7, sy: 0.3, sz: 1.4 }));
  for (const x of [-1.3, 1.3]) for (const z of [-0.7, 0.7]) a(G.box, '#7a4f2e', T(3.2 + x, 0.45, -3 + z, { sx: 0.22, sy: 0.9, sz: 0.22 }));
  ['#fffaf2', '#ffd24a', '#e2463f', '#2f6db5', '#2d3142', '#ff8a3d'].forEach((c, i) => {
    a(G.sphere, c, T(2.4 + (i % 3) * 0.5 + rnd() * 0.2, 1.33, -3.3 + Math.floor(i / 3) * 0.5, { s: 0.2 }), { shadow: false });
  });
  site.box(3.2, -3, 1.6, 1);
  site.object('pooltable', 3.2, -3);

  // hiking track signpost
  site.put(signboard('Hiking track →', { w: 2.8, h: 0.8, bg: '#8a6a4a', fg: '#fffaf2', font: 70, lift: 1.3, postColor: '#6b4f36' }), -12.5, 0, 8, 0.5);
  site.circle(-12.5, 8, 1.2);
  site.object('track', -12.5, 8);

  // umbrella + towel
  a(G.cyl6, '#fffaf2', T(-1.2, 1.2, -4.5, { sx: 0.08, sy: 2.4, sz: 0.08 }));
  a(new THREE.ConeGeometry(1.6, 0.8, 8), '#ef7a6a', T(-1.2, 2.5, -4.5, {}));
  a(G.box, '#7cc6de', T(-0.5, 0.03, -3, { sx: 1, sy: 0.05, sz: 2 }), { shadow: false });
  site.circle(-1.2, -4.5, 0.3);

  site.npcAt = [0.8, -1.8, 0.4];
}

function buildLighthouse(site) {
  const { a } = site;
  for (let i = 0; i < 6; i++) {
    const r0 = 2.3 - i * 0.14, r1 = 2.3 - (i + 1) * 0.14;
    a(new THREE.CylinderGeometry(r1, r0, 2, 14), i % 2 ? '#e2463f' : '#fffaf2', T(0, i * 2 + 1, -2, {}));
  }
  a(G.cyl, '#2d3142', T(0, 12.1, -2, { sx: 3.6, sy: 0.2, sz: 3.6 }));
  a(new THREE.ConeGeometry(1.5, 1.5, 14), '#e2463f', T(0, 14.6, -2, {}));
  a(G.box, '#8a6a4a', T(0, 1.1, -0.1, { sx: 1, sy: 2.2, sz: 0.3 }));
  site.circle(0, -2, 2.5);
  house(a, -6.5, -2.5, { w: 3.5, h: 2.6, d: 3.5, wall: '#fffaf2', roof: '#7cc6de', ry: 0.4 });
  site.box(-6.5, -2.5, 2, 2, 0.4);

  const lampMat = new THREE.MeshLambertMaterial({ color: '#fff3c4', emissive: '#000000', transparent: true, opacity: 0.85 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.6, 12), lampMat);
  lamp.position.set(0, 13, -2); site.dyn.add(lamp);

  const beam = new THREE.Group(); beam.position.set(0, 13, -2); beam.visible = false; site.dyn.add(beam);
  for (const dir of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 20, 1, true), glowMaterial('#fff1a8', 0.16));
    cone.rotation.z = (dir * Math.PI) / 2; cone.position.x = dir * 20; beam.add(cone);
  }
  const light = new THREE.PointLight('#ffe9a0', 0, 60, 1.5);
  light.position.set(0, 13, -2); site.dyn.add(light);

  site.lit = false;
  site.setLit = (on) => {
    site.lit = on; beam.visible = on;
    lampMat.emissive.set(on ? '#ffd24a' : '#000000');
    light.intensity = on ? 60 : 0;
  };
  site.updaters.push((t) => { if (site.lit) beam.rotation.y = t * 0.9; });
  site.npcAt = [1.6, 2.2, 0];
}

// ---------- Scenery scatter ----------

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatter(batch, layout, colliders, rnd) {
  const add = (geo, c, m, o) => batch.add(geo, c, m, o);
  const placed = [];
  const clearOfSites = (x, z, pad) => Object.values(layout).every((s) => Math.hypot(x - s.x, z - s.z) > s.r + pad);
  for (let i = 0; i < 1400 && placed.length < 190; i++) {
    const th = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 90;
    const x = Math.cos(th) * d, z = Math.sin(th) * d;
    const t = coastT(x, z), y = terrainHeight(x, z);
    if (t > 0.9 || y < 1.1) continue;
    if (!clearOfSites(x, z, 3) || distToPaths(x, z) < 3.2) continue;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 3.2)) continue;
    placed.push([x, z]);
    const r = rnd(), s = 0.8 + rnd() * 0.5;
    if (t > 0.7) {
      if (r < 0.55) { pohutukawa(add, x, y, z, s, rnd); colliders.push({ type: 'circle', x, z, r: 0.7 }); }
      else if (r < 0.8) flax(add, x, y, z, s, rnd);
      else { rock(add, x, y, z, s * 1.2, rnd); colliders.push({ type: 'circle', x, z, r: 0.9 * s }); }
    } else if (r < 0.3) { cabbageTree(add, x, y, z, s, rnd); colliders.push({ type: 'circle', x, z, r: 0.4 }); }
    else if (r < 0.58) { ponga(add, x, y, z, s, rnd); colliders.push({ type: 'circle', x, z, r: 0.5 }); }
    else if (r < 0.72) { pohutukawa(add, x, y, z, s, rnd); colliders.push({ type: 'circle', x, z, r: 0.7 }); }
    else if (r < 0.86) { rock(add, x, y, z, s, rnd); colliders.push({ type: 'circle', x, z, r: 0.8 * s }); }
    else flax(add, x, y, z, s, rnd);
  }
  return placed;
}

function clouds(scene, rnd) {
  const list = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(G.ico1, mat('#ffffff'));
      m.scale.set(6 + rnd() * 5, 3 + rnd() * 2, 5 + rnd() * 3);
      m.position.set(k * 5 - 7, rnd() * 1.5, (rnd() - 0.5) * 4);
      g.add(m);
    }
    g.position.set((rnd() - 0.5) * 300, 45 + rnd() * 20, (rnd() - 0.5) * 300);
    scene.add(g); list.push(g);
  }
  return (t, dt) => list.forEach((c) => { c.position.x += dt * 1.2; if (c.position.x > 170) c.position.x = -170; });
}

// ---------- Collision helpers ----------

function worldCollider(site, c) {
  const p = site.world(c.local[0], c.local[1]);
  return c.type === 'circle' ? { type: 'circle', x: p.x, z: p.z, r: c.r } : { type: 'box', x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: site.s.rot + c.ry };
}

// ---------- Build everything ----------

export function buildWorld(scene, cv) {
  const layout = resolveLayout();
  const rnd = mulberry32(20170101);
  const batch = new Batcher();

  scene.add(buildTerrain());
  const water = buildWater();
  scene.add(water);

  const sites = {};
  const builders = {
    wharf: (s) => buildWharf(s), campus: (s) => buildCampus(s, cv), market: (s) => buildMarket(s, cv, rnd),
    tower: (s) => buildTower(s, cv), highway: (s) => buildHighway(s, cv), summit: (s) => buildSummit(s, cv),
    library: (s) => buildLibrary(s, rnd), hall: (s) => buildHall(s, cv), beach: (s) => buildBeach(s, rnd),
    lighthouse: (s) => buildLighthouse(s),
  };
  for (const [id, s] of Object.entries(layout)) {
    const site = new Site(id, s, batch, scene);
    builders[id](site);
    sites[id] = site;
  }

  const colliders = [];
  const placed = scatter(batch, layout, colliders, rnd);

  // Sheep grazing in open fields.
  const sheep = [];
  for (const [x, z] of placed.filter((_, i) => i % 23 === 5).slice(0, 7)) {
    const sx = x + 2, sz = z + 1.5;
    if (terrainHeight(sx, sz) < 1.2) continue;
    const s = makeSheep(); s.position.set(sx, terrainHeight(sx, sz), sz); s.rotation.y = rnd() * 6; s.scale.setScalar(0.9);
    scene.add(s); sheep.push(s); colliders.push({ type: 'circle', x: sx, z: sz, r: 1 });
  }

  scene.add(batch.build());

  const updaters = [water.userData.update, clouds(scene, rnd)];
  updaters.push((t) => sheep.forEach((s, i) => { s.children[1].position.y = 1.0 + Math.sin(t * 1.5 + i) * 0.08; }));

  // Interactables, NPCs & stones.
  const interactables = [];
  const npcs = [];
  const stones = {};
  const platforms = [];

  for (const [id, site] of Object.entries(sites)) {
    updaters.push(...site.updaters);
    for (const c of site.colliders) colliders.push(worldCollider(site, c));
    if (site.platform) {
      const p = site.world(...site.platform.local);
      platforms.push({ x: p.x, z: p.z, hw: site.platform.hw, hd: site.platform.hd, rot: site.s.rot, y: site.platform.y });
    }
    for (const o of site.objects) {
      const p = site.world(o.pos[0], o.pos[1], 1);
      interactables.push({ kind: 'object', id: o.id, name: OBJECT_NAMES[o.id], pos: p, radius: o.radius, site: id });
    }

    if (site.npcAt) {
      const [lx, lz, ry] = site.npcAt;
      const isGuide = id === 'wharf';
      const npc = isGuide ? makeKiwi() : makePerson(NPC_LOOKS[id]);
      if (isGuide) npc.scale.setScalar(1.3);
      site.put(npc, lx, 0, lz, ry);
      const wp = site.world(lx, lz);
      npc.position.y = terrainHeight(wp.x, wp.z) - site.s.y;
      const name = isGuide ? cv.guide.name : id === 'lighthouse' ? cv.lighthouse.npc : cv.sites[id].npc;
      const entry = { kind: 'npc', id: isGuide ? 'guide' : id, name, pos: new THREE.Vector3(wp.x, site.s.y + 2.8, wp.z), radius: 3.4, mesh: npc, site: id, baseRot: ry + site.s.rot };
      npcs.push(entry); interactables.push(entry);
      colliders.push({ type: 'circle', x: wp.x, z: wp.z, r: 0.6 });
    }

    if (site.stoneAt) {
      const [lx, lz] = site.stoneAt;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshLambertMaterial({ color: '#5fd497', emissive: '#1c7a4c', flatShading: true }));
      gem.scale.y = 1.4; gem.castShadow = true;
      site.put(gem, lx, 1.8, lz);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 60, 12, 1, true), glowMaterial('#7fe0a8', 0.22));
      site.put(beam, lx, 31, lz);
      stones[id] = { gem, beam, collected: false, site };
      updaters.push((t) => {
        if (stones[id].collected) return;
        gem.rotation.y = t * 1.5; gem.position.y = 1.8 + Math.sin(t * 2 + lx) * 0.15;
        beam.material.opacity = 0.16 + Math.sin(t * 2) * 0.06;
      });
    }
  }

  const spawnSite = sites.wharf;
  const sp = spawnSite.world(...spawnSite.spawn.local);
  const spawn = { x: sp.x, z: sp.z, y: spawnSite.spawn.y, rotY: spawnSite.s.rot + Math.PI };

  function groundHeight(x, z) {
    let h = terrainHeight(x, z);
    for (const p of platforms) {
      const dx = x - p.x, dz = z - p.z;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) h = Math.max(h, p.y);
    }
    return h;
  }

  return { layout, sites, colliders, interactables, npcs, stones, updaters, spawn, groundHeight };
}
