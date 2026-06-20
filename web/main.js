// 3D single-player build. Renders the SAME 2D game engine (game.js) in 3D
// with Three.js: the simulation runs on a plane (x,y) which is mapped to the
// 3D ground plane (x, z). Bots, tongue, camouflage and eating all come from
// the shared engine; this file only adds 3D rendering + 3D controls.
import * as THREE from 'three';
import { Game } from './game.js';
import { TICK_MS, WORLD } from './constants.js';

const canvas = document.getElementById('game');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const nameInput = document.getElementById('name');
const playBtn = document.getElementById('play');
const deathBox = document.getElementById('death');
const deathMsg = document.getElementById('death-msg');
const hint = document.getElementById('hint');

const touchMode = window.matchMedia('(pointer: coarse)').matches
  || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (touchMode) document.body.classList.add('touch');

// ---------- Three.js setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd7e6);
scene.fog = new THREE.Fog(0x9fd7e6, 1200, 3200);

const camera = new THREE.PerspectiveCamera(60, 1, 1, 8000);
camera.position.set(WORLD.WIDTH / 2, 400, WORLD.HEIGHT / 2 + 400);

// lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.0));
const sun = new THREE.DirectionalLight(0xfff4d6, 1.1);
sun.position.set(0.6, 1, 0.4).multiplyScalar(1000);
scene.add(sun);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD.WIDTH, WORLD.HEIGHT),
  new THREE.MeshStandardMaterial({ color: 0x2f6b38, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(WORLD.WIDTH / 2, 0, WORLD.HEIGHT / 2);
scene.add(ground);

const grid = new THREE.GridHelper(WORLD.WIDTH, 45, 0x254f2c, 0x357a40);
grid.position.set(WORLD.WIDTH / 2, 1, WORLD.HEIGHT / 2);
scene.add(grid);

// world walls (semi-transparent boundary)
const wallMat = new THREE.MeshStandardMaterial({ color: 0x1d4023, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const wallH = 220;
function addWall(w, d, x, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
  m.position.set(x, wallH / 2, z);
  scene.add(m);
}
addWall(WORLD.WIDTH, 20, WORLD.WIDTH / 2, 0);
addWall(WORLD.WIDTH, 20, WORLD.WIDTH / 2, WORLD.HEIGHT);
addWall(20, WORLD.HEIGHT, 0, WORLD.HEIGHT / 2);
addWall(20, WORLD.HEIGHT, WORLD.WIDTH, WORLD.HEIGHT / 2);

// scatter some decorative bushes/rocks
const bushGeo = new THREE.IcosahedronGeometry(28, 0);
for (let i = 0; i < 80; i++) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.28 + Math.random() * 0.08, 0.5, 0.32) });
  const b = new THREE.Mesh(bushGeo, mat);
  b.scale.setScalar(0.6 + Math.random() * 1.6);
  b.position.set(Math.random() * WORLD.WIDTH, 10, Math.random() * WORLD.HEIGHT);
  scene.add(b);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ---------- shared bug geometry ----------
const bugGeo = new THREE.SphereGeometry(7, 8, 6);

function buildBug(hue) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((hue % 360) / 360, 0.8, 0.6) });
  const m = new THREE.Mesh(bugGeo, mat);
  return m;
}

// ---------- chameleon model (built facing +X) ----------
function buildChameleon(hue) {
  const g = new THREE.Group();
  const baseCol = new THREE.Color().setHSL((hue % 360) / 360, 0.55, 0.5);
  const darkCol = new THREE.Color().setHSL((hue % 360) / 360, 0.6, 0.38);
  const bodyMat = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: darkCol, roughness: 0.8 });

  // body
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), bodyMat);
  body.scale.set(1.5, 0.85, 1.0);
  g.add(body);

  // crest along the back
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 4), darkMat);
  crest.rotation.z = -Math.PI / 2;
  crest.position.set(0, 0.85, 0);
  crest.scale.set(1, 1.6, 0.5);
  g.add(crest);

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), bodyMat);
  head.position.set(1.35, 0.12, 0);
  g.add(head);

  // eyes (turret spheres on each side)
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const s of [1, -1]) {
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), darkMat);
    turret.position.set(1.25, 0.42, 0.42 * s);
    g.add(turret);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), whiteMat);
    white.position.set(1.4, 0.45, 0.5 * s);
    g.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), pupilMat);
    pupil.position.set(1.52, 0.45, 0.52 * s);
    g.add(pupil);
  }

  // curled tail
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 8, 16, Math.PI * 1.5), darkMat);
  tail.position.set(-1.5, 0, 0);
  tail.rotation.x = Math.PI / 2;
  g.add(tail);

  // legs
  const legGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.7, 6);
  for (const [lx, lz] of [[0.5, 0.7], [0.5, -0.7], [-0.5, 0.7], [-0.5, -0.7]]) {
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(lx, -0.55, lz);
    g.add(leg);
  }

  g.userData.mats = [bodyMat, darkMat, whiteMat, pupilMat];
  return g;
}

function setGroupOpacity(group, opacity) {
  const transparent = opacity < 1;
  for (const mat of group.userData.mats) {
    mat.transparent = transparent;
    mat.opacity = opacity;
    mat.depthWrite = !transparent;
  }
}

const tongueGeo = new THREE.CylinderGeometry(1, 1, 1, 7);
function makeTongue(hue) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((hue + 320) % 360) / 360, 0.8, 0.65) });
  const m = new THREE.Mesh(tongueGeo, mat);
  m.visible = false;
  return m;
}

// ---------- game state ----------
const game = new Game();
let myId = null;
let playing = false;

let leaderboard = [];
let self = null;
let snapPlayers = [];
let snapFood = [];

const playerObjs = new Map(); // id -> { group, tongue }
const foodObjs = new Map(); // id -> mesh

// ---------- input ----------
const keys = {};
let firing = false;
let camo = false;
let camYaw = 0;
let camPitch = 0.55;
let pointerLocked = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') firing = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') camo = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space') firing = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') camo = false;
});

// pointer lock for mouse-look on desktop
canvas.addEventListener('click', () => {
  if (!touchMode && playing && !pointerLocked) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (hint) hint.style.opacity = pointerLocked ? '0' : '';
});
canvas.addEventListener('mousedown', (e) => {
  if (touchMode) return;
  if (e.button === 0) firing = true;
  if (e.button === 2) camo = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) camo = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  camYaw -= e.movementX * 0.0026;
  camPitch = Math.min(1.15, Math.max(0.12, camPitch + e.movementY * 0.0022));
});

// ---------- touch controls ----------
const joy = { active: false, id: null, dx: 0, dy: 0, mag: 0 };
const JOY_R = 48;
const joyEl = document.getElementById('joystick');
const knobEl = document.getElementById('joy-knob');
const btnTongue = document.getElementById('btn-tongue');
const btnCamo = document.getElementById('btn-camo');

function setKnob(px, py) { knobEl.style.transform = `translate(${px}px, ${py}px)`; }
function updateJoy(cx0, cy0) {
  const rect = joyEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = cx0 - cx;
  const dy = cy0 - cy;
  const len = Math.hypot(dx, dy);
  const clamped = Math.min(len, JOY_R);
  joy.dx = len ? dx / len : 0;
  joy.dy = len ? dy / len : 0;
  joy.mag = clamped / JOY_R;
  setKnob(joy.dx * clamped, joy.dy * clamped);
}
joyEl.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  joy.active = true; joy.id = t.identifier; updateJoy(t.clientX, t.clientY); e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (e) => {
  if (!joy.active) return;
  for (const t of e.changedTouches) if (t.identifier === joy.id) { updateJoy(t.clientX, t.clientY); e.preventDefault(); }
}, { passive: false });
function endJoy(e) {
  if (!joy.active) return;
  for (const t of e.changedTouches) if (t.identifier === joy.id) {
    joy.active = false; joy.id = null; joy.dx = 0; joy.dy = 0; joy.mag = 0; setKnob(0, 0);
  }
}
window.addEventListener('touchend', endJoy);
window.addEventListener('touchcancel', endJoy);

// drag on the 3D canvas rotates the camera (mobile look)
let look = { id: null, x: 0, y: 0 };
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  look.id = t.identifier; look.x = t.clientX; look.y = t.clientY;
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === look.id) {
      camYaw -= (t.clientX - look.x) * 0.006;
      camPitch = Math.min(1.15, Math.max(0.12, camPitch + (t.clientY - look.y) * 0.005));
      look.x = t.clientX; look.y = t.clientY;
    }
  }
}, { passive: true });

function bindHold(el, on, off) {
  el.addEventListener('touchstart', (e) => { on(); e.preventDefault(); }, { passive: false });
  el.addEventListener('touchend', (e) => { off(); e.preventDefault(); }, { passive: false });
  el.addEventListener('touchcancel', off);
}
bindHold(btnTongue, () => { firing = true; }, () => { firing = false; });
bindHold(btnCamo, () => { camo = true; btnCamo.classList.add('on'); },
  () => { camo = false; btnCamo.classList.remove('on'); });

// ---------- menu ----------
function join() {
  const name = nameInput.value.trim() || 'Chameleon';
  if (!myId) myId = game.addHuman(name).id;
  else game.respawn(myId, name);
  playing = true;
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  deathBox.classList.add('hidden');
}
function showDeath(d) {
  playing = false;
  if (pointerLocked) document.exitPointerLock();
  hud.classList.add('hidden');
  menu.classList.remove('hidden');
  deathBox.classList.remove('hidden');
  const by = d.by ? `eaten by <b>${escapeHtml(d.by)}</b>` : 'lost';
  deathMsg.innerHTML = `You were ${by}.<br/>Mass <b>${d.score}</b> · Kills <b>${d.kills}</b>`;
  playBtn.textContent = 'Play again';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
playBtn.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// ---------- simulation ----------
let lastSim = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastSim) / 1000);
  lastSim = now;
  if (playing) game.update(dt);
}, TICK_MS);

// feed input ~30/s
setInterval(() => {
  if (!playing || !self || !myId) return;
  // forward/strafe relative to camera yaw
  const fwd = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
  const right = { x: -fwd.z, z: fwd.x };
  let fk = 0;
  let sk = 0;
  if (keys.KeyW || keys.ArrowUp) fk += 1;
  if (keys.KeyS || keys.ArrowDown) fk -= 1;
  if (keys.KeyD || keys.ArrowRight) sk += 1;
  if (keys.KeyA || keys.ArrowLeft) sk -= 1;
  if (touchMode && joy.active && joy.mag > 0.12) { fk = -joy.dy; sk = joy.dx; }

  let mvx = fwd.x * fk + right.x * sk;
  let mvz = fwd.z * fk + right.z * sk;
  const len = Math.hypot(mvx, mvz);
  if (len > 0.001) {
    mvx /= len; mvz /= len;
    game.setInput(myId, { mx: self.x + mvx * 600, my: self.y + mvz * 600, fire: firing, camo, move: true });
  } else {
    game.setInput(myId, { mx: self.x + Math.cos(0), my: self.y, fire: firing, camo, move: false });
  }
}, 1000 / 30);

// ---------- apply snapshot to 3D scene ----------
function applySnapshot(s) {
  leaderboard = s.leaderboard;
  self = s.self;
  snapPlayers = s.players;
  snapFood = s.food;
  if (s.dead && playing) showDeath(s.dead);

  // players
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    let obj = playerObjs.get(p.id);
    if (!obj) {
      const group = buildChameleon(p.hue);
      const tongue = makeTongue(p.hue);
      scene.add(group);
      scene.add(tongue);
      obj = { group, tongue, tx: p.x, tz: p.y, ts: p.r };
      playerObjs.set(p.id, obj);
    }
    obj.tx = p.x; obj.tz = p.y; obj.ts = p.r; obj.angle = p.angle;
    obj.camo = p.camo;
    obj.tongueData = p.tongue;
    obj.hue = p.hue;
  }
  for (const [id, obj] of playerObjs) {
    if (!seen.has(id)) { scene.remove(obj.group); scene.remove(obj.tongue); playerObjs.delete(id); }
  }

  // food
  const seenF = new Set();
  for (const f of s.food) {
    seenF.add(f.id);
    let m = foodObjs.get(f.id);
    if (!m) { m = buildBug(f.hue); m.position.set(f.x, 12, f.y); scene.add(m); foodObjs.set(f.id, m); }
  }
  for (const [id, m] of foodObjs) {
    if (!seenF.has(id)) { scene.remove(m); foodObjs.delete(id); }
  }
}

// ---------- render ----------
const up = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
let t0 = performance.now();

function render() {
  requestAnimationFrame(render);
  const now = performance.now();
  const dt = Math.min(0.05, (now - t0) / 1000);
  t0 = now;

  if (playing && myId) applySnapshot(game.snapshotFor(myId));

  // update player meshes
  for (const obj of playerObjs.values()) {
    const g = obj.group;
    const k = 1 - Math.pow(0.0001, dt); // smoothing
    g.position.x += (obj.tx - g.position.x) * k;
    g.position.z += (obj.tz - g.position.z) * k;
    const s = obj.ts;
    g.position.y = s * 0.85;
    g.scale.setScalar(s);
    if (obj.angle !== undefined) {
      const targetRot = -obj.angle;
      let d = targetRot - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 12);
    }
    const op = obj.camo >= 1 ? 0.12 : (obj.camo > 0 ? 0.4 : 1);
    setGroupOpacity(g, op);

    // tongue
    if (obj.tongueData) {
      const t = obj.tongue;
      t.visible = true;
      tmpA.set(g.position.x, s * 0.9, g.position.z);
      tmpB.set(obj.tongueData.x, s * 0.9, obj.tongueData.y);
      tmpDir.subVectors(tmpB, tmpA);
      const len = tmpDir.length() || 1;
      t.position.copy(tmpA).addScaledVector(tmpDir, 0.5);
      t.quaternion.setFromUnitVectors(up, tmpDir.clone().normalize());
      t.scale.set(Math.max(3, s * 0.18), len, Math.max(3, s * 0.18));
      t.material.opacity = op; t.material.transparent = op < 1;
    } else {
      obj.tongue.visible = false;
    }
  }

  // camera follow
  if (self) {
    const px = self.x;
    const pz = self.y;
    const r = Math.sqrt(self.mass) * 6;
    const dist = r * 7 + 160;
    const cx = px + Math.sin(camYaw) * Math.cos(camPitch) * dist;
    const cz = pz + Math.cos(camYaw) * Math.cos(camPitch) * dist;
    const cy = r * 0.85 + Math.sin(camPitch) * dist;
    camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
    camera.lookAt(px, r * 0.85 + 20, pz);
  }

  renderer.render(scene, camera);
  drawHUD();
  drawMinimap();
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
  const sc = mini.width / WORLD.WIDTH;
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = 'rgba(0,0,0,0.3)';
  mctx.fillRect(0, 0, mini.width, mini.height);
  for (const p of snapPlayers) {
    if (p.camo >= 1 && !p.isSelf) continue;
    mctx.fillStyle = p.isSelf ? '#ffe98a' : `hsl(${p.hue},60%,55%)`;
    mctx.beginPath();
    mctx.arc(p.x * sc, p.y * sc, p.isSelf ? 3.5 : 2, 0, Math.PI * 2);
    mctx.fill();
  }
}

render();
