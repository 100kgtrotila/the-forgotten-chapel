import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

for (const id of ['lucy_angel', 'large_iron_gate']) {
  test(`${id} ships real indexed geometry and all local glTF dependencies`, () => {
    const folder = new URL(`../public/models/${id}/`, import.meta.url)
    const model = JSON.parse(readFileSync(new URL(`${id}.gltf`, folder), 'utf8'))
    assert.equal(model.asset.version, '2.0')
    let triangles = 0
    for (const mesh of model.meshes) {
      for (const primitive of mesh.primitives) {
        const positions = model.accessors[primitive.attributes.POSITION]
        assert.ok(positions.count > 100)
        triangles += model.accessors[primitive.indices].count / 3
      }
    }
    assert.ok(triangles > 10000)
    for (const buffer of model.buffers) {
      assert.ok(!buffer.uri.includes('..') && !buffer.uri.includes('://'))
      assert.equal(readFileSync(new URL(buffer.uri, folder)).length, buffer.byteLength)
    }
    for (const image of model.images ?? []) {
      const bytes = readFileSync(new URL(image.uri, folder))
      assert.equal(bytes.readUInt16BE(0), 0xffd8)
      let offset = 2
      let dimensionFound = false
      while (offset < bytes.length - 10) {
        const marker = bytes.readUInt16BE(offset)
        const length = bytes.readUInt16BE(offset + 2)
        if ([0xffc0, 0xffc1, 0xffc2].includes(marker)) {
          assert.ok(bytes.readUInt16BE(offset + 5) <= 2048)
          assert.ok(bytes.readUInt16BE(offset + 7) <= 2048)
          dimensionFound = true
          break
        }
        offset += length + 2
      }
      assert.ok(dimensionFound, 'JPEG must contain valid image dimensions')
    }
    assert.ok(model.materials.every((material: { pbrMetallicRoughness?: unknown }) => material.pbrMetallicRoughness))
  })
}
