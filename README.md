# 🧸 Claw Friends

A **3D anime-style claw machine arcade** for the browser. Walk Kyoko around a cozy arcade full of claw machines, grab plush friends with a physics claw, fill your cart, swap five small friends for a big one and check out at the cashier.

![Claw Friends](screenshot.png)

## Run locally

```bash
git clone https://github.com/GianneAngely/claw-friends.git
cd claw-friends/game
npm install
npm run build
open dist/index.html
```

## Controls

- **WASD** — walk, or move the claw at a machine
- **E / Space** — use, grab
- **Arrow keys or drag** — look around
- **C** — wardrobe (tee and shorts colours)
- **Esc** — leave the machine

## What's inside

- **game/** — the game: arcade room, physics claw, cart, big swap booth, cashier, wardrobe, music
- **blender/** — Kyoko's 3D model, built from her reference art (part masks → meshes → Blender → `game/assets/kyoko.glb`) plus her face expressions
- **refs/** — art direction moodboards and Kyoko's character options
- **mockup/, mockup3d/** — early 2D and 3D mockups
- **tools/cdpshot.mjs** — headless Chrome screenshots for checking the game

## Built with

Three.js · Rapier · esbuild · Blender

Plain JavaScript bundled into one file, so the built game runs straight from `dist/index.html`.
