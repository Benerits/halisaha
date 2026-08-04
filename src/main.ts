/**
 * HALI SAHA — giriş noktası. Sahne + arayüz + döngü.
 * SIFIR SÜRTÜNME: kart seç → takvimde yanıp sönen yere tıkla. Başka kural yok.
 */
import * as THREE from 'three'
import { World } from './world'
import { audio } from './audio'
import { Game, DAY_NAMES, HOURS, OPEN_HOUR, DAY_SECONDS, SEGMENTS, BUILDS, parcelCost, type BuyId, type BuildKind } from './state'

const SAVE_KEY = 'halisaha-save-v1'
const canvas = document.getElementById('c') as HTMLCanvasElement
const world = new World(canvas)
const game = new Game()

// kayıt yükle
try {
  const raw = localStorage.getItem(SAVE_KEY)
  if (raw) game.load(JSON.parse(raw))
} catch { /* bozuk kayıt: sıfırdan */ }
if (game.pitches >= 2) world.buildPitch(0, 5.2)

let selected: number | null = null

// ---------- arayüz yardımcıları ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const tl = (n: number) => Math.round(n).toLocaleString('tr-TR')

function toast(msg: string, kind: '' | 'g' | 'b' = '') {
  const d = document.createElement('div')
  d.className = 'toast ' + kind
  d.textContent = msg
  $('toasts').appendChild(d)
  setTimeout(() => d.remove(), 2600)
}

// ---------- takvim (gün sekmeli tek şerit — 105 minik hücre yerine 15 büyük slot) ----------
let viewDay = -1
let tabsCache = '', calCache = '', pickCache = ''
let flashUntil = 0
const DAY_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

/** yerleştirme onayı: "Pazartesi 18:00 seçildi ✓" yanıp söner, sonra kaybolur */
function confirmFlash(d: number, h: number) {
  const pickbar = $('pickbar')
  flashUntil = performance.now() + 1700
  pickCache = '__flash__'
  pickbar.className = 'show confirm'
  pickbar.innerHTML = `${DAY_FULL[d]} ${h}:00 seçildi ✓`
  setTimeout(() => { flashUntil = 0; pickbar.className = ''; renderCal() }, 1700)
}

function renderCal() {
  const head = document.querySelector('#desk .desk-head') as HTMLElement | null
  const nowHour = OPEN_HOUR + Math.floor((game.t / DAY_SECONDS) * HOURS.length)
  const nowDay = (game.day - 1) % 7
  if (viewDay < 0) viewDay = nowDay
  const sel = selected !== null ? game.queue.find(r => r.id === selected) : null
  if (head) head.textContent = sel
    ? `${sel.team} için saat seç — yanan kutuya tıkla`
    : 'Çizelge — soldan istek seç'
  const desk = document.getElementById('desk')!
  desk.classList.toggle('picking', !!sel)

  // YÖNERGE ŞERİDİ — nereye koyacağını söylemez, sadece kimin için seçtiğini söyler
  const pickbar = $('pickbar')
  if (performance.now() > flashUntil) {
    const ph = sel ? `${sel.team} · ₺${tl(sel.price)}${sel.weeks ? '/hf' : ''} — yanan saate tıkla<span class="arr">⬇</span>` : ''
    if (ph !== pickCache) {
      pickCache = ph
      pickbar.className = sel ? 'show' : ''
      pickbar.innerHTML = ph
      if (sel) {
        const dr = desk.getBoundingClientRect()
        pickbar.style.bottom = `${innerHeight - dr.top + 10}px`
      }
    }
  }

  // GÜN SEKMELERİ (önbellekli — değişmediyse DOM'a dokunma, tıklama yutulmasın)
  const tabs = $('daytabs')
  const tabsHtml = DAY_NAMES.map((nm, d) => {
    const occ = game.bookings.filter(b => b.day === d).length / HOURS.length
    const hasValid = sel ? HOURS.some(h => !game.bookingAt(d, h) && game.slotOk(sel, d, h)) : false
    return `<div class="dtab ${d === viewDay ? 'on' : ''} ${d === nowDay ? 'today' : ''}" data-d="${d}">
      ${hasValid ? '<span class="dot"></span>' : ''}
      <b>${nm}</b><div class="obar"><i style="width:${Math.round(occ * 100)}%"></i></div>
    </div>`
  }).join('')
  if (tabsHtml !== tabsCache) {
    tabsCache = tabsHtml
    tabs.innerHTML = tabsHtml
    tabs.querySelectorAll<HTMLElement>('.dtab').forEach(el => {
      el.addEventListener('click', () => { viewDay = Number(el.dataset.d); audio.click(); renderCal() })
    })
  }

  // SEÇİLİ GÜNÜN ŞERİDİ (önbellekli)
  const cal = $('cal')
  const calHtml = HOURS.map(hour => {
    const b = game.bookingAt(viewDay, hour)
    const hint = sel && !b && game.slotOk(sel, viewDay, hour)
    const cls = ['dslot']
    if (b) cls.push(b.sub ? 'sub' : 'full')
    if (hint) cls.push('hint')
    if (viewDay === nowDay && hour === nowHour) cls.push('now')
    if (!b && hour >= 20 && hour <= 22) cls.push('prime')
    return `<div class="${cls.join(' ')}" data-h="${hour}"
      title="${b ? b.team + ' · ₺' + tl(b.price) : DAY_NAMES[viewDay] + ' ' + hour + ':00 — boş'}">
      <span class="h">${hour}:00</span><span class="t">${b ? b.team.slice(0, 6) : ''}</span>
    </div>`
  }).join('')
  if (calHtml !== calCache) {
    calCache = calHtml
    cal.innerHTML = calHtml
    cal.querySelectorAll<HTMLElement>('.dslot').forEach(el => {
      el.addEventListener('click', () => {
        if (selected === null) { toast('Önce soldan bir istek seç.'); return }
        const day = viewDay, hour = Number(el.dataset.h)
        const r = game.place(selected, day, hour)
        if (r.ok) audio.place(); else audio.bad()
        if (r.ok) { selected = null; save(); confirmFlash(day, hour) } else toast(r.msg, 'b')
        renderAll()
      })
    })
  }
}

// ---------- rezervasyon kuyruğu ----------
/** kartı seç + geçerli slotu olan ilk güne atla (yerleştirme akışının tek girişi) */
function selectCard(id: number) {
  selected = id
  audio.click()
  const r = game.queue.find(x => x.id === id)
  if (r) {
    const days = r.flexible ? r.flexDays : [r.day]
    const hours = r.flexible ? r.flexHours : [r.hour]
    outer: for (const d of days) for (const h of hours) {
      if (!game.bookingAt(d, h)) { viewDay = d; break outer }
    }
  }
  renderQueue(); renderCal()
}
const seenCards = new Set<number>()
const warned = new Set<number>()
let qCache = ''
function renderQueue() {
  const list = $('qlist')
  if (game.queue.length === 0) {
    const h = `<div class="empty">Şu an istek yok.<br>Birazdan telefon çalar…</div>`
    if (h !== qCache) { qCache = h; list.innerHTML = h }
    return
  }
  // yapı anahtarı: sabır çubuğu HARİÇ her şey — çubuk ayrıca güncellenir,
  // böylece 0.4sn'lik döngü DOM'u yeniden kurup TIKLAMALARI YUTMAZ
  const html = game.queue.map(r => {
    const seg = SEGMENTS[r.segment]
    const when = r.flexible
      ? `${r.flexDays.length > 5 ? 'Her gün' : r.flexDays[0] >= 5 ? 'Hafta sonu' : 'Hafta içi'} ${r.flexHours[0]}-${r.flexHours[r.flexHours.length - 1] + 1}`
      : `${DAY_NAMES[r.day]} ${r.hour}:00`
    const pat = r.patience / r.maxPatience
    const lever = pat > 0.55 && (r.hour >= 20 || r.segment === 'kurumsal')
    const tip = r.haggled ? 'pazarlık bitti'
      : lever ? 'sıkı müşteri — pazarlık şansı yüksek'
      : pat < 0.4 ? 'acelesi var, üstüne gitme' : ''
    return `<div class="rcard ${selected === r.id ? 'sel' : ''} ${seenCards.has(r.id) ? '' : 'new'}" data-id="${r.id}">
      <div class="team">${r.team}</div>${r.weeks ? `<span class="tagsub">${r.weeks} HAFTA</span>` : ''}
      <div class="when">${when}${r.flexible ? '<span class="flex">ESNEK</span>' : ''}</div>
      <div class="meta">${seg.label}</div>
      <div class="price"><span class="plab">teklifi</span> ₺${tl(r.price)}${r.weeks ? ' <span class="pw">/hafta</span>' : ''}</div>
      ${r.haggled ? '<div class="hdone">pazarlık yapıldı</div>' : `<div class="hgl">
        <button data-hg="1" data-id="${r.id}" title="Ölçülü zam — genelde kabul eder">
          <b>₺${tl(Math.round(r.price * 1.25 / 10) * 10)}</b><i>iste · güvenli</i></button>
        <button data-hg="2" data-id="${r.id}" title="Sert pazarlık — kalkıp gidebilir">
          <b>₺${tl(Math.round(r.price * 1.5 / 10) * 10)}</b><i>iste · riskli</i></button>
      </div>`}
      ${tip ? `<div class="hint2 ${lever ? 'up' : 'dn'}">${tip}</div>` : ''}
      <div class="bar"><i></i></div>
    </div>`
  }).join('')
  if (html !== qCache) {
    qCache = html
    list.innerHTML = html
    for (const r of game.queue) seenCards.add(r.id)
    list.querySelectorAll<HTMLElement>('button[data-hg]').forEach(b => {
      b.addEventListener('click', ev => {
        ev.stopPropagation()
        const id = Number(b.dataset.id)
        const res = game.haggle(id, Number(b.dataset.hg) as 1 | 2)
        if (res.ok) audio.cash(); else audio.bad()
        toast(res.msg, res.ok ? 'g' : 'b')
        renderAll()
        if (res.ok || (!res.walked && game.queue.some(x => x.id === id))) {
          selectCard(id)
        }
      })
    })
    list.querySelectorAll<HTMLElement>('.rcard').forEach(el => {
      el.addEventListener('click', () => {
        selectCard(Number(el.dataset.id))
      })
    })
  }
  // sabır çubukları: DOM kurmadan, her karede güncelle
  list.querySelectorAll<HTMLElement>('.rcard').forEach(el => {
    const r = game.queue.find(x => x.id === Number(el.dataset.id))
    const bar = el.querySelector('.bar i') as HTMLElement | null
    if (r && bar) {
      bar.style.width = r.haggled ? '100%' : `${(r.patience / r.maxPatience) * 100}%`
      el.classList.toggle('deal', r.haggled)
    }
  })
}

// ---------- hedefler (oyunda tutan kısa döngü) ----------
function renderGoals() {
  const gs = game.goals()
  const ms = game.nextMilestone()
  const done = gs.filter(g => g.done).length
  let h = `<div class="gh"><span>Günün Hedefleri</span><span>${done}/${gs.length}</span></div><div class="gb">`
  for (const g of gs) {
    const pct = Math.min(100, Math.round((g.now / g.need) * 100))
    h += `<div class="goal ${g.done ? 'ok' : ''}">
      <div class="gl"><span>${g.done ? '✓ ' : ''}${g.label}</span>
        <span class="gv">${g.done ? '<span class="grew">+₺' + tl(g.reward) + '</span>' : tl(g.now) + '/' + tl(g.need)}</span></div>
      <div class="gbar"><i style="width:${pct}%"></i></div></div>`
  }
  if (ms) {
    const pct = Math.min(100, Math.round((ms.have / ms.need) * 100))
    h += `<div class="mstone"><div class="ml">Sıradaki: ${ms.label}</div>
      <div class="gbar"><i style="width:${pct}%"></i></div>
      <div class="mv">₺${tl(Math.max(0, ms.need - ms.have))} kaldı</div></div>`
  }
  $('goals').innerHTML = h + '</div>'
}

// ---------- öneri kartları (sıfır sürtünme çekirdeği) ----------
function renderTips() {
  const box = $('tips')
  box.innerHTML = game.suggestions().map((s, i) => `
    <div class="tip ${s.urgent ? 'urgent' : ''}">
      <div class="th">${s.urgent ? 'ACİL' : 'ÖNERİ'}</div>
      <div class="tb">
        <div class="tt">${s.title}</div>
        <div class="tw">${s.why}</div>
        ${s.cta ? `<button data-buy="${s.action}" data-i="${i}">${s.cta}</button>` : ''}
      </div>
    </div>`).join('')
  box.querySelectorAll<HTMLElement>('button[data-buy]').forEach(b => {
    b.addEventListener('click', () => doBuy(b.dataset.buy as BuyId))
  })
}

function doBuy(id: BuyId) {
  const r = game.buy(id)
  if (r.ok) audio.build(); else audio.bad()
  toast(r.msg, r.ok ? 'g' : 'b')
  if (r.ok) {
    save(); renderAll(); renderOffice()
  }
}

// ---------- ofis ----------
let officeTab = 'yatirim'
function renderOffice() {
  const body = $('pbody')
  if (officeTab === 'yatirim') {
    body.innerHTML = game.shop().map(it => `
      <div class="srow">
        <span class="nm">${it.label}</span>
        <span class="gn">${it.gain}</span>
        ${it.upkeep ? `<span class="up">-₺${tl(it.upkeep)}/gün</span>` : ''}
        <button class="buy ${it.owned ? 'have' : ''}" data-buy="${it.id}" ${it.owned || it.locked ? 'disabled' : ''}>
          ${it.owned ? 'VAR ✓' : it.locked ? it.locked : '₺' + tl(it.cost)}
        </button>
        <span class="ds">${it.desc}</span>
      </div>`).join('')
    body.querySelectorAll<HTMLElement>('button[data-buy]').forEach(b =>
      b.addEventListener('click', () => doBuy(b.dataset.buy as BuyId)))
  } else if (officeTab === 'ozet') {
    const occ = Math.round(game.occupancy() * 100)
    const sub = Math.round(game.subRatio() * 100)
    body.innerHTML = `
      <div class="srow"><span class="nm">Dünkü kâr</span><span class="gn ${game.lastDayProfit < 0 ? 'bad' : ''}">₺${tl(game.lastDayProfit)}</span>
        <span class="ds">Gelir ₺${tl(game.incomeToday)} · Gider ₺${tl(game.expenseToday)}</span></div>
      <div class="srow"><span class="nm">Doluluk</span><span class="gn">%${occ}</span>
        <span class="ds">Haftada ${game.bookings.length} dolu slot. Gündüz saatleri en büyük fırsat.</span></div>
      <div class="srow"><span class="nm">Abonelik oranı</span><span class="gn">%${sub}</span>
        <span class="ds">%45-55 ideal. Fazlası prime-time esnekliğini bitirir.</span></div>
      <div class="srow"><span class="nm">Evrak geçerliliği</span>
        <span class="gn" style="${game.docs < 0.4 ? 'background:#fbe0e0;color:#b23434' : ''}">%${Math.round(game.docs * 100)}</span>
        <span class="ds">Düşerse denetimde ceza riski var.</span></div>
      <div class="srow"><span class="nm">Günlük sabit gider</span><span class="up">-₺${tl(game.dailyUpkeep())}</span>
        <span class="ds">Elektrik, su, temizlik, personel.</span></div>`
  } else if (officeTab === 'ayarlar') {
    body.innerHTML = `
      <div class="srow"><span class="nm">Ses efektleri</span>
        <button class="buy" id="sfxrow">${audio.on ? 'AÇIK ✓' : 'KAPALI'}</button>
        <span class="ds">Telefon, para, yerleştirme sesleri.</span></div>
      <div class="srow"><span class="nm">Müzik</span>
        <button class="buy" id="musrow">${audio.musicOn ? 'AÇIK ✓' : 'KAPALI'}</button>
        <span class="ds">Sentezlenmiş sakin fon — telifsiz, tamamen oyun içinde üretilir.</span></div>
      <div class="srow"><span class="nm">Kamera</span>
        <button class="buy" id="camreset">Görünümü sıfırla</button>
        <span class="ds">Kaybolduysan: kamerayı tesise, zoom'u başlangıca döndürür.</span></div>`
    $('sfxrow').addEventListener('click', () => {
      const on = audio.toggle()
      ;($('sfxrow') as HTMLElement).textContent = on ? 'AÇIK ✓' : 'KAPALI'
    })
    $('musrow').addEventListener('click', () => {
      const on = audio.toggleMusic()
      ;($('musrow') as HTMLElement).textContent = on ? 'AÇIK ✓' : 'KAPALI'
    })
    $('camreset').addEventListener('click', () => { world.resetCam(); audio.click() })
  } else {
    body.innerHTML = game.events.slice(-14).reverse()
      .map(e => `<div class="srow"><span class="ds" style="flex:1">${e}</span></div>`).join('')
      || '<div class="srow"><span class="ds">Henüz kayıt yok.</span></div>'
  }
}

// ---------- ARSA: sahnede tıkla → satın al / yapı kur ----------
function openParcel(c: number, r: number) {
  const owned = game.ownsParcel(c, r)
  const b = game.buildAt(c, r)
  const box = $('parcel')
  let h = `<div class="phead"><b>ARSA ${c + 1}-${r + 1}</b><button id="pclose">Kapat ✕</button></div><div class="pbody">`
  if (b) {
    h += `<div class="srow"><span class="nm">${BUILDS[b.kind].label}</span>
      <span class="gn">${BUILDS[b.kind].gain}</span>
      <span class="ds">${BUILDS[b.kind].desc}</span></div>`
  } else if (!owned) {
    h += `<div class="srow"><span class="nm">Boş arsa</span>
      <button class="buy" id="pbuy">₺${tl(parcelCost(c, r))} — Satın Al</button>
      <span class="ds">Merkeze yakın arsalar daha pahalı. Aldıktan sonra üstüne saha ya da tesis kurabilirsin.</span></div>`
  } else {
    h += `<div class="srow" style="background:#eefaf0"><span class="ds" style="flex:1">Bu arsa senin — ne kuralım?</span></div>`
    for (const k of Object.keys(BUILDS) as BuildKind[]) {
      const it = BUILDS[k]
      h += `<div class="srow"><span class="nm">${it.label}</span><span class="gn">${it.gain}</span>
        <button class="buy" data-build="${k}">₺${tl(it.cost)}</button>
        <span class="ds">${it.desc}</span></div>`
    }
  }
  box.innerHTML = h + '</div>'
  box.classList.add('show')
  $('pclose').addEventListener('click', () => box.classList.remove('show'))
  const pb = document.getElementById('pbuy')
  if (pb) pb.addEventListener('click', () => {
    const res = game.buyParcel(c, r)
    if (res.ok) audio.build(); else audio.bad()
    toast(res.msg, res.ok ? 'g' : 'b')
    if (res.ok) { save(); world.syncParcels(game.ownedParcels, game.builds); openParcel(c, r) }
  })
  box.querySelectorAll<HTMLElement>('button[data-build]').forEach(btn =>
    btn.addEventListener('click', () => {
      const res = game.placeBuild(c, r, btn.dataset.build as BuildKind)
      if (res.ok) audio.build(); else audio.bad()
      toast(res.msg, res.ok ? 'g' : 'b')
      if (res.ok) { save(); world.syncParcels(game.ownedParcels, game.builds); box.classList.remove('show'); renderAll() }
    }))
}

// SAHNE GEZİNME: sürükle → kaydır, bırak → (hareket yoksa) arsa tıklaması
let dragging = false, dragMoved = 0, lastX = 0, lastY = 0
addEventListener('pointerdown', e => {
  if ((e.target as HTMLElement).closest('#desk,#queue,#office,#rail,#zoombar,#parcel,#hud')) return
  dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY
})
addEventListener('pointermove', e => {
  if (!dragging) return
  const dx = e.clientX - lastX, dy = e.clientY - lastY
  lastX = e.clientX; lastY = e.clientY
  dragMoved += Math.abs(dx) + Math.abs(dy)
  world.pan(dx, dy)
  document.body.style.cursor = 'grabbing'
})
addEventListener('pointerup', e => {
  document.body.style.cursor = ''
  if (!dragging) return
  dragging = false
  if (dragMoved > 6) return                    // sürükleme yaptıysa tıklama sayma
  if ((e.target as HTMLElement).closest('#desk,#queue,#office,#rail,#zoombar,#parcel,#hud')) return
  if (world.pickYazihane(e.clientX, e.clientY)) { openOffice(); return }
  const hit = world.pickParcel(e.clientX, e.clientY)
  if (hit) { audio.click(); openParcel(hit.c, hit.r) }
})

$('zin').addEventListener('click', () => { world.zoomBy(0.82); audio.click() })
$('zout').addEventListener('click', () => { world.zoomBy(1.22); audio.click() })
addEventListener('wheel', e => { if ((e.target as HTMLElement).closest('#desk,#queue,#office,#tips,#goals')) return; world.zoomBy(e.deltaY > 0 ? 1.08 : 0.93) }, { passive: true })
addEventListener('pointerdown', () => { audio.ensure(); audio.startMusic() }, { once: true })
function openOffice() { audio.click(); $('office').classList.add('show'); renderOffice() }
$('yazpill').addEventListener('click', openOffice)
$('closeoffice').addEventListener('click', () => $('office').classList.remove('show'))
document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'))
  t.classList.add('on'); officeTab = t.dataset.tab!; renderOffice()
}))

// ---------- HUD ----------
function renderHud() {
  const hour = OPEN_HOUR + Math.floor((game.t / DAY_SECONDS) * HOURS.length)
  $('h-money').textContent = '₺' + tl(game.money)
  $('h-day').textContent = String(game.day)
  const totalMin = Math.floor((game.t / DAY_SECONDS) * 15 * 60)
  const ch = 9 + Math.floor(totalMin / 60), cm = totalMin % 60
  $('h-clock').textContent = String(Math.min(23, ch)).padStart(2, '0') + ':' + String(cm).padStart(2, '0')
  $('h-rep').textContent = game.rep.toFixed(1)
  $('h-occ').textContent = '%' + Math.round(game.occupancy() * 100)
  const rd = game.daysToRent()
  $('h-rent').textContent = `₺${tl(game.rentAmount())} · ${rd}g`
  ;($('h-rent').parentElement as HTMLElement).classList.toggle('warn', rd <= 2)
  const repChip = $('h-rep').parentElement as HTMLElement
  repChip.classList.toggle('warn', game.rep < 2.5)
}

function renderAll() { renderHud(); renderQueue(); renderCal(); renderGoals(); renderTips() }

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.save())) } catch { /* kota */ }
}

// ---------- döngü ----------
const clock = new THREE.Clock()
let spawnT = 2
let matchWasOn = false
let uiT = 0
let saveT = 0

function frame() {
  requestAnimationFrame(frame)
  if (document.hidden) { clock.getDelta(); return }
  const dt = Math.min(clock.getDelta(), 0.05)

  const prevDay = game.day
  game.tick(dt)
  while (game.notices.length) { toast(game.notices.shift()!, 'g'); audio.place() }
  while (game.lostNotices.length) { toast(game.lostNotices.shift()!, 'b'); audio.lost() }
  // anlaşılan kart kaçmaz (süre donuk) — 45 sn sonra bir kez nazikçe hatırlat
  for (const r of game.queue) {
    if (r.haggled && !warned.has(r.id) && (r.dealWait ?? 0) > 45) {
      warned.add(r.id)
      toast(`${r.team} takvimde yerini bekliyor — hazır olunca koy.`)
      const hd = document.querySelector('#queue .desk-head') as HTMLElement | null
      if (hd) { hd.classList.remove('ringing'); void hd.offsetWidth; hd.classList.add('ringing') }
    }
  }
  if (game.day !== prevDay) {
    audio.day()
    toast(`Gün ${game.day} · dün ₺${tl(game.lastDayProfit)} kâr`, game.lastDayProfit >= 0 ? 'g' : 'b'); save()
  }
  for (const g of game.claimGoals()) { audio.cash(); toast(`HEDEF TAMAM: ${g.label} · +₺${tl(g.reward)}`, 'g') }

  // rezervasyon üretimi
  spawnT -= dt
  if (spawnT <= 0) { spawnT = 8 + Math.random() * 9
    for (let k = 0; k < 6; k++) if (game.spawnReservation()) {
      renderQueue(); audio.ring()
      const hd = document.querySelector('#queue .desk-head') as HTMLElement | null
      if (hd) { hd.classList.remove('ringing'); void hd.offsetWidth; hd.classList.add('ringing') }
      break
    } }

  // gün-gece
  const frac = game.t / DAY_SECONDS
  const night = frac < 0.62 ? 0 : Math.min(1, (frac - 0.62) / 0.14)
  world.setNight(night, game.hasLights)

  // o an maç var mı → botlar oynasın
  const hour = OPEN_HOUR + Math.floor(frac * HOURS.length)
  const nowDay = (game.day - 1) % 7
  const nowMatch = !!game.bookingAt(nowDay, hour)
  if (nowMatch && !matchWasOn) world.sendArrivals(4)   // maç başladı → oyuncular otoparktan yürüsün
  matchWasOn = nowMatch
  world.updateMatch(dt, nowMatch)
  world.updateAmbient(dt)
  world.setBillboards(game.hasBillboard)
  world.setRoadSign(game.hasRoadSign)
  world.syncParcels(game.ownedParcels, game.builds)

  uiT -= dt
  if (uiT <= 0) { uiT = 0.4; renderAll() }
  const pp = world.project(-14.5, 7.2, 5.1)
  const yp = $('yazpill')
  yp.style.left = `${pp.x}px`; yp.style.top = `${pp.y}px`
  saveT -= dt
  if (saveT <= 0) { saveT = 10; save() }

  world.render()
}

(window as any).__g = game; (window as any).__w = world
renderAll()
frame()

// ilk açılışta yönlendirme
if (game.day === 1 && game.bookings.length === 0) {
  setTimeout(() => toast('Sağdan bir rezervasyon isteği seç, takvimde yerine tıkla.'), 900)
}
