/**
 * İzometrik 3D dünya — halı saha tesisi.
 * BenelOil'in kanıtlanmış kamera kurulumu (ortografik, ~24°) devralındı.
 */
import * as THREE from 'three'

export const PITCH_W = 12   // izometrik birim (≈40 m)
export const PITCH_D = 7.5  // (≈25 m)

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c })

function box(w: number, d: number, h: number, c: number, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), lam(c))
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

export interface Player { mesh: THREE.Mesh; vx: number; vy: number; team: 0 | 1; homeX: number; homeY: number }

export class World {
  scene = new THREE.Scene()
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  /** her saha için bot oyuncular */
  players: Player[] = []
  ball!: THREE.Mesh
  ballVX = 0; ballVY = 0
  private floodlights: THREE.Mesh[] = []
  private lightMats: THREE.MeshBasicMaterial[] = []
  private pitchGroups: THREE.Group[] = []
  private zoom = 23

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x9fd4e8)
    const a = window.innerWidth / window.innerHeight
    this.camera = new THREE.OrthographicCamera(-this.zoom * a / 2, this.zoom * a / 2, this.zoom / 2, -this.zoom / 2, -100, 200)
    // BenelOil ana açısı: (1, 2, 1) yönü ≈ 24°
    this.camera.position.set(20, -40, 20)
    this.camera.up.set(0, 0, 1)
    this.camera.lookAt(0, -1.5, 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.hemi = new THREE.HemisphereLight(0xdff0fa, 0x6d8a5e, 1.05)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff6e4, 1.15)
    this.sun.position.set(14, -18, 26)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const c = this.sun.shadow.camera as THREE.OrthographicCamera
    c.left = -35; c.right = 35; c.top = 35; c.bottom = -35; c.near = 1; c.far = 90
    this.scene.add(this.sun)

    this.buildGround()
    this.buildPitch(0, -4.5)
    this.buildBuilding()
    this.buildFence()
    this.buildSurroundings()
    this.spawnPlayers()

    addEventListener('resize', () => this.onResize())
  }

  private onResize() {
    const a = window.innerWidth / window.innerHeight
    this.camera.left = -this.zoom * a / 2; this.camera.right = this.zoom * a / 2
    this.camera.top = this.zoom / 2; this.camera.bottom = -this.zoom / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), lam(0x7e8b6d))
    g.receiveShadow = true
    this.scene.add(g)
    // tesis betonu
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), lam(0xc9c3b3))
    pad.position.set(0, 0, 0.01)
    pad.receiveShadow = true
    this.scene.add(pad)
  }

  /** halı saha: çim + çizgiler + kaleler + file direkleri */
  buildPitch(cx: number, cy: number) {
    const g = new THREE.Group()
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_D), lam(0x3f8f4a))
    turf.position.z = 0.02
    turf.receiveShadow = true
    g.add(turf)
    // çim şeritleri
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W / 6, PITCH_D), lam(i % 2 ? 0x459a51 : 0x3b8745))
      s.position.set(-PITCH_W / 2 + PITCH_W / 12 + i * PITCH_W / 6, 0, 0.03)
      g.add(s)
    }
    // beyaz çizgiler
    const line = (w: number, d: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xf2f4f0))
      m.position.set(x, y, 0.04); g.add(m)
    }
    line(PITCH_W - 0.4, 0.09, 0, PITCH_D / 2 - 0.2)
    line(PITCH_W - 0.4, 0.09, 0, -PITCH_D / 2 + 0.2)
    line(0.09, PITCH_D - 0.4, -PITCH_W / 2 + 0.2, 0)
    line(0.09, PITCH_D - 0.4, PITCH_W / 2 - 0.2, 0)
    line(0.09, PITCH_D - 0.4, 0, 0)
    const circle = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.34, 32), lam(0xf2f4f0))
    circle.position.z = 0.04; g.add(circle)
    // kaleler
    for (const s of [-1, 1]) {
      const gx = s * (PITCH_W / 2 - 0.35)
      box(0.12, 2.6, 1.5, 0xf5f5f2, gx, 0, 0.75, g)
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5),
        new THREE.MeshLambertMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))
      net.rotation.y = Math.PI / 2
      net.position.set(gx + s * 0.5, 0, 0.75)
      g.add(net)
    }
    g.position.set(cx, cy, 0)
    this.scene.add(g)
    this.pitchGroups.push(g)
    // projektör direkleri
    for (const [px, py] of [[-PITCH_W / 2 - 1, PITCH_D / 2 + 1], [PITCH_W / 2 + 1, PITCH_D / 2 + 1],
                            [-PITCH_W / 2 - 1, -PITCH_D / 2 - 1], [PITCH_W / 2 + 1, -PITCH_D / 2 - 1]] as [number, number][]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 6, 8), lam(0x9aa3ac))
      pole.rotation.x = Math.PI / 2
      pole.position.set(cx + px, cy + py, 3)
      this.scene.add(pole)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), new THREE.MeshBasicMaterial({ color: 0x3a4148 }))
      head.position.set(cx + px, cy + py, 6)
      this.scene.add(head)
      const glow = new THREE.MeshBasicMaterial({ color: 0x3a4148 })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.12), glow)
      lamp.position.set(cx + px, cy + py - 0.18, 5.85)
      this.scene.add(lamp)
      this.floodlights.push(lamp)
      this.lightMats.push(glow)
    }
    return g
  }

  /** merkez bina: kantin + soyunma + idare */
  private buildBuilding() {
    const g = new THREE.Group()
    box(7, 4, 2.6, 0xe8e2d4, 0, 0, 1.3, g)
    box(7.3, 4.3, 0.25, 0xd64545, 0, 0, 2.7, g)   // kırmızı saçak (marka rengi)
    box(1.1, 0.12, 1.6, 0x3a4148, -1.6, -2.02, 0.8, g) // kapı
    for (const x of [0.6, 2.2]) box(1.2, 0.1, 0.9, 0x9fd4e8, x, -2.02, 1.5, g) // pencere
    // tabela
    const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 128
    const ctx = cvs.getContext('2d')!
    ctx.fillStyle = '#d64545'; ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = '#faf6ec'; ctx.font = '800 62px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('HALI SAHA', 256, 68)
    const tex = new THREE.CanvasTexture(cvs)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: tex }))
    sign.position.set(0, -2.06, 2.0)
    sign.rotation.x = Math.PI / 2
    g.add(sign)
    g.position.set(-6, 7.5, 0)
    this.scene.add(g)
  }

  private buildFence() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8d9aa5, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    const mk = (w: number, x: number, y: number, rot: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), mat)
      m.position.set(x, y, 1.2); m.rotation.x = Math.PI / 2; m.rotation.y = rot
      this.scene.add(m)
    }
    mk(34, 0, 13, 0); mk(34, 0, -13, 0)
    mk(26, -17, 0, Math.PI / 2); mk(26, 17, 0, Math.PI / 2)
  }

  /** mahalle dokusu — apartmanlar, yol, ağaçlar */
  private buildSurroundings() {
    for (let i = 0; i < 5; i++) {
      const h = 6 + (i % 3) * 3
      box(5, 5, h, i % 2 ? 0xc9c2b4 : 0xd5cec0, -26 + i * 6.5, 22, h / 2, this.scene)
    }
    for (let i = 0; i < 4; i++) box(5, 5, 7 + (i % 2) * 4, 0xcfc8ba, 24, -18 + i * 7, 4, this.scene)
    // yol
    const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 5), lam(0x4a5057))
    road.position.set(0, 16.5, 0.01)
    this.scene.add(road)
    for (let i = -7; i <= 7; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.18), lam(0xe8e4d8))
      d.position.set(i * 5, 16.5, 0.02); this.scene.add(d)
    }
    // ağaçlar
    for (const [x, y] of [[-14, 12], [14, 12], [-20, -10], [20, 8], [8, -14]] as [number, number][]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6), lam(0x7a5c3e))
      t.rotation.x = Math.PI / 2; t.position.set(x, y, 0.7); this.scene.add(t)
      const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), lam(0x4f8250))
      c2.position.set(x, y, 2); c2.castShadow = true; this.scene.add(c2)
    }
  }

  /** 14 bot oyuncu + top */
  private spawnPlayers() {
    const cy = -4.5
    for (let i = 0; i < 14; i++) {
      const team = (i < 7 ? 0 : 1) as 0 | 1
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 4, 8),
        lam(team === 0 ? 0xd64545 : 0x2f6fed))
      const hx = (team === 0 ? -1 : 1) * (1 + (i % 7) * 0.9)
      const hy = cy + ((i % 7) - 3) * 0.9
      m.position.set(hx, hy, 0.35)
      m.rotation.x = Math.PI / 2
      m.castShadow = true
      this.scene.add(m)
      this.players.push({ mesh: m, vx: 0, vy: 0, team, homeX: hx, homeY: hy })
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lam(0xf7f7f5))
    this.ball.position.set(0, cy, 0.13)
    this.ball.castShadow = true
    this.scene.add(this.ball)
  }

  /** bot futbol: topu kovala + pas + şut — izometrikten "maç" gibi okunuyor */
  updateMatch(dt: number, active: boolean) {
    const vis = active
    for (const p of this.players) p.mesh.visible = vis
    this.ball.visible = vis
    if (!vis) return
    const b = this.ball.position
    b.x += this.ballVX * dt; b.y += this.ballVY * dt
    this.ballVX *= 0.985; this.ballVY *= 0.985
    // saha sınırı
    const cy = -4.5
    if (Math.abs(b.x) > PITCH_W / 2 - 0.3) { this.ballVX *= -0.7; b.x = Math.sign(b.x) * (PITCH_W / 2 - 0.3) }
    if (Math.abs(b.y - cy) > PITCH_D / 2 - 0.3) { this.ballVY *= -0.7; b.y = cy + Math.sign(b.y - cy) * (PITCH_D / 2 - 0.3) }
    // en yakın iki oyuncu topa koşar, diğerleri pozisyona döner
    const sorted = [...this.players].sort((p, q) =>
      (p.mesh.position.distanceToSquared(b)) - (q.mesh.position.distanceToSquared(b)))
    sorted.forEach((p, idx) => {
      const chase = idx < 3
      const tx = chase ? b.x : p.homeX + Math.sin(performance.now() / 1400 + p.homeY) * 0.7
      const ty = chase ? b.y : p.homeY + Math.cos(performance.now() / 1600 + p.homeX) * 0.7
      const dx = tx - p.mesh.position.x, dy = ty - p.mesh.position.y
      const d = Math.hypot(dx, dy) || 1
      const spd = chase ? 3.4 : 1.5
      p.mesh.position.x += (dx / d) * spd * dt
      p.mesh.position.y += (dy / d) * spd * dt
      // topa değdi → vur
      if (chase && d < 0.4) {
        const goalX = p.team === 0 ? PITCH_W / 2 : -PITCH_W / 2
        const ax = goalX - b.x, ay = (cy + (Math.random() - 0.5) * 2) - b.y
        const an = Math.hypot(ax, ay) || 1
        const power = 4 + Math.random() * 5
        this.ballVX = (ax / an) * power
        this.ballVY = (ay / an) * power
      }
    })
    // zıplama hissi
    this.ball.position.z = 0.13 + Math.abs(Math.sin(performance.now() / 220)) * 0.06
  }

  /** gece: 0 = gündüz, 1 = tam gece. Projektörler yanar. */
  setNight(n: number, lightsOn: boolean) {
    this.hemi.intensity = 1.05 - n * 0.62
    this.sun.intensity = 1.15 - n * 0.95
    this.scene.background = new THREE.Color().setHSL(0.55, 0.5, 0.72 - n * 0.55)
    const on = lightsOn && n > 0.25
    for (const m of this.lightMats) m.color.setHex(on ? 0xfff6d0 : 0x3a4148)
    if (on) { this.hemi.intensity += 0.35; this.sun.intensity += 0.12 }
  }

  render() { this.renderer.render(this.scene, this.camera) }
}
