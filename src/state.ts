/**
 * HALI SAHA — oyun durumu ve ekonomi çekirdeği.
 * Three.js BİLMEZ → tamamı test edilebilir (BenelOil state.ts kalıbı).
 *
 * SIFIR SÜRTÜNME İLKESİ (Oğuz): oyuncu hiçbir şeyi tahmin etmek zorunda kalmasın.
 * Her karar kartında getirisi ve götürüsü YAZILI olacak; ne yapacağını bilmeyen
 * oyuncuya ÖNERİ KARTI zaten söyleyecek.
 */

// ---- Zaman ----
export const DAY_SECONDS = 160 // BenelOil ile aynı ritim: 1 oyun günü = 160 sn
export const OPEN_HOUR = 9
export const CLOSE_HOUR = 24
export const HOURS: number[] = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i)
export const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const

/** Saatin talep katsayısı — prime time 20-23 arası zaten dolu, asıl mesele gündüz. */
export function hourDemand(hour: number, dayIdx: number): number {
  const weekend = dayIdx >= 5
  if (hour >= 20 && hour <= 22) return weekend ? 0.85 : 1.0
  if (hour >= 18 && hour < 20) return weekend ? 0.8 : 0.65
  if (hour === 23) return 0.5
  if (hour >= 14 && hour < 18) return weekend ? 0.75 : 0.28
  return weekend ? 0.55 : 0.15 // sabah/öğle: oyunun asıl problemi
}

export type SegmentId = 'klasik' | 'genclik' | 'veteran' | 'kurumsal'

export interface Segment {
  id: SegmentId
  label: string
  /** hangi saat aralığını doldurur */
  hours: [number, number]
  /** temel ücret çarpanı */
  priceMult: number
  /** açık mı — kilitliyse yatırımla açılır */
  unlockNote: string
}

export const SEGMENTS: Record<SegmentId, Segment> = {
  klasik: { id: 'klasik', label: 'Akşamcı takımlar', hours: [18, 23], priceMult: 1.0, unlockNote: '' },
  genclik: { id: 'genclik', label: 'Gençlik / okul', hours: [14, 18], priceMult: 0.7, unlockNote: 'Okul anlaşması gerekli' },
  veteran: { id: 'veteran', label: 'Veteran / emekli', hours: [9, 13], priceMult: 0.6, unlockNote: 'Çay ocağı gerekli' },
  kurumsal: { id: 'kurumsal', label: 'Şirket takımları', hours: [12, 17], priceMult: 1.3, unlockNote: 'Kurumsal fatura gerekli' },
}

// ---- Rezervasyon ----
export interface Reservation {
  id: number
  team: string
  segment: SegmentId
  /** istenen gün (0-6) — esnekse -1 */
  day: number
  /** istenen saat — esnekse -1 */
  hour: number
  price: number
  /** abonelik teklifi mi (kaç hafta) */
  weeks: number
  /** kart ekranda kalma süresi (sn) */
  patience: number
  maxPatience: number
}

export interface Booking {
  day: number
  hour: number
  team: string
  segment: SegmentId
  price: number
  /** abonelik slotu mu */
  sub: boolean
  /** kalan hafta (abonelikte) */
  weeksLeft: number
}

const TEAM_NAMES = [
  'Yılmazlar', 'Kaptanlar', 'Mahalle FK', 'Şimşekler', 'Kartallar', 'Dostlar SK',
  'Gece Vardiyası', 'Beton Mikserleri', 'Emekliler', 'Çaycılar', 'Site Gençliği',
  'Ofis Ligi', 'Sanayi Spor', 'Kırmızı Kartlar', 'Ayaküstü FC', 'Kandilliler',
]

// ---- Mağaza / yatırım kalemleri ----
export type BuyId =
  | 'pitch2' | 'canteen' | 'fridge' | 'cleats' | 'lights' | 'shower'
  | 'schooldeal' | 'tearoom' | 'corporate' | 'staff' | 'docs'

export interface ShopItem {
  id: BuyId
  label: string
  /** kısa fayda — GETİRİSİ (sıfır sürtünme: oyuncu tahmin etmesin) */
  gain: string
  /** GÖTÜRÜSÜ — maliyet/dezavantaj */
  cost: number
  upkeep: number
  desc: string
  owned: boolean
  locked: string | null
}

export interface SaveData { [k: string]: unknown }

export class Game {
  money = 25_000
  rep = 3.0 // 0-5
  day = 1
  /** gün içi saniye */
  t = 0
  bookings: Booking[] = []
  queue: Reservation[] = []
  private nextId = 1
  /** haftalık gelir/gider defteri */
  incomeToday = 0
  expenseToday = 0
  lastDayProfit = 0
  events: string[] = []

  // yatırımlar
  pitches = 1
  hasCanteen = false
  hasFridge = false
  hasCleats = false
  hasLights = false
  hasShower = false
  hasSchoolDeal = false
  hasTeaRoom = false
  hasCorporate = false
  staff = 0
  docService = false

  /** belge geçerliliği 0-1 (1 = tam) — sıfıra yaklaşınca denetimde ceza */
  docs = 1

  // ---- türetilmiş ----
  get slotCount() { return this.pitches * 7 * HOURS.length }
  basePrice() { return 700 + this.pitches * 40 + Math.round(this.rep * 60) }
  /** kantin + ekipman geliri (maç başına) */
  extraPerMatch() {
    let v = 0
    if (this.hasCanteen) v += 120
    if (this.hasFridge) v += 60
    if (this.hasCleats) v += 45
    return v
  }
  dailyUpkeep() {
    let v = 350 // sabit: elektrik + su + temizlik
    if (this.hasLights) v += 180
    if (this.hasCanteen) v += 90
    if (this.hasShower) v += 70
    v += this.staff * 400
    if (this.docService) v += 250
    v += (this.pitches - 1) * 200
    return v
  }
  segmentOpen(s: SegmentId): boolean {
    if (s === 'genclik') return this.hasSchoolDeal
    if (s === 'veteran') return this.hasTeaRoom
    if (s === 'kurumsal') return this.hasCorporate
    return true
  }
  bookingAt(day: number, hour: number): Booking | undefined {
    return this.bookings.find(b => b.day === day && b.hour === hour)
  }
  /** doluluk yüzdesi */
  occupancy(): number {
    const usable = 7 * HOURS.length
    return usable === 0 ? 0 : this.bookings.length / usable
  }
  subRatio(): number {
    return this.bookings.length === 0 ? 0 : this.bookings.filter(b => b.sub).length / this.bookings.length
  }

  // ---- rezervasyon üretimi ----
  /** Talep: itibar + ışık + saat katsayısı. Sıfır sürtünme: kart üstünde her şey yazılı. */
  spawnReservation(): Reservation | null {
    if (this.queue.length >= 4) return null
    const open = (Object.keys(SEGMENTS) as SegmentId[]).filter(s => this.segmentOpen(s))
    const seg = SEGMENTS[open[Math.floor(Math.random() * open.length)]]
    const day = Math.floor(Math.random() * 7)
    const [h0, h1] = seg.hours
    const hour = h0 + Math.floor(Math.random() * Math.max(1, h1 - h0))
    // o saatte talep var mı?
    const demand = hourDemand(hour, day) * (0.65 + this.rep * 0.12) * (this.hasLights && hour >= 19 ? 1.25 : 1)
    if (Math.random() > demand) return null
    if (this.bookingAt(day, hour) && this.pitches < 2) return null
    const weeks = Math.random() < 0.28 ? (Math.random() < 0.5 ? 4 : 8) : 0
    const raw = this.basePrice() * seg.priceMult * (weeks > 0 ? 0.82 : 1)
    const r: Reservation = {
      id: this.nextId++,
      team: TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)],
      segment: seg.id,
      day, hour,
      price: Math.round(raw / 10) * 10,
      weeks,
      patience: 30, maxPatience: 30,
    }
    this.queue.push(r)
    return r
  }

  /** kartı takvime yerleştir */
  place(resId: number, day: number, hour: number): { ok: boolean; msg: string } {
    const i = this.queue.findIndex(r => r.id === resId)
    if (i < 0) return { ok: false, msg: 'Bu istek artık geçerli değil.' }
    const r = this.queue[i]
    if (this.bookingAt(day, hour)) return { ok: false, msg: 'O saat dolu.' }
    if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) return { ok: false, msg: 'Tesis o saatte kapalı.' }
    // katı istek: istediği saatten sapma varsa reddeder
    if (r.day !== day || r.hour !== hour) return { ok: false, msg: `${r.team} sadece ${DAY_NAMES[r.day]} ${r.hour}:00 istiyor.` }
    this.queue.splice(i, 1)
    this.bookings.push({
      day, hour, team: r.team, segment: r.segment, price: r.price,
      sub: r.weeks > 0, weeksLeft: r.weeks,
    })
    return { ok: true, msg: r.weeks > 0 ? `${r.team} ${r.weeks} hafta abone oldu!` : `${r.team} rezervasyonu alındı.` }
  }

  /** her saniye */
  tick(dt: number) {
    this.t += dt
    // belge aşınması (docService varsa otomatik yenilenir)
    if (this.docService) this.docs = Math.min(1, this.docs + 0.004 * dt)
    else this.docs = Math.max(0, this.docs - 0.0025 * dt)

    if (this.t >= DAY_SECONDS) {
      this.t -= DAY_SECONDS
      this.endDay()
    }
    // kart sabrı
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i].patience -= dt
      if (this.queue[i].patience <= 0) {
        const lost = this.queue.splice(i, 1)[0]
        this.events.push(`${lost.team} bekledi, başka sahaya gitti.`)
        this.rep = Math.max(0, this.rep - 0.02)
      }
    }
  }

  /** gün sonu: gelir tahsil, gider düş, abonelikleri işle */
  endDay() {
    const todays = this.bookings.filter(b => b.day === (this.day - 1) % 7)
    let income = 0
    for (const b of todays) {
      income += b.price + this.extraPerMatch()
      // abonelik haftası tüket
      if (b.sub) {
        b.weeksLeft--
        if (b.weeksLeft <= 0) {
          const happy = this.rep >= 3.2
          if (happy) { b.weeksLeft = 4; this.events.push(`${b.team} aboneliğini uzattı.`) }
          else {
            this.bookings = this.bookings.filter(x => x !== b)
            this.events.push(`${b.team} memnun kalmadı, aboneliği bıraktı.`)
            this.rep = Math.max(0, this.rep - 0.1)
          }
        }
      } else {
        // tek maç: slot boşalır
        this.bookings = this.bookings.filter(x => x !== b)
      }
    }
    const upkeep = this.dailyUpkeep()
    this.money += income - upkeep
    this.lastDayProfit = income - upkeep
    this.incomeToday = income
    this.expenseToday = upkeep
    this.day++
    // memnuniyet: dolulukla hafif artar
    if (todays.length > 0) this.rep = Math.min(5, this.rep + 0.03)
    this.events.push(`Gün ${this.day - 1}: ${todays.length} maç · gelir ₺${income.toLocaleString('tr-TR')} · gider ₺${upkeep.toLocaleString('tr-TR')}`)
    // denetim riski: belgeler zayıfsa
    if (this.docs < 0.35 && Math.random() < 0.4) {
      const fine = Math.round(this.basePrice() * 1.5)
      this.money = Math.max(0, this.money - fine)
      this.docs = Math.min(1, this.docs + 0.3)
      this.events.push(`DENETİM: evrak eksiği — ₺${fine.toLocaleString('tr-TR')} ceza kesildi.`)
      this.rep = Math.max(0, this.rep - 0.15)
    }
  }

  // ---- MAĞAZA (sıfır sürtünme: getiri/götürü satırda yazılı) ----
  shop(): ShopItem[] {
    const rows: ShopItem[] = [
      { id: 'canteen', label: 'Kantin', gain: 'Her maçtan +₺120', cost: 9_000, upkeep: 90,
        desc: 'Çay, tost, ayran. Maç sonrası oturan takım daha memnun ayrılır.', owned: this.hasCanteen, locked: null },
      { id: 'fridge', label: 'Soğuk Su Dolabı', gain: 'Her maçtan +₺60', cost: 3_500, upkeep: 0,
        desc: 'Yazın olmazsa olmaz. Kantin varken daha çok satar.', owned: this.hasFridge,
        locked: this.hasCanteen ? null : 'Önce kantin gerekli' },
      { id: 'cleats', label: 'Krampon Kiralama', gain: 'Her maçtan +₺45', cost: 4_200, upkeep: 0,
        desc: '“Abi kramponu unuttum” geliri. Zamanla eskir, yenilemek gerekir.', owned: this.hasCleats, locked: null },
      { id: 'lights', label: 'LED Projektör', gain: 'Akşam talebi +%25', cost: 14_000, upkeep: 180,
        desc: 'Işık kalitesi akşam maçlarını çeker; elektrik gideri artar.', owned: this.hasLights, locked: null },
      { id: 'shower', label: 'Duş & Soyunma', gain: 'İtibar +0,5', cost: 18_000, upkeep: 70,
        desc: 'Kalite algısını yükseltir, abonelikler daha uzun sürer.', owned: this.hasShower, locked: null },
      { id: 'pitch2', label: '2. Halı Saha', gain: 'Aynı saate 2 maç', cost: 120_000, upkeep: 200,
        desc: 'Kapasiteyi ikiye katlar — prime time çakışmaları biter.', owned: this.pitches >= 2, locked: null },
      { id: 'schooldeal', label: 'Okul Anlaşması', gain: 'Gençlik segmenti açılır (14-18)', cost: 12_000, upkeep: 0,
        desc: 'Öğleden sonra ölü saatleri okul takımlarıyla doldurursun.', owned: this.hasSchoolDeal, locked: null },
      { id: 'tearoom', label: 'Çay Ocağı', gain: 'Veteran segmenti açılır (9-13)', cost: 7_500, upkeep: 0,
        desc: 'Sabah emekli grupları gelir — en ölü saat dolar.', owned: this.hasTeaRoom, locked: null },
      { id: 'corporate', label: 'Kurumsal Fatura', gain: 'Şirket segmenti açılır (12-17)', cost: 15_000, upkeep: 0,
        desc: 'Şirket turnuvaları gündüz gelir, ücreti %30 yüksek.', owned: this.hasCorporate, locked: null },
      { id: 'staff', label: 'Tesis Görevlisi', gain: 'Saha bakımı otomatik', cost: 6_000, upkeep: 400,
        desc: 'Yovmiyesi var ama bakım işini üstlenir.', owned: this.staff >= 1, locked: null },
      { id: 'docs', label: 'Belge Takip Servisi', gain: 'Evraklar otomatik yenilenir', cost: 9_500, upkeep: 250,
        desc: 'Denetimde ceza yeme riskini bitirir.', owned: this.docService, locked: null },
    ]
    return rows
  }

  buy(id: BuyId): { ok: boolean; msg: string } {
    const it = this.shop().find(r => r.id === id)
    if (!it) return { ok: false, msg: 'Bilinmeyen kalem.' }
    if (it.owned) return { ok: false, msg: 'Zaten var.' }
    if (it.locked) return { ok: false, msg: it.locked }
    if (this.money < it.cost) return { ok: false, msg: `₺${(it.cost - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= it.cost
    switch (id) {
      case 'canteen': this.hasCanteen = true; break
      case 'fridge': this.hasFridge = true; break
      case 'cleats': this.hasCleats = true; break
      case 'lights': this.hasLights = true; break
      case 'shower': this.hasShower = true; this.rep = Math.min(5, this.rep + 0.5); break
      case 'pitch2': this.pitches = 2; break
      case 'schooldeal': this.hasSchoolDeal = true; break
      case 'tearoom': this.hasTeaRoom = true; break
      case 'corporate': this.hasCorporate = true; break
      case 'staff': this.staff = 1; break
      case 'docs': this.docService = true; break
    }
    this.events.push(`${it.label} alındı.`)
    return { ok: true, msg: `${it.label} hazır — ${it.gain}` }
  }

  // ---- ÖNERİ KARTLARI (sıfır sürtünme çekirdeği) ----
  /**
   * Oyuncuya "şimdi ne yapmalıyım?" sorusunu ASLA sordurtma.
   * Her öneri: ne yap + neden + kaça + ne kazandırır.
   */
  suggestions(): { title: string; why: string; action?: BuyId; cta?: string; urgent: boolean }[] {
    const out: { title: string; why: string; action?: BuyId; cta?: string; urgent: boolean }[] = []
    // 1. acil: evrak
    if (!this.docService && this.docs < 0.5) {
      out.push({ title: 'Evrakların eskiyor', why: `Geçerlilik %${Math.round(this.docs * 100)}. Denetim gelirse ceza yersin.`,
        action: 'docs', cta: 'Belge Takip Servisi ₺9.500', urgent: true })
    }
    // 2. boş prime-time varsa: ışık
    if (!this.hasLights && this.day >= 3) {
      out.push({ title: 'Akşam saatlerin boş kalıyor', why: 'Işık kalitesi düşük olduğu için akşam takımları başka sahaya gidiyor.',
        action: 'lights', cta: 'LED Projektör ₺14.000 → akşam talebi +%25', urgent: false })
    }
    // 3. gündüz boş: segment aç
    const dayEmpty = this.bookings.filter(b => b.hour < 18).length
    if (dayEmpty < 3 && !this.hasSchoolDeal) {
      out.push({ title: 'Gündüz saatlerin bomboş', why: 'Öğleden sonra (14-18) hiç müşterin yok. Okul takımları bu saati doldurur.',
        action: 'schooldeal', cta: 'Okul Anlaşması ₺12.000 → gençlik segmenti', urgent: false })
    }
    if (dayEmpty < 3 && this.hasSchoolDeal && !this.hasTeaRoom) {
      out.push({ title: 'Sabahlar hâlâ ölü', why: 'Emekli grupları sabah oynar ama çay ocağı olmayan sahaya gelmezler.',
        action: 'tearoom', cta: 'Çay Ocağı ₺7.500 → veteran segmenti', urgent: false })
    }
    // 4. kantin yoksa
    if (!this.hasCanteen && this.bookings.length >= 3) {
      out.push({ title: 'Maç sonrası herkes dağılıyor', why: 'Kantin yok; her maçtan ₺120 ek gelir kaçırıyorsun.',
        action: 'canteen', cta: 'Kantin ₺9.000', urgent: false })
    }
    // 5. doluluk yüksekse ikinci saha
    if (this.pitches < 2 && this.occupancy() > 0.35) {
      out.push({ title: 'Saha yetmiyor', why: `Doluluk %${Math.round(this.occupancy() * 100)}. Aynı saati isteyen takımları geri çeviriyorsun.`,
        action: 'pitch2', cta: '2. Halı Saha ₺120.000', urgent: false })
    }
    // 6. abonelik dengesi
    if (this.subRatio() > 0.65) {
      out.push({ title: 'Fazla abone bağladın', why: `Slotlarının %${Math.round(this.subRatio() * 100)}'i abonelikte. Yüksek ücretli tek maçlara yer kalmıyor.`,
        urgent: false })
    }
    if (out.length === 0) {
      out.push({ title: 'İşler yolunda', why: 'Gelen rezervasyon isteklerini takvime yerleştirmeye devam et.', urgent: false })
    }
    return out.slice(0, 3)
  }

  // ---- kayıt ----
  save(): SaveData {
    return {
      money: this.money, rep: this.rep, day: this.day, bookings: this.bookings,
      pitches: this.pitches, hasCanteen: this.hasCanteen, hasFridge: this.hasFridge,
      hasCleats: this.hasCleats, hasLights: this.hasLights, hasShower: this.hasShower,
      hasSchoolDeal: this.hasSchoolDeal, hasTeaRoom: this.hasTeaRoom, hasCorporate: this.hasCorporate,
      staff: this.staff, docService: this.docService, docs: this.docs,
    }
  }
  load(d: SaveData) {
    const n = (k: string, def: number) => typeof d[k] === 'number' ? d[k] as number : def
    const b = (k: string) => d[k] === true
    this.money = n('money', 25_000); this.rep = n('rep', 3); this.day = n('day', 1)
    this.pitches = n('pitches', 1); this.staff = n('staff', 0); this.docs = n('docs', 1)
    this.hasCanteen = b('hasCanteen'); this.hasFridge = b('hasFridge'); this.hasCleats = b('hasCleats')
    this.hasLights = b('hasLights'); this.hasShower = b('hasShower'); this.hasSchoolDeal = b('hasSchoolDeal')
    this.hasTeaRoom = b('hasTeaRoom'); this.hasCorporate = b('hasCorporate'); this.docService = b('docService')
    if (Array.isArray(d.bookings)) this.bookings = d.bookings as Booking[]
  }
}
