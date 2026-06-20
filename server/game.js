import {
  WORLD, FOOD, PLAYER, TONGUE, CAMO, EAT_RATIO, BOT,
} from './constants.js';

let nextId = 1;
const uid = (p = 'e') => `${p}${nextId++}`;

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export function massToRadius(mass) {
  return Math.sqrt(mass) * PLAYER.RADIUS_FACTOR;
}

function speedForMass(mass) {
  const s = PLAYER.BASE_SPEED * Math.exp(-PLAYER.SPEED_FALLOFF * mass);
  return Math.max(PLAYER.MIN_SPEED, s);
}

function tongueLenForRadius(r) {
  return Math.min(TONGUE.MAX_LEN, TONGUE.BASE_LEN + r * TONGUE.LEN_PER_RADIUS);
}

export class Game {
  constructor() {
    this.players = new Map(); // id -> player
    this.food = new Map(); // id -> food
    this.seedFood();
  }

  seedFood() {
    while (this.food.size < FOOD.COUNT) this.spawnFood();
  }

  spawnFood() {
    const id = uid('f');
    this.food.set(id, {
      id,
      x: rand(40, WORLD.WIDTH - 40),
      y: rand(40, WORLD.HEIGHT - 40),
      mass: rand(FOOD.MIN_MASS, FOOD.MAX_MASS),
      hue: Math.floor(rand(0, 360)),
    });
  }

  randomSpawnPoint() {
    return { x: rand(300, WORLD.WIDTH - 300), y: rand(300, WORLD.HEIGHT - 300) };
  }

  makePlayer({ id, name, isBot = false }) {
    const { x, y } = this.randomSpawnPoint();
    return {
      id,
      name: (name || 'Chameleon').slice(0, 16),
      isBot,
      x,
      y,
      mass: PLAYER.START_MASS,
      angle: rand(0, Math.PI * 2),
      hue: Math.floor(rand(60, 140)), // greens by default
      alive: true,
      // input from client / bot brain
      input: { mx: x + Math.cos(0), my: y, fire: false, camo: false },
      // tongue state machine
      tongue: { state: 'idle', len: 0, maxLen: 0, dx: 1, dy: 0, grab: null },
      tongueCooldown: 0,
      // stealth
      camo: CAMO.MAX,
      camoActive: false,
      score: PLAYER.START_MASS,
      kills: 0,
      // bot brain scratch space
      brain: isBot ? { retarget: 0, wanderAngle: rand(0, Math.PI * 2) } : null,
    };
  }

  addHuman(name) {
    const id = uid('p');
    const p = this.makePlayer({ id, name, isBot: false });
    this.players.set(id, p);
    return p;
  }

  addBot() {
    const id = uid('b');
    const name = BOT.NAMES[Math.floor(rand(0, BOT.NAMES.length))];
    const p = this.makePlayer({ id, name, isBot: true });
    p.hue = Math.floor(rand(0, 360));
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    p.input.mx = input.mx;
    p.input.my = input.my;
    p.input.fire = !!input.fire;
    p.input.camo = !!input.camo;
  }

  topUpBots() {
    const bots = [...this.players.values()].filter((p) => p.isBot).length;
    for (let i = bots; i < BOT.COUNT; i++) this.addBot();
  }

  // ---- main simulation step ----
  update(dt) {
    this.topUpBots();
    this.seedFood();

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.isBot) this.botThink(p, dt);
      this.updateMovement(p, dt);
      this.updateCamo(p, dt);
      this.updateTongue(p, dt);
    }
  }

  updateMovement(p, dt) {
    const dx = p.input.mx - p.x;
    const dy = p.input.my - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.angle = Math.atan2(dy, dx);

    let speed = speedForMass(p.mass);
    if (p.camoActive) speed *= CAMO.MOVE_FACTOR;

    // dead-zone near the cursor so you can sit still
    const move = Math.min(1, d / 60);
    p.x += (dx / d) * speed * move * dt;
    p.y += (dy / d) * speed * move * dt;

    const r = massToRadius(p.mass);
    p.x = clamp(p.x, r, WORLD.WIDTH - r);
    p.y = clamp(p.y, r, WORLD.HEIGHT - r);
  }

  updateCamo(p, dt) {
    const wants = p.input.camo && p.camo > 0;
    if (wants && (p.camoActive || p.camo >= CAMO.MIN_TO_START)) {
      p.camoActive = true;
      p.camo = clamp(p.camo - CAMO.DRAIN * dt, 0, CAMO.MAX);
      if (p.camo <= 0) p.camoActive = false;
    } else {
      p.camoActive = false;
      p.camo = clamp(p.camo + CAMO.REGEN * dt, 0, CAMO.MAX);
    }
  }

  updateTongue(p, dt) {
    const t = p.tongue;
    if (p.tongueCooldown > 0) p.tongueCooldown -= dt * 1000;
    const r = massToRadius(p.mass);

    // Fire: only when idle, off cooldown, and not hiding.
    if (t.state === 'idle' && p.input.fire && p.tongueCooldown <= 0 && !p.camoActive) {
      t.state = 'out';
      t.len = r;
      t.maxLen = tongueLenForRadius(r);
      t.dx = Math.cos(p.angle);
      t.dy = Math.sin(p.angle);
      t.grab = null;
      p.tongueCooldown = TONGUE.COOLDOWN_MS;
    }

    if (t.state === 'idle') return;

    if (t.state === 'out') {
      t.len += TONGUE.EXTEND_SPEED * dt;
      const tipX = p.x + t.dx * t.len;
      const tipY = p.y + t.dy * t.len;
      if (!t.grab) this.tongueTryGrab(p, tipX, tipY);
      if (t.len >= t.maxLen || t.grab) t.state = 'in';
    } else if (t.state === 'in') {
      t.len -= TONGUE.RETRACT_SPEED * dt;
      if (t.len <= r) {
        t.len = 0;
        if (t.grab) this.resolveGrab(p, t.grab);
        t.grab = null;
        t.state = 'idle';
      }
    }
  }

  tongueTryGrab(p, tipX, tipY) {
    const tipR2 = TONGUE.TIP_RADIUS * TONGUE.TIP_RADIUS;
    // bugs first
    for (const f of this.food.values()) {
      if (dist2(tipX, tipY, f.x, f.y) <= tipR2 + 100) {
        p.tongue.grab = { type: 'food', id: f.id };
        return;
      }
    }
    // smaller chameleons (can't grab the ones who are camouflaged)
    for (const o of this.players.values()) {
      if (o.id === p.id || !o.alive || o.camoActive) continue;
      if (p.mass < o.mass * EAT_RATIO) continue;
      const or = massToRadius(o.mass);
      if (dist2(tipX, tipY, o.x, o.y) <= (TONGUE.TIP_RADIUS + or) ** 2) {
        p.tongue.grab = { type: 'player', id: o.id };
        return;
      }
    }
  }

  resolveGrab(p, grab) {
    if (grab.type === 'food') {
      const f = this.food.get(grab.id);
      if (!f) return;
      this.food.delete(grab.id);
      this.grow(p, f.mass);
    } else {
      const o = this.players.get(grab.id);
      if (!o || !o.alive) return;
      // re-check ratio at resolution time so it stays fair
      if (p.mass < o.mass * EAT_RATIO) return;
      this.grow(p, o.mass * 0.75);
      p.kills += 1;
      this.kill(o, p);
    }
  }

  grow(p, amount) {
    p.mass = Math.min(PLAYER.MAX_MASS, p.mass + amount);
    p.score = Math.floor(p.mass);
  }

  kill(victim, killer) {
    victim.alive = false;
    // scatter some of the victim's mass as bugs where they died
    const drops = Math.min(20, Math.floor(victim.mass / 12));
    for (let i = 0; i < drops; i++) {
      const id = uid('f');
      const a = rand(0, Math.PI * 2);
      const rr = rand(10, massToRadius(victim.mass));
      this.food.set(id, {
        id,
        x: clamp(victim.x + Math.cos(a) * rr, 20, WORLD.WIDTH - 20),
        y: clamp(victim.y + Math.sin(a) * rr, 20, WORLD.HEIGHT - 20),
        mass: rand(FOOD.MIN_MASS, FOOD.MAX_MASS + 1),
        hue: victim.hue,
      });
    }
    victim.deadBy = killer ? killer.name : null;
  }

  respawn(id, name) {
    const p = this.players.get(id);
    if (!p) return this.addHuman(name);
    Object.assign(p, this.makePlayer({ id, name: name || p.name, isBot: p.isBot }));
    return p;
  }

  // ---- simple bot AI ----
  botThink(b, dt) {
    const brain = b.brain;
    brain.retarget -= dt;
    const br = massToRadius(b.mass);

    // Find the nearest threat (bigger chameleon) and nearest prey (food / smaller).
    let threat = null;
    let threatD2 = Infinity;
    let prey = null;
    let preyD2 = Infinity;

    for (const o of this.players.values()) {
      if (o.id === b.id || !o.alive || o.camoActive) continue;
      const d2 = dist2(b.x, b.y, o.x, o.y);
      if (o.mass * EAT_RATIO <= b.mass) {
        if (d2 < preyD2) { preyD2 = d2; prey = o; }
      } else if (o.mass >= b.mass * EAT_RATIO) {
        if (d2 < threatD2) { threatD2 = d2; threat = o; }
      }
    }

    let nearestFood = null;
    let foodD2 = Infinity;
    for (const f of this.food.values()) {
      const d2 = dist2(b.x, b.y, f.x, f.y);
      if (d2 < foodD2) { foodD2 = d2; nearestFood = f; }
    }

    b.input.fire = false;
    b.input.camo = false;

    // Flee from a close, bigger predator (and hide if cornered).
    if (threat && threatD2 < (br + 420) ** 2) {
      b.input.mx = b.x - (threat.x - b.x);
      b.input.my = b.y - (threat.y - b.y);
      if (threatD2 < (br + 220) ** 2 && b.camo > CAMO.MIN_TO_START) b.input.camo = true;
      return;
    }

    // Hunt smaller chameleons if close.
    if (prey && preyD2 < (tongueLenForRadius(br) + massToRadius(prey.mass)) ** 2 * 1.3) {
      b.input.mx = prey.x;
      b.input.my = prey.y;
      b.input.fire = true;
      return;
    }

    // Otherwise graze on bugs.
    if (nearestFood) {
      b.input.mx = nearestFood.x;
      b.input.my = nearestFood.y;
      const reach = tongueLenForRadius(br) * 0.9;
      if (foodD2 < reach * reach) b.input.fire = true;
      return;
    }

    // Wander.
    if (brain.retarget <= 0) {
      brain.wanderAngle += rand(-1, 1);
      brain.retarget = rand(1.5, 3.5);
    }
    b.input.mx = b.x + Math.cos(brain.wanderAngle) * 300;
    b.input.my = b.y + Math.sin(brain.wanderAngle) * 300;
  }

  // ---- snapshot sent to clients ----
  snapshotFor(viewerId) {
    const viewer = this.players.get(viewerId);
    const players = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      // Camouflaged players are hidden from others (but the owner always sees self).
      const hidden = p.camoActive && p.id !== viewerId;
      players.push({
        id: p.id,
        name: p.name,
        x: Math.round(p.x),
        y: Math.round(p.y),
        mass: Math.round(p.mass),
        r: Math.round(massToRadius(p.mass)),
        angle: +p.angle.toFixed(2),
        hue: p.hue,
        camo: hidden ? 1 : (p.camoActive ? 0.85 : 0),
        isSelf: p.id === viewerId,
        tongue: p.tongue.state !== 'idle' ? {
          x: Math.round(p.x + p.tongue.dx * p.tongue.len),
          y: Math.round(p.y + p.tongue.dy * p.tongue.len),
        } : null,
      });
    }

    const food = [];
    for (const f of this.food.values()) {
      food.push({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), hue: f.hue });
    }

    const leaderboard = [...this.players.values()]
      .filter((p) => p.alive)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map((p) => ({ name: p.name, score: Math.floor(p.mass), isSelf: p.id === viewerId }));

    return {
      world: WORLD,
      players,
      food,
      leaderboard,
      self: viewer && viewer.alive ? {
        x: Math.round(viewer.x),
        y: Math.round(viewer.y),
        mass: Math.floor(viewer.mass),
        camo: Math.round(viewer.camo),
        camoActive: viewer.camoActive,
        kills: viewer.kills,
      } : null,
      dead: viewer && !viewer.alive ? {
        score: Math.floor(viewer.mass),
        by: viewer.deadBy || null,
        kills: viewer.kills,
      } : null,
    };
  }
}
