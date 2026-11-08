import * as THREE from 'three'

export interface PavingTile {
  position: readonly [number, number, number]
  angle: number
  materialIndex: number
}

export function createPaving(geometry: THREE.BufferGeometry, materials: THREE.Material[], tiles: PavingTile[], castShadow: boolean): THREE.InstancedMesh[] {
  const transform = new THREE.Object3D()
  return materials.flatMap((material, materialIndex) => {
    const matching = tiles.filter((tile) => tile.materialIndex === materialIndex)
    if (matching.length === 0) return []
    const mesh = new THREE.InstancedMesh(geometry, material, matching.length)
    matching.forEach((tile, index) => {
      transform.position.set(...tile.position)
      transform.rotation.y = tile.angle
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    return [mesh]
  })
}
