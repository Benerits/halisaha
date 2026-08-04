/**
 * İzometrik 3D dünya — halı saha tesisi.
 * Kamera BenelOil'in kanıtlanmış kurulumu (ortografik ~24°).
 * Çevre Kenney kitleriyle giydirilir; kit inmezse prosedürel yedek devrede kalır.
 */
import * as THREE from 'three'
import { loadKit, fitModel, fitCharacter, fitTile, type Kit } from './models'
import { PARCEL_COLS, PARCEL_ROWS, PARCEL_W, PARCEL_D, parcelKey, type BuildKind } from './state'

export const PITCH_W = 13
export const PITCH_D = 8
const PITCH_Y = -3.2

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c })

function box(w: number, d: number, h: number, c: number, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), lam(c))
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true
  parent.add(m); return m
}

interface Ply { g: THREE.Group; team: 0 | 1; hx: number; hy: number; sp: number; cd: number; ang: number }

export class World {
  scene = new THREE.Scene()
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  private kit: Kit | null = null
  private players: Ply[] = []
  private ball!: THREE.Mesh
  private bvx = 0; private bvy = 0
  private lightMats: THREE.MeshBasicMaterial[] = []
  private beams: THREE.Mesh[] = []
  private zoom = 27
  private target = new THREE.Vector3(-1, 2.5, 0)
  private readonly camOffset = new THREE.Vector3(22, -44, 22)
  private matchGroup = new THREE.Group()
  private parkedCars: THREE.Group[] = []
  /** yoldan akan araçlar */
  private traffic: { g: THREE.Group; sp: number; dir: 1 | -1; axis: 'x' | 'y' }[] = []
  /** maça yürüyen oyuncular (otoparktan sahaya) */
  private walkers: { g: THREE.Group; t: number; from: THREE.Vector3; to: THREE.Vector3 }[] = []
  private billboards: THREE.Group[] = []
  private signBoard: THREE.Group | null = null
  /** arsa ızgarası: tıklanabilir zeminler */
  private parcelTiles = new Map<string, THREE.Mesh>()
  private parcelBuilds = new Map<string, THREE.Group>()
  private ray = new THREE.Raycaster()

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0xa8dcef)
    this.scene.fog = new THREE.Fog(0xa8dcef, 78, 165)
    const a = innerWidth / innerHeight
    this.camera = new THREE.OrthographicCamera(-this.zoom * a / 2, this.zoom * a / 2, this.zoom / 2, -this.zoom / 2, -120, 220)
    this.camera.up.set(0, 0, 1)
    this.camera.position.copy(this.target).add(this.camOffset)
    this.camera.lookAt(this.target.x, this.target.y, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.28

    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0xa9b39a, 0.78)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.95)
    this.sun.position.set(16, -20, 30)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const c = this.sun.shadow.camera as THREE.OrthographicCamera
    c.left = -38; c.right = 38; c.top = 38; c.bottom = -38; c.near = 1; c.far = 100
    this.scene.add(this.sun)
    this.scene.add(this.matchGroup)

    this.buildGround()
    this.buildPitch(0, PITCH_Y)
    this.buildClubhouse()
    this.buildParking()
    this.buildStreet()
    this.spawnPlayers()
    this.buildParcelGrid()

    loadKit().then(k => { this.kit = k; this.buildRoadNetwork(); this.dressScene() })
    addEventListener('resize', () => this.onResize())
  }

  onResize() {
    const a = innerWidth / innerHeight
    this.camera.left = -this.zoom * a / 2; this.camera.right = this.zoom * a / 2
    this.camera.top = this.zoom / 2; this.camera.bottom = -this.zoom / 2
    this.camera.updateProjectionMatrix()
    this.applyCam()
    this.renderer.setSize(innerWidth, innerHeight)
  }

  private buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), lam(0x7fa05e))
    g.receiveShadow = true; this.scene.add(g)
    // AVLU: yalnız giriş parseli (1,0) beton — kalan her yer çimen
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 9.0), lam(0xb6b0a1))
    pad.position.set(0, 6.9, 0.035); pad.receiveShadow = true; this.scene.add(pad)
    // yürüyüş yolu (avlu → saha)
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), lam(0xc9c3b4))
    walk.position.set(0, 1.2, 0.036); this.scene.add(walk)
  }

  /** Halı saha dokusu: çizgiler+şeritler TEK canvas'a çizilir → z-fighting imkânsız */
  private pitchTexture(w: number, d: number): THREE.CanvasTexture {
    const S = 96 // birim başına piksel yoğunluğu
    const cv = document.createElement('canvas')
    cv.width = Math.round(w * S); cv.height = Math.round(d * S)
    const x = cv.getContext('2d')!
    const px = (u: number) => u * S
    // çim şeritleri
    const bands = 8
    for (let i = 0; i < bands; i++) {
      x.fillStyle = i % 2 ? '#47a055' : '#3c8d49'
      x.fillRect((cv.width / bands) * i, 0, cv.width / bands + 1, cv.height)
    }
    // çizgiler
    x.strokeStyle = '#f4f7f2'; x.lineWidth = px(0.12); x.lineCap = 'square'
    const m = px(0.45)
    x.strokeRect(m, m, cv.width - m * 2, cv.height - m * 2)          // dış çizgi
    x.beginPath(); x.moveTo(cv.width / 2, m); x.lineTo(cv.width / 2, cv.height - m); x.stroke() // orta
    x.beginPath(); x.arc(cv.width / 2, cv.height / 2, px(1.4), 0, Math.PI * 2); x.stroke()      // orta yuvarlak
    x.beginPath(); x.arc(cv.width / 2, cv.height / 2, px(0.14), 0, Math.PI * 2); x.fillStyle = '#f4f7f2'; x.fill()
    // ceza sahaları
    const boxW = px(2.0), boxH = px(3.6)
    x.strokeRect(m, cv.height / 2 - boxH / 2, boxW, boxH)
    x.strokeRect(cv.width - m - boxW, cv.height / 2 - boxH / 2, boxW, boxH)
    // kale ağzı
    const gaW = px(0.7), gaH = px(1.9)
    x.strokeRect(m, cv.height / 2 - gaH / 2, gaW, gaH)
    x.strokeRect(cv.width - m - gaW, cv.height / 2 - gaH / 2, gaW, gaH)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }

  buildPitch(cx: number, cy: number) {
    const g = new THREE.Group()
    // kenar bandı (koyu çim)
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W + 1.1, PITCH_D + 1.1), lam(0x2a6e35))
    skirt.position.z = 0.02; skirt.receiveShadow = true; g.add(skirt)
    // ASIL SAHA — tek düzlem, tek doku
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_D),
      new THREE.MeshLambertMaterial({ map: this.pitchTexture(PITCH_W, PITCH_D) }))
    turf.position.z = 0.045; turf.receiveShadow = true; g.add(turf)
    // kaleler — direk + üst direk + file
    for (const sg of [-1, 1]) {
      const gx = sg * (PITCH_W / 2 - 0.3)
      for (const py of [-1.3, 1.3]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8), lam(0xfaf9f6))
        post.rotation.x = Math.PI / 2; post.position.set(gx, py, 0.8); post.castShadow = true; g.add(post)
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), lam(0xfaf9f6))
      bar.position.set(gx, 0, 1.6); bar.castShadow = true; g.add(bar)
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xeaf0f2, transparent: true, opacity: 0.3, side: THREE.DoubleSide }))
      net.rotation.y = Math.PI / 2; net.position.set(gx + sg * 0.55, 0, 0.8); g.add(net)
    }
    g.position.set(cx, cy, 0)
    this.scene.add(g)

    // projektörler
    for (const [px, py] of [[-PITCH_W / 2 - 1.2, PITCH_D / 2 + 1.2], [PITCH_W / 2 + 1.2, PITCH_D / 2 + 1.2],
                            [-PITCH_W / 2 - 1.2, -PITCH_D / 2 - 1.2], [PITCH_W / 2 + 1.2, -PITCH_D / 2 - 1.2]] as [number, number][]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 7, 8), lam(0x8d97a1))
      pole.rotation.x = Math.PI / 2; pole.position.set(cx + px, cy + py, 3.5); pole.castShadow = true; this.scene.add(pole)
      const glow = new THREE.MeshBasicMaterial({ color: 0x3a4148 })
      for (const off of [-0.32, 0.32]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.16), glow)
        lamp.position.set(cx + px + off, cy + py - 0.2, 6.9); this.scene.add(lamp)
      }
      this.lightMats.push(glow)
      // ışık huzmesi (gece görünür)
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      const beam = new THREE.Mesh(new THREE.ConeGeometry(3.6, 7, 12, 1, true), beamMat)
      beam.position.set(cx + px * 0.72, cy + py * 0.72, 3.5)
      beam.rotation.x = Math.PI
      this.scene.add(beam); this.beams.push(beam)
    }
    return g
  }

  /** kulüp binası: kantin + soyunma + idare */
  private buildClubhouse() {
    const g = new THREE.Group()
    box(8, 4.4, 2.8, 0xf2ece0, 0, 0, 1.4, g)
    box(8.4, 4.8, 0.3, 0x2f7a3c, 0, 0, 2.95, g)             // yeşil saçak (marka)
    box(8.4, 0.25, 0.5, 0x27a05a, 0, -2.3, 2.5, g)           // ön bant
    box(1.3, 0.14, 2.0, 0x33404a, -2.4, -2.24, 1.0, g)       // kapı
    for (const x of [-0.4, 1.2, 2.8]) box(1.3, 0.12, 1.0, 0xbfe6f2, x, -2.24, 1.7, g)
    // kantin tentesi + masalar
    box(3.2, 1.4, 0.12, 0x27a05a, 2.2, -3.1, 2.15, g)
    for (const [tx, ty] of [[1.2, -3.6], [3.2, -3.6]] as [number, number][]) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), lam(0xf7f4ec))
      top.rotation.x = Math.PI / 2; top.position.set(tx, ty, 0.72); top.castShadow = true; g.add(top)
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), lam(0xd8d2c4))
      leg.rotation.x = Math.PI / 2; leg.position.set(tx, ty, 0.35); g.add(leg)
      for (const [ox, oy] of [[-0.62, 0], [0.62, 0]] as [number, number][]) {
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.1), lam(0x27a05a))
        ch.position.set(tx + ox, ty + oy, 0.42); ch.castShadow = true; g.add(ch)
      }
    }
    // tabela
    const cvs = document.createElement('canvas'); cvs.width = 640; cvs.height = 160
    const ctx = cvs.getContext('2d')!
    ctx.fillStyle = '#1d7c45'; ctx.beginPath(); ctx.roundRect(0, 0, 640, 160, 22); ctx.fill()
    ctx.fillStyle = '#f7fbf4'; ctx.font = '800 74px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('HALI SAHA', 320, 62)
    ctx.font = '700 34px sans-serif'; ctx.fillStyle = '#bfe8cd'
    ctx.fillText('SALI 21:00 SENİNDİR', 320, 118)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true }))
    sign.position.set(0, -2.28, 3.5); sign.rotation.x = Math.PI / 2
    g.add(sign)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.0), lam(0x8d97a1))
    post.position.set(0, -2.28, 3.0); g.add(post)
    g.position.set(-14.5, 7.2, 0)
    this.scene.add(g)
    this.clubhouse = g
  }

  /** yazıhane (kulüp binası) tıklaması */
  private clubhouse: THREE.Group | null = null
  pickYazihane(clientX: number, clientY: number): boolean {
    if (!this.clubhouse) return false
    const nx = (clientX / innerWidth) * 2 - 1
    const ny = -(clientY / innerHeight) * 2 + 1
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera)
    return this.ray.intersectObject(this.clubhouse, true).length > 0
  }

  /** dünya noktası → ekran pikseli (pill konumlandırma) */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    return { x: (v.x + 1) / 2 * innerWidth, y: (-v.y + 1) / 2 * innerHeight }
  }

  private buildParking() {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(11, 7.5), lam(0x585f66))
    pad.position.set(14.5, 7.2, 0.04); pad.receiveShadow = true; this.scene.add(pad)
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 6.4), lam(0xe9e4d6))
      l.position.set(10.4 + i * 2.1, 7.2, 0.05); this.scene.add(l)
    }
  }

  private protoRoad = new THREE.Group()
  private nudgeT = 0
  private buildStreet() {
    // prosedürel yedek — Kenney yol kiti inince kaldırılıp karolarla değişir
    const road = new THREE.Mesh(new THREE.PlaneGeometry(340, 6), lam(0x4c535a))
    road.position.set(0, 17.5, 0.01); this.protoRoad.add(road)
    for (let i = -33; i <= 33; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), lam(0xeae5d7))
      d.position.set(i * 5, 17.5, 0.02); this.protoRoad.add(d)
    }
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(340, 1.2), lam(0xa9a294))
    kerb.position.set(0, 14.4, 0.015); this.protoRoad.add(kerb)
    this.scene.add(this.protoRoad)
  }

  /** KENNEY YOL AĞI: ana cadde + iki dikey sokak (T kavşaklı) — yolun sonu görünmez */
  private buildRoadNetwork() {
    const k = this.kit!
    if (!k.roads.straight) return
    this.scene.remove(this.protoRoad)
    const T = 6 // karo boyu
    const put = (proto: THREE.Group, x: number, y: number, rot: number) => {
      const t = fitTile(proto, T)
      t.position.set(x, y, 0.005)
      t.rotation.z = rot
      this.scene.add(t)
    }
    const VX = [-28, 28] // dikey sokakların x'i
    // ana cadde (yatay, y=17.5)
    for (let x = -168; x <= 168; x += T) {
      if (VX.includes(x) && k.roads.tee) { put(k.roads.tee, x, 17.5, Math.PI) ; continue }
      put(k.roads.straight, x, 17.5, 0)
    }
    // dikey sokaklar: caddeden güneye
    for (const vx of VX) {
      for (let y = 17.5 - T; y >= -160; y -= T) {
        put(k.roads.straight, vx, y, Math.PI / 2)
      }
    }
  }

  /** parsel (c,r) → dünya merkezi. TESİS BU IZGARAYA OTURUR: saha=(1,1), kulüp=(0,0), avlu=(1,0), otopark=(2,0) */
  parcelCenter(c: number, r: number): [number, number] {
    return [(c - 1) * (PARCEL_W + 0.5), 6.9 - r * (PARCEL_D + 0.5)]
  }

  /** ARSA IZGARASI — tüm tesis alanı; sahipsiz parsel DÜMDÜZ ÇİMEN */
  private buildParcelGrid() {
    for (let c = 0; c < PARCEL_COLS; c++) {
      for (let r = 0; r < PARCEL_ROWS; r++) {
        const [x, y] = this.parcelCenter(c, r)
        const m = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_W, PARCEL_D),
          new THREE.MeshLambertMaterial({ color: 0x7fa05e }))
        m.position.set(x, y, 0.02)
        m.receiveShadow = true
        m.userData = { c, r }
        this.scene.add(m)
        this.parcelTiles.set(parcelKey(c, r), m)
        // ince parsel sınırı — arazinin bölünmüş olduğu okunur ama bağırmaz
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(PARCEL_W, PARCEL_D)),
          new THREE.LineBasicMaterial({ color: 0xf6f2e2, transparent: true, opacity: 0.32 }))
        edge.position.set(x, y, 0.03)
        this.scene.add(edge)
      }
    }
  }

  /** sahipli parsel köşe kazıkları — 'burası senin' okunur */
  private stakes = new Map<string, THREE.Group>()
  private markOwned(key: string, x: number, y: number) {
    if (this.stakes.has(key)) return
    const g = new THREE.Group()
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.62, 6), lam(0xf3efe2))
      post.rotation.x = Math.PI / 2
      post.position.set(sx * (PARCEL_W / 2 - 0.35), sy * (PARCEL_D / 2 - 0.35), 0.31)
      post.castShadow = true; g.add(post)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 6), lam(0x27a05a))
      cap.rotation.x = Math.PI / 2
      cap.position.set(sx * (PARCEL_W / 2 - 0.35), sy * (PARCEL_D / 2 - 0.35), 0.65)
      g.add(cap)
    }
    g.position.set(x, y, 0)
    this.scene.add(g)
    this.stakes.set(key, g)
  }

  /** arsa durumlarını güncelle: sahipli = biçilmiş çim + köşe kazıkları; boş = dümdüz çimen */
  syncParcels(owned: string[], builds: { key: string; kind: BuildKind }[]) {
    for (const [key, tile] of this.parcelTiles) {
      const mat = tile.material as THREE.MeshLambertMaterial
      if (owned.includes(key)) {
        mat.color.setHex(0x8cab68)  // biçilmiş, bakımlı çim
        this.markOwned(key, tile.position.x, tile.position.y)
      } else {
        mat.color.setHex(0x7fa05e)  // zeminle aynı — dümdüz çimen
      }
    }
    for (const b of builds) {
      if (this.parcelBuilds.has(b.key)) continue
      const tile = this.parcelTiles.get(b.key)
      if (!tile) continue
      const g = this.makeBuild(b.kind, tile.position.x, tile.position.y)
      this.parcelBuilds.set(b.key, g)
    }
  }

  private makeBuild(kind: BuildKind, x: number, y: number): THREE.Group {
    const g = new THREE.Group()
    if (kind === 'pitch' || kind === 'mini') {
      const w = kind === 'pitch' ? PARCEL_W - 0.8 : PARCEL_W * 0.62
      const d = kind === 'pitch' ? PARCEL_D - 0.8 : PARCEL_D * 0.62
      const skirt2 = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, d + 0.5), lam(0x2a6e35))
      skirt2.position.z = 0.055; g.add(skirt2)
      const turf = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
        new THREE.MeshLambertMaterial({ map: this.pitchTexture(w, d) }))
      turf.position.z = 0.075; turf.receiveShadow = true; g.add(turf)
      for (const sgn of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, d * 0.34, 6), lam(0xfaf9f6))
        bar.position.set(sgn * (w / 2 - 0.2), 0, 0.6); g.add(bar)
      }
    } else if (kind === 'basket') {
      // turuncu saha + iki pota
      const court = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.4), lam(0xc97a3d))
      court.position.z = 0.06; court.receiveShadow = true; g.add(court)
      const line = (w: number, d: number, x: number, y: number) => {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xf4efe2)); l.position.set(x, y, 0.075); g.add(l)
      }
      line(10, 0.12, 0, 3.14); line(10, 0.12, 0, -3.14); line(0.12, 6.4, -4.94, 0); line(0.12, 6.4, 4.94, 0)
      line(0.12, 6.4, 0, 0)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.92, 20), lam(0xf4efe2))
      ring.position.z = 0.075; g.add(ring)
      for (const sgn of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), lam(0x8d97a1))
        pole.rotation.x = Math.PI / 2; pole.position.set(sgn * 5.4, 0, 1.3); pole.castShadow = true; g.add(pole)
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.9), lam(0xf7f4ec))
        board.position.set(sgn * 5.05, 0, 2.35); board.castShadow = true; g.add(board)
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 14), lam(0xd6633a))
        hoop.position.set(sgn * 4.7, 0, 2.05); g.add(hoop)
      }
    } else if (kind === 'voley') {
      // kum zemin + file
      const sand = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.6), lam(0xdcc492))
      sand.position.z = 0.06; sand.receiveShadow = true; g.add(sand)
      const line = (w: number, d: number, x: number, y: number) => {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xf7f2e4)); l.position.set(x, y, 0.075); g.add(l)
      }
      line(9, 0.1, 0, 2.74); line(9, 0.1, 0, -2.74); line(0.1, 5.6, -4.45, 0); line(0.1, 5.6, 4.45, 0)
      for (const sgn of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8), lam(0x8d97a1))
        pole.rotation.x = Math.PI / 2; pole.position.set(0, sgn * 2.9, 0.95); pole.castShadow = true; g.add(pole)
      }
      const net = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 5.8),
        new THREE.MeshLambertMaterial({ color: 0xeff3f4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
      net.rotation.x = Math.PI / 2; net.position.set(0, 0, 1.45); g.add(net)
    } else if (kind === 'parking') {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_W - 1, PARCEL_D - 1), lam(0x585f66))
      pad.position.z = 0.06; g.add(pad)
      for (let i = 0; i < 4; i++) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.09, PARCEL_D - 1.8), lam(0xe9e4d6))
        l.position.set(-2.4 + i * 1.6, 0, 0.07); g.add(l)
      }
      if (this.kit?.cars.length) {
        for (let i = 0; i < 2; i++) {
          const car = fitModel(this.kit.cars[i % this.kit.cars.length], 1.0)
          car.position.set(-1.6 + i * 1.6, 0, 0); car.rotation.z = Math.PI / 2; g.add(car)
        }
      }
    } else {
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_W - 1, PARCEL_D - 1), lam(0x6f9a55))
      lawn.position.z = 0.06; lawn.receiveShadow = true; g.add(lawn)
      if (this.kit?.trees.length) {
        for (const [tx, ty] of [[-2, 1], [1.6, -1.2], [0.2, 1.6]] as [number, number][]) {
          const t = fitModel(this.kit.trees[Math.floor(Math.random() * this.kit.trees.length)], 2.1)
          t.position.set(tx, ty, 0); g.add(t)
        }
      }
    }
    g.position.set(x, y, 0)
    this.scene.add(g)
    return g
  }

  /** ekran koordinatından arsa bul */
  pickParcel(clientX: number, clientY: number): { c: number; r: number } | null {
    const nx = (clientX / innerWidth) * 2 - 1
    const ny = -(clientY / innerHeight) * 2 + 1
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera)
    const hits = this.ray.intersectObjects([...this.parcelTiles.values()], false)
    if (!hits.length) return null
    const ud = hits[0].object.userData as { c: number; r: number }
    return { c: ud.c, r: ud.r }
  }

  /** prosedürel yedek oyuncular — kit inince Kenney karakterleriyle değişir */
  private spawnPlayers() {
    for (let i = 0; i < 12; i++) {
      const team = (i < 6 ? 0 : 1) as 0 | 1
      const wrap = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 4, 8), lam(team === 0 ? 0xd64545 : 0x2f6fed))
      body.rotation.x = Math.PI / 2; body.position.z = 0.33; body.castShadow = true
      wrap.add(body)
      const hx = (team === 0 ? -1 : 1) * (1.2 + (i % 6) * 0.85)
      const hy = PITCH_Y + ((i % 6) - 2.5) * 1.05
      wrap.position.set(hx, hy, 0)
      this.matchGroup.add(wrap)
      this.players.push({ g: wrap, team, hx, hy, sp: 2.9 + Math.random() * 1.2, cd: 0, ang: 0 })
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), lam(0xffffff))
    this.ball.position.set(0, PITCH_Y, 0.15); this.ball.castShadow = true
    this.matchGroup.add(this.ball)
  }

  /** kit indi → çevreyi giydir + oyuncuları Kenney karakterleriyle değiştir */
  private dressScene() {
    const k = this.kit!
    // OYUNCULAR: forma renkli kasket + gerçek karakter modeli
    if (k.chars.length) {
      this.players.forEach((p, i) => {
        p.g.clear()
        const proto = k.chars[i % k.chars.length]
        const fig = fitCharacter(proto, 0.78)
        // TAKIM İŞARETİ: ayak altı renkli halka — izometrikten net okunur
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.28, 16),
          new THREE.MeshBasicMaterial({ color: p.team === 0 ? 0xe23b3b : 0x2f6fed,
            transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
        ring.position.z = 0.035
        p.g.add(ring)
        // forma: omuz hizasında ince bant
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.1, 10),
          lam(p.team === 0 ? 0xe23b3b : 0x2f6fed))
        band.rotation.x = Math.PI / 2; band.position.z = 0.46
        fig.add(band)
        p.g.add(fig)
      })
    }
    // AĞAÇLAR — tesis çeperi
    if (k.trees.length) {
      const spots: [number, number, number][] = [
        [-23.5, 13, 2.6], [-11, 13, 2.2], [8, 13, 2.6], [12, -19.5, 2.4],
        [-24.5, -12, 2.2], [-4, -19.6, 2.5], [6, -19.6, 2.2], [24, 2, 2.6],
        [-24.5, 4, 2.3], [23, 13, 2.8], [-2, -19.8, 2.4],
      ]
      for (const [x, y, h] of spots) {
        const t = fitModel(k.trees[Math.floor(Math.random() * k.trees.length)], h)
        t.position.set(x, y, 0); t.rotation.z = Math.random() * Math.PI
        this.scene.add(t)
      }
    }
    // UZAK YOL DOKUSU: uzakta seyrek ağaçlar — yol boşlukta yüzmesin
    if (k.trees.length) {
      for (let i = 0; i < 16; i++) {
        const x = -160 + i * 21 + (i % 3) * 4
        if (Math.abs(x) < 42) continue // merkez zaten dolu
        const t = fitModel(k.trees[i % k.trees.length], 2.2 + (i % 3) * 0.5)
        t.position.set(x, 12.6 + (i % 2) * 9, 0); this.scene.add(t)
        const t2 = fitModel(k.trees[(i + 1) % k.trees.length], 2.0 + (i % 2) * 0.6)
        t2.position.set(x + 8, 24 + (i % 3) * 3, 0); this.scene.add(t2)
      }
    }
    // BİNALAR — mahalle dokusu (yolun ötesi + yanlar)
    if (k.buildings.length) {
      const spots: [number, number, number][] = [
        [-34, 30, 6], [-22, 31, 8], [-8, 30.5, 5.5], [6, 31, 7], [20, 30, 6], [33, 31, 8.5],
        [37.5, 8, 6.5], [38.5, -8, 5.5], [-37.5, -8, 6], [-38.5, 8, 7], [-37, -22, 5.5], [36.5, -22, 6.5],
      ]
      spots.forEach(([x, y, h], i) => {
        const b = fitModel(k.buildings[i % k.buildings.length], h)
        b.position.set(x, y, 0)
        b.rotation.z = (i % 4) * Math.PI / 2
        this.scene.add(b)
        // ÇEVRE DÜZENLEMESİ: bahçe çimi + kaldırım + ağaç/çalı
        const inward = y > 10 ? -1 : y < -10 ? 1 : 0
        const gx = inward !== 0 ? x : x + (x > 0 ? -5.5 : 5.5)
        const gy = inward !== 0 ? y + inward * 5.5 : y
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 5), lam(0x6f9a55))
        lawn.position.set(gx, gy, 0.015); lawn.receiveShadow = true; this.scene.add(lawn)
        const path = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 5), lam(0xc4bdae))
        path.position.set(gx, gy, 0.02); this.scene.add(path)
        if (k.trees.length) {
          for (const ox of [-3.1, 3.1]) {
            const t = fitModel(k.trees[(i + 1) % k.trees.length], 2.0 + (i % 2) * 0.5)
            t.position.set(gx + ox, gy + (i % 2 ? 0.8 : -0.8), 0); this.scene.add(t)
          }
        }
        if (k.planter) {
          const pl = fitModel(k.planter, 0.65)
          pl.position.set(gx + 1.4, gy - 1.9, 0); this.scene.add(pl)
        }
      })
    }
    // ARABALAR — otoparkta
    if (k.cars.length) {
      const slots: [number, number][] = [[11.5, 7.2], [13.6, 7.2], [15.7, 7.2]]
      slots.forEach(([x, y], i) => {
        const car = fitModel(k.cars[i % k.cars.length], 1.0)
        car.position.set(x, y, 0); car.rotation.z = Math.PI / 2
        this.scene.add(car); this.parkedCars.push(car)
      })
      // sokakta park etmiş birkaç araç
      for (let i = 0; i < 3; i++) {
        const car = fitModel(k.cars[(i + 2) % k.cars.length], 1.0)
        car.position.set(-12 + i * 11, 14.9, 0)
        this.scene.add(car)
      }
    }
    // AKAN TRAFİK — yol canlı olsun
    if (k.cars.length) {
      for (let i = 0; i < 10; i++) {
        const dir: 1 | -1 = i % 2 ? 1 : -1
        const car = fitModel(k.cars[i % k.cars.length], 1.0)
        car.position.set(-105 + i * 22, dir > 0 ? 16.4 : 18.6, 0)
        car.rotation.z = dir > 0 ? Math.PI / 2 : -Math.PI / 2
        this.scene.add(car)
        this.traffic.push({ g: car, sp: 3.5 + Math.random() * 2.5, dir, axis: 'x' })
      }
      // dikey sokak trafiği
      for (let i = 0; i < 4; i++) {
        const dir: 1 | -1 = i % 2 ? 1 : -1
        const vx = i < 2 ? -28 : 28
        const car = fitModel(k.cars[(i + 3) % k.cars.length], 1.0)
        car.position.set(vx + (dir > 0 ? 1.1 : -1.1), -80 + i * 35, 0)
        car.rotation.z = dir > 0 ? Math.PI : 0
        this.scene.add(car)
        this.traffic.push({ g: car, sp: 3 + Math.random() * 2, dir, axis: 'y' })
      }
    }
    // SAKSILAR — giriş süsü
    if (k.planter) {
      for (const [x, y] of [[-4.2, 3.2], [4.2, 3.2], [-5.2, 10.6], [5.2, 10.6]] as [number, number][]) {
        const p = fitModel(k.planter, 0.8); p.position.set(x, y, 0); this.scene.add(p)
      }
    }
  }

  /** maç simülasyonu — izometrikten "futbol" gibi okunur */
  updateMatch(dt: number, active: boolean) {
    this.matchGroup.visible = active
    for (const c of this.parkedCars) c.visible = true
    if (!active) return
    const b = this.ball.position
    b.x += this.bvx * dt; b.y += this.bvy * dt
    this.bvx *= 0.982; this.bvy *= 0.982
    const lx = PITCH_W / 2 - 0.4, ly = PITCH_D / 2 - 0.4
    if (Math.abs(b.x) > lx) { this.bvx *= -0.72; b.x = Math.sign(b.x) * lx }
    if (Math.abs(b.y - PITCH_Y) > ly) { this.bvy *= -0.72; b.y = PITCH_Y + Math.sign(b.y - PITCH_Y) * ly }
    // top durduysa ARALIKLI dürt (her karede değil — titreme kaynağıydı)
    this.nudgeT -= dt
    if (Math.hypot(this.bvx, this.bvy) < 0.25 && this.nudgeT <= 0) {
      this.nudgeT = 0.9
      this.bvx += (Math.random() - 0.5) * 2.4; this.bvy += (Math.random() - 0.5) * 2.4
    }
    const near = [...this.players].sort((p, q) =>
      (p.g.position.x - b.x) ** 2 + (p.g.position.y - b.y) ** 2 -
      ((q.g.position.x - b.x) ** 2 + (q.g.position.y - b.y) ** 2))
    const now = performance.now()
    near.forEach((p, idx) => {
      p.cd = Math.max(0, p.cd - dt)
      const chase = idx < 3
      const tx = chase ? b.x : p.hx + Math.sin(now / 1500 + p.hy * 2) * 1.1
      const ty = chase ? b.y : p.hy + Math.cos(now / 1700 + p.hx * 2) * 0.9
      const dx = tx - p.g.position.x, dy = ty - p.g.position.y
      const d = Math.hypot(dx, dy)
      // ÖLÜ BÖLGE: hedefin dibindeyken kıpırdama — titremenin ana kaynağı buydu
      if (d > 0.18) {
        const spd = chase ? p.sp : p.sp * 0.42
        const step = Math.min(spd * dt, d)   // AŞMA YOK: hedefi geçip geri salınmaz
        p.g.position.x += (dx / d) * step
        p.g.position.y += (dy / d) * step
        // dönüş YUMUŞAK: hedef açıya kısa yoldan kayarak dön (anlık zıplama yok)
        const want = Math.atan2(dy, dx) - Math.PI / 2
        let diff = want - p.ang
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        p.ang += diff * Math.min(1, 10 * dt)
        p.g.rotation.z = p.ang
      }
      // tekme: bekleme süresiyle — iki oyuncu topu aralarında zıplatamaz
      if (chase && d < 0.5 && p.cd === 0) {
        p.cd = 0.7
        const gx = p.team === 0 ? PITCH_W / 2 : -PITCH_W / 2
        const ax = gx - b.x, ay = (PITCH_Y + (Math.random() - 0.5) * 2.4) - b.y
        const an = Math.hypot(ax, ay) || 1
        const pw = 5 + Math.random() * 6
        this.bvx = (ax / an) * pw; this.bvy = (ay / an) * pw
      }
    })
    this.ball.position.z = 0.15 + Math.abs(Math.sin(now / 200)) * 0.07
  }

  /** yol trafiği + maça yürüyen oyuncular — sahne hep canlı */
  updateAmbient(dt: number) {
    for (const t of this.traffic) {
      if (t.axis === 'x') {
        t.g.position.x += t.sp * t.dir * dt
        if (t.dir > 0 && t.g.position.x > 115) t.g.position.x = -115
        if (t.dir < 0 && t.g.position.x < -115) t.g.position.x = 115
      } else {
        t.g.position.y += t.sp * t.dir * dt
        if (t.dir > 0 && t.g.position.y > 12) t.g.position.y = -115
        if (t.dir < 0 && t.g.position.y < -115) t.g.position.y = 12
      }
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i]
      w.t += dt * 0.32
      if (w.t >= 1) { this.scene.remove(w.g); this.walkers.splice(i, 1); continue }
      w.g.position.lerpVectors(w.from, w.to, w.t)
      w.g.position.z = 0
      const d = new THREE.Vector3().subVectors(w.to, w.from)
      w.g.rotation.z = Math.atan2(d.y, d.x) - Math.PI / 2
    }
  }

  /** maç başlarken: otoparktan sahaya oyuncular yürüsün */
  sendArrivals(n = 4) {
    const k = this.kit
    if (!k?.chars.length) return
    for (let i = 0; i < n; i++) {
      const fig = fitCharacter(k.chars[Math.floor(Math.random() * k.chars.length)], 0.78)
      const from = new THREE.Vector3(11.5 + Math.random() * 4, 6.6 + Math.random() * 1.4, 0)
      const to = new THREE.Vector3(PITCH_W / 2 + 1.4, PITCH_Y + (Math.random() - 0.5) * 3, 0)
      fig.position.copy(from)
      this.scene.add(fig)
      this.walkers.push({ g: fig, t: -i * 0.12, from, to })
    }
  }

  /** REKLAM PANOSU — saha kenarına, satın alınınca görünür */
  setBillboards(on: boolean) {
    if (on && this.billboards.length === 0) {
      const texts = ['BENEROİL', 'MAHALLE MARKET', 'ÖZ SANAYİ']
      texts.forEach((txt, i) => {
        const g = new THREE.Group()
        const cvs = document.createElement('canvas'); cvs.width = 420; cvs.height = 120
        const ctx = cvs.getContext('2d')!
        const bg = ['#d64545', '#2f6fed', '#f2b53c'][i]
        ctx.fillStyle = bg; ctx.fillRect(0, 0, 420, 120)
        ctx.fillStyle = '#fff'; ctx.font = '800 46px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(txt, 210, 62)
        const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.05),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), side: THREE.DoubleSide }))
        p.position.z = 1.05; p.rotation.x = Math.PI / 2
        g.add(p)
        for (const ox of [-1.6, 1.6]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), lam(0x8d97a1))
          leg.rotation.x = Math.PI / 2; leg.position.set(ox, 0, 0.55); g.add(leg)
        }
        g.position.set(-4.2 + i * 4.4, PITCH_Y - PITCH_D / 2 - 1.5, 0)
        this.scene.add(g); this.billboards.push(g)
      })
    }
    for (const b of this.billboards) b.visible = on
  }

  /** YOL TABELASI — tesise yönlendiren büyük tabela */
  setRoadSign(on: boolean) {
    if (on && !this.signBoard) {
      const g = new THREE.Group()
      const cvs = document.createElement('canvas'); cvs.width = 340; cvs.height = 440
      const ctx = cvs.getContext('2d')!
      ctx.fillStyle = '#14532d'; ctx.beginPath(); ctx.roundRect(0, 0, 340, 440, 26); ctx.fill()
      ctx.fillStyle = '#f7fbf4'; ctx.font = '800 54px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('HALI', 170, 110); ctx.fillText('SAHA', 170, 175)
      ctx.fillStyle = '#8ec63f'; ctx.font = '800 34px sans-serif'
      ctx.fillText('7/24 AÇIK', 170, 250)
      ctx.fillStyle = '#f2b53c'; ctx.font = '800 30px sans-serif'
      ctx.fillText('REZERVASYON', 170, 320); ctx.fillText('ALINIR', 170, 360)
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.9),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), side: THREE.DoubleSide }))
      face.position.z = 4.4; face.rotation.x = Math.PI / 2
      g.add(face)
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4.6), lam(0x6f7d88))
      mast.position.z = 2.3; g.add(mast)
      g.position.set(-14.5, 12.4, 0)
      this.scene.add(g); this.signBoard = g
    }
    if (this.signBoard) this.signBoard.visible = on
  }

  setNight(n: number, lightsOn: boolean) {
    this.hemi.intensity = 0.72 - n * 0.42
    this.sun.intensity = 0.95 - n * 0.80
    const col = new THREE.Color().setHSL(0.56, 0.52, 0.74 - n * 0.6)
    this.scene.background = col
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color = col
    const on = lightsOn && n > 0.22
    for (const m of this.lightMats) m.color.setHex(on ? 0xfff6d2 : 0x3a4148)
    for (const bm of this.beams) (bm.material as THREE.MeshBasicMaterial).opacity = on ? 0.07 * n : 0
    if (on) { this.hemi.intensity += 0.30; this.sun.intensity += 0.12 }
  }

  zoomBy(f: number) {
    this.zoom = Math.max(12, Math.min(44, this.zoom * f))
    this.onResize()
  }

  /** kamerayı başlangıç görünümüne döndür */
  resetCam() {
    this.zoom = 27
    this.target.set(-1, 2.5, 0)
    this.onResize()
  }

  /** ekran sürüklemesini dünya kaydırmasına çevirir */
  pan(dxPx: number, dyPx: number) {
    const a = innerWidth / innerHeight
    const wPerPx = (this.zoom * a) / innerWidth
    const hPerPx = this.zoom / innerHeight
    // kameranın ekran sağ/yukarı eksenleri (dünya düzleminde)
    const fwd = new THREE.Vector3().subVectors(this.target, this.camera.position).setZ(0).normalize()
    // DİKKAT: ekran-sağı (fwd.y, -fwd.x) — önceki (-fwd.y, fwd.x) bunun tersiydi,
    // o yüzden yatay eksen dikeyle çelişiyordu ve pan hep 'ters' hissettiriyordu
    const right = new THREE.Vector3(fwd.y, -fwd.x, 0)
    const up = new THREE.Vector3(fwd.x, fwd.y, 0)
    this.target.addScaledVector(right, -dxPx * wPerPx)
    // izometrik kısaltma telafisi: yerdeki ileri-geri hareket ekranda sin(eğim) kadar
    // kısa görünür — bölmezsek dikey sürükleme 'ağır' kalır (ölçüldü: 90px → 37px)
    const sinElev = this.camOffset.z / this.camOffset.length()
    this.target.addScaledVector(up, (dyPx * hPerPx) / sinElev)
    this.target.x = Math.max(-45, Math.min(45, this.target.x))
    this.target.y = Math.max(-40, Math.min(40, this.target.y))
    this.applyCam()
  }

  private applyCam() {
    this.camera.position.copy(this.target).add(this.camOffset)
    this.camera.lookAt(this.target.x, this.target.y, 0)
  }

  render() { this.renderer.render(this.scene, this.camera) }
}
