// Shared game tuning constants (server-authoritative).
export const WORLD = {
  WIDTH: 4500,
  HEIGHT: 4500,
};

export const TICK_RATE = 30; // server simulation steps per second
export const TICK_MS = 1000 / TICK_RATE;

export const FOOD = {
  COUNT: 450, // target number of bugs in the world at all times
  MIN_MASS: 1,
  MAX_MASS: 3,
};

export const PLAYER = {
  START_MASS: 18,
  MAX_MASS: 4000,
  // radius = sqrt(mass) * RADIUS_FACTOR
  RADIUS_FACTOR: 6,
  // movement speed in px/sec, shrinks as you grow
  BASE_SPEED: 240,
  MIN_SPEED: 95,
  // how strongly mass slows you down
  SPEED_FALLOFF: 0.0009,
};

export const TONGUE = {
  // tongue reach (px) = base + mass scaling, capped
  BASE_LEN: 230,
  LEN_PER_RADIUS: 5.5,
  MAX_LEN: 620,
  EXTEND_SPEED: 2200, // px/sec out
  RETRACT_SPEED: 1500, // px/sec back in
  TIP_RADIUS: 14, // grab hitbox at the tongue tip
  COOLDOWN_MS: 250,
};

export const CAMO = {
  MAX: 100, // stealth meter capacity
  DRAIN: 28, // per second while hiding
  REGEN: 14, // per second while not hiding
  MIN_TO_START: 12, // need at least this much to begin hiding
  MOVE_FACTOR: 0.45, // movement speed multiplier while camouflaged
};

// You can eat another chameleon with your tongue only if you are at least
// this much heavier than them.
export const EAT_RATIO = 1.18;

export const BOT = {
  COUNT: 14, // bots topped up to keep the world lively
  NAMES: [
    'Kpermit', 'Pascal', 'Rango', 'Karma', 'Yoshi', 'Gex', 'Verde',
    'Limey', 'Sticky', 'Camo', 'Iggy', 'Mossy', 'Zappy', 'Coil',
    'Snappy', 'Bonk', 'Twiggy', 'Mantis', 'Geko', 'Slurp',
  ],
};
