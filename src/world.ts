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

interface Ply { g: THREE.Group; team: 0 | 1; hx: number; hy: number; sp: number; cd: number; ang: number; entering?: boolean }

export type LocTheme = 'mahalle' | 'sanayi' | 'sahil'

export class World {
  private theme: LocTheme
  scene = new THREE.Scene()
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  private kit: Kit | null = null
  /** Kenney kitleri sahneye uygulandığında çözülür — boot maskesi bunu bekler (tavanlı). */
  kitReady: Promise<void> = Promise.resolve()
  // GECE PENCERE IŞIKLARI: evler + tesis binaları — setNight açar/kapar
  private windowGlows: THREE.Mesh[] = []
  private addWindowGlow(x: number, y: number, z: number, w = 1.5, h = 0.85) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false }))
    m.position.set(x, y, z); m.rotation.x = Math.PI / 2
    this.scene.add(m); this.windowGlows.push(m)
    return m
  }
  // SÜS ENVANTERİ: parsel alanına düşebilecek dekor (ağaç/şezlong/saksı). Oyuncu o parseli
  // sahiplenince pruneDecor kaldırır — yoksa kortun ortasında ağaç dikili kalıyordu.
  private decorItems: THREE.Object3D[] = []
  private ownedKeys = new Set<string>()
  private players: Ply[] = []
  private ball!: THREE.Mesh
  private bvx = 0; private bvy = 0
  private lightMats: THREE.MeshBasicMaterial[] = []
  private lampGlows: THREE.MeshBasicMaterial[] = []
  private beams: THREE.Mesh[] = []
  private zoom = 27
  private target = new THREE.Vector3(-1, 2.5, 0)
  private readonly camOffset = new THREE.Vector3(22, -44, 22)
  private matchGroup = new THREE.Group()
  private parkedCars: THREE.Group[] = []
  /** yoldan akan araçlar */
  private traffic: { g: THREE.Group; sp: number; dir: 1 | -1; axis: 'x' | 'y' }[] = []
  /** maça yürüyen oyuncular (otoparktan sahaya) */
  private walkers: { g: THREE.Group; seg: number; pts: THREE.Vector3[]; sp: number; delay: number }[] = []
  private billboards: THREE.Group[] = []
  private signBoard: THREE.Group | null = null
  /** arsa ızgarası: tıklanabilir zeminler */
  private parcelTiles = new Map<string, THREE.Mesh>()
  private parcelBuilds = new Map<string, THREE.Group>()
  private ray = new THREE.Raycaster()

  constructor(canvas: HTMLCanvasElement, theme: LocTheme = 'mahalle') {
    this.theme = theme
    this.scene.background = new THREE.Color(theme === 'sahil' ? 0xaee2f2 : 0xa8dcef)
    this.scene.fog = new THREE.Fog(0xa8dcef, 78, 165)
    const a = innerWidth / innerHeight
    this.camera = new THREE.OrthographicCamera(-this.zoom * a / 2, this.zoom * a / 2, this.zoom / 2, -this.zoom / 2, -120, 220)
    this.camera.up.set(0, 0, 1)
    this.camera.position.copy(this.target).add(this.camOffset)
    this.camera.lookAt(this.target.x, this.target.y, 0)

    // K2 (BenelOil 56 ısınma şikayeti): mobilde render bütçesi — gölge yok,
    // antialias yok, pixelRatio 1.5 tavan
    const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 900
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.shadowMap.enabled = !mobile
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

    this.kitReady = loadKit()
      .then(k => { this.kit = k; this.buildRoadNetwork(); this.upgradeClubhouse(); this.dressScene() })
      .catch(() => { /* kit inmezse prosedürel yedek zaten sahnede — boot maskesini bloklama */ })
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
    const groundCol = this.theme === 'sanayi' ? 0x97946f : this.theme === 'sahil' ? 0x88ab60 : 0x7fa05e
    const g = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), lam(groundCol))
    g.receiveShadow = true; this.scene.add(g)
    if (this.theme === 'sahil') {
      // güneyde kumsal + deniz
      const sand = new THREE.Mesh(new THREE.PlaneGeometry(340, 14), lam(0xe8d5a0))
      sand.position.set(0, -27, 0.012); this.scene.add(sand)
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(340, 140), lam(0x4fa8cf))
      sea.position.set(0, -104, 0.01); this.scene.add(sea)
    }
    // AVLU: yalnız giriş parseli (1,0) beton — kalan her yer çimen
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 9.0), lam(0xb6b0a1))
    pad.position.set(0, 6.9, 0.06); pad.receiveShadow = true; this.scene.add(pad)
    // yürüyüş yolu (avlu → saha)
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), lam(0xc9c3b4))
    walk.position.set(0, 1.2, 0.065); this.scene.add(walk)
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

  /** kale filesi ağ dokusu — kare örgü, transparan */
  private netTexture(): THREE.CanvasTexture {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64
    const x = cv.getContext('2d')!
    x.clearRect(0, 0, 64, 64)
    x.strokeStyle = 'rgba(255,255,252,1)'; x.lineWidth = 5
    for (let i = 0; i <= 64; i += 16) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke()
      x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke()
    }
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(4, 2)
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
    t.anisotropy = 8
    return t
  }

  /** kale filesi — GERÇEK KALE: arka dikey direkler + çatı ağı + arka/yan ağ panelleri */
  private buildGoalNet(g: THREE.Group, gx: number, sg: number, sc = 1) {
    const depth = 0.85 * sc, H = 1.58 * sc, Hb = 1.28 * sc, W = 1.3 * sc
    const bx = gx + sg * depth
    const mat = new THREE.MeshBasicMaterial({
      map: this.netTexture(), transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2))
      g.add(new THREE.Mesh(geo, mat))
    }
    // ÇATI: ön üst direk → arka üst çubuk
    quad([gx, -W, H], [gx, W, H], [bx, W, Hb], [bx, -W, Hb])
    // ARKA: arka üstten dümdüz yere
    quad([bx, -W, Hb], [bx, W, Hb], [bx, W, 0.03], [bx, -W, 0.03])
    // YANLAR: dörtgen paneller
    for (const py of [-W, W])
      quad([gx, py, H], [bx, py, Hb], [bx, py, 0.03], [gx, py, 0.03])
    // arka DİKEY direkler + üst bağlantı çubukları + arka üst çubuk
    const rodMat = lam(0xdedad0)
    for (const py of [-W, W]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, Hb, 6), rodMat)
      post.rotation.x = Math.PI / 2
      post.position.set(bx, py, Hb / 2)
      post.castShadow = true; g.add(post)
    }
    const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, W * 2, 6), rodMat)
    backBar.position.set(bx, 0, Hb)
    g.add(backBar)
  }

  buildPitch(cx: number, cy: number) {
    const g = new THREE.Group()
    // kenar bandı (koyu çim)
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W + 1.1, PITCH_D + 1.1), lam(0x2a6e35))
    skirt.position.z = 0.075; skirt.receiveShadow = true; g.add(skirt)
    // ASIL SAHA — tek düzlem, tek doku
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_D),
      new THREE.MeshLambertMaterial({ map: this.pitchTexture(PITCH_W, PITCH_D) }))
    turf.position.z = 0.09; turf.receiveShadow = true; g.add(turf)
    // kaleler — direk + üst direk + file
    for (const sg of [-1, 1]) {
      const gx = sg * (PITCH_W / 2 - 0.3)
      for (const py of [-1.3, 1.3]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8), lam(0xfaf9f6))
        post.rotation.x = Math.PI / 2; post.position.set(gx, py, 0.8); post.castShadow = true; g.add(post)
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), lam(0xfaf9f6))
      bar.position.set(gx, 0, 1.6); bar.castShadow = true; g.add(bar)
      this.buildGoalNet(g, gx, sg)
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
    ctx.fillText('HALI SAHA', 320, 80)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true }))
    sign.position.set(0, -2.28, 3.5); sign.rotation.x = Math.PI / 2
    g.add(sign)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.0), lam(0x8d97a1))
    post.position.set(0, -2.28, 3.0); g.add(post)
    g.position.set(-14.5, 7.2, 0)
    this.scene.add(g)
    this.clubhouse = g
    this.addWindowGlow(-15.2, 5.2, 1.1, 1.2, 0.7)
    this.addWindowGlow(-13.6, 5.2, 1.1, 1.2, 0.7)
  }

  private signMat: THREE.MeshBasicMaterial | null = null
  private signName = ''
  private signTexture(name: string): THREE.CanvasTexture {
    const cvs = document.createElement('canvas'); cvs.width = 640; cvs.height = 200
    const ctx = cvs.getContext('2d')!
    ctx.fillStyle = '#0e3d22'; ctx.beginPath(); ctx.roundRect(0, 0, 640, 200, 26); ctx.fill()
    ctx.strokeStyle = '#f2b53c'; ctx.lineWidth = 12; ctx.beginPath(); ctx.roundRect(10, 10, 620, 180, 20); ctx.stroke()
    const title = (name || (this.theme === 'sanayi' ? 'SANAYİ SAHA' : this.theme === 'sahil' ? 'SAHİL SAHA' : 'HALI SAHA')).toUpperCase()
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `800 ${title.length > 10 ? 62 : 86}px sans-serif`
    ctx.fillText(title, 320, 100)
    const t = new THREE.CanvasTexture(cvs); t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  /** tabelaya oyuncunun verdiği adı yaz */
  setSignName(name: string) {
    this.signName = (name || '').slice(0, 16)
    if (this.signMat) {
      this.signMat.map?.dispose()
      this.signMat.map = this.signTexture(this.signName)
      this.signMat.needsUpdate = true
    }
  }

  /** prosedürel kulüp binası → Kenney ticari bina + ayaklı tabela */
  private upgradeClubhouse() {
    const k = this.kit
    if (!k?.buildings.length || !this.clubhouse) return
    this.scene.remove(this.clubhouse)
    const g = new THREE.Group()
    // yeşil çatılı müstakil ev (homes kiti) — kulüp binası gibi okunur, marka yeşiliyle uyumlu
    const proto = k.buildings[Math.min(4, k.buildings.length - 1)]
    const b = fitModel(proto, 3.6)
    b.rotation.z = Math.PI   // kapısı avluya baksın
    g.add(b)
    // AYAKLI TABELA: iki direk + pano (binadan bağımsız, yola bakar)
    const bmat = new THREE.MeshBasicMaterial({ map: this.signTexture(this.signName), transparent: true, side: THREE.DoubleSide })
    bmat.toneMapped = false  // ACES tonemap panoyu soluk mint'e çeviriyordu
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.45), bmat)
    this.signMat = bmat
    board.rotation.x = Math.PI / 2
    const sg = new THREE.Group()
    for (const px of [-2.0, 2.0]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8), lam(0x6b7680))
      post.rotation.x = Math.PI / 2; post.position.set(px, 0, 1.7); post.castShadow = true; sg.add(post)
    }
    board.position.set(0, -0.06, 3.1); sg.add(board)
    sg.position.set(5.8, 11.6, 0)  // kaldırım kenarında, caddeye bakar
    this.scene.add(sg)
    g.position.set(-14.5, 7.2, 0)
    this.scene.add(g)
    this.clubhouse = g
    this.addWindowGlow(-15.2, 5.2, 1.1, 1.2, 0.7)
    this.addWindowGlow(-13.6, 5.2, 1.1, 1.2, 0.7)
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
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 8.6), lam(0x585f66))
    pad.position.set(14.5, 7.0, 0.06); pad.receiveShadow = true; this.scene.add(pad)
    // ÇİFT SIRA: üst + alt slot şeritleri, ortada sürüş koridoru
    for (let i = 0; i < 6; i++) {
      const x = 9.7 + i * 1.95
      for (const [cy, h] of [[9.55, 2.6], [4.45, 2.6]] as [number, number][]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, h), lam(0xe9e4d6))
        l.position.set(x, cy, 0.075); this.scene.add(l)
      }
    }
    // sıra kapama çizgileri
    for (const cy of [8.25, 5.75]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(9.85, 0.1), lam(0xe9e4d6))
      l.position.set(14.58, cy, 0.075); this.scene.add(l)
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
    const VX = [-30, 30] // dikey sokaklar — 6'nın KATI olmalı (karo ızgarasına denk gelsin)
    // ana cadde (yatay, y=17.5) — tesis girişinde (x=0) YAYA GEÇİDİ
    for (let x = -168; x <= 168; x += T) {
      if (VX.includes(x) && k.roads.tee) { put(k.roads.tee, x, 17.5, 0) ; continue }  // gövde GÜNEYE — bordür kuzeyde kalır
      if (x === 0 && k.roads.crossing) { put(k.roads.crossing, x, 17.5, 0); continue }
      put(k.roads.straight, x, 17.5, 0)
    }
    // SOKAK LAMBALARI: kavşaklarda çift kollu, cadde boyunca tekli
    const lamp = (proto: THREE.Group | null, x: number, y: number, rot: number) => {
      if (!proto) return
      const m = fitModel(proto, 3.4)
      m.position.set(x, y, 0); m.rotation.z = rot
      this.scene.add(m)
    }
    for (const vx of VX) lamp(k.roads.lightDouble, vx, 14.3, 0)
    for (const lx of [-52, -10, 10, 52, 76, -76]) lamp(k.roads.light, lx, 14.5, 0)
    for (const vx of VX) for (const ly of [-6, -30]) lamp(k.roads.light, vx - 3.4, ly, Math.PI / 2)
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
    // TAPU SINIRI: dört kenarda belirgin krem şerit — 'burası senin' uzaktan okunur
    const bm = lam(0xf1ecd9)
    const t = 0.22
    for (const [w, d, px, py] of [
      [PARCEL_W, t, 0, PARCEL_D / 2 - t / 2], [PARCEL_W, t, 0, -PARCEL_D / 2 + t / 2],
      [t, PARCEL_D, PARCEL_W / 2 - t / 2, 0], [t, PARCEL_D, -PARCEL_W / 2 + t / 2, 0],
    ] as [number, number, number, number][]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), bm)
      strip.position.set(px, py, 0.05)
      g.add(strip)
    }
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
  private addDecor(o: THREE.Object3D) { this.decorItems.push(o); this.scene.add(o) }
  /** sahiplenilen parsellerin üstünde kalan süsleri kaldır (satın alma VE geç kit yüklemesi sonrası) */
  private pruneDecor() {
    if (!this.decorItems.length || !this.ownedKeys.size) return
    const keep: THREE.Object3D[] = []
    for (const o of this.decorItems) {
      let hit = false
      for (const key of this.ownedKeys) {
        const t = this.parcelTiles.get(key)
        if (t && Math.abs(o.position.x - t.position.x) < PARCEL_W / 2 + 0.7
              && Math.abs(o.position.y - t.position.y) < PARCEL_D / 2 + 0.7) { hit = true; break }
      }
      if (hit) this.scene.remove(o); else keep.push(o)
    }
    this.decorItems = keep
  }

  syncParcels(owned: string[], builds: { key?: string; kind: BuildKind }[]) {
    this.ownedKeys = new Set(owned)
    this.pruneDecor()
    for (const [key, tile] of this.parcelTiles) {
      const mat = tile.material as THREE.MeshLambertMaterial
      if (owned.includes(key)) {
        mat.color.setHex(0x94b26f)  // biçilmiş, bakımlı çim — boş parselden net ayrışır
        this.markOwned(key, tile.position.x, tile.position.y)
      } else {
        mat.color.setHex(0x7fa05e)  // zeminle aynı — dümdüz çimen
      }
    }
    // yıkılan yapıların görseli kalksın
    for (const [key, g] of this.parcelBuilds) {
      if (!builds.some(b => (b.key ?? '') === key)) { this.scene.remove(g); this.parcelBuilds.delete(key) }
    }
    for (const b of builds) {
      const key = b.key ?? ''
      const cur = this.parcelBuilds.get(key)
      const cnt = (b as { count?: number }).count ?? 1
      if (cur && cur.userData.count === cnt) continue
      if (cur) { this.scene.remove(cur); this.parcelBuilds.delete(key) } // mini sayısı değişti → yeniden çiz
      const tile = this.parcelTiles.get(key)
      if (!tile) continue
      const g = this.makeBuild(b.kind, tile.position.x, tile.position.y, cnt)
      g.userData.count = cnt
      this.parcelBuilds.set(key, g)
    }
  }

  private makeBuild(kind: BuildKind, x: number, y: number, count = 1): THREE.Group {
    const g = new THREE.Group()
    if (kind === 'pitch') {
      const w = PARCEL_W - 0.8, d = PARCEL_D - 0.8
      const skirt2 = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, d + 0.5), lam(0x2a6e35))
      skirt2.position.z = 0.075; g.add(skirt2)
      const turf = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
        new THREE.MeshLambertMaterial({ map: this.pitchTexture(w, d) }))
      turf.position.z = 0.09; turf.receiveShadow = true; g.add(turf)
      // KALELER: ana sahadaki gerçek fileli kaleler — 'yeni sahada kale yok' fixi
      for (const sgn of [-1, 1] as const) this.buildGoalNet(g, sgn * (w / 2 - 0.55), sgn)
    } else if (kind === 'mini') {
      // DİKİNE İSTİF: bir arsaya yan yana 3 dikey mini saha (her biri kendi kaleleriyle)
      const skirt2 = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_W - 0.3, PARCEL_D - 0.3), lam(0x2a6e35))
      skirt2.position.z = 0.07; g.add(skirt2)
      const fieldW = PARCEL_D - 1.4   // dikey saha: uzun eksen y (alt-grup döndürülür)
      const fieldD = 3.9
      for (let i = 0; i < count; i++) {
        const sub = new THREE.Group()
        const turf = new THREE.Mesh(new THREE.PlaneGeometry(fieldW, fieldD),
          new THREE.MeshLambertMaterial({ map: this.pitchTexture(fieldW, fieldD) }))
        turf.position.z = 0.09; turf.receiveShadow = true; sub.add(turf)
        for (const sgn of [-1, 1] as const) this.buildGoalNet(sub, sgn * (fieldW / 2 - 0.35), sgn, 0.62)
        sub.rotation.z = Math.PI / 2
        sub.position.x = (i - (count - 1) / 2) * (fieldD + 0.45)
        g.add(sub)
      }
    } else if (kind === 'basket') {
      // MODERN KORT: koyu zemin + turuncu oyun alanı + boyalı 'key' bölgeleri
      const w = PARCEL_W - 0.7, d = PARCEL_D - 0.7
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0x2e4a44))
      deck.position.z = 0.06; deck.receiveShadow = true; g.add(deck)
      const court = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.6, d - 1.4), lam(0xd08544))
      court.position.z = 0.07; court.receiveShadow = true; g.add(court)
      const line = (lw: number, ld: number, lx: number, ly: number, col = 0xf7f3e8) => {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lam(col)); l.position.set(lx, ly, 0.085); g.add(l)
      }
      const cw = w - 1.6, cd = d - 1.4
      line(cw, 0.14, 0, cd / 2 - 0.07); line(cw, 0.14, 0, -cd / 2 + 0.07)
      line(0.14, cd, -cw / 2 + 0.07, 0); line(0.14, cd, cw / 2 - 0.07, 0); line(0.14, cd, 0, 0)
      // KEY bölgeleri (koyu turuncu) + serbest atış yayı
      for (const sgn of [-1, 1] as const) {
        const key = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.6), lam(0xb96f35))
        key.position.set(sgn * (cw / 2 - 1.55), 0, 0.078); g.add(key)
        const arc = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.24, 22, 1, 0, Math.PI), lam(0xf7f3e8))
        arc.rotation.z = sgn > 0 ? Math.PI / 2 : -Math.PI / 2
        arc.position.set(sgn * (cw / 2 - 3.1), 0, 0.085); g.add(arc)
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.29, 26), lam(0xf7f3e8))
      ring.position.z = 0.085; g.add(ring)
      // potalar
      for (const sgn of [-1, 1] as const) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.9, 8), lam(0x5b646d))
        pole.rotation.x = Math.PI / 2; pole.position.set(sgn * (w / 2 - 0.35), 0, 1.45); pole.castShadow = true; g.add(pole)
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 1.0), lam(0xf7f4ec))
        board.position.set(sgn * (w / 2 - 0.75), 0, 2.55); board.castShadow = true; g.add(board)
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 16), lam(0xd6633a))
        hoop.position.set(sgn * (w / 2 - 1.15), 0, 2.2); g.add(hoop)
      }
    } else if (kind === 'voley') {
      // CANLI PLAJ KORTU: teal çerçeve + sıcak kum + gergin file
      const w = PARCEL_W - 0.7, d = PARCEL_D - 0.7
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0x3a8f8a))
      deck.position.z = 0.06; deck.receiveShadow = true; g.add(deck)
      const sand = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.6, d - 1.4), lam(0xeacf98))
      sand.position.z = 0.07; sand.receiveShadow = true; g.add(sand)
      // kum dokusu: hafif ton benekleri
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Mesh(new THREE.CircleGeometry(0.5 + (i % 3) * 0.25, 10), lam(i % 2 ? 0xe2c288 : 0xf2dcae))
        sp.position.set((Math.sin(i * 2.4) * (w / 2 - 2.2)), (Math.cos(i * 1.9) * (d / 2 - 1.8)), 0.075); g.add(sp)
      }
      const vline = (lw: number, ld: number, lx: number, ly: number) => {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lam(0xffffff)); l.position.set(lx, ly, 0.085); g.add(l)
      }
      const cw = w - 2.2, cd = d - 2.0
      vline(cw, 0.12, 0, cd / 2); vline(cw, 0.12, 0, -cd / 2)
      vline(0.12, cd, -cw / 2, 0); vline(0.12, cd, cw / 2, 0)
      // FİLE: iki direk + üst bant + ağ dokusu
      for (const sgn of [-1, 1] as const) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8), lam(0x8d97a1))
        post.rotation.x = Math.PI / 2; post.position.set(0, sgn * (cd / 2 + 0.35), 1.05); post.castShadow = true; g.add(post)
      }
      const net = new THREE.Mesh(new THREE.PlaneGeometry(0.04, cd + 0.7),
        new THREE.MeshBasicMaterial({ map: this.netTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }))
      net.rotation.y = Math.PI / 2; net.scale.z = 18
      const netQ = new THREE.Mesh(new THREE.PlaneGeometry(cd + 0.7, 0.85),
        new THREE.MeshBasicMaterial({ map: this.netTexture(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))
      netQ.rotation.x = Math.PI / 2; netQ.rotation.y = Math.PI / 2
      netQ.position.set(0, 0, 1.55); g.add(netQ)
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, cd + 0.7, 0.1), lam(0xffffff))
      band.position.set(0, 0, 2.0); g.add(band)
    } else if (kind === 'kantin' || kind === 'dus' || kind === 'wc') {
      // İŞLETME BİNALARI — kenney ticari bina + tür işareti; kit yoksa prosedürel kutu
      const pad2 = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_W - 2, PARCEL_D - 2), lam(0xc9c3b4))
      pad2.position.z = 0.06; pad2.receiveShadow = true; g.add(pad2)
      const bh = kind === 'kantin' ? 2.9 : kind === 'dus' ? 2.5 : 2.2
      if (this.kit?.buildings.length) {
        const idx = kind === 'kantin' ? 1 : kind === 'dus' ? 2 : 5 // wc: BenelOil'deki gibi düzgün kenney binası
        const b = fitModel(this.kit.buildings[idx % this.kit.buildings.length], bh)
        b.rotation.z = Math.PI
        g.add(b)
      } else {
        box(4.5, 3, bh, 0xf2ece0, 0, 0, bh / 2, g)
        box(4.7, 3.2, 0.25, kind === 'dus' ? 0x3f8fe4 : 0x27a05a, 0, 0, bh + 0.1, g)
      }
      // tür bandı (renk kodu: kantin yeşil, duş mavi, wc gri)
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 0.5),
        lam(kind === 'kantin' ? 0x27a05a : kind === 'dus' ? 0x3f8fe4 : 0x8d97a1))
      band.position.set(0, -1.8, bh * 0.75); band.castShadow = true; g.add(band)
      if (kind === 'kantin') {
        for (const [tx, ty] of [[-2.6, -1.6], [2.6, -1.6]] as [number, number][]) {
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), lam(0xf7f4ec))
          top.rotation.x = Math.PI / 2; top.position.set(tx, ty, 0.7); top.castShadow = true; g.add(top)
        }
      }
    } else if (kind === 'parking') {
      // ANA OTOPARKLA AYNI DİL: koyu asfalt + bordür + çift sıra çizgili cepler + park etmiş araçlar
      const w = PARCEL_W, d = PARCEL_D // TÜM parseli kaplar
      const kerb = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xa9a294))
      kerb.position.z = 0.055; kerb.receiveShadow = true; g.add(kerb)
      const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), lam(0x454c54))
      asphalt.position.z = 0.065; asphalt.receiveShadow = true; g.add(asphalt)
      const slotW = 1.95, rows = [d / 4, -d / 4]
      for (const ry of rows) {
        for (let i = 0; i <= 5; i++) {
          const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, d / 2 - 0.7), lam(0xe9e4d6))
          l.position.set(-w / 2 + 0.9 + i * slotW, ry, 0.075); g.add(l)
        }
      }
      if (this.kit?.cars.length) {
        const picks = [0, 2, 4, 1]
        picks.forEach((pi, i) => {
          if (i >= 4 || Math.random() < 0.2) return
          const car = fitModel(this.kit!.cars[pi % this.kit!.cars.length], 1.0)
          const row = i % 2
          car.position.set(-w / 2 + 0.9 + slotW / 2 + (i % 3) * slotW * (1 + (i > 2 ? 1 : 0)), rows[row], 0)
          car.rotation.z = row === 0 ? Math.PI : 0  // cebe DİK park, burnu bordüre
          g.add(car)
        })
      }
    } else {
      // BAKIMLI PARK: çim + kavisli yollar + orta meydan + banklar + çiçek tarhları + ağaçlar
      const w = PARCEL_W - 0.7, d = PARCEL_D - 0.7
      const hedge = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0x4f7d3c))
      hedge.position.z = 0.055; hedge.receiveShadow = true; g.add(hedge)
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), lam(0x77a85a))
      lawn.position.z = 0.065; lawn.receiveShadow = true; g.add(lawn)
      // çapraz yürüyüş yolları + orta meydan
      for (const rot of [0.62, -0.62]) {
        const path = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.5, 1.0), lam(0xd9d2bf))
        path.rotation.z = rot; path.position.z = 0.07; g.add(path)
      }
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), lam(0xd9d2bf))
      plaza.position.z = 0.075; g.add(plaza)
      const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.35, 16), lam(0x9fb7c4))
      fountain.rotation.x = Math.PI / 2; fountain.position.z = 0.2; g.add(fountain)
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), lam(0x69b7d9))
      water.position.z = 0.39; g.add(water)
      // banklar (meydana bakan)
      for (const [bx2, by2, rot] of [[-2.3, 1.5, 0.62], [2.3, -1.5, 0.62], [-2.3, -1.5, -0.62], [2.3, 1.5, -0.62]] as [number, number, number][]) {
        const bench = new THREE.Group()
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.34, 0.09), lam(0x9a6b43))
        seat.position.z = 0.34; seat.castShadow = true; bench.add(seat)
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.3), lam(0x9a6b43))
        back.position.set(0, -0.15, 0.55); bench.add(back)
        for (const lx of [-0.45, 0.45]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.32), lam(0x4a4f55))
          leg.position.set(lx, 0, 0.17); bench.add(leg)
        }
        bench.position.set(bx2, by2, 0); bench.rotation.z = rot; g.add(bench)
      }
      // çiçek tarhları (köşeler)
      for (const [fx, fy] of [[-w / 2 + 1.3, d / 2 - 1.1], [w / 2 - 1.3, d / 2 - 1.1], [-w / 2 + 1.3, -d / 2 + 1.1], [w / 2 - 1.3, -d / 2 + 1.1]] as [number, number][]) {
        const bed = new THREE.Mesh(new THREE.CircleGeometry(0.75, 14), lam(0x5c4a33))
        bed.position.set(fx, fy, 0.072); g.add(bed)
        for (let i = 0; i < 6; i++) {
          const fl = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), lam([0xe05d7a, 0xf2b53c, 0xf7f3e8][i % 3]))
          fl.position.set(fx + Math.sin(i * 1.05) * 0.42, fy + Math.cos(i * 1.05) * 0.42, 0.08); g.add(fl)
        }
      }
      if (this.kit?.trees.length) {
        for (const [tx, ty] of [[-w / 2 + 1.2, 0], [w / 2 - 1.2, 0]] as [number, number][]) {
          const t = fitModel(this.kit.trees[Math.floor(Math.random() * this.kit.trees.length)], 2.3)
          t.position.set(tx, ty, 0); g.add(t)
        }
      }
    }
    g.position.set(x, y, 0)
    this.scene.add(g)
    return g
  }

  // ---- İNŞAAT: 3D izometrik önizleme + elde taşıma hayaleti (BenelOil mekaniği) ----
  private thumbCache = new Map<string, string>()
  private thumbRenderer: THREE.WebGLRenderer | null = null
  /** yapıyı offscreen izometrik render edip dataURL döner (katalog görseli) */
  renderThumb(kind: BuildKind): string {
    const hit = this.thumbCache.get(kind)
    if (hit) return hit
    const g = this.makeBuild(kind, 0, 0)
    this.scene.remove(g)
    const sc = new THREE.Scene()
    sc.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 1.15))
    const dl = new THREE.DirectionalLight(0xfff4e0, 1.0); dl.position.set(8, -10, 14); sc.add(dl)
    const base = new THREE.Mesh(new THREE.PlaneGeometry(15, 11), new THREE.MeshLambertMaterial({ color: 0x86a763 }))
    sc.add(base); sc.add(g)
    const cam = new THREE.OrthographicCamera(-8.6, 8.6, 6.4, -6.4, -60, 120)
    cam.up.set(0, 0, 1); cam.position.set(11, -22, 11); cam.lookAt(0, 0, 0.8)
    if (!this.thumbRenderer) {
      this.thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      this.thumbRenderer.setSize(148, 110)
      this.thumbRenderer.outputColorSpace = THREE.SRGBColorSpace
    }
    this.thumbRenderer.render(sc, cam)
    const url = this.thumbRenderer.domElement.toDataURL()
    sc.remove(g)
    this.thumbCache.set(kind, url)
    return url
  }

  private ghost: THREE.Group | null = null
  private ghostRing: THREE.Mesh | null = null
  /** yapıyı ELİNE VER: yarı saydam hayalet imleci izler */
  startGhost(kind: BuildKind) {
    this.clearGhost()
    const g = this.makeBuild(kind, 0, 0)
    this.scene.remove(g)
    g.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        const mat = (m.material as THREE.Material).clone()
        mat.transparent = true; mat.opacity = 0.55
        m.material = mat
      }
    })
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.1, 36),
      new THREE.MeshBasicMaterial({ color: 0x2f9e57, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    ring.position.z = 0.12
    g.add(ring)
    this.ghostRing = ring
    g.visible = false
    this.scene.add(g)
    this.ghost = g
  }
  /** hayaleti imlecin altındaki parsele oturt; parseli döner */
  moveGhost(cx: number, cy: number): { c: number; r: number } | null {
    if (!this.ghost) return null
    const hit = this.pickParcel(cx, cy)
    if (!hit) { this.ghost.visible = false; return null }
    const [x, y] = this.parcelCenter(hit.c, hit.r)
    this.ghost.visible = true
    this.ghost.position.set(x, y, 0.25)
    return hit
  }
  /** halka rengi: yeşil = kurulabilir, kırmızı = olmaz */
  setGhostOk(ok: boolean) {
    if (this.ghostRing) (this.ghostRing.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x2f9e57 : 0xd64545)
  }
  clearGhost() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; this.ghostRing = null }
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
      for (const [x, y, h] of (this.theme === 'sanayi' ? spots.filter((_, i) => i % 2 === 0) : spots)) {
        const t = fitModel(k.trees[Math.floor(Math.random() * k.trees.length)], h)
        t.position.set(x, y, 0); t.rotation.z = Math.random() * Math.PI
        this.addDecor(t) // parsel sahiplenilince temizlenebilsin
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
        // gece penceresi: cephede sıcak ışık (her evde 1-2 pencere)
        this.addWindowGlow(x - 1.2, y - 2.6, h * 0.42, 1.3, 0.8)
        if (i % 2 === 0) this.addWindowGlow(x + 1.4, y - 2.6, h * 0.55, 1.1, 0.7)
        // BAHÇE: çitli, düzenli. KROKİ kuralı: yan koridor evlerinde (dikey sokaklar
        // |x|>25) bahçe YOLA DEĞİL, evin arkasına (dışa) bakar — asfalta çit kurulmaz
        const side = Math.abs(x) > 25 ? Math.sign(x) : 0
        const gx = side !== 0 ? x + side * 7.5 : x
        const gy = side !== 0 ? y : y + (y > 10 ? -6 : 6)
        const G = new THREE.Group()
        const gw = 9.4, gd = 6
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), lam(0x699a4d))  // koyu bakımlı bahçe çimi
        lawn.position.z = 0.016; lawn.receiveShadow = true; G.add(lawn)
        // alçak beyaz çit — dört kenar, kapı boşluğu yolda
        const fenceMat = lam(0xf1ede0)
        const rail = (w: number, d: number, px: number, py: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, 0.3), fenceMat)
          m.position.set(px, py, 0.15); m.castShadow = true; G.add(m)
        }
        // eve bakan kenarda çit YOK — bahçe evin doğal uzantısı olur
        const skip = side !== 0 ? (side > 0 ? 'L' : 'R') : (y > 10 ? 'T' : 'B')
        if (skip !== 'T') rail(gw, 0.09, 0, gd / 2)
        if (skip !== 'B') rail(gw, 0.09, 0, -gd / 2)
        if (skip !== 'L') rail(0.09, gd, -gw / 2, 0)
        if (skip !== 'R') rail(0.09, gd, gw / 2, 0)
        for (let fx = -gw / 2; fx <= gw / 2; fx += 1.16) {
          if (skip !== 'T') {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), fenceMat)
            post.position.set(fx, gd / 2, 0.25); G.add(post)
          }
          if (skip !== 'B') {
            const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), fenceMat)
            post2.position.set(fx, -gd / 2, 0.25); G.add(post2)
          }
        }
        // eve dik bahçe yolu (kapıdan çite)
        const path = new THREE.Mesh(new THREE.PlaneGeometry(1.3, gd), lam(0xd6cfbe))
        path.rotation.z = side !== 0 ? Math.PI / 2 : 0
        path.position.z = 0.02; G.add(path)
        // köşelere 1 ağaç + 2 saksı — ızgara düzeni
        if (k.trees.length) {
          const t = fitModel(k.trees[(i + 1) % k.trees.length], 2.1)
          t.position.set(-gw / 2 + 1.1, gd / 2 - 1.1, 0); G.add(t)
        }
        if (k.planter) {
          for (const [px2, py2] of [[gw / 2 - 1, -gd / 2 + 0.9], [gw / 2 - 1, gd / 2 - 0.9]] as [number, number][]) {
            const pl = fitModel(k.planter, 0.6); pl.position.set(px2, py2, 0); G.add(pl)
          }
        }
        G.position.set(gx, gy, 0)
        this.scene.add(G)
      })
    }
    // ARABALAR — otoparkta
    if (k.cars.length) {
      const slots: [number, number, number][] = [
        [10.68, 9.75, Math.PI], [14.58, 9.75, Math.PI], [16.53, 9.75, Math.PI], // üst sıra: slotun dibinde
        [12.63, 4.25, 0], [16.53, 4.25, 0],                                      // alt sıra: slotun dibinde
      ]
      slots.forEach(([x, y, rot], i) => {
        const car = fitModel(k.cars[i % k.cars.length], 1.0)
        car.position.set(x, y, 0); car.rotation.z = rot
        this.scene.add(car); this.parkedCars.push(car)
      })
    }
    // AKAN TRAFİK — yol canlı olsun
    if (k.cars.length) {
      for (let i = 0; i < 10; i++) {
        const dir: 1 | -1 = i % 2 ? 1 : -1
        const car = fitModel(k.cars[i % k.cars.length], 1.0)
        car.position.set(-105 + i * 22, dir > 0 ? 16.6 : 18.4, 0)
        car.rotation.z = dir > 0 ? Math.PI / 2 : -Math.PI / 2
        this.scene.add(car)
        this.traffic.push({ g: car, sp: 3.5 + Math.random() * 2.5, dir, axis: 'x' })
      }
      // dikey sokak trafiği
      for (let i = 0; i < 4; i++) {
        const dir: 1 | -1 = i % 2 ? 1 : -1
        const vx = i < 2 ? -30 : 30
        const car = fitModel(k.cars[(i + 3) % k.cars.length], 1.0)
        car.position.set(vx + (dir > 0 ? 0.9 : -0.9), -80 + i * 35, 0)
        car.rotation.z = dir > 0 ? Math.PI : 0
        this.scene.add(car)
        this.traffic.push({ g: car, sp: 3 + Math.random() * 2, dir, axis: 'y' })
      }
    }
    // MAÇ İZLEYİCİLERİ: saha kenarında 3 kişi — sadece maç sırasında görünür
    if (k.chars.length) {
      for (let i = 0; i < 3; i++) {
        const fig = fitCharacter(k.chars[(i + 2) % k.chars.length], 0.74)
        fig.position.set(-4 + i * 3.6, PITCH_Y - PITCH_D / 2 - 0.9, 0)
        fig.rotation.z = Math.PI  // yüzü sahaya dönük
        this.matchGroup.add(fig)
      }
    }
    // ŞUBE DEKORLARI
    if (this.theme === 'sahil') {
      for (let i = 0; i < 5; i++) {
        const bx = -26 + i * 13, by = -25.5 - (i % 2) * 2
        // şezlong: yatay + eğik parça
        const g2 = new THREE.Group()
        box(1.6, 0.6, 0.12, 0xffffff, 0, 0, 0.3, g2)
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), lam(i % 2 ? 0xe4633f : 0x3f8fe4))
        back.position.set(-0.65, 0, 0.5); back.rotation.y = -0.7; back.castShadow = true; g2.add(back)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.56, 0.06), lam(i % 2 ? 0xe4633f : 0x3f8fe4))
        seat.position.set(0.15, 0, 0.37); g2.add(seat)
        g2.position.set(bx, by, 0); this.addDecor(g2)
        // şemsiye
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), lam(0xf1ede0))
        pole.rotation.x = Math.PI / 2; pole.position.set(bx + 1.2, by - 0.6, 1); this.addDecor(pole)
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 10), lam(i % 2 ? 0xe4b23f : 0x3fb2e4))
        canopy.rotation.x = Math.PI / 2; canopy.position.set(bx + 1.2, by - 0.6, 2.1)
        canopy.castShadow = true; this.addDecor(canopy)
      }
    }
    if (this.theme === 'sanayi') {
      const cols = [0xc4552f, 0x3f6fb5, 0x5f8f4a, 0x8f5fa0]
      for (let i = 0; i < 6; i++) {
        const cx2 = i < 3 ? -34 - (i % 2) * 2 : 36 + (i % 2) * 2
        const cy2 = -14 + (i % 3) * 4.2
        const cont = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 1.5), lam(cols[i % cols.length]))
        cont.position.set(cx2, cy2, 0.75); cont.castShadow = true; cont.receiveShadow = true
        cont.rotation.z = (i % 2) * 0.12
        this.scene.add(cont)
      }
    }
    // SAKSILAR — giriş süsü
    if (k.planter) {
      for (const [x, y] of [[-4.2, 3.2], [4.2, 3.2], [-5.2, 10.6], [5.2, 10.6]] as [number, number][]) {
        const p = fitModel(k.planter, 0.8); p.position.set(x, y, 0); this.addDecor(p)
      }
    }
    // kit geç indi: sahiplenilmiş parsele düşen süsler hemen kalksın
    this.pruneDecor()
  }

  /** maç simülasyonu — izometrikten "futbol" gibi okunur */
  /** 0-1: maçın o anki heyecanı (top hızından) — kalabalık uğultusu bunu izler */
  matchHeat = 0

  private matchWasActive = false
  updateMatch(dt: number, active: boolean) {
    this.matchGroup.visible = active
    this.matchHeat = active ? Math.min(1, Math.hypot(this.bvx, this.bvy) / 8) : 0
    for (const c of this.parkedCars) c.visible = true
    if (!active) { this.matchWasActive = false; return }
    // MAÇ BAŞLADI: oyuncular sahaya IŞINLANMAZ — girişten (otopark tarafı) yürüyerek gelir.
    // Giriş noktası saha sağ kenarının dışı; yol diğer sahaların içinden geçmez.
    if (!this.matchWasActive) {
      this.matchWasActive = true
      this.players.forEach((p, i) => {
        p.g.position.set(PITCH_W / 2 + 2.0 + (i % 3) * 0.7, PITCH_Y + 2.4 + Math.floor(i / 3) * 0.6, 0)
        p.entering = true
      })
    }
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
      // GİRİŞ FAZI: önce ev pozisyonuna yürü (top kovalamak yok), varınca oyuna karış
      if (p.entering) {
        const ex = p.hx - p.g.position.x, ey = p.hy - p.g.position.y
        const ed = Math.hypot(ex, ey)
        if (ed < 0.35) { p.entering = false }
        else {
          const st = Math.min(p.sp * 0.62 * dt, ed)
          p.g.position.x += (ex / ed) * st; p.g.position.y += (ey / ed) * st
          const want = Math.atan2(ey, ex) + Math.PI / 2
          let dw = want - p.ang
          while (dw > Math.PI) dw -= Math.PI * 2
          while (dw < -Math.PI) dw += Math.PI * 2
          p.ang += dw * Math.min(1, 10 * dt); p.g.rotation.z = p.ang
          return
        }
      }
      const chase = idx < 3 && !p.entering
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
        const want = Math.atan2(dy, dx) + Math.PI / 2  // model önü -Y: yüz gittiği yöne
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
    this.updateMissions(dt)
    this.updateFieldPlays(dt)
    // devriye: sahne canlı kalsın — görev araçları meşgul değilse
    this.patrolT -= dt
    if (this.patrolT <= 0) {
      this.patrolT = 140 + Math.random() * 140
      if (this.missions.length === 0 && this.kit) this.emergency('polis')
    }
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
      if (w.delay > 0) { w.delay -= dt; continue }
      w.g.visible = true
      const tgt = w.pts[w.seg]
      if (!tgt) { this.scene.remove(w.g); this.walkers.splice(i, 1); continue }
      const dx = tgt.x - w.g.position.x, dy = tgt.y - w.g.position.y
      const d = Math.hypot(dx, dy)
      if (d < 0.12) { w.seg++; continue }
      const st = Math.min(w.sp * dt, d)
      w.g.position.x += (dx / d) * st; w.g.position.y += (dy / d) * st
      w.g.rotation.z = Math.atan2(dy, dx) + Math.PI / 2
    }
  }

  // --- GÖREV ARAÇLARI: maç öncesi gelen araba + acil araçlar (polis/ambulans) ---
  // yol şeridi y=16.6; araç yoldan girer, hedefte bekler, işi bitince çekip gider.
  private missions: { g: THREE.Object3D; seg: number; wait: number; waited: boolean
    path: { x: number; y: number; sp: number }[]; lights?: THREE.Mesh[]; onArrive?: () => void }[] = []

  /** maç öncesi: araba yoldan gelip otoparka park eder; kapılar açılır (callback) → oyuncular iner */
  carArrival(onOut?: () => void) {
    const k = this.kit
    if (!k?.cars.length) { onOut?.(); return }
    const g = fitModel(k.cars[Math.floor(Math.random() * k.cars.length)], 1.0)
    const slotX = 12.4 + Math.random() * 4.2
    g.position.set(-70, 16.6, 0); g.rotation.z = Math.PI / 2
    this.scene.add(g)
    this.missions.push({ g, seg: 0, wait: 7, waited: false, onArrive: onOut,
      path: [{ x: slotX, y: 16.6, sp: 15 }, { x: slotX, y: 10.9, sp: 4 },
             { x: slotX, y: 16.6, sp: 4 }, { x: 85, y: 16.6, sp: 15 }] })
  }

  /** ACİL ARAÇ: kavga → polis, sakatlanma → ambulans. Kenney aracı + çakar bar —
   *  prosedürel kutu gövde yan gidiyordu (yerel eksen farkı); gerçek araç modeli düzgün döner. */
  emergency(kind: 'polis' | 'ambulans') {
    const k = this.kit
    let g: THREE.Object3D
    if (k?.cars.length) {
      g = fitModel(k.cars[(kind === 'polis' ? 3 : 1) % k.cars.length], 1.05)
      // KENNEY GÖVDESİNİ BOYA: kaporta rengi palet TEXTURE'ından geliyor (materyal beyaz+map) —
      // 'body' mesh'inde map kaldırılıp düz beyaz basılır; tekerlek/diğer parçalar dokunulmaz.
      g.traverse(o => {
        const m = o as THREE.Mesh
        if (!(m as THREE.Mesh).isMesh || !m.material || !/body/i.test(o.name)) return
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        const cloned = mats.map(mm => {
          const c = (mm as THREE.MeshStandardMaterial).clone()
          c.map = null; c.color?.set(0xf2f5f7); c.needsUpdate = true
          return c
        })
        m.material = Array.isArray(m.material) ? cloned : cloned[0]
      })
      // kimlik şeridi: polis LACİVERT, ambulans KIRMIZI — gövdenin ortasına kuşak
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.9, 0.16),
        lam(kind === 'polis' ? 0x2b3b8f : 0xd64545))
      stripe.position.set(0, 0, 0.52)
      g.add(stripe)
    } else {
      const grp = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.6, 0.95), lam(0xf4f6f8))
      body.position.z = 0.62; body.castShadow = true; grp.add(body)
      g = grp
    }
    // ÇAKAR: aracın tepesine — genişlik ekseni X (model önü -Y)
    const lights: THREE.Mesh[] = []
    const mkLight = (x: number, col: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.2),
        new THREE.MeshBasicMaterial({ color: col }))
      m.position.set(x, 0, 1.18); g.add(m); lights.push(m)
    }
    mkLight(-0.22, 0xff2f2f); mkLight(0.22, kind === 'polis' ? 0x2f6fff : 0xff2f2f)
    g.position.set(-70, 16.6, 0); g.rotation.z = Math.PI / 2
    this.scene.add(g)
    this.missions.push({ g, seg: 0, wait: 7, waited: false, lights,
      path: [{ x: 1.5, y: 16.6, sp: 22 }, { x: 1.5, y: 14.2, sp: 6 },
             { x: 1.5, y: 16.6, sp: 6 }, { x: 85, y: 16.6, sp: 22 }] })
  }

  // AMBİYANS DEVRİYESİ: ara ara polis gelip tesise yanaşır, etrafı kolaçan eder, gider
  private patrolT = 50 + Math.random() * 70

  private updateMissions(dt: number) {
    const blink = Math.floor(performance.now() / 220) % 2
    for (let i = this.missions.length - 1; i >= 0; i--) {
      const m = this.missions[i]
      if (m.lights) m.lights.forEach((l, li) => { l.visible = (li % 2 === blink) })
      const tgt = m.path[m.seg]
      if (!tgt) { this.scene.remove(m.g); this.missions.splice(i, 1); continue }
      const dx = tgt.x - m.g.position.x, dy = tgt.y - m.g.position.y
      const d = Math.hypot(dx, dy)
      if (d < 0.15) {
        // park segmentinin sonunda bekle + kapıları aç (bir kez)
        if (m.seg === 1 && !m.waited) {
          if (m.onArrive) { m.onArrive(); m.onArrive = undefined }
          m.wait -= dt
          if (m.wait > 0) continue
          m.waited = true
        }
        m.seg++
        continue
      }
      const step = Math.min(tgt.sp * dt, d)
      m.g.position.x += (dx / d) * step
      m.g.position.y += (dy / d) * step
      m.g.rotation.z = Math.atan2(dy, dx) - Math.PI / 2 + Math.PI
    }
  }

  // SAHA NUMARASI etiketleri (Saha 2 / Mini 1 / Basket 1 ...) — sahanın köşesinde küçük plaka
  private fieldLabels = new Map<string, THREE.Mesh>()
  setFieldLabels(labels: { key: string; sub: number; count: number; text: string }[]) {
    const want = new Set(labels.map(l2 => l2.key + ':' + l2.sub))
    for (const [id, m] of this.fieldLabels) {
      if (!want.has(id)) { this.scene.remove(m); this.fieldLabels.delete(id) }
    }
    for (const lb of labels) {
      const id = lb.key + ':' + lb.sub
      if (this.fieldLabels.has(id)) continue
      const tile = this.parcelTiles.get(lb.key)
      if (!tile) continue
      const cvs = document.createElement('canvas'); cvs.width = 192; cvs.height = 56
      const ctx = cvs.getContext('2d')!
      ctx.fillStyle = 'rgba(20,40,28,0.85)'; ctx.beginPath(); ctx.roundRect(2, 2, 188, 52, 14); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = '800 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(lb.text, 96, 29)
      const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.67),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
      let cx = tile.position.x, cy = tile.position.y
      if (lb.count > 1) cx += (lb.sub - (lb.count - 1) / 2) * 4.35
      m.position.set(cx, cy - PARCEL_D / 2 + 0.7, 0.3)
      this.scene.add(m)
      this.fieldLabels.set(id, m)
    }
  }

  // ---- TÜM SAHALARDA GÖRÜNÜR OYUN: aktif saatte parsel sahalarına oyuncu gelir ----
  private fieldPlays = new Map<string, { figs: { g: THREE.Group; hx: number; hy: number; entering: boolean; sp: number }[]; ball?: THREE.Mesh }>()
  /** her karede ana döngüden: o an maçı olan şeritlerin fiziksel sahaları */
  setFieldActivity(actives: { id: string; key: string; kind: 'pitch' | 'mini' | 'basket' | 'voley'; sub: number; count: number }[]) {
    const want = new Set(actives.map(a => a.id))
    // biten maçlar: figürleri kaldır
    for (const [id, fp] of this.fieldPlays) {
      if (want.has(id)) continue
      for (const f of fp.figs) this.scene.remove(f.g)
      if (fp.ball) this.scene.remove(fp.ball)
      this.fieldPlays.delete(id)
    }
    const k = this.kit
    for (const a of actives) {
      if (this.fieldPlays.has(a.id)) continue
      const tile = this.parcelTiles.get(a.key)
      if (!tile) continue
      let cx = tile.position.x, cy = tile.position.y
      let hw = (PARCEL_W - 3) / 2, hd = (PARCEL_D - 3) / 2 // oyun alanı yarı-boyutları
      if (a.kind === 'mini') {
        cx += (a.sub - (a.count - 1) / 2) * 4.35
        hw = 1.4; hd = (PARCEL_D - 3) / 2
      }
      const figs: { g: THREE.Group; hx: number; hy: number; entering: boolean; sp: number }[] = []
      const n = a.kind === 'mini' ? 4 : a.kind === 'voley' ? 4 : a.kind === 'basket' ? 4 : 8
      for (let i = 0; i < n; i++) {
        const fig = k?.chars.length
          ? fitCharacter(k.chars[Math.floor(Math.random() * k.chars.length)], 0.74)
          : (() => { const gg = new THREE.Group(); box(0.3, 0.3, 0.7, i % 2 ? 0xe23b3b : 0x2f6fed, 0, 0, 0.35, gg); return gg })()
        fig.position.set(cx + hw + 1.6 + (i % 3) * 0.5, cy + (i - n / 2) * 0.4, 0)
        this.scene.add(fig)
        figs.push({ g: fig, hx: cx + (Math.random() * 2 - 1) * hw, hy: cy + (Math.random() * 2 - 1) * hd,
          entering: true, sp: 1.7 + Math.random() * 0.5 })
      }
      let ball: THREE.Mesh | undefined
      if (a.kind === 'pitch' || a.kind === 'mini') {
        ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf5f5f2 }))
        ball.position.set(cx, cy, 0.14); ball.castShadow = true
        this.scene.add(ball)
      }
      this.fieldPlays.set(a.id, { figs, ball })
    }
  }
  private updateFieldPlays(dt: number) {
    const now = performance.now()
    for (const fp of this.fieldPlays.values()) {
      fp.figs.forEach((f, i) => {
        const tx = f.entering ? f.hx : f.hx + Math.sin(now / 1400 + i * 2.1) * 0.9
        const ty = f.entering ? f.hy : f.hy + Math.cos(now / 1600 + i * 1.7) * 0.8
        const dx = tx - f.g.position.x, dy = ty - f.g.position.y
        const d = Math.hypot(dx, dy)
        if (d < 0.15) { f.entering = false; return }
        const st = Math.min(f.sp * dt, d)
        f.g.position.x += (dx / d) * st; f.g.position.y += (dy / d) * st
        f.g.rotation.z = Math.atan2(dy, dx) + Math.PI / 2
      })
      if (fp.ball) fp.ball.position.z = 0.14 + Math.abs(Math.sin(now / 260)) * 0.1
    }
  }

  /** maç başlarken: otoparktan sahaya oyuncular yürüsün */
  sendArrivals(n = 4) {
    const k = this.kit
    if (!k?.chars.length) return
    // ROTA: otopark çıkışı → sahalar ARASINDAKİ koridor (x≈7.25, kolon boşluğu) →
    // ana saha hizasına in → soldan sahaya gir. Kimsenin sahasının üstünden geçilmez.
    const CORR_X = 7.25
    for (let i = 0; i < n; i++) {
      const fig = fitCharacter(k.chars[Math.floor(Math.random() * k.chars.length)], 0.78)
      const endY = PITCH_Y + (Math.random() - 0.5) * 3
      const pts = [
        new THREE.Vector3(11.5 + Math.random() * 4, 6.6 + Math.random() * 1.4, 0), // otopark
        new THREE.Vector3(CORR_X, 6.2 + Math.random() * 0.8, 0),                    // koridor girişi
        new THREE.Vector3(CORR_X, endY, 0),                                         // koridordan aşağı
        new THREE.Vector3(PITCH_W / 2 + 1.2, endY, 0),                              // saha kenarı
      ]
      fig.position.copy(pts[0]); fig.visible = false
      this.scene.add(fig)
      this.walkers.push({ g: fig, seg: 1, pts, sp: 1.9 + Math.random() * 0.5, delay: i * 0.5 })
    }
  }

  /** REKLAM PANOSU — saha kenarına, satın alınınca görünür */
  setBillboards(on: boolean) {
    if (on && this.billboards.length === 0) {
      // GRUP MARKALARI: tek kelimeliler dar (1 birim), uzunlar geniş (2 birim).
      // KOYU zemin + BEYAZ kalın yazı — 'çok aydınlık, okunmuyor' geri bildirimi.
      const ads: { txt: string; bg: string; units: number }[] = [
        { txt: 'BENERITS', bg: '#14532d', units: 1 },
        { txt: 'HOPSULE', bg: '#1d3a8f', units: 1 },
        { txt: 'BENELOIL', bg: '#8f1d1d', units: 1 },
        { txt: 'DENIZOGLU CAPITAL', bg: '#123c4a', units: 2 },
      ]
      const UNIT = 2.9, GAP = 0.35
      const totalW = ads.reduce((a2, x) => a2 + x.units * UNIT, 0) + GAP * (ads.length - 1)
      let cursor = -totalW / 2
      for (const ad of ads) {
        const w = ad.units * UNIT
        const g = new THREE.Group()
        const cw = 220 * ad.units
        const cvs = document.createElement('canvas'); cvs.width = cw; cvs.height = 64
        const ctx = cvs.getContext('2d')!
        ctx.fillStyle = ad.bg; ctx.beginPath(); ctx.roundRect(0, 0, cw, 64, 8); ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4
        ctx.beginPath(); ctx.roundRect(4, 4, cw - 8, 56, 6); ctx.stroke()
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        let fs = 30
        ctx.font = `800 ${fs}px sans-serif`
        while (ctx.measureText(ad.txt).width > cw - 28 && fs > 14) { fs -= 2; ctx.font = `800 ${fs}px sans-serif` }
        ctx.fillText(ad.txt, cw / 2, 34)
        const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace
        const pm = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
        pm.toneMapped = false
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 64 / cw), pm)
        p.position.z = 0.95; p.rotation.x = Math.PI / 2
        g.add(p)
        for (const ox of [-w / 2 + 0.35, w / 2 - 0.35]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), lam(0x8d97a1))
          leg.rotation.x = Math.PI / 2; leg.position.set(ox, 0, 0.5); g.add(leg)
        }
        g.position.set(cursor + w / 2, PITCH_Y - PITCH_D / 2 - 1.5, 0)
        this.scene.add(g); this.billboards.push(g)
        cursor += w + GAP
      }
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
    // zifiri karanlık YOK: taban aydınlık yüksek — gece 'akşam mavisi' hissi verir,
    // sahne ve UI her zaman okunur kalır
    this.hemi.intensity = 0.72 - n * 0.22
    this.sun.intensity = 0.95 - n * 0.45
    const col = new THREE.Color().setHSL(0.58, 0.45, 0.74 - n * 0.34)
    this.scene.background = col
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color = col
    const on = lightsOn && n > 0.22
    for (const m of this.lightMats) m.color.setHex(on ? 0xfff6d2 : 0x3a4148)
    for (const bm of this.beams) (bm.material as THREE.MeshBasicMaterial).opacity = on ? 0.07 * n : 0
    for (const gm of this.lampGlows) gm.opacity = n > 0.25 ? 0.85 * n : 0  // sokak lambaları gece yanar
    if (on) { this.hemi.intensity += 0.30; this.sun.intensity += 0.12 }
    // PENCERELER: gece evlerin/binaların ışıkları yanar
    for (const wgl of this.windowGlows)
      (wgl.material as THREE.MeshBasicMaterial).opacity = n > 0.3 ? 0.28 + 0.5 * n : 0
    // GÜN BATIMI: geçiş sırasında güneş turunculaşır, tam gecede soğuk beyaza döner
    if (n > 0.05 && n < 0.75) this.sun.color.setHSL(0.08, 0.55 * Math.sin(Math.PI * (n / 0.75)), 0.62)
    else this.sun.color.setHex(0xffffff)
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
