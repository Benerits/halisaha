/**
 * İzometrik 3D dünya — halı saha tesisi.
 * Kamera BenelOil'in kanıtlanmış kurulumu (ortografik ~24°).
 * Çevre Kenney kitleriyle giydirilir; kit inmezse prosedürel yedek devrede kalır.
 */
import * as THREE from 'three'
import { loadKit, fitModel, fitCharacter, type Kit } from './models'

export const PITCH_W = 13
export const PITCH_D = 8
const PITCH_Y = -3.2

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c })

function box(w: number, d: number, h: number, c: number, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), lam(c))
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true
  parent.add(m); return m
}

interface Ply { g: THREE.Group; team: 0 | 1; hx: number; hy: number; sp: number }

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
  private matchGroup = new THREE.Group()
  private parkedCars: THREE.Group[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0xa8dcef)
    this.scene.fog = new THREE.Fog(0xa8dcef, 78, 165)
    const a = innerWidth / innerHeight
    this.camera = new THREE.OrthographicCamera(-this.zoom * a / 2, this.zoom * a / 2, this.zoom / 2, -this.zoom / 2, -120, 220)
    this.camera.position.set(22, -44, 22)
    this.camera.up.set(0, 0, 1)
    this.camera.lookAt(-1, 2.5, 0)

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
    this.buildFence()
    this.buildParking()
    this.buildStreet()
    this.spawnPlayers()

    loadKit().then(k => { this.kit = k; this.dressScene() })
    addEventListener('resize', () => this.onResize())
  }

  onResize() {
    const a = innerWidth / innerHeight
    this.camera.left = -this.zoom * a / 2; this.camera.right = this.zoom * a / 2
    this.camera.top = this.zoom / 2; this.camera.bottom = -this.zoom / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(innerWidth, innerHeight)
  }

  private buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lam(0x7fa05e))
    g.receiveShadow = true; this.scene.add(g)
    // tesis zemini — asfalt/beton
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(36, 27), lam(0xb6b0a1))
    pad.position.set(0, -0.5, 0.01); pad.receiveShadow = true; this.scene.add(pad)
    // yürüyüş yolu (bina → saha)
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, 8), lam(0xc9c3b4))
    walk.position.set(-7.5, 3.2, 0.02); this.scene.add(walk)
  }

  buildPitch(cx: number, cy: number) {
    const g = new THREE.Group()
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W + 0.8, PITCH_D + 0.8), lam(0x2f7a3c))
    turf.position.z = 0.02; turf.receiveShadow = true; g.add(turf)
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W / 8, PITCH_D), lam(i % 2 ? 0x47a055 : 0x3c8d49))
      s.position.set(-PITCH_W / 2 + PITCH_W / 16 + i * PITCH_W / 8, 0, 0.03); g.add(s)
    }
    const line = (w: number, d: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xf4f7f2))
      m.position.set(x, y, 0.04); g.add(m)
    }
    line(PITCH_W - 0.5, 0.1, 0, PITCH_D / 2 - 0.25); line(PITCH_W - 0.5, 0.1, 0, -PITCH_D / 2 + 0.25)
    line(0.1, PITCH_D - 0.5, -PITCH_W / 2 + 0.25, 0); line(0.1, PITCH_D - 0.5, PITCH_W / 2 - 0.25, 0)
    line(0.1, PITCH_D - 0.5, 0, 0)
    const circ = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.45, 40), lam(0xf4f7f2))
    circ.position.z = 0.04; g.add(circ)
    // ceza sahaları
    for (const s of [-1, 1]) {
      line(0.1, 3.4, s * (PITCH_W / 2 - 2.2), 0)
      line(2.2, 0.1, s * (PITCH_W / 2 - 1.15), 1.7)
      line(2.2, 0.1, s * (PITCH_W / 2 - 1.15), -1.7)
    }
    // kaleler — direk + üst direk + file
    for (const s of [-1, 1]) {
      const gx = s * (PITCH_W / 2 - 0.3)
      for (const py of [-1.3, 1.3]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8), lam(0xfaf9f6))
        post.rotation.x = Math.PI / 2; post.position.set(gx, py, 0.8); post.castShadow = true; g.add(post)
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), lam(0xfaf9f6))
      bar.position.set(gx, 0, 1.6); bar.castShadow = true; g.add(bar)
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xeaf0f2, transparent: true, opacity: 0.3, side: THREE.DoubleSide }))
      net.rotation.y = Math.PI / 2; net.position.set(gx + s * 0.55, 0, 0.8); g.add(net)
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
    g.position.set(-8.5, 8.2, 0)
    this.scene.add(g)
  }

  private buildFence() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x7f8d99, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
    const seg = (w: number, x: number, y: number, rot: number, h = 2.6) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      m.position.set(x, y, h / 2); m.rotation.x = Math.PI / 2; m.rotation.y = rot
      this.scene.add(m)
      // direkler
      const n = Math.floor(w / 3)
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), lam(0x6f7d88))
        p.rotation.x = Math.PI / 2
        const t = -w / 2 + (w / n) * i
        p.position.set(x + (rot ? 0 : t), y + (rot ? t : 0), h / 2)
        this.scene.add(p)
      }
    }
    seg(36, 0, 13, 0); seg(36, 0, -14, 0)
    seg(27, -18, -0.5, Math.PI / 2); seg(27, 18, -0.5, Math.PI / 2)
  }

  private buildParking() {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.5), lam(0x585f66))
    pad.position.set(10.5, 8.5, 0.02); pad.receiveShadow = true; this.scene.add(pad)
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 5.6), lam(0xe9e4d6))
      l.position.set(7.2 + i * 2.2, 8.5, 0.03); this.scene.add(l)
    }
  }

  private buildStreet() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 6), lam(0x4c535a))
    road.position.set(0, 17.5, 0.01); this.scene.add(road)
    for (let i = -8; i <= 8; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), lam(0xeae5d7))
      d.position.set(i * 5, 17.5, 0.02); this.scene.add(d)
    }
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(90, 1.2), lam(0xa9a294))
    kerb.position.set(0, 14.4, 0.015); this.scene.add(kerb)
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
      this.players.push({ g: wrap, team, hx, hy, sp: 2.9 + Math.random() * 1.2 })
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
        [-16, 11, 2.6], [-11, 12.5, 2.2], [16, 11.5, 2.6], [12, -13, 2.4],
        [-16, -12, 2.2], [-4, -13.2, 2.5], [6, -13.2, 2.2], [16.5, 2, 2.6],
        [-17, 4, 2.3], [20, 14, 2.8], [-21, 13, 2.6],
      ]
      for (const [x, y, h] of spots) {
        const t = fitModel(k.trees[Math.floor(Math.random() * k.trees.length)], h)
        t.position.set(x, y, 0); t.rotation.z = Math.random() * Math.PI
        this.scene.add(t)
      }
    }
    // BİNALAR — mahalle dokusu (yolun ötesi + yanlar)
    if (k.buildings.length) {
      const spots: [number, number, number][] = [
        [-34, 30, 6], [-22, 31, 8], [-8, 30.5, 5.5], [6, 31, 7], [20, 30, 6], [33, 31, 8.5],
        [34, 8, 6.5], [35, -8, 5.5], [-34, -8, 6], [-35, 8, 7], [-33, -22, 5.5], [32, -22, 6.5],
      ]
      spots.forEach(([x, y, h], i) => {
        const b = fitModel(k.buildings[i % k.buildings.length], h)
        b.position.set(x, y, 0)
        b.rotation.z = (i % 4) * Math.PI / 2
        this.scene.add(b)
      })
    }
    // ARABALAR — otoparkta
    if (k.cars.length) {
      const slots: [number, number][] = [[8.3, 8.5], [10.5, 8.5], [12.7, 8.5]]
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
    // SAKSILAR — giriş süsü
    if (k.planter) {
      for (const [x, y] of [[-10.6, 5.4], [-6.4, 5.4], [-10.6, 11], [-6.4, 11]] as [number, number][]) {
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
    if (Math.hypot(this.bvx, this.bvy) < 0.25) { // top durdu → hafif dürt
      this.bvx += (Math.random() - 0.5) * 2; this.bvy += (Math.random() - 0.5) * 2
    }
    const near = [...this.players].sort((p, q) =>
      (p.g.position.x - b.x) ** 2 + (p.g.position.y - b.y) ** 2 -
      ((q.g.position.x - b.x) ** 2 + (q.g.position.y - b.y) ** 2))
    const now = performance.now()
    near.forEach((p, idx) => {
      const chase = idx < 3
      const tx = chase ? b.x : p.hx + Math.sin(now / 1500 + p.hy * 2) * 1.1
      const ty = chase ? b.y : p.hy + Math.cos(now / 1700 + p.hx * 2) * 0.9
      const dx = tx - p.g.position.x, dy = ty - p.g.position.y
      const d = Math.hypot(dx, dy) || 1
      const spd = chase ? p.sp : p.sp * 0.42
      p.g.position.x += (dx / d) * spd * dt
      p.g.position.y += (dy / d) * spd * dt
      p.g.rotation.z = Math.atan2(dy, dx) - Math.PI / 2 // koştuğu yöne bak
      if (chase && d < 0.45) {
        const gx = p.team === 0 ? PITCH_W / 2 : -PITCH_W / 2
        const ax = gx - b.x, ay = (PITCH_Y + (Math.random() - 0.5) * 2.4) - b.y
        const an = Math.hypot(ax, ay) || 1
        const pw = 5 + Math.random() * 6
        this.bvx = (ax / an) * pw; this.bvy = (ay / an) * pw
      }
    })
    this.ball.position.z = 0.15 + Math.abs(Math.sin(now / 200)) * 0.07
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
    this.zoom = Math.max(12, Math.min(60, this.zoom * f))
    this.onResize()
  }

  render() { this.renderer.render(this.scene, this.camera) }
}
