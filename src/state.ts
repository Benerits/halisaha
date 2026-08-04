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
  /** KATI istekte tek gün; ESNEKte kabul edilen günler */
  day: number
  hour: number
  /** esnek mi — birden çok slota konabilir (asıl karar burada doğar) */
  flexible: boolean
  flexDays: number[]
  flexHours: number[]
  /** müşterinin teklifi */
  price: number
  /** GİZLİ: en fazla ödeyeceği (pazarlık bunun üstünde patlar) */
  maxPay: number
  /** pazarlık yapıldı mı (bir kez) */
  haggled: boolean
  weeks: number
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
  | 'canteen' | 'fridge' | 'cleats' | 'lights' | 'shower'
  | 'schooldeal' | 'tearoom' | 'corporate' | 'staff' | 'docs' | 'billboard' | 'roadsign'
  | 'phone2' | 'cirak' | 'ads'

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

// ---- ARSA IZGARASI (3x3) — TESİS BU IZGARANIN ÜSTÜNDE OTURUR ----
// Başlangıç mülkü: üst sıra (kulüp binası + avlu + otopark) ve ortadaki saha parseli.
// Kalan 5 parsel dümdüz çimen; satın alınıp geliştirilebilir.
export const PARCEL_COLS = 3
export const PARCEL_ROWS = 3
/** parsel dünya boyutu (izometrik birim) — ana saha (13x8) bir parsele tam sığar */
export const PARCEL_W = 14
export const PARCEL_D = 9.6
export const parcelKey = (c: number, r: number) => `${c},${r}`
/** oyuna sahip başlanan parseller: kulüp binası, avlu, otopark, ana saha */
export const STARTER_PARCELS = ['0,0', '1,0', '2,0', '1,1']
/** Fiyat ana sahaya (1,1) yakınlıkla artar */
export function parcelCost(c: number, r: number): number {
  const d = Math.abs(c - 1) + Math.abs(r - 1)
  return Math.max(14_000, 26_000 - d * 4_000)
}

export type BuildKind = 'pitch' | 'mini' | 'basket' | 'voley' | 'parking' | 'garden'
export interface PlacedBuild { key: string; kind: BuildKind }

export const BUILDS: Record<BuildKind, { label: string; cost: number; gain: string; desc: string }> = {
  pitch:   { label: 'Halı Saha', cost: 62_000, gain: 'Aynı saate +1 maç', desc: 'Tam boy ikinci saha — prime-time çakışmaları biter.' },
  mini:    { label: 'Mini Saha 5v5', cost: 34_000, gain: 'Aynı saate +1 maç', desc: 'Küçük ve ucuz; çocuk/genç grupları için hızlı devir.' },
  basket:  { label: 'Basketbol Sahası', cost: 26_000, gain: 'Günde +₺800 kira', desc: 'Saatlik kiralanır; futbol takviminden bağımsız pasif gelir.' },
  voley:   { label: 'Voleybol Sahası', cost: 20_000, gain: 'Günde +₺550 · itibar +0,2', desc: 'Kum zemin; yazın çok tutar, tesise çeşitlilik katar.' },
  parking: { label: 'Ek Otopark', cost: 18_000, gain: 'İtibar +0,3', desc: 'Araç sığmayınca müşteri kaçar; park yeri memnuniyeti artırır.' },
  garden:  { label: 'Yeşil Alan', cost: 9_000, gain: 'İtibar +0,2', desc: 'Oturma alanı ve peyzaj — tesis daha bakımlı görünür.' },
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
  hasBillboard = false   // saha kenarı reklam panoları — kira geliri
  hasRoadSign = false    // yol tabelası — talep artışı
  /** satın alınmış parseller */
  ownedParcels: string[] = [...STARTER_PARCELS]
  /** parsellere kurulan yapılar */
  builds: PlacedBuild[] = []

  /** belge geçerliliği 0-1 (1 = tam) — sıfıra yaklaşınca denetimde ceza */
  docs = 1
  /** HAFTALIK KİRA — 7 günde bir öde; ödeyemezsen itibar yanar (baskı davulu) */
  rentDueDay = 7
  rentMissed = 0
  rentAmount(): number { return 12_000 + (this.pitches - 1) * 4_000 }
  daysToRent(): number { return Math.max(0, this.rentDueDay - this.day + 1) }

  // ---- türetilmiş ----
  get slotCount() { return this.pitches * 7 * HOURS.length }
  basePrice() { return 700 + this.pitches * 40 + Math.round(this.rep * 60) }
  /** kantin + ekipman geliri (maç başına) */
  extraPerMatch() {
    let v = 0
    if (this.hasCanteen) v += 120
    if (this.hasFridge) v += 60
    if (this.hasCleats) v += 45
    if (this.hasBillboard) v += 90   // pano kirası maç başına yansır
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
    if (this.queue.length >= this.queueCap()) return null
    const open = (Object.keys(SEGMENTS) as SegmentId[]).filter(s => this.segmentOpen(s))
    const seg = SEGMENTS[open[Math.floor(Math.random() * open.length)]]
    const day = Math.floor(Math.random() * 7)
    const [h0, h1] = seg.hours
    const hour = h0 + Math.floor(Math.random() * Math.max(1, h1 - h0))
    // o saatte talep var mı?
    const demand = hourDemand(hour, day) * (0.65 + this.rep * 0.12)
      * (this.hasLights && hour >= 19 ? 1.25 : 1) * (this.hasRoadSign ? 1.2 : 1)
      * (this.adDays > 0 ? 1.5 : 1)
    if (Math.random() > demand) return null
    if (this.bookingAt(day, hour) && this.pitches < 2) return null
    const weeks = Math.random() < 0.28 ? (Math.random() < 0.5 ? 4 : 8) : 0
    const raw = this.basePrice() * seg.priceMult * (weeks > 0 ? 0.82 : 1)
    // ESNEK İSTEK (%60): "hafta içi akşam olsun" → hangi slota koyacağına SEN karar verirsin
    const flexible = Math.random() < 0.6
    const flexDays: number[] = []
    const flexHours: number[] = []
    if (flexible) {
      const weekendOnly = Math.random() < 0.25
      for (let d = 0; d < 7; d++) if (weekendOnly ? d >= 5 : d < 5) flexDays.push(d)
      const span = 2 + Math.floor(Math.random() * 2)
      for (let k = 0; k < span; k++) { const hh = hour + k; if (hh < CLOSE_HOUR) flexHours.push(hh) }
    }
    // TUTARLILIK: esnek kartın temel gün/saati kendi kümesinin İÇİNDE olmalı
    let baseDay = day, baseHour = hour
    if (flexible) {
      if (!flexDays.includes(baseDay)) baseDay = flexDays[Math.floor(Math.random() * flexDays.length)]
      if (!flexHours.includes(baseHour)) baseHour = flexHours[0]
    }
    const team = TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)]
    // GİZLİ TAVAN: talep + doluluk + sadakat okunabilir sinyallerden türer
    const dem = hourDemand(hour, day)
    const lever = 1 + dem * 0.35 + this.occupancy() * 0.5 + (seg.id === 'kurumsal' ? 0.25 : 0)
      - (seg.id === 'genclik' ? 0.12 : 0)
    const r: Reservation = {
      id: this.nextId++,
      team, segment: seg.id,
      day: baseDay, hour: baseHour, flexible, flexDays, flexHours,
      price: Math.round(raw / 10) * 10,
      maxPay: Math.round(raw * lever / 10) * 10,
      haggled: false,
      weeks,
      patience: 34, maxPatience: 34,
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
    if (!this.slotOk(r, day, hour)) {
      return r.flexible
        ? { ok: false, msg: `${r.team} bu saati kabul etmiyor — yanıp sönen slotlardan birini seç.` }
        : { ok: false, msg: `${r.team} sadece ${DAY_NAMES[r.day]} ${r.hour}:00 istiyor.` }
    }
    this.queue.splice(i, 1)
    this.bookings.push({
      day, hour, team: r.team, segment: r.segment, price: r.price,
      sub: r.weeks > 0, weeksLeft: r.weeks,
    })
    if (r.weeks > 0) { if (this.goalDay !== this.day) { this.goalDay = this.day; this.gMatches = 0; this.gEarned = 0; this.gSubs = 0; this.goalsDone = [] } this.gSubs++ }
    return { ok: true, msg: r.weeks > 0 ? `${r.team} ${r.weeks} hafta abone oldu!` : `${r.team} rezervasyonu alındı.` }
  }

  /** ÖNERİLEN SLOT: bitişik saat primi kuran slot öncelikli, yoksa ilk boş geçerli slot */
  bestSlot(r: Reservation): { day: number; hour: number; adj: boolean } | null {
    const days = r.flexible ? r.flexDays : [r.day]
    const hours = r.flexible ? r.flexHours : [r.hour]
    let first: { day: number; hour: number; adj: boolean } | null = null
    for (const d of days) for (const h of hours) {
      if (this.bookingAt(d, h)) continue
      if (this.bookings.filter(b => b.day === d && b.hour === h).length >= this.pitches) continue
      const adj = !!(this.bookingAt(d, h - 1) || this.bookingAt(d, h + 1))
      if (adj) return { day: d, hour: h, adj: true }   // bitişik = kantin primi → en iyi
      if (!first) first = { day: d, hour: h, adj: false }
    }
    return first
  }

  /** bu kart bu slota konabilir mi (esnek istek desteği) */
  slotOk(r: Reservation, day: number, hour: number): boolean {
    if (!r.flexible) return r.day === day && r.hour === hour
    return r.flexDays.includes(day) && r.flexHours.includes(hour)
  }

  /** PAZARLIK — bir kez. level 1 = ölçülü, 2 = sert. */
  haggle(resId: number, level: 1 | 2): { ok: boolean; msg: string; walked?: boolean } {
    const i = this.queue.findIndex(x => x.id === resId)
    if (i < 0) return { ok: false, msg: 'İstek artık yok.' }
    const r = this.queue[i]
    if (r.haggled) return { ok: false, msg: 'Bu takımla zaten pazarlık ettin.' }
    r.haggled = true
    const ask = Math.round(r.price * (level === 1 ? 1.25 : 1.5) / 10) * 10
    const loyal = this.loyalty[r.team] ?? 0
    if (ask <= r.maxPay) {
      r.price = ask
      if (r.weeks > 0 || loyal > 0) this.loyalty[r.team] = loyal - (level === 1 ? 0.5 : 1.2) // müdavimi sıkmanın bedeli
      return { ok: true, msg: `${r.team} kabul etti — ₺${ask.toLocaleString('tr-TR')}` }
    }
    // tavanı aştın: ölçülüyse ortayı bulur, sertse çeker gider
    const midChance = level === 1 ? 0.72 : 0.25
    if (Math.random() < midChance) {
      const mid = Math.round((r.price + r.maxPay) / 2 / 10) * 10
      r.price = mid
      this.loyalty[r.team] = loyal - 0.4
      return { ok: true, msg: `${r.team} ortada buluştu — ₺${mid.toLocaleString('tr-TR')}` }
    }
    this.queue.splice(i, 1)
    this.rep = Math.max(0, this.rep - 0.06)
    this.loyalty[r.team] = loyal - 2
    return { ok: false, walked: true, msg: `${r.team} "çok oldu abi" deyip kapattı.` }
  }

  /** müdavim sadakati — sıkıştırdıkça düşer, aboneliği yenilemeyi belirler */
  loyalty: Record<string, number> = {}
  /** 2. telefon hattı: sırada 6 istek bekleyebilir (4 yerine) */
  hasPhone2 = false
  /** ÇIRAK: sabrı bitmek üzere olan istekleri kendisi yerleştirir (kayıp istek = kayıp para bitiyor) */
  hasCirak = false
  /** sosyal medya reklamı: kalan gün — sürerken talep +%50 */
  adDays = 0
  /** oyun-içi otomatik olaylar için bildirim kuyruğu (UI toast'a çevirir) */
  notices: string[] = []
  queueCap(): number { return this.hasPhone2 ? 6 : 4 }

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
    // ÇIRAK: sabrı azalan isteği oyuncu adına yerleştirir
    if (this.hasCirak) {
      for (const r of [...this.queue]) {
        if (r.patience > r.maxPatience * 0.25) continue
        const days = r.flexible ? r.flexDays : [r.day]
        const hours = r.flexible ? r.flexHours : [r.hour]
        outer: for (const d of days) for (const h of hours) {
          if (this.place(r.id, d, h).ok) {
            this.notices.push(`Çırak telefona baktı: ${r.team} → ${DAY_NAMES[d]} ${h}:00`)
            break outer
          }
        }
      }
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
    // KESİNTİSİZ SAAT PRİMİ: arka arkaya dolu saatler kantini patlatır
    const hoursSet = new Set(todays.map(b => b.hour))
    let bestRun = 0, run = 0
    for (const h of HOURS) { if (hoursSet.has(h)) { run++; bestRun = Math.max(bestRun, run) } else run = 0 }
    const runBonus = bestRun >= 3 ? 1 + Math.min(0.3, (bestRun - 2) * 0.1) : 1
    let income = 0
    // ek sahaların günlük kirası (futbol takviminden bağımsız)
    const courtRent = this.builds.reduce((sum, b) =>
      sum + (b.kind === 'basket' ? 800 : b.kind === 'voley' ? 550 : 0), 0)
    income += courtRent
    for (const b of todays) {
      income += b.price + Math.round(this.extraPerMatch() * runBonus)
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
    this.gMatches += todays.length
    this.gEarned += income
    const upkeep = this.dailyUpkeep()
    this.money += income - upkeep
    this.lastDayProfit = income - upkeep
    this.incomeToday = income
    this.expenseToday = upkeep
    if (this.adDays > 0) {
      this.adDays--
      if (this.adDays === 0) this.notices.push('Sosyal medya reklamı bitti — istersen yenisini ver.')
    }
    // KİRA GÜNÜ
    if (this.day >= this.rentDueDay) {
      const rent = this.rentAmount()
      if (this.money >= rent) {
        this.money -= rent
        this.events.push(`Haftalık kira ödendi: ₺${rent.toLocaleString('tr-TR')}`)
      } else {
        this.rentMissed++
        this.rep = Math.max(0, this.rep - 0.5)
        this.events.push(`KİRA ÖDENEMEDİ! (₺${rent.toLocaleString('tr-TR')}) — itibar düştü.`)
      }
      this.rentDueDay = this.day + 7
    }
    this.day++
    // memnuniyet: dolulukla hafif artar
    if (todays.length > 0) this.rep = Math.min(5, this.rep + 0.03)
    this.events.push(`Gün ${this.day - 1}: ${todays.length} maç · gelir ₺${income.toLocaleString('tr-TR')} · gider ₺${upkeep.toLocaleString('tr-TR')}`
      + (bestRun >= 3 ? ` · ${bestRun} saat kesintisiz (+%${Math.round((runBonus - 1) * 100)} kantin)` : '')
      + (courtRent > 0 ? ` · ek saha kirası ₺${courtRent.toLocaleString('tr-TR')}` : ''))
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
      { id: 'schooldeal', label: 'Okul Anlaşması', gain: 'Gençlik segmenti açılır (14-18)', cost: 12_000, upkeep: 0,
        desc: 'Öğleden sonra ölü saatleri okul takımlarıyla doldurursun.', owned: this.hasSchoolDeal, locked: null },
      { id: 'tearoom', label: 'Çay Ocağı', gain: 'Veteran segmenti açılır (9-13)', cost: 7_500, upkeep: 0,
        desc: 'Sabah emekli grupları gelir — en ölü saat dolar.', owned: this.hasTeaRoom, locked: null },
      { id: 'corporate', label: 'Kurumsal Fatura', gain: 'Şirket segmenti açılır (12-17)', cost: 15_000, upkeep: 0,
        desc: 'Şirket turnuvaları gündüz gelir, ücreti %30 yüksek.', owned: this.hasCorporate, locked: null },
      { id: 'billboard', label: 'Reklam Panoları', gain: 'Her maçtan +₺90', cost: 11_000, upkeep: 0,
        desc: 'Saha kenarına yerel esnaf reklamı asarsın; kira her maçta cebe girer.', owned: this.hasBillboard, locked: null },
      { id: 'roadsign', label: 'Yol Tabelası', gain: 'Tüm talep +%20', cost: 16_000, upkeep: 60,
        desc: 'Ana caddeden görünen büyük tabela — yoldan geçen daha çok kişi arar.', owned: this.hasRoadSign, locked: null },
      { id: 'phone2', label: '2. Telefon Hattı', gain: 'Sırada 6 istek bekler (4 yerine)', cost: 5_500, upkeep: 40,
        desc: 'Hat meşgulken arayan müşteri kaçıyordu — ikinci hat kuyruk kapasitesini artırır.', owned: this.hasPhone2, locked: null },
      { id: 'cirak', label: 'Çırak', gain: 'Sabrı biten istekleri o yerleştirir', cost: 8_000, upkeep: 350,
        desc: 'Telefona bakar: sen yetişemezsen bekleyen isteği uygun boş saate kendisi yazar. Pazarlık yapmaz.', owned: this.hasCirak, locked: null },
      { id: 'ads', label: 'Sosyal Medya Reklamı', gain: '2 gün talep +%50', cost: 2_500, upkeep: 0,
        desc: 'Mahalle gruplarında sponsorlu ilan. Bitince tekrar verebilirsin.', owned: false,
        locked: this.adDays > 0 ? `Reklam yayında (${this.adDays} gün kaldı)` : null },
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
      case 'schooldeal': this.hasSchoolDeal = true; break
      case 'tearoom': this.hasTeaRoom = true; break
      case 'corporate': this.hasCorporate = true; break
      case 'staff': this.staff = 1; break
      case 'docs': this.docService = true; break
      case 'billboard': this.hasBillboard = true; break
      case 'roadsign': this.hasRoadSign = true; break
      case 'phone2': this.hasPhone2 = true; break
      case 'cirak': this.hasCirak = true; break
      case 'ads': this.adDays = 2; break
    }
    this.events.push(`${it.label} alındı.`)
    return { ok: true, msg: `${it.label} hazır — ${it.gain}` }
  }

  // ---- ARSA ----
  ownsParcel(c: number, r: number) { return this.ownedParcels.includes(parcelKey(c, r)) }
  buildAt(c: number, r: number): PlacedBuild | undefined {
    return this.builds.find(b => b.key === parcelKey(c, r))
  }
  buyParcel(c: number, r: number): { ok: boolean; msg: string } {
    if (c < 0 || c >= PARCEL_COLS || r < 0 || r >= PARCEL_ROWS) return { ok: false, msg: 'Geçersiz arsa.' }
    if (this.ownsParcel(c, r)) return { ok: false, msg: 'Bu arsa zaten senin.' }
    const cost = parcelCost(c, r)
    if (this.money < cost) return { ok: false, msg: `₺${(cost - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= cost
    this.ownedParcels.push(parcelKey(c, r))
    this.events.push(`Arsa alındı (${c + 1},${r + 1}) — ₺${cost.toLocaleString('tr-TR')}`)
    return { ok: true, msg: `Arsa senin! Üstüne saha ya da tesis kurabilirsin.` }
  }
  placeBuild(c: number, r: number, kind: BuildKind): { ok: boolean; msg: string } {
    if (!this.ownsParcel(c, r)) return { ok: false, msg: 'Önce arsayı satın al.' }
    if (this.buildAt(c, r)) return { ok: false, msg: 'Bu arsa dolu.' }
    const b = BUILDS[kind]
    if (this.money < b.cost) return { ok: false, msg: `₺${(b.cost - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= b.cost
    this.builds.push({ key: parcelKey(c, r), kind })
    if (kind === 'pitch') this.pitches++
    if (kind === 'mini') this.pitches++
    if (kind === 'basket') this.rep = Math.min(5, this.rep + 0.1)
    if (kind === 'voley') this.rep = Math.min(5, this.rep + 0.2)
    if (kind === 'parking') this.rep = Math.min(5, this.rep + 0.3)
    if (kind === 'garden') this.rep = Math.min(5, this.rep + 0.2)
    this.events.push(`${b.label} kuruldu.`)
    return { ok: true, msg: `${b.label} hazır — ${b.gain}` }
  }

  // ---- GÜNLÜK HEDEFLER (oyuncuyu tutan kısa döngü) ----
  goalDay = 0
  gMatches = 0        // bugün oynanan maç
  gEarned = 0         // bugün kazanılan
  gSubs = 0           // bugün yapılan abonelik
  goalsDone: string[] = []

  /** gün başında hedefler sıfırlanır */
  private resetGoals() {
    this.goalDay = this.day
    this.gMatches = 0; this.gEarned = 0; this.gSubs = 0; this.goalsDone = []
  }

  goals(): { id: string; label: string; now: number; need: number; reward: number; done: boolean }[] {
    if (this.goalDay !== this.day) this.resetGoals()
    const needM = Math.min(6, 2 + Math.floor(this.day / 4))
    const needE = 1500 + this.day * 250
    return [
      { id: 'm', label: `${needM} maç oynat`, now: this.gMatches, need: needM,
        reward: 800 + this.day * 40, done: this.goalsDone.includes('m') },
      { id: 'e', label: `₺${needE.toLocaleString('tr-TR')} kazan`, now: Math.round(this.gEarned), need: needE,
        reward: 1000 + this.day * 50, done: this.goalsDone.includes('e') },
      { id: 's', label: 'Bir abonelik bağla', now: this.gSubs, need: 1,
        reward: 1500, done: this.goalsDone.includes('s') },
    ]
  }

  /** hedef tamamlandıysa ödülü ver — main her tikte çağırır */
  claimGoals(): { label: string; reward: number }[] {
    const out: { label: string; reward: number }[] = []
    for (const g of this.goals()) {
      if (!g.done && g.now >= g.need) {
        this.goalsDone.push(g.id)
        this.money += g.reward
        out.push({ label: g.label, reward: g.reward })
      }
    }
    return out
  }

  /** SIRADAKİ BÜYÜK HEDEF — uzun döngü (D11 kalıbı: ne kadar kaldı görünsün) */
  nextMilestone(): { label: string; have: number; need: number } | null {
    if (!this.hasCanteen) return { label: 'Kantin kur', have: this.money, need: 9_000 }
    if (!this.hasLights) return { label: 'LED projektör tak', have: this.money, need: 14_000 }
    if (!this.hasSchoolDeal) return { label: 'Okul anlaşması yap', have: this.money, need: 12_000 }
    if (!this.hasBillboard) return { label: 'Reklam panolarını as', have: this.money, need: 11_000 }
    if (!this.hasRoadSign) return { label: 'Yol tabelası dik', have: this.money, need: 16_000 }
    if (!this.hasShower) return { label: 'Duş & soyunma yenile', have: this.money, need: 18_000 }
    if (this.pitches < 2) return { label: 'Arsa al + mini saha kur', have: this.money, need: parcelCost(0, 1) + BUILDS.mini.cost }
    return null
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
    // 5. doluluk yüksekse ikinci saha (arsa yoluyla)
    if (this.pitches < 2 && this.occupancy() > 0.35) {
      out.push({ title: 'Saha yetmiyor', why: `Doluluk %${Math.round(this.occupancy() * 100)}. Boş arsaya tıkla: arsa al + mini saha kur (₺${(parcelCost(0, 1) + BUILDS.mini.cost).toLocaleString('tr-TR')}).`,
        urgent: false })
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
      hasBillboard: this.hasBillboard, hasRoadSign: this.hasRoadSign,
      rentDueDay: this.rentDueDay, rentMissed: this.rentMissed, loyalty: this.loyalty,
      hasPhone2: this.hasPhone2, hasCirak: this.hasCirak, adDays: this.adDays,
      ownedParcels: this.ownedParcels, builds: this.builds,
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
    this.hasBillboard = b('hasBillboard'); this.hasRoadSign = b('hasRoadSign')
    if (Array.isArray(d.bookings)) this.bookings = d.bookings as Booking[]
    this.rentDueDay = n('rentDueDay', 7); this.rentMissed = n('rentMissed', 0)
    this.hasPhone2 = d.hasPhone2 === true; this.hasCirak = d.hasCirak === true; this.adDays = n('adDays', 0)
    if (d.loyalty && typeof d.loyalty === 'object') this.loyalty = d.loyalty as Record<string, number>
    if (Array.isArray(d.ownedParcels))
      this.ownedParcels = [...new Set([...STARTER_PARCELS, ...(d.ownedParcels as string[])])]
    if (Array.isArray(d.builds)) this.builds = d.builds as PlacedBuild[]
  }
}
