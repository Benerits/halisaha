/**
 * Kenney GLB yükleyici. İki tuzak:
 *  1) Kitler Y-up, sahnemiz Z-up → fitModel dönüştürür.
 *  2) mini-characters RIGGED (SkinnedMesh) → normal clone() bozar, SkeletonUtils şart.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js'

const loader = new GLTFLoader()

function load(url: string): Promise<THREE.Group | null> {
  return new Promise(res => {
    loader.load(url, g => res(g.scene as THREE.Group), undefined, () => res(null))
  })
}

/** Y-up kit modelini Z-up sahneye çevirir, hedef yüksekliğe ölçekler, yere oturtur. */
export function fitModel(proto: THREE.Group, targetH: number): THREE.Group {
  const g = proto.clone(true)
  const wrap = new THREE.Group()
  g.rotation.x = Math.PI / 2          // Y-up → Z-up
  wrap.add(g)
  wrap.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(wrap)
  const h = Math.max(0.001, b.max.z - b.min.z)
  const s = targetH / h
  wrap.scale.setScalar(s)
  wrap.updateMatrixWorld(true)
  const b2 = new THREE.Box3().setFromObject(wrap)
  g.position.z -= b2.min.z / s        // tabanı z=0'a getir
  g.position.x -= (b2.min.x + b2.max.x) / 2 / s
  g.position.y -= (b2.min.y + b2.max.y) / 2 / s
  wrap.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  return wrap
}

/** RIGGED karakter kopyası — SkeletonUtils şart (normal clone iskeleti paylaşır → bozuk görünür). */
export function fitCharacter(proto: THREE.Group, targetH: number): THREE.Group {
  const g = skeletonClone(proto) as THREE.Group
  const wrap = new THREE.Group()
  g.rotation.x = Math.PI / 2
  wrap.add(g)
  wrap.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(wrap)
  const h = Math.max(0.001, b.max.z - b.min.z)
  const s = targetH / h
  wrap.scale.setScalar(s)
  wrap.updateMatrixWorld(true)
  const b2 = new THREE.Box3().setFromObject(wrap)
  g.position.z -= b2.min.z / s
  wrap.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true })
  return wrap
}

export interface Kit {
  chars: THREE.Group[]
  trees: THREE.Group[]
  cars: THREE.Group[]
  buildings: THREE.Group[]
  fence: THREE.Group | null
  planter: THREE.Group | null
  roads: { straight: THREE.Group | null; tee: THREE.Group | null; bend: THREE.Group | null; end: THREE.Group | null }
}

/** Yol karosu: yüksekliğe değil TABAN GENİŞLİĞİNE göre ölçekle (düz parçalar için fitModel yanlış) */
export function fitTile(proto: THREE.Group, targetW: number): THREE.Group {
  const g = proto.clone(true)
  const wrap = new THREE.Group()
  g.rotation.x = Math.PI / 2
  wrap.add(g)
  wrap.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(wrap)
  const w = Math.max(0.001, b.max.x - b.min.x)
  const s = targetW / w
  wrap.scale.setScalar(s)
  wrap.updateMatrixWorld(true)
  const b2 = new THREE.Box3().setFromObject(wrap)
  g.position.z -= b2.min.z / s
  g.position.x -= (b2.min.x + b2.max.x) / 2 / s
  g.position.y -= (b2.min.y + b2.max.y) / 2 / s
  wrap.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true })
  return wrap
}

/** Tembel yükleme — sahne bunlarsız da ayakta (prosedürel yedek devreye girer). */
export async function loadKit(): Promise<Kit> {
  const B = '/kenney'
  const names = {
    chars: ['character-male-a', 'character-male-b', 'character-male-c', 'character-male-d', 'character-female-a', 'character-female-b'],
    trees: ['tree-large', 'tree-small'],
    cars: ['sedan', 'suv', 'van', 'taxi', 'hatchback-sports', 'delivery'],
    buildings: ['building-a', 'building-c', 'building-e', 'building-g'],
    homes: ['building-type-a', 'building-type-e', 'building-type-l'],
  }
  const [chars, trees, cars, buildings, homes, fence, planter, rStraight, rTee, rBend, rEnd] = await Promise.all([
    Promise.all(names.chars.map(n => load(`${B}/chars/${n}.glb`))),
    Promise.all(names.trees.map(n => load(`${B}/props/${n}.glb`))),
    Promise.all(names.cars.map(n => load(`${B}/cars/${n}.glb`))),
    Promise.all(names.buildings.map(n => load(`${B}/buildings/${n}.glb`))),
    Promise.all(names.homes.map(n => load(`${B}/homes/${n}.glb`))),
    load(`${B}/props/fence-low.glb`),
    load(`${B}/props/planter.glb`),
    load(`${B}/roads/road-straight.glb`),
    load(`${B}/roads/road-intersection.glb`),
    load(`${B}/roads/road-bend-sidewalk.glb`),
    load(`${B}/roads/road-end-round.glb`),
  ])
  const ok = <T,>(a: (T | null)[]) => a.filter((x): x is T => !!x)
  return { chars: ok(chars), trees: ok(trees), cars: ok(cars), buildings: [...ok(buildings), ...ok(homes)], fence, planter,
    roads: { straight: rStraight, tee: rTee, bend: rBend, end: rEnd } }
}
