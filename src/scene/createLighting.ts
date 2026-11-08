import * as THREE from 'three'

export const CANDLE_BASE_INTENSITY = 4.2

export interface ChapelLighting {
  candleLights: THREE.PointLight[]
}

export function createLighting(scene: THREE.Scene, candlePositions: THREE.Vector3[]): ChapelLighting {
  const fill = new THREE.HemisphereLight('#91a3bb', '#303025', 1.4)
  const moon = new THREE.DirectionalLight('#b7c9e2', 3.3)
  moon.position.set(-7, 12, 5)
  moon.target.position.set(0, 1.6, -1)
  moon.castShadow = true
  moon.shadow.mapSize.set(1024, 1024)
  moon.shadow.camera.left = -9
  moon.shadow.camera.right = 9
  moon.shadow.camera.top = 9
  moon.shadow.camera.bottom = -9
  moon.shadow.camera.near = 1
  moon.shadow.camera.far = 28
  moon.shadow.bias = -0.0001
  moon.shadow.normalBias = 0.018
  scene.add(fill, moon, moon.target)

  const candleLights = candlePositions.map((position) => {
    const light = new THREE.PointLight('#ffb66a', CANDLE_BASE_INTENSITY, 5.2, 2)
    light.position.copy(position)
    scene.add(light)
    return light
  })

  return { candleLights }
}
