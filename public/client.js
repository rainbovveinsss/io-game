/* global io */
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

let W = (canvas.width = window.innerWidth);
let H = (canvas.height = window.innerHeight);
window.addEventListener('resize', () => {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
});

const socket = io();
let myId = null;
let playing = false;

// Latest server snapshot + a render copy we interpolate toward.
let world = { WIDTH: 4500, HEIGHT: 4500 };
let serverPlayers = new Map();
const renderPlayers = new Map();
let food = [];
let leaderboard = [];
let self = null;

// Camera (smoothly follows the player).
const cam = { x: 2250, y: 2250, zoom: 1 };

// ---- input ----
const mouse = { x: W / 2, y: H / 2 };
let firing = false;
let camo = false;

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

// touch: drag to aim, two-finger for camo
canvas.addEventListener('touchstart', (e) => {
  firing = true;
  if (e.touches.length >= 2) camo = true;
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', () => { firing = false; camo = false; }, { passive: true });

// ---- networking ----
socket.on('joined', ({ id }) => { myId = id; });

socket.on('state', (s) => {
  world = s.world;
  food = s.food;
  leaderboard = s.leaderboard;
  self = s.self;

  const next = new Map();
  for (const p of s.players) next.set(p.id, p);
  serverPlayers = next;

  // prune render copies that vanished
  for (const id of [...renderPlayers.keys()]) {
    if (!next.has(id)) renderPlayers.delete(id);
  }

  if (s.dead && playing) showDeath(s.dead);
});

function join() {
  const name = nameInput.value.trim() || 'Chameleon';
  if (!myId) socket.emit('join', name);
  else socket.emit('respawn', name);
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

// send input ~30/s
setInterval(() => {
  if (!playing || !self) return;
  // convert mouse (screen) to world coords
  const wx = cam.x + (mouse.x - W / 2) / cam.zoom;
  const wy = cam.y + (mouse.y - H / 2) / cam.zoom;
  socket.emit('input', { mx: wx, my: wy, fire: firing, camo });
}, 1000 / 30);

// ---- render loop ----
function lerp(a, b, t) { return a + (b - a) * t; }

function render() {
  requestAnimationFrame(render);

  // interpolate render players toward server snapshot
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

  // camera follows self
  if (self) {
    const target = self;
    cam.x = lerp(cam.x, target.x, 0.12);
    cam.y = lerp(cam.y, target.y, 0.12);
    const desiredZoom = Math.max(0.55, Math.min(1.1, 36 / Math.sqrt(self.mass)));
    cam.zoom = lerp(cam.zoom, desiredZoom, 0.05);
  }

  ctx.clearRect(0, 0, W, H);
  drawBackground();

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawWorldBounds();
  for (const f of food) drawBug(f);
  // draw players sorted so the biggest are on top
  const ordered = [...renderPlayers.values()].sort((a, b) => a.r - b.r);
  for (const p of ordered) drawChameleon(p);

  ctx.restore();

  drawHUD();
  drawMinimap();
}

function drawBackground() {
  ctx.fillStyle = '#1c3d27';
  ctx.fillRect(0, 0, W, H);

  // grid that scrolls with the camera for a sense of motion
  const grid = 80 * cam.zoom;
  const ox = ((-cam.x * cam.zoom + W / 2) % grid + grid) % grid;
  const oy = ((-cam.y * cam.zoom + H / 2) % grid + grid) % grid;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox; x < W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = oy; y < H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
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
  // little wings
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

  // tongue (draw under body origin but over background)
  if (p.tongue) {
    ctx.strokeStyle = `hsl(${(p.hue + 320) % 360}, 70%, 60%)`;
    ctx.lineWidth = Math.max(3, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.tongue.x, p.tongue.y);
    ctx.stroke();
    // sticky tip
    ctx.fillStyle = `hsl(${(p.hue + 320) % 360}, 80%, 70%)`;
    ctx.beginPath();
    ctx.arc(p.tongue.x, p.tongue.y, r * 0.22 + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  const bodyLight = `hsl(${p.hue}, 55%, 58%)`;
  const bodyDark = `hsl(${p.hue}, 60%, 42%)`;

  // curled tail (behind the body)
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = r * 0.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.quadraticCurveTo(-r * 1.5, -r * 0.2, -r * 1.4, r * 0.5);
  ctx.quadraticCurveTo(-r * 1.35, r * 0.95, -r * 0.95, r * 0.75);
  ctx.stroke();

  // legs
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = r * 0.22;
  for (const [lx, ly] of [[-0.2, 0.75], [-0.2, -0.75], [0.45, 0.7], [0.45, -0.7]]) {
    ctx.beginPath();
    ctx.moveTo(r * lx, r * ly * 0.6);
    ctx.lineTo(r * lx + r * 0.1, r * ly);
    ctx.stroke();
  }

  // body
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, bodyLight);
  grad.addColorStop(1, bodyDark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  // crest along the back
  ctx.fillStyle = `hsl(${p.hue}, 65%, 35%)`;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.7);
  ctx.lineTo(0, -r * 0.95);
  ctx.lineTo(r * 0.35, -r * 0.62);
  ctx.closePath();
  ctx.fill();

  // head
  ctx.fillStyle = bodyLight;
  ctx.beginPath();
  ctx.ellipse(r * 0.85, 0, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // eye turret
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

  // name + outline for self
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

// ---- HUD ----
function drawHUD() {
  if (!self) return;
  document.getElementById('stat-mass').textContent = self.mass;
  document.getElementById('stat-kills').textContent = self.kills;
  document.getElementById('camo-fill').style.width = `${self.camo}%`;
  document.getElementById('camo-fill').style.filter =
    self.camoActive ? 'brightness(1.4) saturate(1.4)' : 'none';

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
