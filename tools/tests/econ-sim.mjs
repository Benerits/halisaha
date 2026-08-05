// Ekonomi simülasyonu: raporun "iyi oyuncu" senaryosu — sink'ler sonrası eğri
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { Game, PARCEL_COLS, PARCEL_ROWS } = await import('../../src/state.ts')
const g = new Game()
const SHOPPING = ['canteen','fridge','tost','baklava','cleats','keeper','lights','shower','schooldeal','tearoom','corporate','billboard','roadsign','staff','docs','phone2']
const log = []
for (let day = 1; day <= 120; day++) {
  // gün içi: ~24 spawn dalgası, bestSlot'a yerleştir (bazen pazarlıklı)
  for (let w = 0; w < 24; w++) {
    g.spawnReservation()
    for (const r of [...g.queue]) {
      if (!r.haggled && Math.random() < 0.5) g.haggle(r.id, 1)
      const slot = g.bestSlot(r)
      if (slot) g.place(r.id, slot.day, slot.hour)
      else g.decline(r.id)
    }
  }
  // alışveriş önceliği: mağaza → arsa+saha → kort; bakım aksatılmaz
  for (const id of SHOPPING) { const it = g.shop().find(x => x.id === id); if (it && !it.owned && !it.locked && g.money > it.cost + 30000) g.buy(id) }
  outer: for (let c = 0; c < PARCEL_COLS; c++) for (let r = 0; r < PARCEL_ROWS; r++) {
    if (g.money < 120000) break outer
    if (!g.ownsParcel(c, r)) { g.buyParcel(c, r); }
    if (g.ownsParcel(c, r) && !g.buildAt(c, r)) {
      const kind = g.pitches < 6 ? (g.pitches % 2 ? 'pitch' : 'mini') : (Math.random() < 0.5 ? 'basket' : 'voley')
      g.placeBuild(c, r, kind)
    }
  }
  for (let c = 0; c < PARCEL_COLS; c++) for (let r = 0; r < PARCEL_ROWS; r++) {
    const b = g.buildAt(c, r)
    if (b && (b.wear ?? 0) > 0.5 && g.money > 20000) g.serviceBuild(c, r)
  }
  g.day = day
  g.endDay()
  if ([7,20,30,50,80,119].includes(day)) log.push({ gun: day, kasa: g.money, kar: g.lastDayProfit, saha: g.pitches, doluluk: Math.round(g.occupancy()*100), itibar: +g.rep.toFixed(2), abone: Math.round(g.subRatio()*100), gider: g.dailyUpkeep() + Math.round(g.rentAmount()/7) })
}
console.log('GÜN | KASA | GÜNLÜK KÂR | SAHA | DOLULUK | İTİBAR | ABONE% | GÜNLÜK GİDER(kira dahil)')
for (const r of log) console.log(`${r.gun} | ₺${r.kasa.toLocaleString('tr-TR')} | ₺${r.kar.toLocaleString('tr-TR')} | ${r.saha} | %${r.doluluk} | ${r.itibar} | %${r.abone} | ₺${r.gider.toLocaleString('tr-TR')}`)
