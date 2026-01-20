# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install     # Install dependencies
npm run dev     # Start development server (Vite)
npm run build   # Production build
npm run preview # Preview production build
```

## Project Overview

Jumpy The Artifact is a vertical platformer game (similar to Doodle Jump) built as a single React component with HTML5 Canvas rendering. The entire game logic lives in `src/jumpy.jsx`.

## Architecture

The game uses a hybrid approach:
- **React** for UI overlays (menu, game over screens) and state management (gameState, score, highScore)
- **Canvas API** for all game rendering via `useRef` canvas
- **requestAnimationFrame** game loop with separate `update()` and `draw()` phases

### Key Game State
- `gameRef.current` holds mutable game state (frog, platforms, gems, enemies, powerups, bullets, particles, camera)
- `gameStateRef.current` tracks UI state ('menu', 'playing', 'gameover') for the game loop

### Entity Types
- **Platforms**: normal, moving, breakable, spring
- **Power-ups**: rocket, cape, spring, shield, propeller, springShoes, magnet, gun
- **Collectibles**: blue/orange/purple gems with weighted values

### Generation System
Platforms and entities generate procedurally as the player ascends. Cleanup occurs for entities below the viewport.
