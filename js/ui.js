import { MAIN, SIDE, PLACES } from './world.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STR = {
  en: {
    journal: 'Journal', talk: 'Talk', quests: 'Quests', skills: 'Skills', continue: 'Continue', character: 'Character',
    found: 'Pounamu found!', discovered: 'Discovered', newSkills: 'New skills', explore: 'Explore freely!',
    talkTo: 'Talk to', lookAt: 'Look at', reoUnlocked: 'Te reo Māori unlocked! Try the Reo button.', lit: 'The lighthouse is shining! Head north.',
  },
  mi: {
    journal: 'Pukapuka', talk: 'Kōrero', quests: 'Ngā Whāinga', skills: 'Ngā Pūkenga', continue: 'Haere tonu', character: 'Tangata',
    found: 'Kua kitea he pounamu!', discovered: 'Kua kitea', newSkills: 'Ngā pūkenga hou', explore: 'Haere, tūhura!',
    talkTo: 'Kōrero ki a', lookAt: 'Titiro ki', reoUnlocked: 'Kua wātea te reo Māori!', lit: 'Kua tiaho te whare rama! Haere ki te raki.',
  },
};

export class UI {
  constructor(cv, state) {
    this.cv = cv; this.state = state; this.lang = 'en';
    this.dlg = null; this.bannerTimer = 0; this.labels = new Map(); this.tab = 'sheet';
    this.renderStones();

    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close(b.dataset.close)));
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderJournal(); }));
    $('btn-journal').addEventListener('click', () => this.toggleJournal());
    $('btn-help').addEventListener('click', () => this.open('help'));
    $('btn-reo').addEventListener('click', () => this.setLang(this.lang === 'en' ? 'mi' : 'en'));
    $('dialogue').addEventListener('click', () => this.advance());
    for (const id of ['journal', 'help', 'ending']) {
      $(id).addEventListener('click', (e) => { if (e.target.id === id && id !== 'ending') this.close(id); });
    }
  }

  t(key) { return STR[this.lang][key] ?? STR.en[key]; }
  place(id) { return PLACES[id][this.lang]; }

  setLang(lang) {
    this.lang = lang;
    $('btn-reo').classList.toggle('on', lang === 'mi');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = this.t(el.dataset.i18n); });
    document.querySelector('[data-tab="sheet"]').textContent = this.t('character');
    if (!$('journal').hidden) this.renderJournal();
  }

  unlockReo() {
    const b = $('btn-reo');
    b.disabled = false; b.textContent = '🌿 Reo'; b.title = 'Toggle te reo Māori';
    this.toast(this.t('reoUnlocked'));
  }

  // ---------- Modals ----------
  get modalOpen() { return ['journal', 'help', 'ending'].some((id) => !$(id).hidden); }
  open(id) { $(id).hidden = false; if (id === 'journal') this.renderJournal(); }
  close(id) { $(id).hidden = true; this.onClose?.(id); }
  toggleJournal() { $('journal').hidden ? this.open('journal') : this.close('journal'); }

  // ---------- Dialogue ----------
  talk(name, lines, onDone) {
    this.dlg = { lines, i: 0, shown: 0, onDone };
    $('dlg-name').textContent = name;
    $('dialogue').hidden = false;
    this.renderLine();
  }
  get talking() { return !!this.dlg; }
  renderLine() { this.dlg.shown = 0; $('dlg-text').textContent = ''; }
  advance() {
    const d = this.dlg;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.shown < line.length) { d.shown = line.length; $('dlg-text').textContent = line; return; }
    d.i++;
    if (d.i >= d.lines.length) {
      this.dlg = null; $('dialogue').hidden = true;
      d.onDone?.();
    } else this.renderLine();
  }
  tickDialogue(dt) {
    const d = this.dlg;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.shown < line.length) {
      d.shown = Math.min(line.length, d.shown + dt * 70);
      $('dlg-text').textContent = line.slice(0, Math.floor(d.shown));
    }
  }

  // ---------- HUD ----------
  renderStones() {
    $('stones').innerHTML = MAIN.map((id) => `<div class="stone ${this.state.collected.has(id) ? 'found' : ''}" title="${esc(this.place(id))}"></div>`).join('');
  }

  toast(title, sub) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstElementChild.remove();
    setTimeout(() => el.remove(), 4100);
  }

  banner(id) {
    const heading = this.cv.sites[id]?.heading;
    const other = this.lang === 'en' ? PLACES[id].mi : PLACES[id].en;
    $('area-banner').innerHTML = `${esc(this.place(id))}<small>${esc(heading && heading !== PLACES[id].en ? heading : other)}</small>`;
    $('area-banner').classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => $('area-banner').classList.remove('show'), 2600);
  }

  prompt(target) {
    const el = $('prompt');
    const touch = document.body.classList.contains('touch');
    if (!target || this.talking) { el.classList.remove('show'); $('btn-act').hidden = true; return; }
    const verb = target.kind === 'npc' ? this.t('talkTo') : this.t('lookAt');
    el.innerHTML = touch ? `${esc(verb)} ${esc(target.name)}` : `<kbd>E</kbd> ${esc(verb)} ${esc(target.name)}`;
    el.classList.add('show');
    $('btn-act').hidden = !touch;
    $('btn-act').textContent = target.kind === 'npc' ? this.t('talk') : '👀';
  }

  compass(target, player, yaw) {
    if (!target) { $('compass-text').textContent = this.t('explore'); $('compass-arrow').style.visibility = 'hidden'; return; }
    const dx = target.x - player.x, dz = target.z - player.z;
    const a = Math.atan2(dx, -dz) + yaw;
    $('compass-arrow').style.visibility = 'visible';
    $('compass-arrow').style.transform = `rotate(${a - Math.PI / 2}rad)`;
    $('compass-text').textContent = `${this.place(target.id)} · ${Math.round(Math.hypot(dx, dz))}m`;
  }

  // ---------- Floating name labels ----------
  updateLabels(npcs, camera, player) {
    const w = innerWidth, h = innerHeight;
    for (const n of npcs) {
      let el = this.labels.get(n);
      if (!el) { el = document.createElement('div'); el.className = 'label'; el.textContent = n.name; $('labels').appendChild(el); this.labels.set(n, el); }
      const d = n.pos.distanceTo(player);
      const p = n.pos.clone(); p.y += 0.3; p.project(camera);
      const visible = d < 38 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      el.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      el.style.left = `${((p.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - p.y) / 2) * h}px`;
      const quest = this.state.hasNews(n.id);
      el.classList.toggle('quest', quest);
      el.classList.toggle('done', !quest);
      el.style.opacity = d > 28 ? String(1 - (d - 28) / 10) : '';
    }
  }

  // ---------- Minimap ----------
  initMinimap(layout, groundHeight) {
    const size = 300, scale = size / 200;
    const bg = document.createElement('canvas'); bg.width = bg.height = size;
    const c = bg.getContext('2d');
    c.fillStyle = '#7fcbe0'; c.fillRect(0, 0, size, size);
    const img = c.getImageData(0, 0, size, size);
    for (let py = 0; py < size; py += 2) for (let px = 0; px < size; px += 2) {
      const x = px / scale - 100, z = py / scale - 100;
      const h = groundHeight(x, z);
      if (h < 0.4) continue;
      const col = h < 1.1 ? [243, 223, 178] : h > 7.5 ? [188, 217, 138] : [166, 217, 143];
      for (let k = 0; k < 4; k++) {
        const i = ((py + (k >> 1)) * size + px + (k & 1)) * 4;
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
      }
    }
    c.putImageData(img, 0, 0);
    this.mini = { bg, layout, scale, size };
  }

  drawMinimap(player, heading, target) {
    const { bg, layout, scale, size } = this.mini;
    const c = $('minimap').getContext('2d');
    c.drawImage(bg, 0, 0);
    const P = (x, z) => [(x + 100) * scale, (z + 100) * scale];
    for (const [id, s] of Object.entries(layout)) {
      if (id === 'wharf') continue;
      const [x, y] = P(s.x, s.z);
      const main = MAIN.includes(id);
      const done = this.state.collected.has(id) || this.state.discovered.has(id);
      c.beginPath(); c.arc(x, y, main ? 9 : 7, 0, Math.PI * 2);
      c.fillStyle = id === 'lighthouse' ? (this.state.lit ? '#ffd24a' : '#9aa0a8') : done ? '#3fae7a' : main ? '#fffaf2' : '#c3a6f0';
      c.fill(); c.lineWidth = 3; c.strokeStyle = target?.id === id ? '#ef7a6a' : '#2d3142'; c.stroke();
    }
    const [px, py] = P(player.x, player.z);
    c.save(); c.translate(px, py); c.rotate(-heading + Math.PI);
    c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath();
    c.fillStyle = '#ef7a6a'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
    c.restore();
  }

  // ---------- Journal ----------
  renderJournal() {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    const { cv, state } = this;
    const body = $('journal-body');
    if (this.tab === 'sheet') {
      const p = cv.profile;
      const progress = (state.collected.size + state.discovered.size) / (MAIN.length + SIDE.length);
      body.innerHTML = `
        <div class="sheet-top">
          <div class="avatar">🧑‍💻</div>
          <div><h3>${esc(p.name)}</h3><div class="muted"><b>${esc(p.title)}</b></div></div>
        </div>
        <div class="stat-row">
          <div class="stat"><span>Level</span>${p.level} · ${esc(p.experience)}</div>
          <div class="stat"><span>Pounamu</span>${state.collected.size} / ${MAIN.length}</div>
          <div class="stat"><span>Side trips</span>${state.discovered.size} / ${SIDE.length}</div>
          <div class="stat"><span>${esc(this.t('skills'))}</span>${state.skills.length}</div>
        </div>
        <div class="xp" title="Island explored"><div style="width:${Math.round(progress * 100)}%"></div></div>
        <p>${esc(p.about)}</p>`;
    } else if (this.tab === 'quests') {
      const chapter = (id, main) => {
        const s = cv.sites[id];
        const known = main ? state.collected.has(id) : state.discovered.has(id);
        if (!known) return `<div class="chapter locked"><h3>${main ? '💎' : '🧭'} ${esc(this.place(id))}</h3><div class="meta">${main ? 'Find the pounamu here' : 'Optional: talk to the local'}</div></div>`;
        return `<div class="chapter"><h3>${main ? '💎' : '✅'} ${esc(s.heading)}</h3>
          ${s.role ? `<div class="meta">${esc(s.role)} · ${esc(s.years)}</div>` : ''}
          <ul>${s.journal.map((j) => `<li>${esc(j)}</li>`).join('')}</ul></div>`;
      };
      body.innerHTML = `
        <h3 style="margin-bottom:8px">Main quest: light the lighthouse ${state.lit ? '✨' : ''}</h3>
        ${[...MAIN].reverse().map((id) => chapter(id, true)).join('')}
        <h3 style="margin:16px 0 8px">Side trips</h3>
        ${SIDE.map((id) => chapter(id, false)).join('')}`;
    } else {
      body.innerHTML = state.skills.length
        ? `<div class="chips">${state.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>`
        : '<p class="muted">Talk to islanders to collect skills.</p>';
    }
  }

  // ---------- Ending ----------
  showEnding(pdfUrl, onKeepExploring) {
    const { cv, state } = this;
    const p = cv.profile;
    const secs = Math.round((performance.now() - state.startTime) / 1000);
    const fileName = `${p.name.replace(/\s+/g, '_')}_CV.pdf`;
    $('ending-body').innerHTML = `
      <div class="big">✨🏝️✨</div>
      <p class="muted" style="margin:0">Ka pai! You lit the lighthouse in ${Math.floor(secs / 60)}m ${secs % 60}s</p>
      <h1>${esc(p.name)}</h1>
      <div class="title">${esc(p.title)}</div>
      <p>${esc(p.about)}</p>
      <div class="stat-row" style="justify-content:center">
        <div class="stat"><span>Pounamu</span>${state.collected.size} / ${MAIN.length}</div>
        <div class="stat"><span>Side trips</span>${state.discovered.size} / ${SIDE.length}</div>
        <div class="stat"><span>Skills</span>${state.skills.length}</div>
      </div>
      <h2 style="margin-top:14px">Let's talk! 👋</h2>
      <div class="contact">
        <a class="primary" href="mailto:${esc(p.contact.email)}">✉️ ${esc(p.contact.email)}</a>
        <a href="${esc(p.contact.linkedin)}" target="_blank" rel="noopener">💼 LinkedIn</a>
        <a href="${esc(p.contact.github)}" target="_blank" rel="noopener">🐙 GitHub</a>
        <a href="${pdfUrl}" download="${esc(fileName)}">📄 Download CV (PDF)</a>
      </div>
      <div class="row">
        <button class="btn" id="btn-keep">Keep exploring</button>
        <button class="btn" id="btn-journal-end">Open journal</button>
      </div>`;
    this.open('ending');
    $('btn-keep').onclick = () => { this.close('ending'); onKeepExploring?.(); };
    $('btn-journal-end').onclick = () => { this.close('ending'); this.tab = 'quests'; this.open('journal'); };
  }
}

