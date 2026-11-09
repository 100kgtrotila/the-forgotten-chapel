export const SCENE_CONFIG = {
  background: '#0b1019',
  fog: { color: '#101722', density: 0.025 },
  camera: {
    fov: 45,
    near: 0.1,
    far: 90,
    framing: {
      sceneHalfWidth: 7.5,
      minDistance: 16,
      maxDistance: 34,
      direction: { x: 0.53, y: 0.35, z: 0.77 },
    },
  },
  controls: {
    target: { x: 0, y: 2.1, z: -0.6 },
    enableDamping: true,
    dampingFactor: 0.06,
    enablePan: false,
    minDistance: 6,
    maxDistance: 36,
    minPolarAngle: 0.12,
    maxPolarAngle: Math.PI * 0.49,
  },
}
