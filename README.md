# The Forgotten Chapel

An interactive Gothic chapel courtyard with pointed arches, a central altar, ruined masonry, stone figures and candlelight.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run check` for TypeScript validation, `npm test` for asset, interaction and real Rapier regression tests, and `npm run build` for a production build. The output is in `dist/`. Tests use Node's native TypeScript support (Node 22.18+; verified with Node 26.8).

Drag to orbit the chapel and scroll to zoom. The camera stays above the courtyard.

The compact bronze-edged menu contains the ritual controls and instructions. **Hide UI** hides the panel while leaving a **Show UI** button; Enter/Space works on the toggle, and hidden controls leave the keyboard tab order. Hiding the menu does not pause the scene or change ritual state. On narrow screens the menu uses a shorter layout; short viewports allow internal scrolling.

Click a visible part of the artifact, or use **Activate ritual**. A 3.2-second charge lifts the relic and gathers eight orbiting fragments. Gold/violet energy ribbons, a soft procedural aura, rising embers and an intensifying seal build toward an expanding pulse. Fragments launch outward/upward into real Rapier gravity and collisions, while the relic settles into an awakened hover. **Reset ritual** restores the scene and all effects without reloading, including during activation. Dragging, canceled gestures and multi-touch gestures do not activate the artifact. Native HTML buttons provide keyboard access.

## Structure

- `src/main.ts` starts the application and reports WebGL startup failure.
- `src/core/App.ts` owns the renderer, camera, controls, resize observer, animation loop, and cleanup.
- `src/scene/createChapel.ts` composes the courtyard, altar, steps, candles and floating artifact.
- `src/scene/createArchitecture.ts` builds the architectural placeholders and model placement slots.
- `src/scene/assets.ts` loads GLB models, normalizes placement, preserves materials and handles resource cleanup.
- `src/scene/materials.ts` creates shared PBR materials and loads optional local texture maps.
- `src/scene/createLighting.ts` sets moonlight, fill light, and candle lights.
- `src/effects/MagicSeal.ts` owns the horizontal transparent ShaderMaterial effect.
- `src/effects/RitualEffects.ts` owns reusable energy ribbons, aura, particle buffers, pulse and local light; all procedural effects use native Three.js/GLSL with no downloaded VFX assets.
- `src/shaders/magicSeal.vert.glsl` and `magicSeal.frag.glsl` contain the custom shader programs.
- `src/interaction/RitualController.ts` owns ritual state, animation, picking and input cleanup.
- `src/physics/PhysicsWorld.ts` owns asynchronous Rapier initialization, colliders, dynamic bodies and fixed stepping.
- `public/models/` and `public/textures/` hold optional licensed assets. Configuration and missing-file instructions are in [ASSETS.md](ASSETS.md).

The courtyard uses local CC0 stone textures and two real imported glTF models: the Lucy church angel from Stanford University Computer Graphics Laboratory and Large Iron Gate by Josh Dean / Poly Haven. Angels stand on both plinths; the gate frames the background. Lucy requires source credit and permission for commercial use; see [ASSETS.md](ASSETS.md). Procedural arches and columns remain alongside imported geometry. Deployment has not been published; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Technology and university requirements

Vanilla Three.js 0.187, TypeScript, Vite, Rapier 3D compat and native GLSL. No UI framework or additional rendering engine is used.

| Requirement | Actual implementation and source |
| --- | --- |
| Primitives | Visible boxes, cylinders, spheres and planes in `scene/createChapel.ts` and `createArchitecture.ts` |
| Complex imported models | **Satisfied:** real indexed Lucy angel and Large Iron Gate glTF meshes in `public/models/`, loaded by `scene/assets.ts` and placed in `createArchitecture.ts` |
| Materials | Shared PBR materials, CC0 color/normal/ARM maps and correct color spaces in `scene/materials.ts` |
| Lighting | Cold moon, hemisphere fill, two candles mounted on the foreground column caps and the ritual's unshadowed local light; the altar surface has no candles |
| Shadows | One directional PCF shadow map, 1024 High / 512 Low, tightened bounds and bias in lighting/App |
| Animation | Time-based floating artifact, stone suspension and candle flicker in App/RitualController |
| Physics | Real Rapier gravity, contacts, friction, restitution and rotation in `physics/PhysicsWorld.ts` |
| High-quality rendering | HDR composer, subtle bloom, ACES, sRGB output, antialiasing and responsive targets in `core/RenderingPipeline.ts`; subjective visual quality is not an FPS guarantee |
| Custom shader | Procedural vertex/fragment GLSL and uniforms in `effects/MagicSeal.ts` and `shaders/` |

## Rendering and quality

`RenderPass → UnrealBloomPass → OutputPass` replaces the direct renderer call. The scene is rendered once per frame. Intermediate targets remain linear HDR; OutputPass applies ACES exposure and sRGB conversion once at the end. Three.js disables material tone mapping when rendering into these intermediate targets, so the seal's standard output chunks do not apply a second conversion. There is no gamma-correction pass.

High uses bloom strength 0.2, radius 0.2, threshold 0.65, 2-sample render targets and pixel ratio capped at 1.5. Low disables bloom, uses non-multisampled targets, caps pixel ratio at 1 and reduces the moon shadow map to 512. Shader, physics and interaction stay enabled in both modes. The single quality button toggles modes; no preference is persisted.

ResizeObserver updates camera aspect, renderer, composer pixel ratio and render-target dimensions together. OrbitControls limits distance and vertical angle and disables panning. Repeated floor/deck tiles use InstancedMesh grouped by material; their bounding volumes are refreshed for culling, picking and physics bounds. Tiles retain the original placement and material variations. Postprocessing passes, render targets, instance buffers, shared textures, shadows and the physics World have explicit cleanup paths.

For opt-in diagnostics open `/?diagnostics=1`. Every 120 frames, `#app` data attributes report renderer.info calls/triangles, allocated geometries/textures, drawing-buffer dimensions, pixel ratio, quality and mean animation-frame interval. Counts include shadow and postprocessing passes because info is reset once per full frame. Memory counts describe allocated resources, not bytes or a complete leak profile. The interval is wall-clock browser scheduling, not GPU time or a portable hardware benchmark. Use browser developer tools to inspect these attributes; no debug panel obscures the experience.

The technical audit, browser evidence and remaining hardware checks are recorded in [docs/final-audit.md](docs/final-audit.md).

## Production and credits

```sh
npm run check
npm test
npm run build
npm run preview
```

Production output is static `dist/`; source maps are not enabled. Asset URLs follow Vite's base URL and no localhost dependency is shipped. Rapier's embedded WebAssembly is in a separate asynchronous chunk; its size still triggers a Vite bundle warning. Optional missing models keep safe fallbacks, missing maps retain usable materials, and initialization failures disable ritual controls with a clear message.

Texture set: **Plastered Stone Wall**, Rob Tuytel / Poly Haven, CC0, attribution not required. Files are local 512×512 WebP maps, about 113 KiB total. Verified links, channel packing, optional asset requirements and unknown model licenses are recorded in [ASSETS.md](ASSETS.md). No model creator or license is invented.

Model credits: **Lucy — Stanford University Computer Graphics Laboratory**, [Stanford 3D Scanning Repository](https://graphics.stanford.edu/data/3Dscanrep/), 100k PLY variant from the official Three.js examples, converted locally to glTF. Research use and free redistribution with credit are permitted; commercial use requires permission. [Large Iron Gate](https://polyhaven.com/a/large_iron_gate) — Josh Dean / Poly Haven, CC0. See ASSETS.md and the bundled Lucy LICENSE.md for details.

## Ritual and shader

The state is one union: `idle`, `activating`, or `released`. Activation is accepted only from `idle`. Both raycasting and the Activate button call the same controller method. The ray uses canvas-relative normalized coordinates, includes nested artifact meshes, and checks for visible foreground occluders.

The vertex shader passes UV coordinates to the fragment shader and transforms a horizontal plane. The fragment shader uses distance from the UV center, `atan`, antialiased distance bands, angular sine patterns and smooth masks to draw rings, segmented arcs, radial marks and a six-lobed inner decoration. There is no circle image or noise texture.

| Uniform | Meaning |
| --- | --- |
| `uTime` | Animation phase advanced using frame delta; it accelerates smoothly during activation |
| `uIntensity` | Seal brightness: restrained at idle, stronger during activation, then settling |
| `uActivation` | Smooth 0–1 activation amount, affecting the seal's color and transition |

The plane is 0.012 scene units above the actual altar bounds. It uses alpha transparency with depth testing enabled and depth writing disabled. Reduced-motion preference suppresses automatic artifact/seal movement and pulsing; user-triggered physics still runs.

## Physics and reset

Rapier is loaded asynchronously; its WebAssembly initialization must complete before the ritual controls enable. The environment keeps rendering while this happens. One World uses gravity `(0, -9.81, 0)`, a fixed `1/60` timestep, an accumulator and at most five simulation steps per frame. The existing App owns the only animation loop.

`core/FrameClock.ts` measures foreground visual/state time from animation-loop timestamps. Activation uses the full foreground interval; physics receives at most 0.05 seconds per frame, with no unbounded catch-up. A visibilitychange pauses progress and clears the timestamp baseline on both hide and show; the first resumed frame has zero delta. The ritual is preserved rather than reset. On the release frame only the interval after the activation boundary can advance physics. A long foreground stall may skip visual frames, while physics deliberately drops excess simulation time.

Nine static cuboids represent the ground, the combined raised platform, four steps and three altar sections. Platform and altar bounds come from the visible geometry. Decorative architecture and candle holders do not receive colliders. Small tile seams are deliberately approximated by a continuous platform collider.

Before release, stone meshes follow a deterministic suspended orbit and have no dynamic bodies. At release, each gets a ball collider and dynamic rigid body initialized from its visible position and rotation. Friction, restitution, damping, CCD and a small initial angular velocity produce falling, slight bouncing and settling. After release, only Rapier writes stone transforms; the render loop copies body translation and quaternion to the meshes.

Reset removes the eight dynamic bodies and their attached colliders, clears the accumulator and transition timers, restores deterministic suspended transforms, resets artifact scale/emission and shader phase, and re-enables activation. It creates no new listeners, geometry, loops or worlds. Teardown removes listeners, frees the World and disposes owned GPU resources; late asynchronous initialization checks cancellation before attaching anything.

The compat physics package embeds WebAssembly, so its separate asynchronous build chunk is relatively large. No frame-rate guarantee or real touch-device benchmark is claimed by the automated tests.
