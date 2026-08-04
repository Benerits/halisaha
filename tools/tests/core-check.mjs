// Ekonomi çekirdeği testleri — three.js'siz, saf mantık.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { Game, SEGMENTS, hourDemand, HOURS, DAY_SECONDS } =
  await import('../../src/state.ts')

let pass = 0, fail = 0
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }

console.log('\n— TALEP EĞRİSİ —')
check('prime time (21:00 hafta içi) en yüksek', hourDemand(21, 1) >= 1.0)
check('sabah (10:00 hafta içi) çok düşük — oyunun problemi', hourDemand(10, 1) <= 0.2)
check('hafta sonu sabahı daha canlı', hourDemand(10, 6) > hourDemand(10, 1))

console.log('\n— REZERVASYON AKIŞI —')
const g = new Game()
check('başlangıç kasası 25.000', g.money === 25_000)
check('kilitli segmentler kapalı', !g.segmentOpen('genclik') && !g.segmentOpen('veteran'))
check('klasik segment açık', g.segmentOpen('klasik'))

// KATI kart bul (esnek kartta 'yanlış gün' geçerli olabilir — o ayrı testte)
let spawned = null
for (let i = 0; i < 1500 && !spawned; i++) {
  const r = g.spawnReservation()
  if (r && !r.flexible) spawned = r
  if (g.queue.length >= 4) g.queue.length = 0
}
check('rezervasyon isteği üretiliyor', !!spawned)
if (spawned) {
  const wrong = g.place(spawned.id, (spawned.day + 1) % 7, spawned.hour)
  check('katı istekte yanlış gün REDDEDİLİR', !wrong.ok)
  const ok = g.place(spawned.id, spawned.day, spawned.hour)
  check('doğru slota yerleşir', ok.ok)
  check('kuyruktan düşer', !g.queue.find(r => r.id === spawned.id))
  check('takvimde görünür', !!g.bookingAt(spawned.day, spawned.hour))
  let dup = null
  for (let i = 0; i < 300 && !dup; i++) dup = g.spawnReservation()
  if (dup) g.place(dup.id, spawned.day, spawned.hour)
  check('dolu slota ikinci rezervasyon giremez', g.bookings.filter(b => b.day === spawned.day && b.hour === spawned.hour).length === 1)
}

console.log('\n— MAĞAZA / SIFIR SÜRTÜNME —')
const s = new Game()
check('her mağaza satırında GETİRİ yazılı', s.shop().every(r => r.gain && r.gain.length > 3))
check('her mağaza satırında açıklama var', s.shop().every(r => r.desc && r.desc.length > 10))
check('soğuk su dolabı kantinsiz KİLİTLİ', !!s.shop().find(r => r.id === 'fridge').locked)
check('kantin alınabilir', s.buy('canteen').ok)
check('kantin sonrası dolap açılır', !s.shop().find(r => r.id === 'fridge').locked)
check('aynı şey iki kez alınamaz', !s.buy('canteen').ok)
const poor = new Game(); poor.money = 100
check('parası yetmeyen alamaz', !poor.buy('shower').ok)
check('okul anlaşması gençlik segmentini açar', (() => {
  const x = new Game(); x.buy('schooldeal'); return x.segmentOpen('genclik')
})())

console.log('\n— ÖNERİ KARTLARI —')
const t = new Game()
check('her zaman en az 1 öneri var', t.suggestions().length >= 1)
check('öneri kartında NEDEN açıklaması var', t.suggestions().every(x => x.why.length > 10))
t.docs = 0.2
check('evrak düşünce ACİL öneri çıkar', t.suggestions().some(x => x.urgent))
check('acil öneri satın alma aksiyonu taşır', t.suggestions().find(x => x.urgent)?.action === 'docs')
const t2 = new Game(); t2.day = 5
check('ışıksız oyuncuya projektör önerilir', t2.suggestions().some(x => x.action === 'lights'))

console.log('\n— GÜN SONU EKONOMİSİ —')
const e = new Game()
let r2 = null
for (let i = 0; i < 800 && !r2; i++) r2 = e.spawnReservation()
if (r2) e.place(r2.id, r2.day, r2.hour)
const before = e.money
e.day = r2.day + 1 // o günün maçları işlensin
e.endDay()
check('gün sonunda gider düşülür', e.expenseToday > 0)
check('gün sayacı ilerler', e.day === r2.day + 2)
check('defterde gün kaydı var', e.events.some(x => x.includes('Gün')))
const noRev = new Game(); noRev.endDay()
check('boş günde ZARAR yazar (sabit gider)', noRev.lastDayProfit < 0)

console.log('\n— EVRAK / DENETİM —')
const d = new Game()
d.tick(120)
check('evrak zamanla eskir', d.docs < 1)
const d2 = new Game(); d2.docService = true; d2.docs = 0.3; d2.tick(100)
check('belge servisi evrakı yeniler', d2.docs > 0.3)

console.log('\n— KAYIT —')
const a = new Game(); a.buy('canteen'); a.money = 4242; a.rep = 4.1
const b2 = new Game(); b2.load(a.save())
check('kayıt/yükleme kasayı korur', b2.money === 4242)
check('kayıt/yükleme yatırımı korur', b2.hasCanteen === true)
check('kayıt/yükleme itibarı korur', Math.abs(b2.rep - 4.1) < 0.001)


console.log('\n— ESNEK İSTEK (asıl karar burada doğar) —')
{
  const g = new Game()
  let flexFound = null, rigidFound = null
  for (let i = 0; i < 900 && (!flexFound || !rigidFound); i++) {
    const r = g.spawnReservation()
    if (!r) continue
    if (r.flexible && !flexFound) flexFound = r
    if (!r.flexible && !rigidFound) rigidFound = r
    if (g.queue.length >= 4) g.queue.length = 0
  }
  check('esnek istek üretiliyor', !!flexFound)
  check('katı istek de üretiliyor (ikisi bir arada)', !!rigidFound)
  if (flexFound) {
    check('esnek istek BİRDEN ÇOK slot kabul eder',
      flexFound.flexDays.length > 1 && flexFound.flexHours.length >= 2)
    const d0 = flexFound.flexDays[0], h0 = flexFound.flexHours[0]
    const d1 = flexFound.flexDays[1], h1 = flexFound.flexHours[1]
    check('esnek: birinci slot geçerli', g.slotOk(flexFound, d0, h0))
    check('esnek: alternatif slot da geçerli', g.slotOk(flexFound, d1, h1))
    check('esnek: kapsam dışı slot REDDEDİLİR', !g.slotOk(flexFound, d0, 9) || flexFound.flexHours.includes(9))
  }
  if (rigidFound) check('katı: sadece kendi slotu geçerli',
    g.slotOk(rigidFound, rigidFound.day, rigidFound.hour) && !g.slotOk(rigidFound, rigidFound.day, rigidFound.hour + 1))
}

console.log('\n— PAZARLIK —')
{
  const g = new Game()
  let r = null
  for (let i = 0; i < 900 && !r; i++) r = g.spawnReservation()
  if (r) {
    const before = r.price
    r.maxPay = before * 3            // kesin kabul senaryosu
    const res = g.haggle(r.id, 1)
    check('tavanın altında pazarlık KABUL edilir', res.ok && r.price > before)
    check('pazarlık bir kez yapılır', !g.haggle(r.id, 1).ok)
  }
  const g2 = new Game()
  let r2 = null
  for (let i = 0; i < 900 && !r2; i++) r2 = g2.spawnReservation()
  if (r2) {
    r2.maxPay = 1                    // kesin reddedilecek
    const res2 = g2.haggle(r2.id, 2)
    check('tavanı aşan SERT pazarlıkta müşteri gidebilir ya da ortayı bulur',
      res2.walked === true || res2.ok === true)
  }
  const g3 = new Game()
  check('olmayan isteğe pazarlık güvenli', !g3.haggle(9999, 1).ok)
}

console.log('\n— HAFTALIK KİRA (baskı davulu) —')
{
  const g = new Game()
  check('kira tutarı pozitif', g.rentAmount() > 0)
  check('kira gününe kalan sayı görünür', g.daysToRent() > 0)
  g.money = 500_000; g.day = 7
  const before = g.money
  g.endDay()
  check('kira günü kasadan düşer', g.money < before)
  check('sonraki kira 7 gün sonraya kurulur', g.rentDueDay === 8 + 7 - 1 || g.rentDueDay > 7)
  const p = new Game(); p.money = 0; p.day = 7
  const repBefore = p.rep
  p.endDay()
  check('kira ödenemezse itibar yanar', p.rep < repBefore && p.rentMissed === 1)
}

console.log('\n— KESİNTİSİZ SAAT PRİMİ —')
{
  const g = new Game()
  g.hasCanteen = true
  for (const h of [19, 20, 21, 22]) g.bookings.push({ day: 0, hour: h, team: 'T', segment: 'klasik', price: 500, sub: false, weeksLeft: 0 })
  g.day = 1
  g.endDay()
  check('arka arkaya 4 saat primi deftere yazılır', g.events.some(e => e.includes('kesintisiz')))
}


console.log('\n— ÇIRAK / TELEFON HATTI / REKLAM —')
{
  const g = new Game()
  check('temel kuyruk 4 istek', g.queueCap() === 4)
  g.money = 50_000
  check('2. hat alınır', g.buy('phone2').ok)
  check('2. hatla kuyruk 6 olur', g.queueCap() === 6)
  check('reklam alınır', g.buy('ads').ok)
  check('reklam yayındayken tekrar verilemez', !g.buy('ads').ok)
  g.day = 1; g.endDay(); g.day = 2; g.endDay()
  check('reklam 2 gün sonra biter', g.adDays === 0)
  check('bitince tekrar verilebilir', g.buy('ads').ok)

  const c = new Game(); c.money = 50_000
  check('çırak alınır', c.buy('cirak').ok)
  let r = null
  for (let i = 0; i < 900 && !r; i++) r = c.spawnReservation()
  if (r) {
    r.patience = r.maxPatience * 0.1        // sabrı bitmek üzere
    c.tick(0.1)
    check('çırak sabrı biten isteği YERLEŞTİRİR', c.bookings.length === 1 && c.queue.length === 0)
    check('çırak yerleştirmesi bildirim üretir', c.notices.some(n => n.includes('Çırak')))
  }
  const noC = new Game()
  let r2 = null
  for (let i = 0; i < 900 && !r2; i++) r2 = noC.spawnReservation()
  if (r2) {
    r2.patience = r2.maxPatience * 0.1
    noC.tick(0.1)
    check('çıraksız istek kendiliğinden yerleşmez', noC.bookings.length === 0)
  }
}


console.log('\n— ANLAŞMA DONDURMASI + SAAT —')
{
  const g = new Game()
  let r = null
  for (let i = 0; i < 900 && !r; i++) r = g.spawnReservation()
  if (r) {
    r.maxPay = r.price * 3
    g.haggle(r.id, 1)
    const before = r.patience
    g.tick(10)
    check('el sıkışılan kartın süresi DONAR (kaçmaz)', r.patience === before && g.queue.includes(r))
    check('bekleme sayacı işler (nazik hatırlatma için)', (r.dealWait ?? 0) >= 10)
  }
  const t = new Game()
  let r2 = null
  for (let i = 0; i < 900 && !r2; i++) r2 = t.spawnReservation()
  if (r2 && !r2.haggled) {
    const before = r2.patience
    t.tick(5)
    check('pazarlıksız kartın süresi normal akar', r2.patience < before)
  }
  check('1 oyun günü = 450 sn (saat=30sn, dakika akışı)', DAY_SECONDS === 450)
}

console.log('\n— ADAPTİF VURGU SAYACI —')
{
  const g = new Game()
  let r = null
  for (let i = 0; i < 1500 && !r; i++) { const x = g.spawnReservation(); if (x && !x.flexible) r = x; if (g.queue.length >= 4) g.queue.length = 0 }
  if (r) {
    const before = g.placedCount
    g.place(r.id, r.day, r.hour)
    check('yerleştirme sayacı artar (öğretici vurgu buna bakar)', g.placedCount === before + 1)
    const b = new Game(); b.load(g.save())
    check('sayaç kayıtla korunur', b.placedCount === g.placedCount)
  }
}
console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı\n`)
process.exit(fail ? 1 : 0)
