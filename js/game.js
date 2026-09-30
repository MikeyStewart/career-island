import * as THREE from 'three';
import { buildWorld, MAIN, SIDE } from './world.js';
import { makePerson, animatePerson } from './builders.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);
const PLAYER_R = 0.5;

export async function start({ cv, pdf }) {
  await document.fonts.ready;

  // ---------- Renderer & scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe6f5');
  scene.fog = new THREE.Fog('#cdebf5', 90, 240);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);

  scene.add(new THREE.HemisphereLight('#fff6e5', '#9fc7a8', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const world = buildWorld(scene, cv);
  const { sites, colliders, interactables, npcs, stones, updaters, groundHeight, layout } = world;

  // ---------- State ----------
  const state = {
    collected: new Set(), discovered: new Set(), skills: [], lit: false, finished: false, startTime: performance.now(),
    hasNews(id) {
      if (MAIN.includes(id)) return !this.collected.has(id);
      if (SIDE.includes(id)) return !this.discovered.has(id);
      if (id === 'lighthouse') return this.lit && !this.finished;
      return id === 'guide' && this.collected.size === 0;
    },
  };
  const ui = new UI(cv, state);
  ui.initMinimap(layout, groundHeight);

  const pdfUrl = URL.createObjectURL(new Blob([Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))], { type: 'application/pdf' }));

  // ---------- Player ----------
  const player = makePerson({ shirt: '#ffb454', pants: '#3f4a6b', hat: 'cap', hatColor: '#3fae7a', prop: 'backpack', hair: '#6b4a2f' });
  const pos = new THREE.Vector3(world.spawn.x, world.spawn.y, world.spawn.z);
  let heading = world.spawn.rotY;
  player.position.copy(pos); player.rotation.y = heading;
  scene.add(player);

  const cam = { yaw: heading + Math.PI, pitch: 0.42, dist: 13, manualAt: 0, recentre: false };
  camera.position.set(pos.x + Math.sin(cam.yaw) * 14, pos.y + 7, pos.z + Math.cos(cam.yaw) * 14);

  // ---------- Input ----------
  const keys = new Set();
  const joy = { x: 0, y: 0, id: null };
  const drag = { id: null, x: 0, y: 0 };

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    if (e.repeat && ['KeyE', 'Space', 'Enter', 'KeyJ', 'KeyH'].includes(k)) return;
    if (k === 'Escape') { for (const id of ['journal', 'help']) if (!$(id).hidden) ui.close(id); return; }
    if (k === 'KeyJ' && $('ending').hidden) { ui.toggleJournal(); return; }
    if (k === 'KeyH' && $('ending').hidden) { $('help').hidden ? ui.open('help') : ui.close('help'); return; }
    if (['KeyE', 'Space', 'Enter'].includes(k)) { if (!$('help').hidden) ui.close('help'); else action(); return; }
    if (k === 'KeyC') { cam.recentre = true; return; }
    if (k === 'Equal' || k === 'NumpadAdd') { cam.dist = THREE.MathUtils.clamp(cam.dist - 2, 6, 28); return; }
    if (k === 'Minus' || k === 'NumpadSubtract') { cam.dist = THREE.MathUtils.clamp(cam.dist + 2, 6, 28); return; }
    keys.add(k);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (drag.id !== null) return;
    drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag.id) return;
    cam.yaw -= (e.clientX - drag.x) * 0.006;
    cam.manualAt = performance.now();
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * 0.004, 0.12, 1.2);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = (e) => { if (e.pointerId === drag.id) drag.id = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  // Trackpads: two-finger swipe sideways rotates, up/down (or pinch) zooms.
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.05, 6, 28); return; }
    cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 6, 28);
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { cam.yaw += e.deltaX * 0.004; cam.manualAt = performance.now(); }
  }, { passive: false });

  const stick = $('joystick'), knob = $('joystick-knob');
  const moveStick = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy), max = r.width / 2 - 10;
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / max; joy.y = -dy / max;
  };
  stick.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  $('btn-act').addEventListener('click', () => action());

  const markTouch = () => document.body.classList.add('touch');
  if (matchMedia('(pointer: coarse)').matches) markTouch();
  addEventListener('touchstart', markTouch, { once: true, passive: true });

  const fitCamera = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 1 ? 70 : 55; // see more of the island in portrait
    camera.updateProjectionMatrix();
  };
  fitCamera();
  addEventListener('resize', fitCamera);

  // ---------- Game logic ----------
  let nearest = null;
  const flights = [];

  function addSkills(list) {
    const fresh = list.filter((s) => !state.skills.includes(s));
    state.skills.push(...fresh);
    return fresh;
  }

  function collect(id) {
    const stone = stones[id];
    if (stone.collected) return;
    stone.collected = true;
    state.collected.add(id);
    const from = new THREE.Vector3(); stone.gem.getWorldPosition(from);
    scene.attach(stone.gem);
    flights.push({ mesh: stone.gem, from, t: 0 });
    stone.beam.visible = false;
    ui.renderStones();
    const s = cv.sites[id];
    ui.toast(`💎 ${ui.t('found')} (${state.collected.size}/${MAIN.length})`, `${s.heading} · ${s.years}`);
    const fresh = addSkills(s.skills);
    if (fresh.length) setTimeout(() => ui.toast(`✨ ${ui.t('newSkills')}`, fresh.join(', ')), 700);
    if (id === 'highway') setTimeout(() => ui.unlockReo(), 1400);
    if (state.collected.size === MAIN.length) {
      state.lit = true;
      sites.lighthouse.setLit(true);
      setTimeout(() => ui.toast(`🌟 ${ui.t('lit')}`), 1800);
    }
  }

  function discover(id) {
    if (state.discovered.has(id)) return;
    state.discovered.add(id);
    ui.toast(`🧭 ${ui.t('discovered')}: ${cv.sites[id].heading} (${state.discovered.size}/${SIDE.length})`);
    const fresh = addSkills(cv.sites[id].skills);
    if (fresh.length) setTimeout(() => ui.toast(`✨ ${ui.t('newSkills')}`, fresh.join(', ')), 700);
  }

  function finish() {
    state.finished = true;
    ui.showEnding(pdfUrl);
  }

  function action() {
    if (ui.modalOpen) return;
    if (ui.talking) { ui.advance(); return; }
    const target = nearest;
    if (!target) return;
    if (target.kind === 'object') { ui.talk(target.name, [cv.objects[target.id]]); return; }

    const id = target.id;
    if (id === 'guide') {
      const lines = [...cv.guide.lines];
      if (state.lit) lines.splice(1, lines.length, 'The lighthouse is shining! Head north and talk to the keeper.');
      else if (state.collected.size) lines.splice(1, lines.length, `You've found ${state.collected.size} of ${MAIN.length} pounamu. Keep following the compass!`);
      ui.talk(target.name, lines);
    } else if (id === 'lighthouse') {
      if (!state.lit) ui.talk(target.name, [cv.lighthouse.dark]);
      else ui.talk(target.name, cv.lighthouse.lit, finish);
    } else if (MAIN.includes(id)) {
      if (state.collected.has(id)) ui.talk(target.name, ['Welcome back! Everything I told you is written in your journal (J).']);
      else ui.talk(target.name, cv.sites[id].lines, () => collect(id));
    } else if (SIDE.includes(id)) {
      if (state.discovered.has(id)) ui.talk(target.name, ['Kia ora again! Check your journal (J) for the details.']);
      else ui.talk(target.name, cv.sites[id].lines, () => discover(id));
    }
  }

  function compassTarget() {
    const next = MAIN.find((id) => !state.collected.has(id));
    const id = next ?? (!state.finished ? 'lighthouse' : null);
    return id ? { id, x: layout[id].x, z: layout[id].z } : null;
  }

  function resolveCollisions(p) {
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.abs(dx) > 12 || Math.abs(dz) > 12) continue;
      if (c.type === 'circle') {
        const d = Math.hypot(dx, dz), min = c.r + PLAYER_R;
        if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
      } else {
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        const qx = THREE.MathUtils.clamp(lx, -c.hw, c.hw), qz = THREE.MathUtils.clamp(lz, -c.hd, c.hd);
        let ox = lx - qx, oz = lz - qz;
        const d = Math.hypot(ox, oz);
        if (d === 0) {
          // inside: push out along the shallowest axis
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) lx = Math.sign(lx || 1) * (c.hw + PLAYER_R); else lz = Math.sign(lz || 1) * (c.hd + PLAYER_R);
        } else if (d < PLAYER_R) {
          lx = qx + (ox / d) * PLAYER_R; lz = qz + (oz / d) * PLAYER_R;
        } else continue;
        p.x = c.x + cs * lx + sn * lz; p.z = c.z - sn * lx + cs * lz;
      }
    }
  }

  const walkable = (x, z) => groundHeight(x, z) > 0.55;
  let currentArea = null;

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // movement
    let ix = 0, iy = 0;
    const frozen = ui.talking || ui.modalOpen;
    if (!frozen) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      ix += joy.x; iy += joy.y;
    }
    const mag = Math.min(1, Math.hypot(ix, iy));

    // camera keys: Z / X rotate, C recentres behind the player
    let turn = 0;
    if (!frozen) {
      if (keys.has('KeyZ')) turn += 1;
      if (keys.has('KeyX')) turn -= 1;
    }
    if (turn) { cam.yaw += turn * 2.2 * dt; cam.manualAt = performance.now(); cam.recentre = false; }
    const behind = heading + Math.PI;
    const gap = Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw));
    if (cam.recentre) {
      cam.yaw += gap * Math.min(1, dt * 8);
      if (Math.abs(gap) < 0.01) cam.recentre = false;
    } else if (iy > 0.3 && drag.id === null && performance.now() - cam.manualAt > 1500 && Math.abs(gap) < 2.2) {
      // gently swing the camera behind the player while walking forward (not when strafing or backing up)
      cam.yaw += gap * Math.min(1, dt * 1.6 * iy);
    }
    let moving = mag > 0.08;
    if (moving) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      let mx = rx * ix + fx * iy, mz = rz * ix + fz * iy;
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || joy.x ** 2 + joy.y ** 2 > 0.8;
      const speed = (run ? 12 : 7.5) * mag * dt;
      const next = { x: pos.x + mx * speed, z: pos.z + mz * speed };
      if (!walkable(next.x, next.z)) {
        if (walkable(next.x, pos.z)) next.z = pos.z;
        else if (walkable(pos.x, next.z)) next.x = pos.x;
        else { next.x = pos.x; next.z = pos.z; }
      }
      resolveCollisions(next);
      if (walkable(next.x, next.z)) { pos.x = next.x; pos.z = next.z; }
      const want = Math.atan2(mx, mz);
      heading += Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * Math.min(1, dt * 12);
      animatePerson(player, t, true, run ? 1.5 : 1);
    } else animatePerson(player, t, false);
    pos.y += (groundHeight(pos.x, pos.z) - pos.y) * Math.min(1, dt * 15);
    player.position.copy(pos); player.rotation.y = heading;

    // camera
    const target = new THREE.Vector3(pos.x, pos.y + 1.6, pos.z);
    const cp = Math.cos(cam.pitch);
    const desired = new THREE.Vector3(
      target.x + Math.sin(cam.yaw) * cam.dist * cp,
      target.y + Math.sin(cam.pitch) * cam.dist,
      target.z + Math.cos(cam.yaw) * cam.dist * cp,
    );
    desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + 1.2);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 8));
    camera.lookAt(target);

    sun.position.set(pos.x + 30, pos.y + 55, pos.z + 22);
    sun.target.position.copy(pos);

    // world animation
    for (const u of updaters) u(t, dt);
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / 0.9;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, target, k).y += Math.sin(k * Math.PI) * 3;
      f.mesh.scale.setScalar(1 - k * 0.9); f.mesh.rotation.y += dt * 12;
      if (k >= 1) { scene.remove(f.mesh); flights.splice(i, 1); }
    }

    // NPCs look at the player when close
    for (const n of npcs) {
      const dx = pos.x - n.pos.x, dz = pos.z - n.pos.z;
      const d = Math.hypot(dx, dz);
      const want = (d < 7 ? Math.atan2(dx, dz) : n.baseRot) - n.mesh.parent.rotation.y;
      const cur = n.mesh.rotation.y;
      n.mesh.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 5);
      if (n.id === 'guide') n.mesh.userData.head.rotation.x = Math.sin(t * 3) * 0.12;
      else animatePerson(n.mesh, t + n.pos.x, false);
    }

    // interaction target
    nearest = null;
    let best = Infinity;
    if (!frozen) {
      for (const it of interactables) {
        const d = Math.hypot(pos.x - it.pos.x, pos.z - it.pos.z);
        if (d < it.radius && d < best) { best = d; nearest = it; }
      }
    }
    ui.prompt(nearest);

    // area banner
    let area = null;
    for (const [id, s] of Object.entries(layout)) if (Math.hypot(pos.x - s.x, pos.z - s.z) < s.r) area = id;
    if (area && area !== currentArea) ui.banner(area);
    currentArea = area;

    const ct = compassTarget();
    ui.compass(ct, pos, cam.yaw);
    ui.drawMinimap(pos, heading, ct);
    ui.updateLabels(npcs, camera, pos);
    ui.tickDialogue(dt);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  $('hud').hidden = false;
  ui.open('help');
  ui.onClose = (id) => {
    if (id === 'help' && !state.introDone) {
      state.introDone = true;
      const guide = npcs.find((n) => n.id === 'guide');
      setTimeout(() => ui.talk(guide.name, cv.guide.lines), 300);
    }
  };
  requestAnimationFrame(frame);

  // Test hook, only with ?debug in the URL.
  if (new URLSearchParams(location.search).has('debug')) window.__game = { state, pos, cam, collect, discover, finish, layout, teleport: (x, z) => { pos.x = x; pos.z = z; } };
}
