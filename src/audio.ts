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

  /** TELEFON — yumuşak iki notalı bildirim (eski 'trrr' sinir bozucuydu) */
  ring() {
    this.ensure()
    if (!this.ctx || !this.on) return
    // yükselen ikili: sıcak, kısa, dikkat çeker ama rahatsız etmez
    this.tone(659, 0.16, 'sine', 0.062)          // E5
    this.tone(988, 0.26, 'sine', 0.052, 0.11)    // B5
    this.tone(1319, 0.20, 'sine', 0.022, 0.20)   // hafif üst tını
  }

  /** rezervasyon yerleşti — onay */
  place() {
    this.ensure()
    this.tone(587, 0.09, 'triangle', 0.13)
    this.tone(880, 0.14, 'sine', 0.12, 0.075)
  }

  /** para geldi */
  cash() {
    this.ensure()
    this.tone(988, 0.08, 'sine', 0.13)
    this.tone(1319, 0.15, 'sine', 0.11, 0.07)
  }

  /** olmadı */
  bad() {
    this.ensure()
    this.tone(196, 0.16, 'sawtooth', 0.075)
    this.tone(150, 0.2, 'sawtooth', 0.065, 0.07)
  }

  /** yatırım yapıldı */
  build() {
    this.ensure()
    this.tone(262, 0.1, 'square', 0.09)
    this.tone(392, 0.12, 'triangle', 0.11, 0.08)
    this.tone(523, 0.18, 'triangle', 0.1, 0.16)
  }

  /** gün sonu */
  day() {
    this.ensure()
    const n = [523.3, 659.3, 784.0]
    n.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, i * 0.08))
  }

  /** hafif tık */
  click() { this.ensure(); this.tone(700, 0.05, 'triangle', 0.07) }

  toggle(): boolean {
    this.on = !this.on
    localStorage.setItem('hs-sfx', this.on ? '1' : '0')
    if (this.on) this.click()
    return this.on
  }
}

export const audio = new Audio()
