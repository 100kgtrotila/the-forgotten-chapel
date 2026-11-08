# Chapel assets

The project includes two real imported glTF models and a local CC0 PBR stone texture set. The pointed arches and broken columns remain procedural; the angels and rear iron gate are imported mesh geometry. The Lucy scan has Stanford-specific noncommercial usage terms, not CC0.

## Included models

| Asset | Creator | Verified source | License / attribution | Local entry point | Total package size | Geometry |
| --- | --- | --- | --- | --- | --- | --- |
| Lucy church angel | Stanford University Computer Graphics Laboratory | https://graphics.stanford.edu/data/3Dscanrep/ ; 100k PLY from the official Three.js examples repository | Source credit required; research use and free redistribution permitted; commercial use requires permission. See `public/models/lucy_angel/LICENSE.md`. | `public/models/lucy_angel/lucy_angel.gltf` | 1,802,914 bytes including license | 100,000 triangles, 50,002 vertices, 1 mesh, 1 material |
| Large Iron Gate | Josh Dean | https://polyhaven.com/a/large_iron_gate | CC0; attribution not required | `public/models/large_iron_gate/large_iron_gate.gltf` | 3,128,181 bytes | 38,140 triangles, 4 meshes, 1 material |

The gate was downloaded through Poly Haven's public metadata API and official `dl.polyhaven.org` links. Its license is verified at https://polyhaven.com/a/large_iron_gate and https://polyhaven.com/license. The application makes no runtime requests to external asset services.

The gate includes its original BIN and three 1K JPEG PBR maps with preserved paths; dependency MD5 hashes matched provider metadata. Lucy was obtained from https://github.com/mrdoob/three.js/blob/dev/examples/models/ply/binary/Lucy100k.ply and converted locally using the installed Three.js PLYLoader to indexed glTF + BIN. All 100,000 triangles were preserved, smooth normals computed, X/Z centered, Y grounded and height normalized to one unit. This PLY variant has no UVs or textures; the material is matte limestone. No decoder or extra runtime dependency is needed.

The angel is reused on both plinths, height 1.8 scene units, positioned at X ±3.65 / Z −2.8. A model-local Y rotation of PI corrects the scan's forward axis; the slots then turn inward by 0.3 radians. One cached request shares geometry/materials between instances. Plinth tops remain at Y 2.05, with Box3 normalization grounding the model on them. The gate occupies the rear arch at `(0, 1.53, -3.72)`, height 3.72. Its feet rest on a stone threshold and the adjoining masonry shares the same rear plane, forming a closed rear passage rather than a freestanding prop. Imported meshes cast and receive shadows. They are static decoration with no physics bodies.

The `surface: 'agedStone'` treatment in `src/scene/assets.ts` applies gray-green tint #767b70, zero metalness and roughness 0.96. Lighting and gate materials remain unchanged. The former Gothic Statue files are no longer shipped.

Lucy is a scanned Christian angel with readable wings and drapery; it replaces the previous ornamental figures. The 100k mesh is heavier to render than the former 27,739-triangle statue, but its package is smaller and uses no image textures. Check target hardware performance before publication.

## Included PBR textures

| File | Location | Type | Source | Creator | License / attribution |
| --- | --- | --- | --- | --- | --- |
| `stone-color.webp` | `public/textures/` | 512×512 base color | [Plastered Stone Wall](https://polyhaven.com/a/plastered_stone_wall) | Rob Tuytel | CC0; attribution not required |
| `stone-normal.webp` | `public/textures/` | 512×512 OpenGL normal | [Plastered Stone Wall](https://polyhaven.com/a/plastered_stone_wall) | Rob Tuytel | CC0; attribution not required |
| `stone-arm.webp` | `public/textures/` | 512×512 packed AO / roughness / metalness | [Plastered Stone Wall](https://polyhaven.com/a/plastered_stone_wall) | Rob Tuytel | CC0; attribution not required |

These existing WebP files were copied from the user's local `threejs-lighthouse/public/textures/` set, also supplied under `threejs-lighthouse/materials/grave/plastered_stone_wall_1k/`. No textures were downloaded during this stage. Creator and license were verified on the official asset page and [Poly Haven license page](https://polyhaven.com/license) on 2026-11-07.

Architecture and floor reuse the same three images with different material tints. The ARM image is shared between `aoMap` (red) and `roughnessMap` (green); stone metalness remains zero. No separate roughness file is needed for this set. The three images total about 113 KiB on disk.

## Models to supply

| Suggested filename | Location | Type | Intended use | Source / creator / license | Attribution |
| --- | --- | --- | --- | --- | --- |
| `gothic-arch.glb` | `public/models/` | Static GLB | Rear pointed arch | Not supplied; unknown | Must be checked before use |
| `ruined-arch.glb` | `public/models/` | Static GLB | Broken western arch | Not supplied; unknown | Must be checked before use |
| `medieval-column.glb` | `public/models/` | Static GLB | Broken foreground columns | Not supplied; unknown | Must be checked before use |

After obtaining a suitable licensed model, put it in `public/models/` and set its `path` in `MODEL_ASSETS` in `src/scene/assets.ts`, for example `path: 'models/stone-statue.glb'`. Keep the path `null` until the file exists. Set `height` in scene units and, if needed, `rotation: [x, y, z]` in radians to correct orientation before automatic sizing.

Model slots in `src/scene/createArchitecture.ts` control world position and rotation. Models are centered on X/Z, grounded at their local minimum Y, and sized to the configured height. Check unusually wide models visually; height normalization cannot guarantee that every asset fits its surroundings.

Supply uncompressed GLB with embedded images, or glTF with all referenced `.bin` and image files beside it. Draco / KTX2 decoder setup is not included. A missing, unsupported, or invalid model leaves its procedural placeholder visible and logs a diagnostic. Model PBR materials are preserved unless an explicit surface treatment is configured. Repeated instances share geometry and materials and use one load per URL and surface treatment.

## Optional texture sets to supply

| Suggested set | Expected files in `public/textures/` | Type | Source / creator / license | Attribution |
| --- | --- | --- | --- | --- |
| Distinct floor stone | `floor-color.webp`, `floor-normal.webp`, `floor-roughness.webp`, optional `floor-ao.webp` | PBR images | Not supplied; unknown | Must be checked before use |
| Aged metal | `metal-color.webp`, `metal-normal.webp`, `metal-roughness.webp`, optional `metal-ao.webp` | PBR images | Not supplied; unknown | Must be checked before use |

Configure optional replacements in `TEXTURE_ASSETS` in `src/scene/materials.ts`. Paths are relative to `public/`. For example, a set with separate roughness and AO maps:

```ts
stone: {
  color: 'textures/stone-color.webp',
  normal: 'textures/stone-normal.webp',
  roughness: 'textures/stone-roughness.webp',
  ao: 'textures/stone-ao.webp',
  repeat: [1, 1],
}
```

Omit maps that are not available. Color maps use sRGB; data maps use `NoColorSpace`. All maps in a set share repeat wrapping and tiling. Use OpenGL normal maps and separate grayscale roughness maps (Three.js reads roughness from the green channel and AO from red). Start with 512–1024 pixel images; no 4K/8K maps are needed here. Normal-map strength is limited to 0.35 for stone.

Stone and metal retain their fallback color, roughness and metalness when a map is missing or fails. When a color map loads, its tint is lightened so the dark albedo is not multiplied by the full untextured fallback darkness. Tiling depends on each primitive's UV layout; inspect seams when adding maps. The statue and architecture GLB materials are not overwritten by these procedural materials.

## Bundled local asset

`public/favicon.svg` is the existing inline-vector chapel icon from this project. It has no external source or creator attribution recorded. It is not a model or PBR texture.

For every asset added later, replace the unknown metadata above with the verified source URL, creator, exact license, and attribution requirements. Do not infer CC0 from the absence of a license notice.
