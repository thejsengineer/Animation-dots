# Gather — Photo Particle Cloud

A React app that turns uploaded photos into interactive fields of glowing particles. Add up to four images, then rotate and zoom each particle cloud in the browser.

## Features

- Upload images with the file picker or drag and drop.
- Add up to four photos and switch between them in the gallery.
- Drag the canvas to rotate the particle cloud and scroll to zoom.
- Toggle between dark and light paper, or open the canvas fullscreen.
- Process images locally in your browser; images are not sent to a server.
- Responsive layout for desktop and mobile.

## Requirements

- Node.js and npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in your browser.

## Production build

```bash
npm run build
npm run preview
```

The production files are generated in `dist/`. Dependencies and build output are excluded from Git.

## Built with

- React
- Vite
- HTML Canvas
