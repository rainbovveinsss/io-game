# Chameleon.io 🦎

A real-time multiplayer **.io game inspired by [Meccha Chameleon](https://mecchachameleon.com/)**.
Play as a chameleon: flick out your sticky tongue to snatch bugs and smaller
chameleons, grow bigger, and **camouflage** to vanish from predators hunting you.

Built with **Node.js + Express + Socket.IO** (authoritative server) and an
**HTML5 Canvas** client. Bots keep the world busy even when you play solo.

## ▶️ Play now (no install)

A **3D browser build** (single-player vs. AI, rendered with Three.js, same game
engine) auto-deploys to GitHub Pages:

**https://rainbovveinsss.github.io/io-game/**

Controls: **WASD / arrows** to move, **mouse** to look (click once to capture the
cursor), **left-click / Space** for the tongue, **Shift / C** to camouflage. On
phones: left **joystick** to move, drag to look, **👅 / CAMO** buttons.

> The link updates a minute or two after the "Deploy to GitHub Pages" Action
> finishes. For real-time online multiplayer, run the Node server (below) — the
> server uses the 2D top-down client in `public/`.

## Features

- 🎯 **Tongue mechanic** — shoot a sticky tongue toward your cursor to grab bugs
  and chameleons smaller than you. It extends, latches on, and reels prey back in.
- 🫥 **Camouflage** — hold to turn nearly invisible to other players (and to bots'
  targeting). Drains a stealth meter that regenerates when you're exposed.
- 📈 **Grow & survive** — eating increases your mass; bigger = slower. You can only
  eat chameleons noticeably smaller than you, and the big ones can eat you.
- 🤖 **AI bots** — wander, graze, hunt smaller players, and flee/hide from threats.
- 🗺️ Live leaderboard, minimap, smooth camera, and a stylized chameleon look.
- 💀 When you die, your mass scatters across the map as fresh bugs.

## Controls

| Action | Input |
| --- | --- |
| Move | Point with the **mouse** (the chameleon follows the cursor) |
| Tongue | **Left click** or **Space** |
| Camouflage | **Right click** or **Shift** |
| Touch (phone) | **Joystick** (bottom-left) to move & aim, **👅 button** for the tongue, **CAMO button** to hide |

On phones the game adapts to **portrait/vertical** play: the canvas renders at the
device pixel ratio for crisp visuals, the camera zooms out a little so you can see
more, the HUD compacts, and on-screen controls appear automatically. The CAMO
button doubles as the stealth meter (it fills as the meter recharges).

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000**. Set the port with `PORT=8080 npm start`.

For development with auto-reload:

```bash
npm run dev
```

## Deploy (get a public link)

The game is a normal Node web server, so any Node host works. A couple of easy
free options:

**Render (one click via blueprint)**
1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [render.com](https://render.com) → **New → Blueprint** → select this repo.
   Render reads `render.yaml` and deploys automatically; you get a public
   `https://chameleon-io.onrender.com`-style URL.

**Docker (any VPS / Fly.io / Railway)**
```bash
docker build -t chameleon-io .
docker run -p 3000:3000 chameleon-io
```

**Railway:** New Project → Deploy from repo → it auto-detects `npm start`.

The server honors the `PORT` env var that hosts inject, so no extra config is
needed.

## Project structure

```
server/
  index.js       # Express + Socket.IO wiring and the broadcast loop
  game.js        # Authoritative game world: players, food, tongue, camo, bot AI
  constants.js   # All gameplay tuning in one place
public/
  index.html     # Menu + HUD markup
  style.css      # Jungle-themed UI
  client.js      # Canvas rendering, input, camera, interpolation
```

## How it works

The server runs a fixed-step simulation at **30 ticks/second** and is the single
source of truth. Clients send input (aim point, fire, camo) ~30×/s; the server
broadcasts a per-player snapshot ~22×/s. Each snapshot is tailored to the viewer
so camouflaged chameleons are simply omitted from everyone else's view. The
client interpolates entity positions between snapshots for smooth motion.

Gameplay numbers (world size, speeds, tongue reach, camo drain, eat ratio, bot
count, …) live in `server/constants.js` — tweak them to change the feel.

## License

MIT
