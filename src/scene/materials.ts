import * as THREE from 'three'

export interface TextureSet {
  color?: string
  normal?: string
  roughness?: string
  ao?: string
  repeat?: readonly [number, number]
}

export interface TextureAssets {
  stone: TextureSet
  floor: TextureSet
  metal: TextureSet
}

// The supplied local stone set is CC0; source and channel packing are in ASSETS.md.
const stoneTextures: TextureSet = {
  color: 'textures/stone-color.webp',
  normal: 'textures/stone-normal.webp',
  roughness: 'textures/stone-arm.webp',
  ao: 'textures/stone-arm.webp',
  repeat: [1, 1],
}
export const TEXTURE_ASSETS: TextureAssets = { stone: stoneTextures, floor: stoneTextures, metal: {} }

export interface ChapelMaterials {
  darkStone: THREE.MeshStandardMaterial
  oldStone: THREE.MeshStandardMaterial
  carvedStone: THREE.MeshStandardMaterial
  floor: THREE.MeshStandardMaterial
  earth: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  wax: THREE.MeshStandardMaterial
  flame: THREE.MeshStandardMaterial
  magic: THREE.MeshPhysicalMaterial
  stoneVariants: THREE.MeshStandardMaterial[]
  floorVariants: THREE.MeshStandardMaterial[]
}

export function createChapelMaterials(
  signal: AbortSignal,
  config: TextureAssets = TEXTURE_ASSETS,
): { materials: ChapelMaterials; ready: Promise<void> } {
  const stone = (color: string) => new THREE.MeshStandardMaterial({
    color, roughness: 0.91, normalScale: new THREE.Vector2(0.35, 0.35), aoMapIntensity: 0.35,
  })
  const materials: ChapelMaterials = {
    darkStone: stone('#333933'),
    oldStone: stone('#66685b'),
    carvedStone: stone('#858575'),
    floor: stone('#55594f'),
    earth: stone('#1c2523'),
    metal: new THREE.MeshStandardMaterial({ color: '#635746', metalness: 0.7, roughness: 0.56 }),
    wax: new THREE.MeshStandardMaterial({ color: '#d6bf9d', roughness: 0.88 }),
    flame: new THREE.MeshStandardMaterial({ color: '#ffe0aa', emissive: '#ffa04c', emissiveIntensity: 3 }),
    magic: new THREE.MeshPhysicalMaterial({
      color: '#7867b5', metalness: 0.25, roughness: 0.2,
      emissive: '#5544a7', emissiveIntensity: 1.2,
      clearcoat: 0.6, clearcoatRoughness: 0.17,
    }),
    stoneVariants: ['#66685b', '#5e645b', '#727365'].map(stone),
    floorVariants: ['#64675c', '#555b53', '#707064', '#5d6256'].map(stone),
  }

  const loader = new THREE.TextureLoader()
  const cache = new Map<string, Promise<THREE.Texture>>()
  const loadedTextures = new Set<THREE.Texture>()
  const textureTint = new THREE.Color('#ffffff')
  const families: Array<{ targets: THREE.MeshStandardMaterial[]; textures: TextureSet }> = [
    { targets: [materials.darkStone, materials.oldStone, materials.carvedStone, ...materials.stoneVariants], textures: config.stone },
    { targets: [materials.floor, ...materials.floorVariants], textures: config.floor },
    { targets: [materials.metal], textures: config.metal },
  ]

  async function applyMap(
    targets: THREE.MeshStandardMaterial[],
    property: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap',
    path: string | undefined,
    repeat: readonly [number, number],
  ): Promise<void> {
    if (!path || signal.aborted) return
    const colorSpace = property === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
    const key = `${path}:${colorSpace}:${repeat.join(',')}`
    try {
      let request = cache.get(key)
      if (!request) {
        const url = `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`
        request = loader.loadAsync(url).then((texture) => {
          texture.colorSpace = colorSpace
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(...repeat)
          texture.needsUpdate = true
          loadedTextures.add(texture)
          return texture
        })
        cache.set(key, request)
      }
      const texture = await request
      if (signal.aborted) return
      for (const target of targets) {
        target[property] = texture
        if (property === 'map') target.color.lerp(textureTint, 0.78)
        target.needsUpdate = true
      }
    } catch (error) {
      if (!signal.aborted) console.warn(`Keeping material fallback for ${path}`, error)
    }
  }

  const ready = Promise.all(families.flatMap(({ targets, textures }) => {
    const repeat = textures.repeat ?? [1, 1]
    return [
      applyMap(targets, 'map', textures.color, repeat),
      applyMap(targets, 'normalMap', textures.normal, repeat),
      applyMap(targets, 'roughnessMap', textures.roughness, repeat),
      applyMap(targets, 'aoMap', textures.ao, repeat),
    ]
  })).then(() => {
    if (signal.aborted) loadedTextures.forEach((texture) => texture.dispose())
  })

  return { materials, ready }
}
