# Jumpy The Artifact Frog

A vertical platformer game inspired by Doodle Jump, built as a single React component with HTML5 Canvas rendering.

## Purpose

This project is published as a public artifact to demonstrate:

- Building a complete game as a single React component
- HTML5 Canvas rendering with requestAnimationFrame game loop
- Hybrid architecture combining React state management with mutable game state
- Procedural generation of platforms, enemies, and power-ups
- Power-up queue system design pattern

Feel free to use this as a learning resource, fork it, or build upon it.

## Play

Use arrow keys or A/D to move left/right. Collect gems for points and power-ups for abilities. Avoid enemies or use power-ups to defeat them.

## Features

- **Platform Types**: Normal, moving, breakable, and spring platforms
- **Power-up Queue System**: Collected power-ups queue up and activate when the current one expires
- **10 Power-ups**:
  - Rocket, Propeller (timed flight)
  - Cape (gliding), Shield (2 hits)
  - Spring Shoes (boosted jumps), Magnet (gem attraction)
  - Sumo (bounce-kill enemies)
  - Laser, Shotgun, Tommy Gun (weapons - press SPACE to fire)
- **Mario-style Protection**: Getting hit with an active power-up removes the power instead of ending the game
- **Fall Rescue**: Persistent powers (Cape, Shield, Weapons) save you from falling once

## Artifact

https://claude.ai/public/artifacts/4b281d60-2bea-477d-82bc-7d8b1093f8a7

```html
<iframe
  src="https://claude.site/public/artifacts/4b281d60-2bea-477d-82bc-7d8b1093f8a7/embed"
  title="Claude Artifact"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-write"
  allowfullscreen
></iframe>
```

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Tech Stack

- React + Vite
- HTML5 Canvas
- Tailwind CSS

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.
