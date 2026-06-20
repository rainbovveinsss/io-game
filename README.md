# Chameleon.io 🦎

A real-time multiplayer **.io game inspired by [Meccha Chameleon](https://mecchachameleon.com/)**.
Play as a chameleon: flick out your sticky tongue to snatch bugs and smaller
chameleons, grow bigger, and **camouflage** to vanish from predators hunting you.

Built with **Node.js + Express + Socket.IO** (authoritative server) and an
**HTML5 Canvas** client. Bots keep the world busy even when you play solo.

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
| Touch | Drag to aim, tap to fire, two fingers to camouflage |

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
