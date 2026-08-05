/**
 * HALI SAHA — giriş noktası. Sahne + arayüz + döngü.
 * SIFIR SÜRTÜNME: kart seç → takvimde yanıp sönen yere tıkla. Başka kural yok.
 */
import * as THREE from 'three'
import { World, type LocTheme } from './world'
import { audio } from './audio'
import { Game, LOCATIONS, type LocId, MAAS, ISE_ALIM, DAY_NAMES, HOURS, OPEN_HOUR, DAY_SECONDS, SEGMENTS, BUILDS, parcelCost, type BuyId, type BuildKind } from './state'

const SAVE_KEY = 'halisaha-save-v1'
const canvas = document.getElementById('c') as HTMLCanvasElement
let world = new World(canvas, 'mahalle')
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
function confirmFlash(d: number, h: number, span = 1) {
  const pickbar = $('pickbar')
  flashUntil = performance.now() + 1700
  pickCache = '__flash__'
  pickbar.className = 'show confirm'
  pickbar.innerHTML = span === 2 ? `${DAY_FULL[d]} ${h}:00-${h + 2}:00 seçildi ✓` : `${DAY_FULL[d]} ${h}:00 seçildi ✓`
  setTimeout(() => { flashUntil = 0; pickbar.className = ''; renderCal() }, 1700)
}

function renderCal() {
  const head = document.querySelector('#desk .desk-head') as HTMLElement | null
  const nowHour = OPEN_HOUR + Math.floor((game.t / DAY_SECONDS) * HOURS.length)
  const nowDay = (game.day - 1) % 7
  if (viewDay < 0) viewDay = nowDay
  const sel = selected !== null ? game.queue.find(r => r.id === selected) : null
  if (head) {
    if (sel) head.textContent = `${sel.team} için saat seç — yanan kutuya tıkla`
    else {
      const todayMatches = game.bookings.filter(b => b.day === nowDay)
      const next = todayMatches.filter(b => b.hour >= nowHour).sort((a, b) => a.hour - b.hour)[0]
      head.textContent = todayMatches.length === 0
        ? `Bugün ${DAY_FULL[nowDay]} — maç yok, telefonu bekle`
        : `Bugün ${DAY_FULL[nowDay]} · ${todayMatches.length} maç` +
          (next ? ` · sıradaki ${next.hour}:00 ${next.team}` : ' · bugünkü maçlar bitti')
    }
  }
  const desk = document.getElementById('desk')!
  desk.classList.toggle('picking', !!sel)

  // YÖNERGE ŞERİDİ — nereye koyacağını söylemez, sadece kimin için seçtiğini söyler
  const pickbar = $('pickbar')
  if (performance.now() > flashUntil) {
    const anyPartial = sel ? DAY_NAMES.some((_, d) => HOURS.some(h => game.canPlacePartial(sel, d, h))) : false
    const noSlot = sel && !game.bestSlot(sel)
    const ph = !sel ? ''
      : noSlot && anyPartial ? `${sel.hours} saatlik yer yok — KESİKLİ saate tıkla, 1 saat öner (kabul etmeyebilir)`
      : noSlot ? `${sel.team} için UYGUN BOŞ SAAT YOK — kartı geri çevir ya da yeni saha aç`
      : `${sel.team} · ₺${tl(sel.price)}${sel.weeks ? '/hf' : ''} — yanan saate tıkla<span class="arr">⬇</span>`
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
    const hasValid = sel ? HOURS.some(h => game.canPlaceAt(sel, d, h)) : false
    return `<div class="dtab ${d === viewDay ? 'on' : ''} ${d === nowDay ? 'today' : ''}" data-d="${d}">
      ${hasValid ? `<span class="dot ${game.placedCount < 12 ? '' : 'calm'}"></span>` : ''}
      <b>${nm}</b>${d === nowDay ? '<span class="bugun">BUGÜN</span>' : ''}
      <div class="obar"><i style="width:${Math.round(occ * 100)}%"></i></div>
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
    const bs = game.bookingsAt(viewDay, hour)
    const b = bs[0]
    const free = game.freeAt(viewDay, hour)
    const hint = sel && game.canPlaceAt(sel, viewDay, hour)
    const part = sel && !hint && game.canPlacePartial(sel, viewDay, hour)
    const cls = ['dslot']
    if (b) cls.push(free ? 'half' : b.sub ? 'sub' : 'full')
    if (hint) cls.push(game.placedCount < 12 ? 'hint' : 'hint calm')
    if (part) cls.push('part')
    if (viewDay === nowDay && hour === nowHour) cls.push('now')
    if (viewDay === nowDay && hour < nowHour) cls.push('past')
    if (!b && hour >= 20 && hour <= 22) cls.push('prime')
    const label = !b ? '' : bs.length > 1 ? `${b.team.slice(0, 4)} +${bs.length - 1}` : b.team.slice(0, 6)
    const cap = game.pitches > 1 && b ? ` (${bs.length}/${game.pitches} saha)` : ''
    return `<div class="${cls.join(' ')}" data-h="${hour}"
      title="${b ? bs.map(x => x.team + ' ₺' + tl(x.price)).join(' · ') + cap : DAY_NAMES[viewDay] + ' ' + hour + ':00 — boş'}">
      <span class="h">${hour}:00</span><span class="t">${label}</span>
    </div>`
  }).join('')
  if (calHtml !== calCache) {
    calCache = calHtml
    cal.innerHTML = calHtml
    cal.querySelectorAll<HTMLElement>('.dslot').forEach(el => {
      el.addEventListener('click', () => {
        if (selected === null) { toast('Önce soldan bir istek seç.'); return }
        const day = viewDay, hour = Number(el.dataset.h)
        const selR = game.queue.find(x => x.id === selected)
        const span = selR?.hours ?? 1
        // tam yer yoksa ama tek saat açıksa: kısmi karşı-teklif dene
        if (selR && !game.canPlaceAt(selR, day, hour) && game.canPlacePartial(selR, day, hour)) {
          const pr = game.placePartial(selected, day, hour)
          if (pr.ok) { audio.place(); selected = null; save(); confirmFlash(day, hour, 1) }
          else { audio.bad() }
          toast(pr.msg, pr.ok ? 'g' : 'b')
          renderAll()
          return
        }
        const r = game.place(selected, day, hour)
        if (r.ok) audio.place(); else audio.bad()
        if (r.ok) { selected = null; save(); confirmFlash(day, hour, span) }
        else {
          toast(r.msg, 'b')
          el.classList.add('deny')
          setTimeout(() => el.classList.remove('deny'), 500)
        }
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
      <div class="when">${when}${r.flexible ? '<span class="flex">ESNEK</span>' : ''}${r.hours === 2 ? '<span class="flex" style="background:var(--clay)">2 SAAT</span>' : ''}${r.needFull ? '<span class="flex" style="background:var(--green-deep)">TAM SAHA</span>' : ''}</div>
      <div class="meta">${seg.label}</div>
      <div class="price"><span class="plab">teklifi</span> ₺${tl(r.price)}${r.weeks ? ' <span class="pw">/hafta</span>' : ''}</div>
      ${r.haggled ? '<div class="hdone">pazarlık yapıldı</div>' : `<div class="hgl">
        <button data-hg="1" data-id="${r.id}" title="Ölçülü zam — genelde kabul eder">
          <b>₺${tl(Math.round(r.price * 1.25 / 10) * 10)}</b><i>iste · güvenli</i></button>
        <button data-hg="2" data-id="${r.id}" title="Sert pazarlık — kalkıp gidebilir">
          <b>₺${tl(Math.round(r.price * 1.5 / 10) * 10)}</b><i>iste · riskli</i></button>
      </div>`}
      ${tip ? `<div class="hint2 ${lever ? 'up' : 'dn'}">${tip}</div>` : ''}
      <button class="rej" data-rej="${r.id}">geri çevir ✕</button>
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
    list.querySelectorAll<HTMLElement>('button[data-rej]').forEach(b => {
      b.addEventListener('click', ev => {
        ev.stopPropagation()
        const id = Number(b.dataset.rej)
        const res = game.decline(id)
        if (res.ok) { audio.lost(); toast(res.msg) ; if (selected === id) selected = null; save() }
        renderAll()
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
  {
    const done = gs.filter(g => g.done).length
    const gb = $('goalsbadge')
    gb.textContent = `${done}/${gs.length}`
    gb.className = 'rbadge' + (done === gs.length && gs.length > 0 ? ' done' : '')
    $('goals').classList.toggle('open', goalsOpen)
    $('goalsbtn').classList.toggle('open', goalsOpen)
  }
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
let goalsOpen = false, tipsOpen = false
function renderTips() {
  const box = $('tips')
  const sugs = game.suggestions()
  const tb = $('tipsbadge')
  tb.textContent = String(sugs.length)
  tb.className = 'rbadge' + (sugs.some(x => x.urgent) ? ' urgent' : '')
  box.classList.toggle('open', tipsOpen)
  $('tipsbtn').classList.toggle('open', tipsOpen)
  box.innerHTML = sugs.map((s, i) => `
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
  } else if (officeTab === 'personel') {
    const p = game.personel
    const row = (nm: string, st: string, act: string, id: string, ds: string, dis = false) => `
      <div class="srow"><span class="nm">${nm}</span><span class="gn">${st}</span>
        <button class="buy" data-per="${id}" ${dis ? 'disabled' : ''}>${act}</button>
        <span class="ds">${ds}</span></div>`
    body.innerHTML = `
      <div class="srow" style="background:#eefaf0"><span class="ds" style="flex:1">
        Personel ŞUBEYE aittir (şu an: ${game.locDef().label}). Maaşlar her gün kasadan düşer.</span></div>
      ${row('Şube Müdürü', p.mudur === 2 ? 'USTA · ₺' + tl(MAAS.mudur2) + '/g' : p.mudur === 1 ? 'Acemi · ₺' + tl(MAAS.mudur1) + '/g' : 'Yok',
        p.mudur === 0 ? '₺' + tl(ISE_ALIM.mudur1) + ' işe al' : p.mudur === 1 ? '₺' + tl(ISE_ALIM.mudur2) + ' terfi' : 'USTA ✓', 'mudur',
        'Pasif şubede geliri tam toplar (müdürsüz %70 kalır). Usta: yerleştirirken ufak zam koparır.', p.mudur === 2)}
      ${p.mudur > 0 ? row('Müdüre bırak', p.auto ? 'AÇIK' : 'KAPALI', p.auto ? 'Kapat' : 'Aç', 'auto',
        'Açıkken bu şubede gelen istekleri müdür anında en iyi slota yerleştirir — sen izlersin.') : ''}
      ${row('Çırak', p.cirak ? 'Çalışıyor · ₺' + tl(MAAS.cirak) + '/g' : 'Yok',
        p.cirak ? 'Çıkar' : '₺' + tl(ISE_ALIM.cirak) + ' işe al', 'cirak',
        'Sabrı bitmek üzere olan isteği uygun boş saate yazar. Pazarlık yapmaz.')}
      ${row('Kantinci', p.kantinci ? 'Tezgâhta · ₺' + tl(MAAS.kantinci) + '/g' : 'Yok',
        p.kantinci ? 'Çıkar' : '₺' + tl(ISE_ALIM.kantinci) + ' işe al', 'kantinci',
        'Kantin gelirlerini %25 artırır (kantin gerekli).')}`
    body.querySelectorAll<HTMLElement>('button[data-per]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.per!
        if (id === 'auto') { game.personel.auto = !game.personel.auto; audio.click(); renderOffice(); return }
        const role = id as 'mudur' | 'cirak' | 'kantinci'
        const already = role === 'mudur' ? false : role === 'cirak' ? game.personel.cirak : game.personel.kantinci
        const res = already ? game.fire(role) : game.hire(role)
        if (res.ok) audio.build(); else audio.bad()
        toast(res.msg, res.ok ? 'g' : 'b')
        save(); renderOffice(); renderAll()
      }))
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
      <button class="buy" id="pdemol" style="background:var(--clay)">YIK · %40 iade</button>
      <span class="ds">${BUILDS[b.kind].desc} Yıkarsan arsa boşalır, yerine başka şey kurabilirsin.</span></div>`
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
  const pd = document.getElementById('pdemol')
  if (pd) pd.addEventListener('click', () => {
    const res = game.removeBuild(c, r)
    if (res.ok) audio.build(); else audio.bad()
    toast(res.msg, res.ok ? 'g' : 'b')
    if (res.ok) { save(); world.syncParcels(game.ownedParcels, game.builds); openParcel(c, r); renderAll() }
  })
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
addEventListener('wheel', e => { if ((e.target as HTMLElement).closest('#desk,#queue,#office,#tips,#goals,#parcel')) return; world.zoomBy(e.deltaY > 0 ? 1.08 : 0.93) }, { passive: true })
addEventListener('pointerdown', () => { audio.ensure(); audio.setMood(game.activeLoc); audio.startMusic() }, { once: true })
function openOffice() { audio.click(); $('office').classList.add('show'); renderOffice() }
$('yazpill').addEventListener('click', openOffice)
$('goalsbtn').addEventListener('click', () => { goalsOpen = !goalsOpen; if (goalsOpen) tipsOpen = false; audio.click(); renderGoals(); renderTips() })
$('tipsbtn').addEventListener('click', () => { tipsOpen = !tipsOpen; if (tipsOpen) goalsOpen = false; audio.click(); renderGoals(); renderTips() })
$('closeoffice').addEventListener('click', () => $('office').classList.remove('show'))
document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'))
  t.classList.add('on'); officeTab = t.dataset.tab!; renderOffice()
}))

// ---------- HUD ----------
function renderHud() {
  const hour = OPEN_HOUR + Math.floor((game.t / DAY_SECONDS) * HOURS.length)
  $('h-money').textContent = '₺' + tl(game.money)
  $('h-day').textContent = `${DAY_NAMES[(game.day - 1) % 7]} · ${game.day}`
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

// ---- ŞUBE ÇUBUĞU ----
let pendingLocBuy: LocId | null = null
function renderLocs() {
  const bar = $('locbar')
  bar.innerHTML = LOCATIONS.map(l => {
    const owned = game.unlockedLocs.includes(l.id)
    const on = game.activeLoc === l.id
    const inc = game.locIncome[l.id]
    return `<button class="loc ${on ? 'on' : ''} ${owned ? '' : 'locked'}" data-loc="${l.id}"
      title="${l.desc}">${l.label}${owned ? '' : ` · ₺${tl(l.cost)}`}${owned && inc !== undefined
        ? `<span class="linc ${inc < 0 ? 'neg' : ''}">${inc < 0 ? '' : '+'}₺${tl(inc)}</span>` : ''}</button>`
  }).join('')
  bar.querySelectorAll<HTMLElement>('button[data-loc]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.loc as LocId
      if (game.unlockedLocs.includes(id)) {
        if (id === game.activeLoc) return
        const r = game.switchLoc(id)
        if (r.ok) { audio.click(); toast(r.msg, 'g'); applyLocSwitch() }
        return
      }
      // kilitli: iki tıkla onay (yanlışlıkla ₺150k gitmesin)
      if (pendingLocBuy !== id) {
        pendingLocBuy = id
        toast(`${LOCATIONS.find(l => l.id === id)!.label}: ₺${tl(LOCATIONS.find(l => l.id === id)!.cost)} — onaylamak için TEKRAR tıkla.`)
        setTimeout(() => { if (pendingLocBuy === id) pendingLocBuy = null }, 4000)
        return
      }
      pendingLocBuy = null
      const r = game.buyLoc(id)
      if (r.ok) { audio.build(); toast(r.msg, 'g'); game.switchLoc(id); applyLocSwitch() }
      else { audio.bad(); toast(r.msg, 'b') }
    })
  })
}

/** şube değişti: UI önbelleklerini sıfırla + sahneyi şube temasıyla yeniden kur */
function applyLocSwitch() {
  audio.swoosh()
  audio.setMood(game.activeLoc)
  selected = null; viewDay = -1
  qCache = ''; tabsCache = ''; calCache = ''; pickCache = ''
  const old = document.getElementById('c') as HTMLCanvasElement
  world.renderer.dispose()
  const c2 = old.cloneNode(false) as HTMLCanvasElement
  old.replaceWith(c2)
  world = new World(c2, game.activeLoc as LocTheme)
  world.syncParcels(game.ownedParcels, game.builds)
  save()
  renderAll()
}

function renderAll() { renderHud(); renderQueue(); renderCal(); renderGoals(); renderTips(); renderLocs() }

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
  if (nowMatch && !matchWasOn) { world.sendArrivals(4); audio.cheer() }   // maç başladı → yürüyüş + tezahürat
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
