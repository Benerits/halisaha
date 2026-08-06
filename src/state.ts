import { t, dayName } from './i18n'
/**
 * HALI SAHA — oyun durumu ve ekonomi çekirdeği.
 * Three.js BİLMEZ → tamamı test edilebilir (BenelOil state.ts kalıbı).
 *
 * SIFIR SÜRTÜNME İLKESİ (Oğuz): oyuncu hiçbir şeyi tahmin etmek zorunda kalmasın.
 * Her karar kartında getirisi ve götürüsü YAZILI olacak; ne yapacağını bilmeyen
 * oyuncuya ÖNERİ KARTI zaten söyleyecek.
 */

// ---- Zaman ----
// 1 oyun saati = 15 gerçek sn → gün 3.75 dk; tempo yüksek, oturum başına daha çok gün
// (30 sn denendi: ilk oyuncular günü uzun buldu — 15 sn'e indirildi, lansman kararı.)
export const HOUR_SECONDS = 15
export const OPEN_HOUR = 9
// GECE SAATLERİ: 24-26 = 00:00-02:00 (LED Projektör ile açılır) — takvim 9:00→03:00
export const NIGHT_START = 24
export const CLOSE_HOUR = 27
export const HOURS: number[] = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i)
export const DAY_SECONDS = HOUR_SECONDS * HOURS.length
/** iç saat → ekran etiketi (25 → '1:00') */
export const hourLabel = (h: number): string => `${h % 24}:00`
export const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const

/** Saatin talep katsayısı — prime time 20-23 arası zaten dolu, asıl mesele gündüz. */
export function hourDemand(hour: number, dayIdx: number): number {
  const weekend = dayIdx >= 5
  // GECE (00-02): gece ligi kültürü — LED şart (spawn/yerleştirme ayrıca kilitli)
  if (hour >= 24) return (weekend ? 0.62 : 0.5) - (hour - 24) * 0.12
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
  /** maç uzunluğu: 1 ya da 2 saat (2 saat = ardışık iki slot kaplar) */
  hours: number
  /** TAM SAHA şart mı (kurumsal 8v8 miniye sığmaz) */
  needFull: boolean
  /** kısmi (tek saat) teklifi reddetti mi */
  partialRefused?: boolean
  /** anlaşma sonrası geçen süre (nazik hatırlatma için) */
  dealWait?: number
  weeks: number
  patience: number
  maxPatience: number
}

export interface Booking {
  /** kaç kez yenilendi (abonelik ömrü: en fazla 3) */
  renews?: number
  /** tam saha kapasitesinden mi yer tutuyor */
  needFull?: boolean
  /** hangi saha şeridinde (0..fullCount-1 tam, sonrası mini) — görsel + atama */
  lane?: number
  /** kaç hafta SONRA oynanacak (0/yok = bu haftaki gün; 1 = sonraki hafta).
   *  2 haftalık takvim: bugünün geçmiş saatine gelecek hafta rezervasyon konabilsin. */
  wk?: number
  /** bu haftaki maçın parası ANINDA ödendi mi (maç bitiminde kasaya düşer) */
  paid?: boolean
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
  'Boğaz Boys', 'Orta Saha AŞ', 'Demir Yumruk', 'Halı Kaplanları', 'Son Dakika FK',
  'Kalecisiz 5', 'Taksiciler', 'Fırıncılar SK', 'Berberler United', 'Komşular FC',
  'Efsaneler', 'Rövaşata', 'Ters Makas', 'Aut Çizgisi', 'Korner Bayrağı',
  'Devre Arası', 'Uzatma Dakikaları', 'Penaltıcılar', 'Direkten Döndü', 'Ofsayt Bekleyenler',
  'Çift Kale', 'Kaleye Kim Geçecek', 'Topu Dışarı Atanlar', 'Yedek Kulübesi', 'Antrenmansızlar',
  'Kramponsuzlar', 'Halı Saha Delileri', 'Pazartesi Sendromu', 'Mesai Kaçakları', 'Kadro Dışı',
  'Golcüler Derneği', 'Verkaç Ustaları', 'Çalım Akademisi',
]

// ---- Mağaza / yatırım kalemleri ----
export type BuyId =
  | 'canteen' | 'fridge' | 'cleats' | 'lights' | 'shower'
  | 'schooldeal' | 'tearoom' | 'corporate' | 'staff' | 'docs' | 'billboard' | 'roadsign'
  | 'phone2' | 'cirak' | 'ads' | 'keeper' | 'tost' | 'baklava'

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
export const PARCEL_ROWS = 6
/** parsel dünya boyutu (izometrik birim) — ana saha (13x8) bir parsele tam sığar */
export const PARCEL_W = 14
export const PARCEL_D = 9.6
export const parcelKey = (c: number, r: number) => `${c},${r}`
/** oyuna sahip başlanan parseller: kulüp binası, avlu, otopark, ana saha */
export const STARTER_PARCELS = ['0,0', '1,0', '2,0', '1,1']
/** Fiyat ana sahaya (1,1) yakınlıkla artar */
export function parcelCost(c: number, r: number): number {
  const d = Math.abs(c - 1) + Math.abs(r - 1)
  return Math.max(10_000, 20_000 - d * 3_000)
}

export type BuildKind = 'pitch' | 'mini' | 'basket' | 'voley' | 'parking' | 'garden' | 'kantin' | 'dus' | 'wc'
export interface PlacedBuild { kind: BuildKind; gx?: number; gy?: number; key?: string; wear?: number }

export const BUILDS: Record<BuildKind, { label: string; cost: number; gain: string; desc: string }> = {
  pitch:   { label: 'Halı Saha', cost: 45_000, gain: 'Aynı saate +1 maç', desc: 'Tam boy ikinci saha — prime-time çakışmaları biter.' },
  mini:    { label: 'Mini Saha 5v5', cost: 22_000, gain: 'Aynı saate +1 maç', desc: 'Küçük ve ucuz; çocuk/genç grupları için hızlı devir.' },
  basket:  { label: 'Basketbol Sahası', cost: 22_000, gain: 'Günde +₺800 kira', desc: 'Saatlik kiralanır; futbol takviminden bağımsız pasif gelir.' },
  voley:   { label: 'Voleybol Sahası', cost: 16_000, gain: 'Günde +₺550 · itibar +0,2', desc: 'Kum zemin; yazın çok tutar, tesise çeşitlilik katar.' },
  parking: { label: 'Ek Otopark', cost: 14_000, gain: 'İtibar +0,3', desc: 'Araç sığmayınca müşteri kaçar; park yeri memnuniyeti artırır.' },
  garden:  { label: 'Yeşil Alan', cost: 9_000, gain: 'İtibar +0,2', desc: 'Oturma alanı ve peyzaj — tesis daha bakımlı görünür.' },
  kantin:  { label: 'Kantin Binası', cost: 9_000, gain: 'Her maçtan +₺120', desc: 'Çay, tost, ayran — maç sonrası oturulan yer. (Mağazadaki kantinle aynı etki, binalı.)' },
  dus:     { label: 'Duş & Soyunma', cost: 14_000, gain: 'İtibar +0,5', desc: 'Kalite algısını yükseltir; abonelikler uzar.' },
  wc:      { label: 'Tuvalet', cost: 4_000, gain: 'İtibar +0,2', desc: 'Olmazsa olmaz — yoksa kimse uzun kalmaz.' },
}
/** tek kurulabilen işletme binaları (tesiste bir tane) */
export const SINGLETON_BUILDS: BuildKind[] = ['kantin', 'dus', 'wc']

// ---- SERBEST YERLEŞTİRME IZGARASI (BenelOil sistemi): küçük karecikler ----
export const CELL = 1.6
export const GRID_OX = -22.4
export const GRID_OY = -19.2
export const GRID_W = 28
export const GRID_H = 20
/** yapı ayak izleri (hücre cinsinden genişlik x derinlik) */
export const FOOT: Record<BuildKind, [number, number]> = {
  pitch: [9, 6], mini: [6, 4], basket: [7, 5], voley: [6, 4],
  parking: [6, 4], garden: [3, 3], kantin: [4, 3], dus: [3, 3], wc: [2, 2],
}
/** başlangıç tesislerinin kapladığı dünya alanları (çakışma yasak) */
export const FIXED_WORLD: { x: number; y: number; w: number; h: number }[] = [
  { x: -14.5, y: 7.2, w: 8.6, h: 5.4 },   // kulüp binası
  { x: 14.5, y: 7.0, w: 11.8, h: 8.8 },   // otopark
  { x: 0, y: -3.2, w: 14.3, h: 9.9 },     // ana saha
  { x: 5.8, y: 11.6, w: 5.2, h: 1.6 },    // ayaklı tabela
]
/** hücre sol-alt köşesinden yapının dünya merkezi */
export function buildCenter(b: { kind: BuildKind; gx: number; gy: number }): [number, number] {
  const [w, h] = FOOT[b.kind]
  return [GRID_OX + (b.gx + w / 2) * CELL, GRID_OY + (b.gy + h / 2) * CELL]
}

// ---- LOKASYONLAR (şubeler): kasa/gün ortak; takvim, kuyruk, arsa, saha ŞUBEYE AİT ----
export type LocId = 'mahalle' | 'sanayi' | 'sahil'
export interface LocDef {
  id: LocId; label: string; cost: number
  /** fiyat çarpanı (bölgenin alım gücü) */ priceMult: number
  /** talep çarpanı (bölgenin yoğunluğu) */ demandMult: number
  desc: string
}
export const LOCATIONS: LocDef[] = [
  { id: 'mahalle', label: 'MAHALLE', cost: 0, priceMult: 1, demandMult: 1,
    desc: 'Başladığın yer. Dengeli talep, dengeli fiyat.' },
  { id: 'sanayi', label: 'SANAYİ', cost: 120_000, priceMult: 0.9, demandMult: 1.3,
    desc: 'İşçi ve şirket takımları — talep yüksek, fiyat bir tık düşük.' },
  { id: 'sahil', label: 'SAHİL', cost: 300_000, priceMult: 1.35, demandMult: 0.85,
    desc: 'Zengin muhit — fiyatlar %35 yüksek, müşteri daha seçici.' },
]
/** şube personeli: müdür 0=yok 1=acemi 2=usta */
export interface Personel { mudur: 0 | 1 | 2; cirak: boolean; kantinci: boolean; sekreter: boolean; auto: boolean }
export const emptyPersonel = (): Personel => ({ mudur: 0, cirak: false, kantinci: false, sekreter: false, auto: false })
export const MAAS = { mudur1: 600, mudur2: 1_000, cirak: 350, kantinci: 400, sekreter: 300 }
export const ISE_ALIM = { mudur1: 18_000, mudur2: 45_000, cirak: 6_000, kantinci: 5_000, sekreter: 4_000 }

/** şubenin taşınabilir durumu */
interface LocSnap {
  bookings: Booking[]; queue: Reservation[]; pitches: number
  ownedParcels: string[]; builds: PlacedBuild[]
  personel?: Personel
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
  hasKeeper = false
  hasTost = false
  hasWC = false
  hasBaklava = false
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
  /** AYLIK KİRA — 30 günde bir öde; ödeyemezsen itibar yanar (baskı davulu).
   *  Haftalıktı: gerçek zamanda ~3 dk'da bir fatura mantıksızdı — aylık tek büyük fatura. */
  rentDueDay = 30
  rentMissed = 0
  rentAmount(): number {
    // K4: saha başına kira MARJİNAL ARTAR — ölçek bedava değil; gider gelirle büyür.
    // Aylık ≈ 3.5 haftalık (yarım haftalık indirim: tek seferde büyük fatura ödemenin ödülü)
    let pitchRent = 0
    const p = this.totalPitches()
    for (let i = 1; i < p; i++) pitchRent += 14_000 + (i - 1) * 4_200
    return 42_000 + pitchRent + (this.unlockedLocs.length - 1) * 28_000
  }
  daysToRent(): number { return Math.max(0, this.rentDueDay - this.day + 1) }

  // ---- türetilmiş ----
  get slotCount() { return this.pitches * 7 * HOURS.length }
  // 700→850 + itibar 60→75: 'para yavaş akıyor' geri bildirimi (lansman öncesi tempo ayarı)
  basePrice() { return 850 + this.pitches * 40 + Math.round(this.rep * 75) }
  /** kantin + ekipman geliri (maç başına) */
  extraPerMatch() {
    let kantin = 0
    if (this.hasCanteen) kantin += 120
    if (this.hasFridge) kantin += 60
    if (this.hasTost) kantin += 45
    if (this.hasBaklava) kantin += 55
    if (!this.hasCanteen) kantin = 0  // kantin yoksa tezgâh gelirleri de yok (yıkım sızıntısı fixi)
    if (this.personel.kantinci) kantin = Math.round(kantin * 1.25)  // kantinci tezgâhı büyütür
    let v = kantin
    if (this.hasCleats) v += 45
    if (this.hasKeeper) v += 70
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
    if (this.personel.mudur === 1) v += MAAS.mudur1
    if (this.personel.mudur === 2) v += MAAS.mudur2
    if (this.personel.cirak) v += MAAS.cirak
    if (this.personel.kantinci) v += MAAS.kantinci
    if (this.personel.sekreter) v += MAAS.sekreter
    v += (this.pitches - 1) * 200
    return v
  }
  segmentOpen(s: SegmentId): boolean {
    if (s === 'genclik') return this.hasSchoolDeal
    if (s === 'veteran') return this.hasTeaRoom
    if (s === 'kurumsal') return this.hasCorporate
    return true
  }
  /** şimdiki oyun saati (gün içi) */
  hourNow(): number { return OPEN_HOUR + Math.floor((this.t / DAY_SECONDS) * HOURS.length) }
  todayDow(): number { return (this.day - 1) % 7 }
  /** bu kayıt (day,hour) slotunu w. haftada işgal ediyor mu — abonelik HER hafta tutar */
  private occupies(b: Booking, wk: number): boolean { return b.sub || (b.wk ?? 0) === wk }
  bookingAt(day: number, hour: number, wk = 0): Booking | undefined {
    return this.bookings.find(b => b.day === day && b.hour === hour && this.occupies(b, wk))
  }
  bookingsAt(day: number, hour: number, wk = 0): Booking[] {
    return this.bookings.filter(b => b.day === day && b.hour === hour && this.occupies(b, wk))
  }
  usedAt(day: number, hour: number, wk = 0): number { return this.bookingsAt(day, hour, wk).length }
  /** bu saatte hâlâ boş saha var mı */
  freeAt(day: number, hour: number, wk = 0): boolean { return this.usedAt(day, hour, wk) < this.pitches }
  /** tam boy saha sayısı (ana saha + parsel halı sahaları; mini hariç) */
  fullPitchCount(): number { return this.pitches - this.builds.filter(b => b.kind === 'mini').length }
  fullUsedAt(day: number, hour: number, wk = 0): number {
    return this.bookingsAt(day, hour, wk).filter(b => b.needFull).length
  }
  /** tam saha isteyen için bu saatte yer var mı */
  fullFreeAt(day: number, hour: number, wk = 0): boolean {
    return this.fullUsedAt(day, hour, wk) < this.fullPitchCount()
  }
  laneTakenBy(day: number, hour: number, lane: number, wk = 0): Booking | undefined {
    return this.bookingsAt(day, hour, wk).find(b => this.laneOf(b, day, hour) === lane)
  }
  /** kayıtlı şerit; eski kayıtların şeritsiz maçlarına deterministik şerit ver */
  laneOf(b: Booking, day: number, hour: number): number {
    if (b.lane !== undefined) return b.lane
    const peers = this.bookingsAt(day, hour, b.sub ? 0 : (b.wk ?? 0))
    let i = 0
    for (const x of peers) {
      if (x === b) break
      if (x.lane === undefined) i++
    }
    const used = new Set(peers.filter(x => x.lane !== undefined).map(x => x.lane))
    let lane = 0, skipped = 0
    for (; lane < this.pitches; lane++) {
      if (used.has(lane)) continue
      if (skipped === i) break
      skipped++
    }
    return lane
  }
  /** İSTENEN şerit uygun mu; değilse AKILLI atama: tam saha isteyen tam şeride,
   *  normal maç MİNİ şeritlere öncelikli (tam sahalar kurumsala boş kalsın) */
  resolveLane(r: Reservation, day: number, hour: number, wanted?: number, wk = 0): number | null {
    const fullN = this.fullPitchCount()
    const okLane = (l: number) => {
      if (l < 0 || l >= this.pitches) return false
      if (r.needFull && l >= fullN) return false
      if (this.laneTakenBy(day, hour, l, wk)) return false
      if (r.hours === 2 && this.laneTakenBy(day, hour + 1, l, wk)) return false
      return true
    }
    if (wanted !== undefined && okLane(wanted)) return wanted
    const order: number[] = []
    if (r.needFull) { for (let l = 0; l < fullN; l++) order.push(l) }
    else {
      for (let l = this.pitches - 1; l >= fullN; l--) order.push(l)  // önce miniler
      for (let l = fullN - 1; l >= 0; l--) order.push(l)
    }
    for (const l of order) if (okLane(l)) return l
    return null
  }
  /** doluluk yüzdesi */
  occupancy(): number {
    const usable = 7 * HOURS.length * Math.max(1, this.pitches)  // K3: sahaları saymıyordu → %1658 doluluk + 10x pazarlık tavanı
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
    let hour = h0 + Math.floor(Math.random() * Math.max(1, h1 - h0))
    // LED varsa: klasik isteklerin ~%28'i GECE (00-02) ister — 'geceleri için çağrı gelsin'
    if (this.hasLights && seg.id === 'klasik' && Math.random() < 0.28)
      hour = NIGHT_START + Math.floor(Math.random() * 3)
    // o saatte talep var mı?
    const demand = hourDemand(hour, day) * (0.65 + this.rep * 0.12)
      * (this.hasLights && hour >= 19 ? 1.25 : 1) * (this.hasRoadSign ? 1.2 : 1)
      * (this.adDays > 0 ? 1.5 : 1) * this.locDef().demandMult
    if (Math.random() > demand) return null
    if (!this.freeAt(day, hour)) return null
    const srNow = this.subRatio()
    // K6: takvim aboneye kilitlenirse çekirdek eylem ölür — tavan mekanikleri
    const weeks = (srNow > 0.7 || Math.random() >= 0.28) ? 0 : (Math.random() < 0.5 ? 4 : 8)
    // 2 SAATLİK MAÇ (%18, aboneliksiz): '21-23 bizim olsun' — ardışık iki slot
    const twoH = weeks === 0 && Math.random() < 0.18
    const subPenalty = srNow > 0.6 ? Math.max(0.7, 1 - (srNow - 0.6) * 0.75) : 1  // K6: aboneye boğulan tesiste tek maç ucuzlar
    const raw = this.basePrice() * seg.priceMult * (weeks > 0 ? 0.82 : 1) * this.locDef().priceMult
      * (twoH ? 1.9 : 1) * subPenalty * this.starMult()
      * (hour >= NIGHT_START ? 1.15 : 1) // gece tarifesi
    // ESNEK İSTEK (%60): "hafta içi akşam olsun" → hangi slota koyacağına SEN karar verirsin
    const flexible = Math.random() < 0.6
    const flexDays: number[] = []
    const flexHours: number[] = []
    if (flexible) {
      const weekendOnly = Math.random() < 0.25
      for (let d = 0; d < 7; d++) if (weekendOnly ? d >= 5 : d < 5) flexDays.push(d)
      const span = 2 + Math.floor(Math.random() * 2)
      for (let k = 0; k < span; k++) { const hh = hour + k; if (hh < CLOSE_HOUR && (this.hasLights || hh < NIGHT_START)) flexHours.push(hh) }
    }
    // TUTARLILIK: esnek kartın temel gün/saati kendi kümesinin İÇİNDE olmalı
    let baseDay = day, baseHour = hour
    if (flexible) {
      if (!flexDays.includes(baseDay)) baseDay = flexDays[Math.floor(Math.random() * flexDays.length)]
      if (!flexHours.includes(baseHour)) baseHour = flexHours[0]
    }
    // AYNI GÜN TEKRAR ENGELİ: kuyrukta ya da bugünün takviminde olan isim tekrar aramasın
    const busy = new Set([...this.queue.map(q => q.team),
      ...this.bookings.filter(b => b.day === this.todayDow()).map(b => b.team)])
    let team = TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)]
    for (let tries = 0; tries < 12 && busy.has(team); tries++)
      team = TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)]
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
      hours: twoH && baseHour + 1 < CLOSE_HOUR ? 2 : 1,
      needFull: seg.id === 'kurumsal' ? Math.random() < 0.7 : Math.random() < 0.1,
      weeks,
      patience: 34, maxPatience: 34,
    }
    this.queue.push(r)
    return r
  }

  /** kartı takvime yerleştir */
  place(resId: number, day: number, hour: number, wantedLane?: number, wk = 0): { ok: boolean; msg: string } {
    const i = this.queue.findIndex(r => r.id === resId)
    if (i < 0) return { ok: false, msg: 'Bu istek artık geçerli değil.' }
    const r = this.queue[i]
    if (!this.freeAt(day, hour, wk)) {
      const alt = this.bestSlot(r)
      return { ok: false, msg: `${DAY_NAMES[day]} ${hour}:00 DOLU (${this.usedAt(day, hour, wk)}/${this.pitches} saha).`
        + (alt ? ` En yakın boş: ${DAY_NAMES[alt.day]} ${hourLabel(alt.hour)}.` : ' Uygun boş saat kalmamış.') }
    }
    if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) return { ok: false, msg: 'Tesis o saatte kapalı.' }
    if (hour >= NIGHT_START && !this.hasLights) {
      return { ok: false, msg: t('Gece maçı için LED Projektör gerekli — Yazıhane → Yatırım.') }
    }
    if (wk === 0 && day === this.todayDow() && hour < this.hourNow()) {
      return { ok: false, msg: t('Bu saat geçti — aynı güne SONRAKİ HAFTA sekmesinden verebilirsin.') }
    }
    if (!this.slotOk(r, day, hour)) {
      return r.flexible
        ? { ok: false, msg: `${r.team} bu saati kabul etmiyor — yanıp sönen slotlardan birini seç.` }
        : { ok: false, msg: `${r.team} sadece ${DAY_NAMES[r.day]} ${r.hour}:00 istiyor.` }
    }
    if (r.needFull && !this.fullFreeAt(day, hour, wk)) {
      return { ok: false, msg: `${r.team} TAM SAHA istiyor — bu saatte tam sahalar dolu (mini boş ama onlara küçük).` }
    }
    if (r.hours === 2 && !this.freeAt(day, hour + 1, wk)) {
      return { ok: false, msg: `${r.team} 2 saat istiyor — ${hour + 1}:00 da boş olmalı.` }
    }
    if (r.hours === 2 && r.needFull && !this.fullFreeAt(day, hour + 1, wk)) {
      return { ok: false, msg: `${r.team} TAM SAHA istiyor — ${hour + 1}:00'da tam sahalar dolu.` }
    }
    const lane = this.resolveLane(r, day, hour, wantedLane, wk)
    if (lane === null) return { ok: false, msg: 'Uygun saha şeridi yok — şeritler dolu.' }
    this.queue.splice(i, 1)
    const wkF = wk > 0 ? wk : undefined
    if (r.hours === 2) {
      const half = Math.round(r.price / 2 / 10) * 10
      this.bookings.push({ day, hour, team: r.team, segment: r.segment, price: half, sub: false, weeksLeft: 0, needFull: r.needFull, lane, wk: wkF })
      this.bookings.push({ day, hour: hour + 1, team: r.team, segment: r.segment, price: r.price - half, sub: false, weeksLeft: 0, needFull: r.needFull, lane, wk: wkF })
    } else {
      this.bookings.push({
        day, hour, team: r.team, segment: r.segment, price: r.price,
        sub: r.weeks > 0, weeksLeft: r.weeks, needFull: r.needFull, lane, wk: r.weeks > 0 ? undefined : wkF,
      })
    }
    if (r.weeks > 0) { if (this.goalDay !== this.day) { this.goalDay = this.day; this.gMatches = 0; this.gEarned = 0; this.gSubs = 0; this.goalsDone = [] } this.gSubs++ }
    this.placedCount++
    return { ok: true, msg: r.hours === 2 ? `${r.team} 2 saatlik maç aldı (${hourLabel(hour)}-${hourLabel(hour + 2)})!`
      : r.weeks > 0 ? `${r.team} ${r.weeks}` + t(' hafta abone oldu!') : r.team + t(' rezervasyonu alındı.') }
  }

  /** ÖNERİLEN SLOT: bitişik saat primi kuran slot öncelikli, yoksa ilk boş geçerli slot */
  bestSlot(r: Reservation): { day: number; hour: number; adj: boolean; wk: number } | null {
    const days = r.flexible ? r.flexDays : [r.day]
    const hours = r.flexible ? r.flexHours : [r.hour]
    let first: { day: number; hour: number; adj: boolean; wk: number } | null = null
    for (const wk of [0, 1]) for (const d of days) for (const h of hours) {
      if (!this.canPlaceAt(r, d, h, wk)) continue
      const adj = !!(this.bookingAt(d, h - 1, wk) || this.bookingAt(d, h + 1, wk))
      if (adj) return { day: d, hour: h, adj: true, wk }   // bitişik = kantin primi → en iyi
      if (!first) first = { day: d, hour: h, adj: false, wk }
    }
    return first
  }

  /** bu kart bu slota konabilir mi (esnek istek desteği; 2 saatlikte h+1 de kapsamda olmalı) */
  slotOk(r: Reservation, day: number, hour: number): boolean {
    if (r.hours === 2 && hour + 1 >= CLOSE_HOUR) return false
    if (!r.flexible) return r.day === day && r.hour === hour
    if (!r.flexDays.includes(day) || !r.flexHours.includes(hour)) return false
    return r.hours < 2 || r.flexHours.includes(hour + 1)
  }

  /** YERLEŞTİRİLEBİLİR Mİ: kural + kapasite (UI vurgusu ve bestSlot bunu kullanır) */
  /** 2 saatlik kart TEK saate sığar mı (tam yer yokken kısmi karşı-teklif) */
  canPlacePartial(r: Reservation, day: number, hour: number, wk = 0): boolean {
    if (r.hours < 2 || r.partialRefused) return false
    if (this.canPlaceAt(r, day, hour, wk)) return false // tam yer varsa kısmiye gerek yok
    if (wk === 0 && day === this.todayDow() && hour < this.hourNow()) return false
    if (!r.flexible) { if (r.day !== day || r.hour !== hour) return false }
    else if (!r.flexDays.includes(day) || !r.flexHours.includes(hour)) return false
    if (!this.freeAt(day, hour, wk)) return false
    return !r.needFull || this.fullFreeAt(day, hour, wk)
  }

  /** KISMİ KARŞI-TEKLİF: "2 saat yok, 1 saat vereyim?" — esnek %70, katı %50 kabul eder */
  placePartial(resId: number, day: number, hour: number, wk = 0): { ok: boolean; msg: string } {
    const i = this.queue.findIndex(x => x.id === resId)
    if (i < 0) return { ok: false, msg: 'Bu istek artık geçerli değil.' }
    const r = this.queue[i]
    if (!this.canPlacePartial(r, day, hour, wk)) return { ok: false, msg: 'Bu saat kısmi teklife uygun değil.' }
    if (Math.random() > (r.flexible ? 0.7 : 0.5)) {
      r.partialRefused = true
      this.loyalty[r.team] = (this.loyalty[r.team] ?? 0) - 0.2
      return { ok: false, msg: `${r.team}: "${r.hours} saat olmazsa gelmeyiz abi." — kısmi teklifi reddetti.` }
    }
    const half = Math.round(r.price / r.hours / 10) * 10
    this.queue.splice(i, 1)
    this.bookings.push({ day, hour, team: r.team, segment: r.segment, price: half, sub: false, weeksLeft: 0,
      needFull: r.needFull, lane: this.resolveLane(r, day, hour, undefined, wk) ?? 0, wk: wk > 0 ? wk : undefined })
    this.placedCount++
    this.events.push(`${r.team} 1 saatle idare etti (₺${half.toLocaleString('tr-TR')}).`)
    return { ok: true, msg: `${r.team} 1 saati kabul etti — ₺${half.toLocaleString('tr-TR')}.` }
  }

  canPlaceAt(r: Reservation, day: number, hour: number, wk = 0): boolean {
    if (!this.slotOk(r, day, hour)) return false
    if (hour >= NIGHT_START && !this.hasLights) return false // gece LED ister
    // BUGÜNÜN geçmiş saati bu hafta oynatılamaz — gelecek hafta sekmesinden verilir
    if (wk === 0 && day === this.todayDow() && hour < this.hourNow()) return false
    if (!this.freeAt(day, hour, wk)) return false
    if (r.needFull && !this.fullFreeAt(day, hour, wk)) return false
    if (r.hours < 2) return true
    return this.freeAt(day, hour + 1, wk) && (!r.needFull || this.fullFreeAt(day, hour + 1, wk))
  }

  /** İsteği kibarca GERİ ÇEVİR — takılı kart kalmasın (dolu takvim supabı) */
  decline(resId: number): { ok: boolean; msg: string } {
    const i = this.queue.findIndex(x => x.id === resId)
    if (i < 0) return { ok: false, msg: 'İstek artık yok.' }
    const r = this.queue.splice(i, 1)[0]
    this.loyalty[r.team] = (this.loyalty[r.team] ?? 0) - 0.3
    this.events.push(`${r.team} kibarca geri çevrildi.`)
    return { ok: true, msg: r.team + t(' geri çevrildi — küsmedi ama not etti.') }
  }

  /** PAZARLIK — bir kez. level 1 = ölçülü, 2 = sert. */
  /** SLIDER PAZARLIĞI: min = mevcut teklif, max = ×1.6. Matematik:
   *  - istek ≤ gizli tavan (maxPay) → kabul; sadakat kaybı isteğin agresifliğiyle orantılı
   *  - tavanı aşarsan: aşım oranı büyüdükçe 'ortada buluşma' şansı düşer, kaçma şansı artar */
  haggleAsk(resId: number, askRaw: number): { ok: boolean; msg: string; walked?: boolean } {
    const i = this.queue.findIndex(x => x.id === resId)
    if (i < 0) return { ok: false, msg: 'İstek artık yok.' }
    const r = this.queue[i]
    if (r.haggled) return { ok: false, msg: 'Bu takımla zaten pazarlık ettin.' }
    const maxAsk = Math.round(r.price * 1.6 / 10) * 10
    const ask = Math.max(r.price, Math.min(maxAsk, Math.round(askRaw / 10) * 10))
    r.haggled = true
    const loyal = this.loyalty[r.team] ?? 0
    const aggro = (ask - r.price) / r.price // 0..0.6
    if (ask <= r.price * 1.02) { // fiyata dokunmadın — el sıkış, bedava iyi niyet
      this.loyalty[r.team] = loyal + 0.3
      return { ok: true, msg: r.team + t(' kabul etti — ') + '₺' + r.price.toLocaleString('tr-TR') }
    }
    if (ask <= r.maxPay) {
      r.price = ask
      if (r.weeks > 0 || loyal > 0) this.loyalty[r.team] = loyal - aggro * 2 // müdavimi sıkmanın bedeli
      return { ok: true, msg: r.team + t(' kabul etti — ') + '₺' + ask.toLocaleString('tr-TR') }
    }
    // tavanı aştın: aşım küçükse ortayı bulur, büyükse çeker gider
    const over = (ask - r.maxPay) / r.maxPay
    const midChance = Math.max(0.12, 0.8 - over * 2.6)
    if (Math.random() < midChance) {
      const mid = Math.round((r.price + r.maxPay) / 2 / 10) * 10
      r.price = mid
      this.loyalty[r.team] = loyal - 0.4
      return { ok: true, msg: r.team + t(' ortada buluştu — ') + '₺' + mid.toLocaleString('tr-TR') }
    }
    this.queue.splice(i, 1)
    this.rep = Math.max(0, this.rep - 0.06)
    this.loyalty[r.team] = loyal - 2
    return { ok: false, walked: true, msg: r.team + t(' "çok oldu abi" deyip kapattı.') }
  }
  /** eski iki-kademe API (testler + geri uyum): slider matematiğine delege eder */
  haggle(resId: number, level: 1 | 2): { ok: boolean; msg: string; walked?: boolean } {
    const r = this.queue.find(x => x.id === resId)
    if (!r) return { ok: false, msg: 'İstek artık yok.' }
    return this.haggleAsk(resId, Math.round(r.price * (level === 1 ? 1.25 : 1.5) / 10) * 10)
  }

  /** müdavim sadakati — sıkıştırdıkça düşer, aboneliği yenilemeyi belirler */
  loyalty: Record<string, number> = {}
  /** 2. telefon hattı: sırada 6 istek bekleyebilir (4 yerine) */
  hasPhone2 = false
  /** eski kayıt uyumu — artık personel.cirak kullanılır */
  hasCirak = false
  /** AKTİF şubenin personeli (şube değişince locStore ile taşınır) */
  personel: Personel = emptyPersonel()
  /** sosyal medya reklamı: kalan gün — sürerken talep +%50 */
  adDays = 0
  /** oyun-içi otomatik olaylar için bildirim kuyruğu (UI toast'a çevirir + Defter'e kopyalanır) */
  notices: string[] = []
  /** ANINDA ÖDEME bildirimleri — UI her karede boşaltır ("+₺X · takım") */
  payouts: { team: string; amt: number }[] = []
  /** telefon kapalı (UI set eder): sabır donuk, kayıp yok — kaydedilmez, oturumluk */
  phonePaused = false
  /** maç olayları (kavga→polis, sakatlanma→ambulans) — UI tüketir */
  incidents: { kind: 'kavga' | 'sakatlanma'; team: string }[] = []
  private lastIncidentDay = 0
  /** bugün maç bitiminde anında ödenen toplam (endDay defteri bununla kapanır) */
  paidToday = 0
  pushNotice(msg: string) { this.notices.push(msg); this.events.push(msg) }
  /** kaçan müşteri bildirimleri (üzgün ses + toast) */
  lostNotices: string[] = []
  /** toplam yerleştirme sayısı — öğretici vurgular buna göre sakinleşir */
  placedCount = 0
  /** K12: ŞAMPİYONLUK YILDIZLARI — sezon kapatınca +1; kalıcı fiyat çarpanı */
  stars = 0
  starMult(): number { return 1 + 0.05 * Math.min(20, this.stars) }
  /** sezonu kapatma şartı ve ödülü: gün ≥ 30 VE kasa ≥ ₺1M */
  canCloseSeason(): boolean { return this.day >= 30 && this.money >= 1_000_000 }
  /** SEZONU ŞAMPİYON BİTİR: her şey sıfırlanır, yıldız kalır (+%5 kalıcı fiyat) */
  closeSeason(): { ok: boolean; msg: string } {
    if (!this.canCloseSeason()) return { ok: false, msg: 'Şart: 30. gün + kasada ₺1.000.000.' }
    const star = this.stars + 1
    const keepName = this.facilityName
    const keepLang = 1
    void keepLang
    const fresh = new Game()
    Object.assign(this, fresh)
    this.stars = star
    this.facilityName = keepName
    this.events.push(`⭐ SEZON ŞAMPİYONU! ${star}. yıldız takıldı — tüm fiyatlar kalıcı +%5.`)
    return { ok: true, msg: `⭐ ${star}. yıldız! Yeni sezon: sıfırdan ama %${star * 5} daha değerli bir isimle.` }
  }

  /** K5: itibar bonusu verilmiş yapı türleri (tür başına TEK sefer) */
  repGiven: string[] = []
  private giveRepOnce(kind: string, amt: number) {
    if (this.repGiven.includes(kind)) return
    this.repGiven.push(kind)
    this.rep = Math.min(5, this.rep + amt)
  }
  /** tesisin adı — tabelada yazar (ilk açılışta oyuncu verir) */
  facilityName = ''
  // ---- ŞUBELER ----
  activeLoc: LocId = 'mahalle'
  unlockedLocs: LocId[] = ['mahalle']
  private locStore: Record<string, LocSnap> = {}
  locDef(): LocDef { return LOCATIONS.find(l => l.id === this.activeLoc)! }
  /** aktif şubenin canlı alanlarını depoya yaz */
  syncLoc() {
    this.locStore[this.activeLoc] = {
      bookings: this.bookings, queue: this.queue, pitches: this.pitches,
      ownedParcels: this.ownedParcels, builds: this.builds, personel: this.personel,
    }
  }
  private loadLocFields(id: LocId) {
    const sn = this.locStore[id]
    if (!sn) return
    this.bookings = sn.bookings; this.queue = sn.queue; this.pitches = sn.pitches
    this.ownedParcels = sn.ownedParcels; this.builds = sn.builds
    this.personel = sn.personel ?? emptyPersonel()
  }
  switchLoc(id: LocId): { ok: boolean; msg: string } {
    if (!this.unlockedLocs.includes(id)) return { ok: false, msg: 'Bu şube henüz senin değil.' }
    if (id === this.activeLoc) return { ok: true, msg: '' }
    this.syncLoc()
    this.activeLoc = id
    this.loadLocFields(id)
    return { ok: true, msg: `${this.locDef().label} şubesine geçildi.` }
  }
  buyLoc(id: LocId): { ok: boolean; msg: string } {
    const def = LOCATIONS.find(l => l.id === id)
    if (!def) return { ok: false, msg: 'Bilinmeyen şube.' }
    if (this.unlockedLocs.includes(id)) return { ok: false, msg: 'Bu şube zaten senin.' }
    if (this.money < def.cost) return { ok: false, msg: `₺${(def.cost - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= def.cost
    this.unlockedLocs.push(id)
    this.locStore[id] = {
      bookings: [], queue: [], pitches: 1,
      ownedParcels: [...STARTER_PARCELS], builds: [], personel: emptyPersonel(),
    }
    this.events.push(`${def.label} şubesi açıldı! (₺${def.cost.toLocaleString('tr-TR')})`)
    return { ok: true, msg: `${def.label} şubesi senin — kurulu 1 saha + arsalarla geliyor.` }
  }
  hire(role: 'mudur' | 'cirak' | 'kantinci' | 'sekreter'): { ok: boolean; msg: string } {
    if (role === 'sekreter') {
      if (this.personel.sekreter) return { ok: false, msg: 'Sekreter zaten var.' }
      if (this.money < ISE_ALIM.sekreter) return { ok: false, msg: `₺${(ISE_ALIM.sekreter - this.money).toLocaleString('tr-TR')} eksik.` }
      this.money -= ISE_ALIM.sekreter; this.personel.sekreter = true
      this.events.push('Sekreter işe alındı.')
      return { ok: true, msg: 'Sekreter telefonda — kartların sabrı %25 yavaş erir, sen yokken istekleri not eder.' }
    }
    const p = this.personel
    if (role === 'mudur') {
      if (p.mudur >= 2) return { ok: false, msg: 'Müdür zaten usta seviyesinde.' }
      const cost = p.mudur === 0 ? ISE_ALIM.mudur1 : ISE_ALIM.mudur2
      if (this.money < cost) return { ok: false, msg: `₺${(cost - this.money).toLocaleString('tr-TR')} eksik.` }
      this.money -= cost; p.mudur++
      this.events.push(p.mudur === 1 ? 'Şube müdürü işe alındı.' : 'Müdür USTA seviyesine terfi etti.')
      return { ok: true, msg: p.mudur === 1 ? 'Müdür hazır — "müdüre bırak"ı açabilirsin.' : 'Usta müdür: yerleştirirken ufak zam da koparır.' }
    }
    if (role === 'cirak') {
      if (p.cirak) return { ok: false, msg: 'Bu şubede çırak zaten var.' }
      if (this.money < ISE_ALIM.cirak) return { ok: false, msg: `₺${(ISE_ALIM.cirak - this.money).toLocaleString('tr-TR')} eksik.` }
      this.money -= ISE_ALIM.cirak; p.cirak = true
      this.events.push('Çırak işe alındı.')
      return { ok: true, msg: 'Çırak telefonun başında — sabrı bitenleri o koyar.' }
    }
    if (p.kantinci) return { ok: false, msg: 'Kantinci zaten var.' }
    if (!this.hasCanteen) return { ok: false, msg: 'Önce kantin gerekli.' }
    if (this.money < ISE_ALIM.kantinci) return { ok: false, msg: `₺${(ISE_ALIM.kantinci - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= ISE_ALIM.kantinci; p.kantinci = true
    this.events.push('Kantinci işe alındı.')
    return { ok: true, msg: 'Kantinci tezgâhta — kantin gelirleri +%25.' }
  }
  fire(role: 'mudur' | 'cirak' | 'kantinci' | 'sekreter'): { ok: boolean; msg: string } {
    if (role === 'sekreter') { if (!this.personel.sekreter) return { ok: false, msg: 'Sekreter yok.' }; this.personel.sekreter = false }
    const p = this.personel
    if (role === 'mudur') { if (!p.mudur) return { ok: false, msg: 'Müdür yok.' }; p.mudur = 0; p.auto = false }
    if (role === 'cirak') { if (!p.cirak) return { ok: false, msg: 'Çırak yok.' }; p.cirak = false }
    if (role === 'kantinci') { if (!p.kantinci) return { ok: false, msg: 'Kantinci yok.' }; p.kantinci = false }
    this.events.push('Personel işten çıkarıldı.')
    return { ok: true, msg: 'İşten çıkarıldı — maaşı kesildi.' }
  }

  /** dün her şubenin net katkısı (şube çubuğu rozetleri) */
  locIncome: Record<string, number> = {}

  /** kayıttan gelen son görülme zamanı (offline hesap için) */
  private loadedLastSeen = 0

  /** SEN YOKKEN: kapalı geçen süreye göre (30 dk = 1 gün, tavan 2 gün) müdür çarpanlı
   *  gelir öder, kira payını düşer. Sekreter varsa dönüşte hazır istekler bekler. */
  applyOffline(nowMs: number): string | null {
    if (!this.loadedLastSeen) return null
    const mins = (nowMs - this.loadedLastSeen) / 60000
    this.loadedLastSeen = 0
    if (mins < 15) return null
    const days = Math.min(2, Math.floor(mins / 30))
    if (days < 1) return null
    this.syncLoc()
    let gross = 0
    for (const id of this.unlockedLocs) {
      const sn = this.locStore[id]
      if (!sn) continue
      const pp = sn.personel ?? emptyPersonel()
      const mult = pp.mudur === 2 ? 0.7 : pp.mudur === 1 ? 0.5 : 0.2
      const weekly = sn.bookings.reduce((sum, b) => sum + b.price, 0)
      gross += Math.round((weekly / 7) * days * mult)
    }
    const rentShare = Math.round(this.rentAmount() / 30 * days)
    const net = Math.max(0, gross - rentShare)
    this.money += net
    // sekreter: telefonlara bakmış — dönüşte hazır istekler
    let ready = 0
    if (this.personel.sekreter) {
      for (let i = 0; i < 60 && ready < 2; i++) if (this.spawnReservation()) ready++
    }
    const mudurVar = Object.values(this.locStore).some(sn => (sn.personel?.mudur ?? 0) > 0)
    const msg = net > 0
      ? `Sen yokken tesis çalıştı: +₺${net.toLocaleString('tr-TR')} kasada` +
        (mudurVar ? '' : ' (müdür olsaydı çok daha fazlaydı)') +
        (ready > 0 ? ` · sekreter ${ready} istek not etmiş.` : '.')
      : ready > 0 ? `Sekreter sen yokken ${ready} istek not etmiş — kartlar sırada.`
      : gross > 0 ? 'Sen yokken gelir kirayı ancak karşıladı — müdür olsaydı kâr kalırdı.' : null
    if (msg) this.events.push(msg)
    return msg
  }

  totalPitches(): number {
    let t = 0
    for (const id of this.unlockedLocs)
      t += id === this.activeLoc ? this.pitches : (this.locStore[id]?.pitches ?? 1)
    return t
  }
  queueCap(): number { return this.hasPhone2 ? 6 : 4 }

  /** her saniye */
  tick(dt: number) {
    this.t += dt
    // belge aşınması (docService varsa otomatik yenilenir)
    if (this.docService) this.docs = Math.min(1, this.docs + 0.0014 * dt)
    else this.docs = Math.max(0, this.docs - 0.0004 * dt) // %9/gün — eski %20/gün kazanca göre acımasızdı

    if (this.t >= DAY_SECONDS) {
      this.t -= DAY_SECONDS
      this.endDay()
    }
    // ANINDA ÖDEME: maç bitti mi (saati geçti mi) → para o an kasaya + bildirim kuyruğu.
    // 'Para gelmiyor' hissinin ilacı: gün sonunu bekleme. endDay ödenmişleri atlar.
    const hn = this.hourNow(), dowNow = this.todayDow()
    for (const b of this.bookings) {
      if (b.paid || b.day !== dowNow || !(b.sub || (b.wk ?? 0) === 0)) continue
      if (b.hour >= hn) continue // maç daha bitmedi
      const amt = b.price + this.extraPerMatch()
      b.paid = true
      this.money += amt
      this.paidToday += amt
      // GÜNÜN HEDEFLERİ maç bitiminde işler (eskiden gün sonundaydı → '0/3 takılı' bug'ı)
      if (this.goalDay !== this.day) { this.goalDay = this.day; this.gMatches = 0; this.gEarned = 0; this.gSubs = 0; this.goalsDone = [] }
      this.gMatches += 1
      this.gEarned += amt
      this.payouts.push({ team: b.team, amt })
    }
    // MAÇ OLAYI: aktif maç varken nadiren kavga/sakatlanma (günde en çok 1, 2. günden itibaren)
    if (this.day >= 2 && this.lastIncidentDay !== this.day) {
      const activeMatch = this.bookings.find(b => b.day === dowNow && b.hour === hn && (b.sub || (b.wk ?? 0) === 0))
      if (activeMatch && Math.random() < dt * 0.006) {
        this.lastIncidentDay = this.day
        const kind = Math.random() < 0.5 ? 'kavga' as const : 'sakatlanma' as const
        if (kind === 'kavga') {
          this.rep = Math.max(0, this.rep - 0.06)
          this.events.push(`${activeMatch.team} ${t('maçında KAVGA çıktı — polis geldi, itibar -0.06.')}`)
        } else {
          this.events.push(`${activeMatch.team} ${t('maçında sakatlanma — ambulans geldi, oyuncuya geçmiş olsun.')}`)
        }
        this.incidents.push({ kind, team: activeMatch.team })
      }
    }
    // ÇIRAK: sabrı azalan isteği oyuncu adına yerleştirir
    if (this.personel.cirak) {
      for (const r of [...this.queue]) {
        if (r.patience > r.maxPatience * 0.25) continue
        const days = r.flexible ? r.flexDays : [r.day]
        const hours = r.flexible ? r.flexHours : [r.hour]
        outer: for (const d of days) for (const h of hours) {
          if (this.place(r.id, d, h).ok) {
            this.notices.push(t('Çırak telefona baktı: ') + `${r.team} → ${dayName(d)} ${hourLabel(h)}`)
            break outer
          }
        }
      }
    }
    // MÜDÜRE BIRAK: müdür telefona bakar, gelen kartı en iyi slota kendisi koyar
    if (this.personel.auto && this.personel.mudur > 0) {
      let placedByMgr = 0
      let lastPlaced = ''
      for (const r of [...this.queue]) {
        const slot = this.bestSlot(r)
        if (!slot) continue
        if (this.personel.mudur === 2 && !r.haggled && Math.random() < 0.5) {
          const bump = Math.round(r.price * 0.1 / 10) * 10
          if (r.price + bump <= r.maxPay) r.price += bump  // usta müdür ufak zam koparır
        }
        if (this.place(r.id, slot.day, slot.hour).ok) {
          placedByMgr++
          lastPlaced = `${r.team} → ${dayName(slot.day)} ${slot.hour}:00`
        }
      }
      // K9: bildirim SELİ yok — tek tick'in tüm yerleştirmeleri tek bildirimde
      if (placedByMgr === 1) this.notices.push(t('Müdür yerleştirdi: ') + lastPlaced)
      else if (placedByMgr > 1) this.notices.push(t('Müdür yerleştirdi: ') + placedByMgr + t(' maç'))
    }
    // kart sabrı — EL SIKIŞILAN (pazarlığı biten) kart KAÇMAZ, süresi donar
    // TELEFON KAPALI: mola modu — sabır da donar, kimse küsmez (itibar cezası işlemez)
    if (this.phonePaused) return
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]
      if (q.haggled) {
        q.dealWait = (q.dealWait ?? 0) + dt
        continue
      }
      q.patience -= dt * (this.personel.sekreter ? 0.75 : 1)
      if (q.patience <= 0) {
        const lost = this.queue.splice(i, 1)[0]
        this.events.push(lost.team + t(' bekledi, başka sahaya gitti.'))
        this.lostNotices.push(lost.team + t(' beklemekten sıkıldı, başka sahaya gitti.'))
        this.rep = Math.max(0, this.rep - 0.008)
      }
    }
  }

  /** gün sonu: gelir tahsil, gider düş, abonelikleri işle */
  endDay() {
    const dow = (this.day - 1) % 7
    // yalnız BU haftanın maçları oynanır; gelecek haftaya yazılanlar (wk>0) sırasını bekler
    const todays = this.bookings.filter(b => b.day === dow && (b.sub || (b.wk ?? 0) === 0))
    // gelecek haftaya yazılanların sayacı bir azalır (bu günün geçişi tüketildi)
    for (const b of this.bookings) if (!b.sub && b.day === dow && (b.wk ?? 0) > 0) b.wk = (b.wk ?? 0) - 1
    // KESİNTİSİZ SAAT PRİMİ: arka arkaya dolu saatler kantini patlatır
    const hoursSet = new Set(todays.map(b => b.hour))
    let bestRun = 0, run = 0
    for (const h of HOURS) { if (hoursSet.has(h)) { run++; bestRun = Math.max(bestRun, run) } else run = 0 }
    const runBonus = bestRun >= 3 ? 1 + Math.min(0.3, (bestRun - 2) * 0.1) : 1
    const unpaidCount = todays.filter(b => !b.paid).length // abonelik paid-reset'inden ÖNCE ölç
    let income = 0
    // ek sahaların günlük kirası (futbol takviminden bağımsız)
    // K4: kort MUSLUK değil — yıpranır (gelir düşer) + günlük bakım gideri;
    // 'Bakım Yenile' (arsa modalı) yeni tekrarlayan sink
    const courtRent = this.builds.reduce((sum, b) => {
      const base = b.kind === 'basket' ? 800 : b.kind === 'voley' ? 550 : 0
      if (!base) return sum
      b.wear = Math.min(1, (b.wear ?? 0) + 0.04)
      return sum + Math.round(base * (1 - (b.wear ?? 0) * 0.7) - 200)
    }, 0)
    income += courtRent
    for (const b of todays) {
      // anında ödenmişse yalnız kesintisiz-gün bonusu farkı; ödenmemişse (23:00 maçı) tamamı
      if (b.paid) income += Math.round(this.extraPerMatch() * (runBonus - 1))
      else income += b.price + Math.round(this.extraPerMatch() * runBonus)
      // abonelik haftası tüket
      if (b.sub) {
        b.paid = false // gelecek haftaki maçı yeniden ödenecek
        b.weeksLeft--
        if (b.weeksLeft <= 0) {
          // K4/K6: sonsuz abonelik bitti — yenileme OLASILIKLI (%60 + itibar payı),
          // en fazla 3 yenileme (12 hafta ömür); sonra takım 'sezonu kapatır'
          b.renews = (b.renews ?? 0) + 1
          const renewChance = 0.6 + Math.min(0.25, this.rep * 0.05)
          if (b.renews <= 3 && Math.random() < renewChance) {
            b.weeksLeft = 4; this.events.push(`${b.team} aboneliğini uzattı.`)
          } else {
            this.bookings = this.bookings.filter(x => x !== b)
            this.events.push(b.renews > 3
              ? `${b.team} sezonu kapattı — slot boşaldı.`
              : `${b.team} aboneliğini yenilemedi.`)
          }
        }
      } else {
        // tek maç: slot boşalır
        this.bookings = this.bookings.filter(x => x !== b)
      }
    }
    this.gMatches += unpaidCount // anında ödenenler zaten sayıldı
    this.gEarned += income
    const upkeep = this.dailyUpkeep()
    this.money += income - upkeep
    // defter: gün içinde anında ödenenler + gün sonu kalemleri birlikte raporlanır
    this.lastDayProfit = this.paidToday + income - upkeep
    this.locIncome[this.activeLoc] = this.paidToday + income - upkeep
    this.incomeToday = this.paidToday + income
    this.expenseToday = upkeep
    this.paidToday = 0
    // DİĞER ŞUBELER: müdür işletir — maçlar oynanır, abonelikler işler, kort kirası gelir
    const dayIdx = (this.day - 1) % 7
    let subeIncome = 0
    for (const id of this.unlockedLocs) {
      if (id === this.activeLoc) continue
      const sn = this.locStore[id]
      if (!sn) continue
      subeIncome += sn.builds.reduce((sum, b) => {
        const base = b.kind === 'basket' ? 800 : b.kind === 'voley' ? 550 : 0
        if (!base) return sum
        b.wear = Math.min(1, (b.wear ?? 0) + 0.04)
        return sum + Math.round(base * (1 - (b.wear ?? 0) * 0.7) - 200)  // bakım gideri + yıpranma
      }, 0)
      const pp = sn.personel ?? emptyPersonel()
      const mult = pp.mudur === 2 ? 1.1 : pp.mudur === 1 ? 1 : 0.7  // müdürsüz şube gelir kaçırır
      subeIncome -= (pp.mudur === 1 ? MAAS.mudur1 : pp.mudur === 2 ? MAAS.mudur2 : 0)
        + (pp.cirak ? MAAS.cirak : 0) + (pp.kantinci ? MAAS.kantinci : 0)
      const played = sn.bookings.filter(b => b.day === dayIdx)
      for (const b of played) {
        subeIncome += Math.round((b.price + this.extraPerMatch()) * mult)
        if (b.sub) {
          b.weeksLeft--
          if (b.weeksLeft <= 0) {
            if (this.rep >= 3.2) b.weeksLeft = 4
            else sn.bookings = sn.bookings.filter(x => x !== b)
          }
        } else sn.bookings = sn.bookings.filter(x => x !== b)
      }
      this.gMatches += played.length
      this.locIncome[id] = subeIncome
    }
    if (subeIncome > 0) {
      this.money += subeIncome
      this.incomeToday += subeIncome
      this.lastDayProfit += subeIncome
      this.gEarned += subeIncome
      this.events.push(`Şubelerden gelir: ₺${subeIncome.toLocaleString('tr-TR')}`)
      this.notices.push(`Şube müdürlerinden rapor: +₺${subeIncome.toLocaleString('tr-TR')}`)
    }
    if (this.adDays > 0) {
      this.adDays--
      if (this.adDays === 0) this.notices.push('Sosyal medya reklamı bitti — istersen yenisini ver.')
    }
    // KİRA GÜNÜ
    if (this.day >= this.rentDueDay) {
      const rent = this.rentAmount()
      if (this.money >= rent) {
        this.money -= rent
        this.events.push(t('Aylık kira ödendi: ') + `₺${rent.toLocaleString('tr-TR')}`)
      } else {
        this.rentMissed++
        this.rep = Math.max(0, this.rep - 0.5)
        this.events.push(`KİRA ÖDENEMEDİ! (₺${rent.toLocaleString('tr-TR')}) — itibar düştü.`)
      }
      this.rentDueDay = this.day + 30
    }
    this.day++
    // memnuniyet: oynanan her maç itibar kazandırır (günde en çok +0.12)
    if (todays.length > 0)
      this.rep = Math.min(5, this.rep + Math.min(0.12, todays.length * 0.02)
        + (this.hasShower ? 0.01 : 0) + (this.hasCanteen ? 0.01 : 0))
    this.events.push(`Gün ${this.day - 1}: ${todays.length} maç · gelir ₺${income.toLocaleString('tr-TR')} · gider ₺${upkeep.toLocaleString('tr-TR')}`
      + (bestRun >= 3 ? ` · ${bestRun} saat kesintisiz (+%${Math.round((runBonus - 1) * 100)} kantin)` : '')
      + (courtRent > 0 ? ` · ek saha kirası ₺${courtRent.toLocaleString('tr-TR')}` : ''))
    // denetim riski: belgeler zayıfsa
    if (this.docs < 0.35 && Math.random() < 0.4) {
      const fine = Math.round(this.basePrice() * 1.0)
      this.money = Math.max(0, this.money - fine)
      this.docs = Math.min(1, this.docs + 0.3)
      this.events.push(`DENETİM: evrak eksiği — ₺${fine.toLocaleString('tr-TR')} ceza kesildi.`)
      this.notices.push(t('Denetim cezası yedin! Kalıcı çözüm: Yazıhane → Yatırım → Belge Takip Servisi.'))
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
      { id: 'tost', label: 'Tost Makinesi', gain: 'Her maçtan +₺45', cost: 3_000, upkeep: 0,
        desc: 'Maç sonu kaşarlı tost — kantinin ruhu.', owned: this.hasTost,
        locked: this.hasCanteen ? null : 'Önce kantin gerekli' },
      { id: 'baklava', label: 'Baklava Tezgâhı', gain: 'Her maçtan +₺55', cost: 4_500, upkeep: 0,
        desc: 'Galibiyet baklavayla kutlanır — tepsiyle gider.', owned: this.hasBaklava,
        locked: this.hasCanteen ? null : 'Önce kantin gerekli' },
      { id: 'keeper', label: 'Kaleci Kiralama', gain: 'Her maçtan +₺70', cost: 5_000, upkeep: 100,
        desc: '"Kalecimiz yok abi" derdine son — tesisin kadrolu kalecisi maça girer.', owned: this.hasKeeper, locked: null },
      { id: 'cleats', label: 'Krampon Kiralama', gain: 'Her maçtan +₺45', cost: 4_200, upkeep: 0,
        desc: '“Abi kramponu unuttum” geliri. Zamanla eskir, yenilemek gerekir.', owned: this.hasCleats, locked: null },
      { id: 'lights', label: 'LED Projektör', gain: 'Akşam talebi +%25 · GECE (00-02) açılır', cost: 11_000, upkeep: 140,
        desc: 'Işık kalitesi akşam maçlarını çeker; elektrik gideri artar.', owned: this.hasLights, locked: null },
      { id: 'shower', label: 'Duş & Soyunma', gain: 'İtibar +0,5', cost: 14_000, upkeep: 70,
        desc: 'Kalite algısını yükseltir, abonelikler daha uzun sürer.', owned: this.hasShower, locked: null },
      { id: 'schooldeal', label: 'Okul Anlaşması', gain: 'Gençlik segmenti açılır (14-18)', cost: 12_000, upkeep: 0,
        desc: 'Öğleden sonra ölü saatleri okul takımlarıyla doldurursun.', owned: this.hasSchoolDeal, locked: null },
      { id: 'tearoom', label: 'Çay Ocağı', gain: 'Veteran segmenti açılır (9-13)', cost: 7_500, upkeep: 0,
        desc: 'Sabah emekli grupları gelir — en ölü saat dolar.', owned: this.hasTeaRoom, locked: null },
      { id: 'corporate', label: 'Kurumsal Fatura', gain: 'Şirket segmenti açılır (12-17)', cost: 12_000, upkeep: 0,
        desc: 'Şirket turnuvaları gündüz gelir, ücreti %30 yüksek.', owned: this.hasCorporate, locked: null },
      { id: 'billboard', label: 'Reklam Panoları', gain: 'Her maçtan +₺90', cost: 8_500, upkeep: 0,
        desc: 'Saha kenarına yerel esnaf reklamı asarsın; kira her maçta cebe girer.', owned: this.hasBillboard, locked: null },
      { id: 'roadsign', label: 'Yol Tabelası', gain: 'Tüm talep +%20', cost: 12_500, upkeep: 60,
        desc: 'Ana caddeden görünen büyük tabela — yoldan geçen daha çok kişi arar.', owned: this.hasRoadSign, locked: null },
      { id: 'phone2', label: '2. Telefon Hattı', gain: 'Sırada 6 istek bekler (4 yerine)', cost: 5_500, upkeep: 40,
        desc: 'Hat meşgulken arayan müşteri kaçıyordu — ikinci hat kuyruk kapasitesini artırır.', owned: this.hasPhone2, locked: null },
      { id: 'ads', label: 'Sosyal Medya Reklamı', gain: '2 gün talep +%50', cost: 2_500, upkeep: 0,
        desc: 'Mahalle gruplarında sponsorlu ilan. Bitince tekrar verebilirsin.', owned: false,
        locked: this.adDays > 0 ? `Reklam yayında (${this.adDays} gün kaldı)` : null },
      { id: 'staff', label: 'Tesis Görevlisi', gain: 'Saha bakımı otomatik', cost: 6_000, upkeep: 280,
        desc: 'Yovmiyesi var ama bakım işini üstlenir.', owned: this.staff >= 1, locked: null },
      { id: 'docs', label: 'Belge Takip Servisi', gain: 'Evraklar otomatik yenilenir', cost: 6_000, upkeep: 120,
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
      case 'keeper': this.hasKeeper = true; break
      case 'tost': this.hasTost = true; break
      case 'baklava': this.hasBaklava = true; break
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
      case 'cirak': this.personel.cirak = true; break
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
  /** KADEMELİ BÜYÜME FRENİ: ilk ek saha taban fiyat, her yenisi +%40 —
   *  'başta hızlı kazansın, sonra yavaşlasın; exponansiyel büyümesin' (lansman kararı) */
  buildCostFor(kind: BuildKind): number {
    const base = BUILDS[kind].cost
    if (kind !== 'pitch' && kind !== 'mini') return base
    const mult = 1 + 0.4 * Math.max(0, this.pitches - 1) // 2. saha ×1.0, 3. ×1.4, 4. ×1.8…
    return Math.round(base * mult / 500) * 500
  }
  /** arsa da kademeli: ilk 4 (başlangıç bölgesi) sonrası her arsa +%35 */
  parcelPrice(c: number, r: number): number {
    const mult = 1 + 0.35 * Math.max(0, this.ownedParcels.length - 4)
    return Math.round(parcelCost(c, r) * mult / 500) * 500
  }

  /** bu arsa mevcut arazine BİTİŞİK mi (4 komşu) — kopuk ada satın alma yok */
  parcelAdjacent(c: number, r: number): boolean {
    return this.ownedParcels.some(k => {
      const [pc, pr] = k.split(',').map(Number)
      return Math.abs(pc - c) + Math.abs(pr - r) === 1
    })
  }
  buyParcel(c: number, r: number): { ok: boolean; msg: string } {
    if (c < 0 || c >= PARCEL_COLS || r < 0 || r >= PARCEL_ROWS) return { ok: false, msg: 'Geçersiz arsa.' }
    if (this.ownsParcel(c, r)) return { ok: false, msg: 'Bu arsa zaten senin.' }
    if (!this.parcelAdjacent(c, r)) return { ok: false, msg: t('Bu arsa arazine bitişik değil — önce aradaki arsayı al.') }
    const cost = this.parcelPrice(c, r)
    if (this.money < cost) return { ok: false, msg: `₺${(cost - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= cost
    this.ownedParcels.push(parcelKey(c, r))
    this.events.push(`Arsa alındı (${c + 1},${r + 1}) — ₺${cost.toLocaleString('tr-TR')}`)
    return { ok: true, msg: `Arsa senin! Üstüne saha ya da tesis kurabilirsin.` }
  }
  placeBuild(c: number, r: number, kind: BuildKind): { ok: boolean; msg: string } {
    if (!this.ownsParcel(c, r)) return { ok: false, msg: 'Önce arsayı satın al.' }
    // TEKİL İŞLETMELER: para kesilmeden ÖNCE kontrol (geç kontrol para yutuyordu — denetim bulgusu)
    if ((kind === 'kantin' && this.hasCanteen && this.buildAt(c, r)?.kind !== 'kantin') ||
        (kind === 'dus' && this.hasShower && this.buildAt(c, r)?.kind !== 'dus') ||
        (kind === 'wc' && this.hasWC && this.buildAt(c, r)?.kind !== 'wc')) {
      return { ok: false, msg: 'Bundan zaten var.' }
    }
    // SAHİPLİ ARSADA ESNEK İNŞA: eski yapı otomatik yıkılır (%40 iade), yenisi kurulur
    if (this.buildAt(c, r)) {
      const rem = this.removeBuild(c, r)
      if (!rem.ok) return rem   // 'son sahanı yıkamazsın' gibi korumalar geçerli kalır
    }
    const b = BUILDS[kind]
    const cost = this.buildCostFor(kind)
    if (this.money < cost) return { ok: false, msg: `₺${(cost - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= cost
    this.builds.push({ key: parcelKey(c, r), kind })
    if (kind === 'pitch') this.pitches++
    if (kind === 'mini') this.pitches++
    if (kind === 'kantin') {
      if (this.hasCanteen) return { ok: false, msg: 'Kantin zaten var.' }
      this.hasCanteen = true
    }
    if (kind === 'dus') {
      if (this.hasShower) return { ok: false, msg: 'Duş & soyunma zaten var.' }
      this.hasShower = true; this.rep = Math.min(5, this.rep + 0.5)
    }
    if (kind === 'wc') {
      if (this.hasWC) return { ok: false, msg: 'Tuvalet zaten var.' }
      this.hasWC = true; this.rep = Math.min(5, this.rep + 0.2)
    }
    if (kind === 'basket') this.giveRepOnce('basket', 0.1)
    if (kind === 'voley') this.giveRepOnce('voley', 0.2)
    if (kind === 'parking') this.giveRepOnce('parking', 0.3)
    if (kind === 'garden') this.giveRepOnce('garden', 0.2)
    this.events.push(`${b.label} kuruldu.`)
    return { ok: true, msg: `${b.label} hazır — ${b.gain}` }
  }

  /** kort bakımı: ₺4.000 → wear sıfırlanır (tekrarlayan sink) */
  serviceBuild(c: number, r: number): { ok: boolean; msg: string } {
    const b = this.buildAt(c, r)
    if (!b || (b.kind !== 'basket' && b.kind !== 'voley')) return { ok: false, msg: 'Burada bakım gerektiren kort yok.' }
    const COST = 4_000
    if (this.money < COST) return { ok: false, msg: `₺${(COST - this.money).toLocaleString('tr-TR')} eksik.` }
    this.money -= COST
    b.wear = 0
    this.events.push(`${BUILDS[b.kind].label} bakımı yapıldı (₺${COST.toLocaleString('tr-TR')}).`)
    return { ok: true, msg: 'Zemin yenilendi — kort tam kapasite kazandırıyor.' }
  }

  /** yapıyı TAŞI (düzenleme modu): bedava, sahipli boş arsaya */
  moveBuild(fc: number, fr: number, tc: number, tr: number): { ok: boolean; msg: string } {
    const b = this.buildAt(fc, fr)
    if (!b) return { ok: false, msg: 'Burada taşınacak yapı yok.' }
    if (fc === tc && fr === tr) return { ok: false, msg: 'Aynı yer.' }
    if (!this.ownsParcel(tc, tr)) return { ok: false, msg: 'Hedef arsa senin değil.' }
    if (this.buildAt(tc, tr)) return { ok: false, msg: 'Hedef arsa dolu.' }
    b.key = parcelKey(tc, tr)
    this.events.push(`${BUILDS[b.kind].label} taşındı.`)
    return { ok: true, msg: `${BUILDS[b.kind].label} yeni yerine taşındı.` }
  }

  /** yapıyı yık: maliyetin %40'ı iade — arsa yeniden düzenlenebilir */
  removeBuild(c: number, r: number): { ok: boolean; msg: string } {
    const i = this.builds.findIndex(b => b.key === parcelKey(c, r))
    if (i < 0) return { ok: false, msg: 'Bu arsada yapı yok.' }
    const b = this.builds[i]
    const refund = Math.round(BUILDS[b.kind].cost * 0.4 / 100) * 100
    if (b.kind === 'pitch' || b.kind === 'mini') {
      if (this.pitches <= 1) return { ok: false, msg: 'Son sahanı yıkamazsın.' }
      this.pitches--
    }
    if (b.kind === 'kantin') this.hasCanteen = false
    if (b.kind === 'dus') this.hasShower = false
    if (b.kind === 'wc') this.hasWC = false
    this.builds.splice(i, 1)
    this.money += refund
    this.events.push(`${BUILDS[b.kind].label} yıkıldı — ₺${refund.toLocaleString('tr-TR')} iade.`)
    return { ok: true, msg: `${BUILDS[b.kind].label} yıkıldı, ₺${refund.toLocaleString('tr-TR')} iade edildi.` }
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
      out.push({ title: t('Evrakların eskiyor'), why: `${t('Geçerlilik')} %${Math.round(this.docs * 100)}. ${t('Denetim gelirse ceza yersin.')} ${t('Aşağıdaki butonla hemen çöz:')}`,
        action: 'docs', cta: `${t('Belge Takip Servisi')} ₺6.000`, urgent: true })
    }
    // 2. boş prime-time varsa: ışık
    if (!this.hasLights && this.day >= 3) {
      out.push({ title: t('Akşam saatlerin boş kalıyor'), why: t('Işık kalitesi düşük olduğu için akşam takımları başka sahaya gidiyor.'),
        action: 'lights', cta: `${t('LED Projektör')} ₺11.000 → ${t('akşam talebi')} +%25 · ${t('gece saatleri')}`, urgent: false })
    }
    // 3. gündüz boş: segment aç
    const dayEmpty = this.bookings.filter(b => b.hour < 18).length
    if (dayEmpty < 3 && !this.hasSchoolDeal) {
      out.push({ title: t('Gündüz saatlerin bomboş'), why: t('Öğleden sonra (14-18) hiç müşterin yok. Okul takımları bu saati doldurur.'),
        action: 'schooldeal', cta: `${t('Okul Anlaşması')} ₺9.000 → ${t('gençlik segmenti')}`, urgent: false })
    }
    if (dayEmpty < 3 && this.hasSchoolDeal && !this.hasTeaRoom) {
      out.push({ title: t('Sabahlar hâlâ ölü'), why: t('Emekli grupları sabah oynar ama çay ocağı olmayan sahaya gelmezler.'),
        action: 'tearoom', cta: `${t('Çay Ocağı')} ₺7.500 → ${t('veteran segmenti')}`, urgent: false })
    }
    // 4. kantin yoksa
    if (!this.hasCanteen && this.bookings.length >= 3) {
      out.push({ title: t('Maç sonrası herkes dağılıyor'), why: t('Kantin yok; her maçtan ₺120 ek gelir kaçırıyorsun.'),
        action: 'canteen', cta: `${t('Kantin')} ₺9.000`, urgent: false })
    }
    // 5. doluluk yüksekse ikinci saha (arsa yoluyla)
    if (this.pitches < 2 && this.occupancy() > 0.35) {
      out.push({ title: t('Saha yetmiyor'), why: `${t('Doluluk')} %${Math.round(this.occupancy() * 100)}. ${t('Boş arsaya tıkla: arsa al + mini saha kur')} (₺${(this.parcelPrice(0, 1) + this.buildCostFor('mini')).toLocaleString('tr-TR')}).`,
        urgent: false })
    }
    // 6. abonelik dengesi
    if (this.subRatio() > 0.65) {
      out.push({ title: t('Fazla abone bağladın'), why: `%${Math.round(this.subRatio() * 100)} ${t('slotun abonelikte — yüksek ücretli tek maçlara yer kalmıyor.')}`,
        urgent: false })
    }
    if (out.length === 0) {
      out.push({ title: t('İşler yolunda'), why: t('Gelen rezervasyon isteklerini takvime yerleştirmeye devam et.'), urgent: false })
    }
    return out.slice(0, 3)
  }

  // ---- kayıt ----
  save(): SaveData {
    return {
      lastSeen: Date.now(),
      money: this.money, rep: this.rep, day: this.day, bookings: this.bookings,
      pitches: this.pitches, hasCanteen: this.hasCanteen, hasFridge: this.hasFridge,
      hasCleats: this.hasCleats, hasKeeper: this.hasKeeper, hasTost: this.hasTost, hasWC: this.hasWC, hasBaklava: this.hasBaklava, hasLights: this.hasLights, hasShower: this.hasShower,
      hasSchoolDeal: this.hasSchoolDeal, hasTeaRoom: this.hasTeaRoom, hasCorporate: this.hasCorporate,
      staff: this.staff, docService: this.docService, docs: this.docs,
      hasBillboard: this.hasBillboard, hasRoadSign: this.hasRoadSign,
      rentDueDay: this.rentDueDay, rentMissed: this.rentMissed, loyalty: this.loyalty,
      hasPhone2: this.hasPhone2, hasCirak: this.hasCirak, adDays: this.adDays,
      placedCount: this.placedCount, facilityName: this.facilityName, repGiven: this.repGiven, stars: this.stars,
      goalDay: this.goalDay, gMatches: this.gMatches, gEarned: this.gEarned,
      gSubs: this.gSubs, goalsDone: this.goalsDone,
      events: this.events.slice(-40), incomeToday: this.incomeToday,
      expenseToday: this.expenseToday, lastDayProfit: this.lastDayProfit,
      locIncome: this.locIncome, t: this.t,
      activeLoc: this.activeLoc, unlockedLocs: this.unlockedLocs,
      locStore: (this.syncLoc(), this.locStore),
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
    this.hasKeeper = d.hasKeeper === true
    this.hasTost = d.hasTost === true
    this.hasBaklava = d.hasBaklava === true
    this.hasWC = d.hasWC === true
    this.hasPhone2 = d.hasPhone2 === true; this.hasCirak = d.hasCirak === true; this.adDays = n('adDays', 0)
    if (this.hasCirak) this.personel.cirak = true
    this.placedCount = n('placedCount', 0)
    if (typeof d.facilityName === 'string') this.facilityName = d.facilityName.slice(0, 16)
    if (Array.isArray(d.repGiven)) this.repGiven = d.repGiven as string[]
    this.stars = n('stars', 0)
    this.goalDay = n('goalDay', 0); this.gMatches = n('gMatches', 0)
    this.gEarned = n('gEarned', 0); this.gSubs = n('gSubs', 0)
    if (Array.isArray(d.goalsDone)) this.goalsDone = d.goalsDone as string[]
    if (Array.isArray(d.events)) this.events = d.events as string[]
    this.incomeToday = n('incomeToday', 0); this.expenseToday = n('expenseToday', 0)
    this.lastDayProfit = n('lastDayProfit', 0); this.t = n('t', 0)
    if (d.locIncome && typeof d.locIncome === 'object') this.locIncome = d.locIncome as Record<string, number>
    this.loadedLastSeen = n('lastSeen', 0)
    if (Array.isArray(d.unlockedLocs) && d.unlockedLocs.length) this.unlockedLocs = d.unlockedLocs as LocId[]
    if (typeof d.activeLoc === 'string' && this.unlockedLocs.includes(d.activeLoc as LocId)) this.activeLoc = d.activeLoc as LocId
    if (d.locStore && typeof d.locStore === 'object') {
      this.locStore = d.locStore as Record<string, LocSnap>
      const sn = this.locStore[this.activeLoc]
      if (sn) {
        // aktif şubenin alanları depodan gelir (eski kayıtta depo yoksa üst düzey alanlar zaten yüklendi)
        this.bookings = sn.bookings; this.queue = sn.queue; this.pitches = sn.pitches
        this.ownedParcels = [...new Set([...STARTER_PARCELS, ...sn.ownedParcels])]
        this.builds = sn.builds
        this.personel = sn.personel ?? this.personel  // yoksa eski kayıt göçü (hasCirak) korunur
      }
    }
    if (d.loyalty && typeof d.loyalty === 'object') this.loyalty = d.loyalty as Record<string, number>
    if (Array.isArray(d.ownedParcels))
      this.ownedParcels = [...new Set([...STARTER_PARCELS, ...(d.ownedParcels as string[])])]
    if (Array.isArray(d.builds)) this.builds = d.builds as PlacedBuild[]
  }
}
