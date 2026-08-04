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

let spawned = null
for (let i = 0; i < 500 && !spawned; i++) spawned = g.spawnReservation()
check('rezervasyon isteği üretiliyor', !!spawned)
if (spawned) {
  const wrong = g.place(spawned.id, (spawned.day + 1) % 7, spawned.hour)
  check('yanlış güne yerleştirme REDDEDİLİR', !wrong.ok)
  const ok = g.place(spawned.id, spawned.day, spawned.hour)
  check('doğru slota yerleşir', ok.ok)
  check('kuyruktan düşer', !g.queue.find(r => r.id === spawned.id))
  check('takvimde görünür', !!g.bookingAt(spawned.day, spawned.hour))
  const dup = g.spawnReservation()
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
check('parası yetmeyen alamaz', !poor.buy('pitch2').ok)
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

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı\n`)
process.exit(fail ? 1 : 0)
