// Single-player build: runs the SAME game engine locally in the browser
// (against AI bots) instead of talking to a server. Rendering/input are
// identical to the multiplayer client; only the network layer is swapped
// for a local Game instance that produces the same snapshot format.
import { Game } from './game.js';
import { TICK_MS } from './constants.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const nameInput = document.getElementById('name');
const playBtn = document.getElementById('play');
const deathBox = document.getElementById('death');
const deathMsg = document.getElementById('death-msg');

const touchMode = window.matchMedia('(pointer: coarse)').matches
  || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (touchMode) document.body.classList.add('touch');

let viewW = 0;
let viewH = 0;
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ---- local engine (replaces the socket) ----
const game = new Game();
let myId = null;
let playing = false;

let world = { WIDTH: 4500, HEIGHT: 4500 };
let serverPlayers = new Map();
const renderPlayers = new Map();
let food = [];
let leaderboard = [];
let self = null;

const cam = { x: 2250, y: 2250, zoom: 1 };

const mouse = { x: viewW / 2, y: viewH / 2 };
let firing = false;
let camo = false;
const lastDir = { x: 1, y: 0 };

canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) firing = true;
  if (e.button === 2) camo = true;
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) camo = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') firing = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') camo = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') firing = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') camo = false;
});

// ---- touch controls ----
const joy = { active: false, id: null, dx: 0, dy: 0, mag: 0 };
const JOY_R = 48;
const joyEl = document.getElementById('joystick');
const knobEl = document.getElementById('joy-knob');
const btnTongue = document.getElementById('btn-tongue');
const btnCamo = document.getElementById('btn-camo');

function setKnob(px, py) { knobEl.style.transform = `translate(${px}px, ${py}px)`; }
function updateJoy(clientX, clientY) {
  const rect = joyEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const len = Math.hypot(dx, dy);
  const clamped = Math.min(len, JOY_R);
  const nx = len ? dx / len : 0;
  const ny = len ? dy / len : 0;
  joy.dx = nx; joy.dy = ny; joy.mag = clamped / JOY_R;
  setKnob(nx * clamped, ny * clamped);
}
joyEl.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  joy.active = true; joy.id = t.identifier;
  updateJoy(t.clientX, t.clientY); e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (e) => {
  if (!joy.active) return;
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { updateJoy(t.clientX, t.clientY); e.preventDefault(); }
  }
}, { passive: false });
function endJoyTouch(e) {
  if (!joy.active) return;
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      joy.active = false; joy.id = null; joy.dx = 0; joy.dy = 0; joy.mag = 0; setKnob(0, 0);
    }
  }
}
window.addEventListener('touchend', endJoyTouch);
window.addEventListener('touchcancel', endJoyTouch);

function bindHold(el, on, off) {
  el.addEventListener('touchstart', (e) => { on(); e.preventDefault(); }, { passive: false });
  el.addEventListener('touchend', (e) => { off(); e.preventDefault(); }, { passive: false });
  el.addEventListener('touchcancel', off);
  el.addEventListener('mousedown', (e) => { on(); e.preventDefault(); });
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
bindHold(btnTongue, () => { firing = true; }, () => { firing = false; });
bindHold(btnCamo, () => { camo = true; btnCamo.classList.add('on'); },
  () => { camo = false; btnCamo.classList.remove('on'); });

// ---- apply a snapshot (same shape the server would send) ----
function applyState(s) {
  world = s.world;
  food = s.food;
  leaderboard = s.leaderboard;
  self = s.self;

  const next = new Map();
  for (const p of s.players) next.set(p.id, p);
  serverPlayers = next;
  for (const id of [...renderPlayers.keys()]) {
    if (!next.has(id)) renderPlayers.delete(id);
  }

  if (s.dead && playing) showDeath(s.dead);
}

function join() {
  const name = nameInput.value.trim() || 'Chameleon';
  if (!myId) { myId = game.addHuman(name).id; }
  else { game.respawn(myId, name); }
  playing = true;
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  deathBox.classList.add('hidden');
}

function showDeath(d) {
  playing = false;
  hud.classList.add('hidden');
  menu.classList.remove('hidden');
  deathBox.classList.remove('hidden');
  const by = d.by ? `eaten by <b>${escapeHtml(d.by)}</b>` : 'lost';
  deathMsg.innerHTML = `You were ${by}.<br/>Mass <b>${d.score}</b> · Kills <b>${d.kills}</b>`;
  playBtn.textContent = 'Play again';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

playBtn.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// ---- local simulation loop ----
let lastSim = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastSim) / 1000);
  lastSim = now;
  if (playing) game.update(dt);
}, TICK_MS);

// feed input into the local game ~30/s
setInterval(() => {
  if (!playing || !self || !myId) return;
  if (touchMode) {
    if (joy.active && joy.mag > 0.12) {
      lastDir.x = joy.dx; lastDir.y = joy.dy;
      game.setInput(myId, { mx: self.x + joy.dx * 600, my: self.y + joy.dy * 600, fire: firing, camo, move: true });
    } else {
      game.setInput(myId, { mx: self.x + lastDir.x * 600, my: self.y + lastDir.y * 600, fire: firing, camo, move: false });
    }
    return;
  }
  const wx = cam.x + (mouse.x - viewW / 2) / cam.zoom;
  const wy = cam.y + (mouse.y - viewH / 2) / cam.zoom;
  game.setInput(myId, { mx: wx, my: wy, fire: firing, camo, move: true });
}, 1000 / 30);

// ---- render ----
function lerp(a, b, t) { return a + (b - a) * t; }

function render() {
  requestAnimationFrame(render);

  // pull a fresh snapshot from the local game each frame
  if (playing && myId) applyState(game.snapshotFor(myId));

  for (const [id, sp] of serverPlayers) {
    let rp = renderPlayers.get(id);
    if (!rp) { rp = { ...sp }; renderPlayers.set(id, rp); }
    rp.x = lerp(rp.x, sp.x, 0.3);
    rp.y = lerp(rp.y, sp.y, 0.3);
    rp.r = lerp(rp.r, sp.r, 0.2);
    rp.angle = sp.angle;
    rp.hue = sp.hue;
    rp.name = sp.name;
    rp.camo = sp.camo;
    rp.isSelf = sp.isSelf;
    rp.tongue = sp.tongue;
    rp.mass = sp.mass;
  }

  if (self) {
    cam.x = lerp(cam.x, self.x, 0.12);
    cam.y = lerp(cam.y, self.y, 0.12);
    const screenFactor = Math.max(0.62, Math.min(1, Math.min(viewW, viewH) / 760));
    const desiredZoom = Math.max(0.5, Math.min(1.1, 36 / Math.sqrt(self.mass))) * screenFactor;
    cam.zoom = lerp(cam.zoom, desiredZoom, 0.05);
  }

  ctx.clearRect(0, 0, viewW, viewH);
  drawBackground();

  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawWorldBounds();
  for (const f of food) drawBug(f);
  const ordered = [...renderPlayers.values()].sort((a, b) => a.r - b.r);
  for (const p of ordered) drawChameleon(p);

  ctx.restore();

  drawHUD();
  drawMinimap();
}

function drawBackground() {
  ctx.fillStyle = '#1c3d27';
  ctx.fillRect(0, 0, viewW, viewH);
  const grid = 80 * cam.zoom;
  const ox = ((-cam.x * cam.zoom + viewW / 2) % grid + grid) % grid;
  const oy = ((-cam.y * cam.zoom + viewH / 2) % grid + grid) % grid;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox; x < viewW; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, viewH); }
  for (let y = oy; y < viewH; y += grid) { ctx.moveTo(0, y); ctx.lineTo(viewW, y); }
  ctx.stroke();
}

function drawWorldBounds() {
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, world.WIDTH, world.HEIGHT);
}

function drawBug(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.fillStyle = `hsl(${f.hue}, 80%, 60%)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-5, -2, 4, 2, -0.6, 0, Math.PI * 2);
  ctx.ellipse(5, -2, 4, 2, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChameleon(p) {
  const alpha = p.camo >= 1 ? 0.12 : (p.camo > 0 ? 0.45 : 1);
  const r = p.r;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (p.tongue) {
    ctx.strokeStyle = `hsl(${(p.hue + 320) % 360}, 70%, 60%)`;
    ctx.lineWidth = Math.max(3, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.tongue.x, p.tongue.y);
    ctx.stroke();
    ctx.fillStyle = `hsl(${(p.hue + 320) % 360}, 80%, 70%)`;
    ctx.beginPath();
    ctx.arc(p.tongue.x, p.tongue.y, r * 0.22 + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  const bodyLight = `hsl(${p.hue}, 55%, 58%)`;
  const bodyDark = `hsl(${p.hue}, 60%, 42%)`;

  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = r * 0.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.quadraticCurveTo(-r * 1.5, -r * 0.2, -r * 1.4, r * 0.5);
  ctx.quadraticCurveTo(-r * 1.35, r * 0.95, -r * 0.95, r * 0.75);
  ctx.stroke();

  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = r * 0.22;
  for (const [lx, ly] of [[-0.2, 0.75], [-0.2, -0.75], [0.45, 0.7], [0.45, -0.7]]) {
    ctx.beginPath();
    ctx.moveTo(r * lx, r * ly * 0.6);
    ctx.lineTo(r * lx + r * 0.1, r * ly);
    ctx.stroke();
  }

  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, bodyLight);
  grad.addColorStop(1, bodyDark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `hsl(${p.hue}, 65%, 35%)`;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.7);
  ctx.lineTo(0, -r * 0.95);
  ctx.lineTo(r * 0.35, -r * 0.62);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = bodyLight;
  ctx.beginPath();
  ctx.ellipse(r * 0.85, 0, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bodyDark;
  ctx.beginPath();
  ctx.arc(r * 0.85, -r * 0.28, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.9, -r * 0.28, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(r * 0.95, -r * 0.28, r * 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.max(alpha, 0.4);
  if (p.isSelf) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = p.isSelf ? '#ffe98a' : '#eafff0';
  ctx.font = `bold ${Math.max(11, r * 0.5)}px Trebuchet MS`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeText(p.name, p.x, p.y - r - 6);
  ctx.fillText(p.name, p.x, p.y - r - 6);
  ctx.restore();
}

function drawHUD() {
  if (!self) return;
  document.getElementById('stat-mass').textContent = self.mass;
  document.getElementById('stat-kills').textContent = self.kills;
  if (touchMode) {
    btnCamo.querySelector('.btn-fill').style.height = `${self.camo}%`;
  } else {
    const fill = document.getElementById('camo-fill');
    fill.style.width = `${self.camo}%`;
    fill.style.filter = self.camoActive ? 'brightness(1.4) saturate(1.4)' : 'none';
  }
  const list = document.getElementById('lb-list');
  list.innerHTML = '';
  for (const row of leaderboard) {
    const li = document.createElement('li');
    if (row.isSelf) li.className = 'me';
    li.innerHTML = `${escapeHtml(row.name)} <span>${row.score}</span>`;
    list.appendChild(li);
  }
}

function drawMinimap() {
  const s = mini.width / world.WIDTH;
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = 'rgba(0,0,0,0.3)';
  mctx.fillRect(0, 0, mini.width, mini.height);
  for (const p of renderPlayers.values()) {
    if (p.camo >= 1 && !p.isSelf) continue;
    mctx.fillStyle = p.isSelf ? '#ffe98a' : `hsl(${p.hue},60%,55%)`;
    mctx.beginPath();
    mctx.arc(p.x * s, p.y * s, p.isSelf ? 3.5 : 2, 0, Math.PI * 2);
    mctx.fill();
  }
}

render();
