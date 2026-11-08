# Static deployment to Vercel

The project is prepared for static Vite hosting. No deployment has been published or verified. There is no server component, required environment secret or need for vercel.json.

## Prepare and push

1. Review the included CC0 glTF models and credits in ASSETS.md. The imported-model requirement is implemented; preserve each model directory and its relative dependencies when committing.
2. Install a supported Node release satisfying Node 22.18+ for the native TypeScript test runner. Run `npm ci`, `npm run check`, `npm test`, and `npm run build`.
3. Run `npm run preview` and verify activation, real falling stones, Reset, both quality modes and resizing.
4. Create a GitHub repository. From this project directory initialize Git if needed, review the files, commit and push to the repository you own. Commit package-lock.json, public assets, source and documentation; keep node_modules and dist ignored. No push was performed by this implementation.

## Import into Vercel

1. In your Vercel account, choose Add New Project and import that GitHub repository.
2. Set Root Directory to the directory containing this package.json (the repository root if this project is its own repository).
3. Select the Vite framework preset. Build command: `npm run build`. Output directory: `dist`. Install command: `npm ci` (or Vercel's npm lockfile default).
4. Select a supported Node version meeting the requirement above. No environment variables are required.
5. Start deployment yourself, inspect the build logs and open the actual generated HTTPS URL. Record a URL only after it works.

## Verify the deployed site

- Reload the HTTPS URL with an empty browser cache. Check console and network for missing files and errors.
- Confirm `textures/stone-color.webp`, `stone-normal.webp`, `stone-arm.webp` and favicon resolve, and real GLB files resolve if added. A 200 response containing an HTML fallback is not a valid model.
- Confirm the separate PhysicsWorld JavaScript chunk loads, embedded WebAssembly initialization finishes and Activate becomes enabled. The compat package embeds WASM; it does not require a separate .wasm URL.
- Inspect the procedural seal for WebGL shader errors. Activate, observe falling/colliding stones, Reset during activation, and repeat full cycles.
- Toggle High/Low and resize the viewport. Check that the seal, controls and physics remain functional and the scene has no overexposed glow.
- Test the intended real laptop and touch device. Local browser measurements do not certify deployed network load time, mobile GPU performance or 60 FPS.

## Submission limitations

Procedural arches and columns intentionally remain alongside the imported statues and gate. The large Rapier compat chunk remains an initial ritual download cost, although the scene can render while it loads. A live production deployment and its final smoke test remain user actions.
