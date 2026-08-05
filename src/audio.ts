/**
 * Ses — dosya yok, tamamı Web Audio sentezi (BenelOil kalıbı).
 * İlk kullanıcı dokunuşunda açılır (tarayıcı autoplay kuralı).
 */
class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  on = localStorage.getItem('hs-sfx') !== '0'

  ensure() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.55
    this.master.connect(this.ctx.destination)
    // sekmeye dönünce devam
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx?.state !== 'running') this.ctx?.resume().catch(() => {})
    })
  }

  /** paylaşılan gürültü tamponu (beyaz) — filtreyle şekillenir */
  private noiseBuf: AudioBuffer | null = null
  private getNoise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf
    const len = this.ctx!.sampleRate
    const b = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noiseBuf = b
    return b
  }
  /** filtreli gürültü patlaması: thunk/çat/tık dokularının hammaddesi */
  private noise(dur: number, type: BiquadFilterType, freq: number, vol: number, when = 0, q = 1) {
    if (!this.ctx || !this.master || !this.on) return
    const t0 = this.ctx.currentTime + when
    const src = this.ctx.createBufferSource(); src.buffer = this.getNoise()
    src.loop = true; src.playbackRate.value = 0.9 + Math.random() * 0.2
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur)
    src.connect(f); f.connect(g); g.connect(this.master)
    src.start(t0); src.stop(t0 + dur + 0.03)
  }
  /** frekansı kayan ton (ıslık/iniş çıkış) */
  private glide(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, when = 0) {
    if (!this.ctx || !this.master || !this.on) return
    const t0 = this.ctx.currentTime + when
    const o = this.ctx.createOscillator(); o.type = type
    o.frequency.setValueAtTime(f0, t0)
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur)
    o.connect(g); g.connect(this.master)
    o.start(t0); o.stop(t0 + dur + 0.04)
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0) {
    if (!this.ctx || !this.master || !this.on) return
    const t0 = this.ctx.currentTime + when
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur)
    osc.connect(g); g.connect(this.master)
    osc.start(t0); osc.stop(t0 + dur + 0.04)
  }

  /** TELEFON — gerçek masa telefonu zili: 425Hz taşıyıcı + 20Hz tremolo, çift vuruş */
  ring() {
    this.ensure()
    if (!this.ctx || !this.master || !this.on) return
    // TEK yumuşak vuruş: kısık, sine tremolo (sert kare değil), yumuşak giriş-çıkış
    const t0 = this.ctx.currentTime
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 480
    const trem = this.ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 16
    const tg = this.ctx.createGain(); tg.gain.value = 0.3
    const g = this.ctx.createGain(); g.gain.value = 0
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.032, t0 + 0.06)
    g.gain.setValueAtTime(0.032, t0 + 0.26)
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.4)
    trem.connect(tg); tg.connect(g.gain)
    o.connect(g); o2.connect(g); g.connect(this.master!)
    o.start(t0); o.stop(t0 + 0.42); o2.start(t0); o2.stop(t0 + 0.42)
    trem.start(t0); trem.stop(t0 + 0.42)
  }

  /** rezervasyon yerleşti — ahşap 'tak' + kısa onay */
  place() {
    this.ensure()
    this.noise(0.06, 'lowpass', 900, 0.14)         // damga vuruşu
    this.tone(210, 0.07, 'sine', 0.10)             // gövde
    this.tone(880, 0.12, 'sine', 0.07, 0.06)       // onay parıltısı
  }

  /** para geldi — bozuk para şıngırtısı (metalik inharmonik tınılar + çekmece) */
  cash() {
    this.ensure()
    this.noise(0.05, 'lowpass', 300, 0.10)                        // çekmece 'thk'
    for (const [f, w] of [[2510, 0.03], [3350, 0.07], [4180, 0.11]] as [number, number][]) {
      this.tone(f, 0.12, 'sine', 0.055, w)
      this.tone(f * 1.48, 0.09, 'sine', 0.028, w + 0.01)          // metalik üst kısmi
    }
  }

  /** müşteri kaçtı — inen ıslık + kapı sesi */
  lost() {
    this.ensure()
    this.glide(880, 420, 0.35, 'sine', 0.06)
    this.noise(0.08, 'lowpass', 400, 0.09, 0.4)   // kapanan kapı
  }

  /** olmadı — kısa kapı zili vızıltısı */
  bad() {
    this.ensure()
    this.noise(0.14, 'bandpass', 320, 0.05, 0, 3)
    this.tone(130, 0.16, 'sawtooth', 0.06)
    this.tone(98, 0.18, 'sawtooth', 0.05, 0.05)
  }

  /** yatırım/inşaat — çift çekiç vuruşu + tamam tınısı */
  build() {
    this.ensure()
    this.noise(0.07, 'lowpass', 500, 0.15)
    this.tone(180, 0.06, 'sine', 0.09)
    this.noise(0.07, 'lowpass', 650, 0.13, 0.14)
    this.tone(220, 0.06, 'sine', 0.08, 0.14)
    this.tone(523, 0.16, 'triangle', 0.08, 0.30)
    this.tone(659, 0.2, 'sine', 0.06, 0.36)
  }

  /** gün sonu */
  day() {
    this.ensure()
    const n = [523.3, 659.3, 784.0]
    n.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, i * 0.08))
  }

  /** hafif tık */
  click() { this.ensure(); this.tone(700, 0.05, 'triangle', 0.07) }

  /** MAÇ TEZAHÜRATI: kabaran kalabalık dalgası + gerçekçi hakem düdüğü */
  cheer() {
    this.ensure()
    if (!this.ctx || !this.master || !this.on) return
    // kalabalık dalgası: bandpass gürültü kabarıp iner
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource(); src.buffer = this.getNoise(); src.loop = true
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t0)
    f.frequency.linearRampToValueAtTime(900, t0 + 0.5); f.Q.value = 0.8
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.07, t0 + 0.35)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6)
    src.connect(f); f.connect(g); g.connect(this.master)
    src.start(t0); src.stop(t0 + 1.7)
    // hakem düdüğü: 2100Hz + hızlı vibrato (gerçek düdük tınısı), çift üfleme
    const whistle = (when: number, dur: number) => {
      const w0 = this.ctx!.currentTime + when
      const o = this.ctx!.createOscillator(); o.type = 'square'; o.frequency.value = 2080
      const vib = this.ctx!.createOscillator(); vib.type = 'sine'; vib.frequency.value = 38
      const vg = this.ctx!.createGain(); vg.gain.value = 90
      vib.connect(vg); vg.connect(o.frequency)
      const g2 = this.ctx!.createGain()
      g2.gain.setValueAtTime(0, w0)
      g2.gain.linearRampToValueAtTime(0.035, w0 + 0.015)
      g2.gain.setValueAtTime(0.035, w0 + dur - 0.03)
      g2.gain.exponentialRampToValueAtTime(0.0008, w0 + dur)
      o.connect(g2); g2.connect(this.master!)
      o.start(w0); o.stop(w0 + dur + 0.02); vib.start(w0); vib.stop(w0 + dur + 0.02)
    }
    whistle(0.12, 0.22); whistle(0.42, 0.38)
  }

  // ---- KALABALIK UĞULTUSU: üretilmiş gürültü (TELİF YOK) — maç heyecanıyla yükselir ----
  private crowdGain: GainNode | null = null
  private crowdStart() {
    if (!this.ctx || !this.master || this.crowdGain) return
    this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0
    this.crowdGain.connect(this.master)
    // katman 1: GÖVDE — kahverengi gürültü, alçak geçiren (uzak stadyum uğultusu)
    const len = this.ctx.sampleRate * 2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.03 * w) / 1.03; d[i] = last * 3 }
    const body = this.ctx.createBufferSource(); body.buffer = buf; body.loop = true
    const bf = this.ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 340
    const bg = this.ctx.createGain(); bg.gain.value = 1
    body.connect(bf); bf.connect(bg); bg.connect(this.crowdGain)
    body.start()
    // katman 2: KONUŞMA DOKUSU — bandpass, yavaş rastgele dalgalanır (canlılık)
    const chat = this.ctx.createBufferSource(); chat.buffer = this.getNoise(); chat.loop = true
    chat.playbackRate.value = 0.65
    const cf = this.ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 950; cf.Q.value = 1.4
    const cg = this.ctx.createGain(); cg.gain.value = 0.35
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.23
    const lg = this.ctx.createGain(); lg.gain.value = 0.14
    lfo.connect(lg); lg.connect(cg.gain)
    chat.connect(cf); cf.connect(cg); cg.connect(this.crowdGain)
    chat.start(); lfo.start()
  }
  /** 0 = sessiz, 1 = coşku — yumuşak geçişle hedefe iner/çıkar */
  crowd(level: number) {
    if (!this.ctx) return
    this.crowdStart()
    if (!this.crowdGain) return
    const v = this.on ? Math.min(0.085, Math.max(0, level) * 0.085) : 0
    this.crowdGain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.45)
  }

  /** şube geçişi — kısa süpürme */
  swoosh() {
    this.ensure()
    this.tone(520, 0.1, 'sine', 0.08)
    this.tone(720, 0.1, 'sine', 0.07, 0.07)
    this.tone(980, 0.16, 'sine', 0.06, 0.14)
  }

  // ---- ARKA PLAN MÜZİĞİ: tamamen sentez, telif YOK ----
  private musicT: number | null = null
  private step = 0
  /** şube ruhu: kök diziler (mahalle sakin, sahil açık majör, sanayi ritmik minör) */
  private roots = [196.0, 146.8, 164.8, 220.0]
  setMood(theme: string) {
    this.roots = theme === 'sahil' ? [220.0, 164.8, 196.0, 246.9]
      : theme === 'sanayi' ? [146.8, 130.8, 146.8, 174.6]
      : [196.0, 146.8, 164.8, 220.0]
  }
  musicOn = localStorage.getItem('hs-music') !== '0'

  /** her tıkta güvenle çağrılır: motoru kur + duraklamışsa uyandır + müziği başlat */
  kick(theme: string) {
    this.ensure()
    this.setMood(theme)
    this.startMusic()
  }

  startMusic() {
    if (this.musicT || !this.musicOn) return
    this.ensure()
    if (!this.ctx) return
    this.musicT = window.setInterval(() => this.musicBar(), 2400)
    this.musicBar()
  }

  /** 2.4 sn'lik ölçü: kısık pad akoru + pentatonik tınılar — sakin dükkân ambiyansı */
  private musicBar() {
    if (!this.ctx || !this.on || !this.musicOn || document.hidden) return
    const r = this.roots[this.step++ % 4]
    for (const [m, v] of [[1, 0.030], [1.5, 0.020], [2, 0.015]] as [number, number][])
      this.tone(r * m, 2.3, 'sine', v)
    const pent = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]
    const n = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++)
      this.tone(r * 2 * pent[Math.floor(Math.random() * pent.length)], 0.55, 'triangle', 0.020,
        0.35 + i * 0.65 + Math.random() * 0.25)
  }

  toggleMusic(): boolean {
    this.musicOn = !this.musicOn
    localStorage.setItem('hs-music', this.musicOn ? '1' : '0')
    if (!this.musicOn) { if (this.musicT) { clearInterval(this.musicT); this.musicT = null } }
    else this.startMusic()
    return this.musicOn
  }

  toggle(): boolean {
    this.on = !this.on
    localStorage.setItem('hs-sfx', this.on ? '1' : '0')
    if (this.on) this.click()
    return this.on
  }
}

export const audio = new Audio()
