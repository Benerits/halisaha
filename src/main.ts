/**
 * HALI SAHA — giriş noktası. Sahne + arayüz + döngü.
 * SIFIR SÜRTÜNME: kart seç → takvimde yanıp sönen yere tıkla. Başka kural yok.
 */
import * as THREE from 'three'
import { World, type LocTheme } from './world'
import { audio } from './audio'
import { t, lang, setLang, dayName, dayFull } from './i18n'
import * as auth from './auth'
import { Game, LOCATIONS, type LocId, MAAS, ISE_ALIM, DAY_NAMES, HOURS, OPEN_HOUR, DAY_SECONDS, NIGHT_START, hourLabel, SEGMENTS, BUILDS, parcelCost, type BuyId, type BuildKind } from './state'

const SAVE_KEY = 'halisaha-save-v1'
const canvas = document.getElementById('c') as HTMLCanvasElement
let world = new World(canvas, 'mahalle')
const game = new Game()

// kayıt yükle
try {
  const raw = localStorage.getItem(SAVE_KEY)
  // TEST KOLAYLIĞI: ?para=1000000 → kasayı doldurur (yerel geliştirme hilesi)
  if (raw) {
    game.load(JSON.parse(raw))
    const rep = game.applyOffline(Date.now())
    if (rep) setTimeout(() => { toast(rep, 'g'); audio.cash() }, 1200)
  }
  // ?para hilesi SADECE yerel geliştirmede (prod'da kapalı — anticheat)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const cheat = new URLSearchParams(location.search).get('para')
    if (cheat) game.money = Math.max(game.money, Number(cheat) || 0)
  }
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
let viewWk = 0 // 0 = bu hafta, 1 = SONRAKİ hafta (2 haftalık takvim)
let laneCat: 'full' | 'mini' | 'basket' | 'voley' = 'full' // takvim kategori sekmesi
let tabsCache = '', calCache = '', pickCache = ''
let flashUntil = 0
const DAY_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

/** yerleştirme onayı: "Pazartesi 18:00 seçildi ✓" yanıp söner, sonra kaybolur */
function confirmFlash(d: number, h: number, span = 1) {
  const pickbar = $('pickbar')
  flashUntil = performance.now() + 1700
  pickCache = '__flash__'
  pickbar.className = 'show confirm'
  pickbar.innerHTML = span === 2 ? `${dayFull(d)} ${h}:00-${h + 2}:00 ${t('seçildi ✓')}` : `${dayFull(d)} ${h}:00 ${t('seçildi ✓')}`
  setTimeout(() => { flashUntil = 0; pickbar.className = ''; renderCal() }, 1700)
}

function renderCal() {
  const head = document.querySelector('#desk .desk-head') as HTMLElement | null
  const nowHour = game.hourNow()
  const nowDay = (game.day - 1) % 7
  if (viewDay < 0) { viewDay = nowDay; viewWk = 0 }
  const sel = selected !== null ? game.queue.find(r => r.id === selected) : null
  if (head) {
    if (sel) head.textContent = `${sel.team} ${t('için saat seç — yanan kutuya tıkla')}`
    else {
      const todayMatches = game.bookings.filter(b => b.day === nowDay)
      const next = todayMatches.filter(b => b.hour >= nowHour).sort((a, b) => a.hour - b.hour)[0]
      head.textContent = todayMatches.length === 0
        ? `${t('Bugün')} ${dayFull(nowDay)} — ${t('maç yok, telefonu bekle')}`
        : `${t('Bugün')} ${dayFull(nowDay)} · ${todayMatches.length} ${t('maç')}` +
          (next ? ` · ${t('sıradaki')} ${hourLabel(next.hour)} ${next.team}` : ' · ' + t('bugünkü maçlar bitti'))
    }
  }
  const desk = document.getElementById('desk')!
  desk.classList.toggle('picking', !!sel)

  // YÖNERGE ŞERİDİ — nereye koyacağını söylemez, sadece kimin için seçtiğini söyler
  const pickbar = $('pickbar')
  if (performance.now() > flashUntil) {
    const anyPartial = sel ? DAY_NAMES.some((_, d) => HOURS.some(h =>
      game.canPlacePartial(sel, d, h, 0) || game.canPlacePartial(sel, d, h, 1))) : false
    const noSlot = sel && !game.bestSlot(sel)
    const ph = !sel ? ''
      : noSlot && anyPartial ? `${sel.hours} saatlik yer yok — KESİKLİ saate tıkla, 1 saat öner (kabul etmeyebilir)`
      : noSlot ? `${sel.team} için UYGUN BOŞ SAAT YOK — kartı geri çevir ya da yeni saha aç`
      : `${sel.team} · ₺${tl(sel.price)}${sel.weeks ? '/hf' : ''} — ${t('yanan saate tıkla')}<span class="arr">⬇</span>`
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

  // GÜN SEKMELERİ — KAYAN 14 GÜN: ilk sekme HEP BUGÜN, geçmiş gün görünmez.
  // (Sabit Pzt..Paz dizilimi 'geçmiş güne rezervasyon' gibi okunuyordu — yanlış histi.)
  const tabs = $('daytabs')
  const tabsHtml = Array.from({ length: 14 }, (_, i) => {
    const d = (nowDay + i) % 7
    const w = i < 7 ? 0 : 1
    const occ = game.bookings.filter(b => b.day === d && (b.sub || (b.wk ?? 0) === w)).length / (HOURS.length * game.pitches)
    const hasValid = sel ? HOURS.some(h => game.canPlaceAt(sel, d, h, w)) : false
    return (i === 7 ? `<div class="wksep" title="${t('sonraki hafta')}">+7g ➜</div>` : '')
      + `<div class="dtab ${d === viewDay && w === viewWk ? 'on' : ''} ${i === 0 ? 'today' : ''}" data-d="${d}" data-w="${w}">
      ${hasValid ? `<span class="dot ${game.placedCount < 12 ? '' : 'calm'}"></span>` : ''}
      <b>${DAY_NAMES[d]}</b>
      <div class="obar"><i style="width:${Math.round(occ * 100)}%"></i></div>
      ${i === 0 ? `<span class="bugun">${t('bugün')}</span>` : ''}
    </div>`
  }).join('')
  if (tabsHtml !== tabsCache) {
    tabsCache = tabsHtml
    tabs.innerHTML = tabsHtml
    tabs.querySelectorAll<HTMLElement>('.dtab').forEach(el => {
      el.addEventListener('click', () => { viewDay = Number(el.dataset.d); viewWk = Number(el.dataset.w); audio.click(); renderCal() })
    })
  }

  // SEÇİLİ GÜNÜN ŞERİDİ (önbellekli) — çok sahada saha satırlı ızgara
  const cal = $('cal')
  const N = game.totalLanes()
  const fullN = game.fullPitchCount()
  const kinds = game.laneKinds()
  const laneLbl = (l: number) => {
    const k = kinds[l]
    const idx = kinds.slice(0, l).filter(x => x === k).length + 1
    return k === 'full' ? `Saha ${idx}` : k === 'mini' ? `Mini ${idx}` : k === 'basket' ? `Basket ${idx}` : `Voley ${idx}`
  }
  const cellHint = (r: typeof sel, hour: number, lane: number): boolean => {
    if (!r) return false
    if (!game.canPlaceAt(r, viewDay, hour, viewWk)) return false
    if (!game.laneAllowed(r, lane)) return false
    if (game.laneTakenBy(viewDay, hour, lane, viewWk)) return false
    if (r.hours === 2 && game.laneTakenBy(viewDay, hour + 1, lane, viewWk)) return false
    return true
  }
  const hintCls = game.placedCount < 12 ? 'hint' : 'hint calm'
  let calHtml = ''
  if (N === 1) {
    $('lanetabs').classList.remove('show')
    calHtml = HOURS.map(hour => {
      const bs = game.bookingsAt(viewDay, hour, viewWk)
      const b = bs[0]
      const free = game.freeAt(viewDay, hour, viewWk)
      const hint = sel && free && game.canPlaceAt(sel, viewDay, hour, viewWk)
      const part = sel && !hint && game.canPlacePartial(sel, viewDay, hour, viewWk)
      const nightLocked = hour >= NIGHT_START && !game.hasLights
      const cls = ['dslot']
      if (b) cls.push(b.sub ? 'sub' : 'full')
      if (hint) cls.push(hintCls)
      if (part) cls.push('part')
      if (viewWk === 0 && viewDay === nowDay && hour === nowHour) cls.push('now')
      if (viewWk === 0 && viewDay === nowDay && hour < nowHour) cls.push('past')
      if (!b && hour >= 20 && hour <= 22) cls.push('prime')
      if (hour >= NIGHT_START) cls.push(nightLocked ? 'night lock' : 'night')
      return `<div class="${cls.join(' ')}" data-h="${hour}" data-l="0"
        title="${nightLocked ? 'Gece maçı için LED Projektör gerekli' : b ? b.team + ' · ₺' + tl(b.price) : DAY_NAMES[viewDay] + ' ' + hourLabel(hour) + ' — boş'}">
        <span class="h">${nightLocked ? '🔒' : hourLabel(hour)}</span><span class="t">${b ? b.team.slice(0, 6) : ''}</span>
      </div>`
    }).join('')
  } else {
    // KATEGORİ SEKMELERİ: Sahalar / Mini / Basket / Voley — 12+ şerit tek listede taşıyordu
    const cats: ('full' | 'mini' | 'basket' | 'voley')[] = []
    for (const k of ['full', 'mini', 'basket', 'voley'] as const) if (kinds.includes(k)) cats.push(k)
    if (!cats.includes(laneCat)) laneCat = cats[0]
    const lt = $('lanetabs')
    lt.classList.toggle('show', cats.length > 1 || N > 6) // tek kategoride bile çok şeritte bağlam ver
    const ltHtml = cats.map(k2 => {
      const cnt = kinds.filter(x => x === k2).length
      const nm = k2 === 'full' ? t('Sahalar') : k2 === 'mini' ? 'Mini' : k2 === 'basket' ? 'Basket' : 'Voley'
      return `<div class="ltab ${laneCat === k2 ? 'on' : ''}" data-cat="${k2}">${nm}<span class="n">${cnt}</span></div>`
    }).join('')
    if (lt.innerHTML !== ltHtml) {
      lt.innerHTML = ltHtml
      lt.querySelectorAll<HTMLElement>('.ltab').forEach(el => el.addEventListener('click', () => {
        laneCat = el.dataset.cat as typeof laneCat; audio.click(); renderCal()
      }))
    }
    const laneIdxs = kinds.map((k2, i) => i).filter(i => kinds[i] === laneCat)
    // sol şerit etiketleri + saat sütunları (satır = seçili kategorinin sahaları)
    calHtml = `<div class="lanecol"><div class="lh"></div>` +
      laneIdxs.map(l =>
        `<div class="ll ${kinds[l] === 'full' ? '' : 'mini'}">${laneLbl(l)}</div>`).join('') + '</div>'
    calHtml += HOURS.map(hour => {
      const isPast = viewWk === 0 && viewDay === nowDay && hour < nowHour
      const nightLocked = hour >= NIGHT_START && !game.hasLights
      let col = `<div class="dcol"><div class="lh ${viewWk === 0 && viewDay === nowDay && hour === nowHour ? 'nowh' : ''}">${hour % 24}</div>`
      for (const l of laneIdxs) {
        const b = game.laneTakenBy(viewDay, hour, l, viewWk)
        const hint = cellHint(sel, hour, l)
        const part = sel && !hint && !b && game.canPlacePartial(sel, viewDay, hour, viewWk) && game.laneAllowed(sel, l)
        const cls = ['dcell']
        if (b) cls.push(b.sub ? 'sub' : 'full')
        if (hint) cls.push(hintCls)
        if (part) cls.push('part')
        if (isPast) cls.push('past')
        if (!b && hour >= 20 && hour <= 22) cls.push('prime')
        if (hour >= NIGHT_START) cls.push(nightLocked ? 'night lock' : 'night')
        col += `<div class="${cls.join(' ')}" data-h="${hour}" data-l="${l}"
          title="${nightLocked ? 'Gece maçı için LED Projektör gerekli' : b ? b.team + ' · ₺' + tl(b.price) : laneLbl(l) + ' · ' + hourLabel(hour) + ' — boş'}">${nightLocked ? '🔒' : b ? b.team.slice(0, 5) : ''}</div>`
      }
      return col + '</div>'
    }).join('')
  }
  if (calHtml !== calCache) {
    calCache = calHtml
    cal.innerHTML = calHtml
    cal.classList.toggle('multi', N > 1)
    // MOBİL: saatler yatay kayar — yanan saat ekran dışındaysa görüş alanına getir
    // (masaüstünde taşma yok, scrollIntoView no-op kalır)
    const firstHint = cal.querySelector<HTMLElement>('.dslot.hint, .dcell.hint')
    const wrap = document.getElementById('calwrap')
    if (firstHint && wrap && wrap.scrollWidth > wrap.clientWidth + 4)
      firstHint.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    cal.querySelectorAll<HTMLElement>('.dslot, .dcell').forEach(el => {
      el.addEventListener('click', () => {
        const hourN = Number(el.dataset.h)
        if (hourN >= NIGHT_START && !game.hasLights) {
          toast(t('Gece maçı için LED Projektör gerekli — Yazıhane → Yatırım.'), 'b'); audio.bad(); return
        }
        if (selected === null) { toast('Önce soldan bir istek seç.'); return }
        const day = viewDay, hour = hourN, lane = Number(el.dataset.l)
        const selR = game.queue.find(x => x.id === selected)
        const span = selR?.hours ?? 1
        if (selR && !game.canPlaceAt(selR, day, hour, viewWk) && game.canPlacePartial(selR, day, hour, viewWk)) {
          const pr = game.placePartial(selected, day, hour, viewWk)
          if (pr.ok) { audio.place(); selected = null; save(); confirmFlash(day, hour, 1) }
          else { audio.bad() }
          toast(pr.msg, pr.ok ? 'g' : 'b')
          renderAll()
          return
        }
        const r = game.place(selected, day, hour, lane, viewWk)
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

// ---------- rezervasyon kuyruğu ----------
/** kartı seç + geçerli slotu olan ilk güne atla (yerleştirme akışının tek girişi) */
function selectCard(id: number) {
  selected = id
  audio.click()
  const r = game.queue.find(x => x.id === id)
  if (r) {
    // en iyi yerleştirilebilir slota atla — bugünün saati geçtiyse SONRAKİ HAFTA sekmesine götürür
    const best = game.bestSlot(r)
    if (best) {
      viewDay = best.day; viewWk = best.wk
      // SEKME SEÇİMİ: mini/kort isteği kendi sekmesine; NORMAL istek 'Sahalar'a
      // (eski hâli 'önce mini doldur' şerit tercihinden Mini sekmesi açıyordu — yanlış his)
      if (r.forCourt) laneCat = r.forCourt
      else if (r.forMini) laneCat = 'mini'
      else {
        const kindsArr = game.laneKinds()
        const fullFree = kindsArr.some((k2, l2) => k2 === 'full'
          && !game.laneTakenBy(best.day, best.hour, l2, best.wk)
          && (!r.needFull || true))
        if (fullFree) laneCat = 'full'
        else {
          const lane = game.resolveLane(r, best.day, best.hour, undefined, best.wk)
          laneCat = lane !== null ? (kindsArr[lane] ?? 'full') : 'full'
        }
      }
    }
  }
  renderQueue(); renderCal()
}
const seenCards = new Set<number>()
const askVals = new Map<number, number>()
const selUnplaceable = (_r: unknown) => false
/** şerit adı (takvim + saha üstü etiket + modal ortak) */
function laneLabel(l: number): string {
  const kinds = game.laneKinds()
  const k = kinds[l]
  const idx = kinds.slice(0, l).filter(x => x === k).length + 1
  return k === 'full' ? `Saha ${idx}` : k === 'mini' ? `Mini ${idx}` : k === 'basket' ? `Basket ${idx}` : `Voley ${idx}`
}
/** parselleri dünyaya bas + saha üstü NUMARA etiketlerini güncelle */
function syncWorldParcels() {
  world.syncParcels(game.ownedParcels, game.builds)
  const labels: { key: string; sub: number; count: number; text: string }[] = []
  for (let l = 1; l < game.totalLanes(); l++) {
    const ref = game.laneBuildRef(l)
    if (ref) labels.push({ key: ref.key, sub: ref.sub, count: ref.count, text: laneLabel(l) })
  }
  world.setFieldLabels(labels)
}
/** deterministik canlı skor: aynı maç aynı dakikada hep aynı skoru verir */
function liveScore(team: string, day: number, hour: number, minute: number): [number, number] {
  let h = 0; for (const ch of team) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  h = (h + day * 97 + hour * 13) >>> 0
  const total = (h % 5) + 2                     // maç başına 2-6 gol
  const done = Math.floor((minute / 60) * total)
  let a = 0, b2 = 0
  for (let i = 0; i < done; i++) { if (((h >> (i * 3)) & 7) % 2 === 0) a++; else b2++ }
  return [a, b2]
} // slider konumu — kart yeniden çizilse de korunur
const warned = new Set<number>()
let qCache = ''
function renderQueue() {
  const list = $('qlist')
  if (game.queue.length === 0) {
    const h = `<div class="empty">${t('Şu an istek yok.')}<br>${t('Birazdan telefon çalar…')}</div>`
    if (h !== qCache) { qCache = h; list.innerHTML = h }
    $('coach').classList.remove('show')
    return
  }
  // yapı anahtarı: sabır çubuğu HARİÇ her şey — çubuk ayrıca güncellenir,
  // böylece 0.4sn'lik döngü DOM'u yeniden kurup TIKLAMALARI YUTMAZ
  const html = game.queue.map(r => {
    const seg = SEGMENTS[r.segment]
    const when = r.flexible
      ? `${r.flexDays.length > 5 ? t('Her gün') : r.flexDays[0] >= 5 ? t('Hafta sonu') : t('Hafta içi')} ${r.flexHours[0]}-${r.flexHours[r.flexHours.length - 1] + 1}`
      : `${dayName(r.day)} ${r.hour}:00`
    const pat = r.patience / r.maxPatience
    const lever = pat > 0.55 && (r.hour >= 20 || r.segment === 'kurumsal')
    const tip = r.haggled ? t('pazarlık bitti')
      : lever ? t('sıkı müşteri — pazarlık şansı yüksek')
      : pat < 0.4 ? t('acelesi var, üstüne gitme') : ''
    return `<div class="rcard ${selected === r.id ? 'sel' : ''} ${seenCards.has(r.id) ? '' : 'new'}" data-id="${r.id}">
      <div class="team">${r.team}</div>${r.weeks ? `<span class="tagsub">${r.weeks} ${t('HAFTA')}</span>` : ''}
      <div class="when">${when}${r.flexible ? `<span class="flex">${t('ESNEK')}</span>` : ''}${r.hours === 2 ? `<span class="flex" style="background:var(--clay)">${t('2 SAAT')}</span>` : ''}${r.needFull ? `<span class="flex" style="background:var(--green-deep)">${t('TAM SAHA')}</span>` : ''}${r.forMini ? `<span class="flex" style="background:#7a9e2f">${t('MİNİ')}</span>` : ''}${r.forCourt === 'basket' ? `<span class="flex" style="background:#c97a3d">BASKET</span>` : ''}${r.forCourt === 'voley' ? `<span class="flex" style="background:#b99b4a">VOLEY</span>` : ''}</div>
      <div class="meta">${seg.label}</div>
      <div class="price"><span class="plab">${t('teklifi')}</span> ₺${tl(r.price)}${r.weeks ? ` <span class="pw">${t('/hafta')}</span>` : ''}</div>
      ${r.haggled ? `<div class="hdone">${t('pazarlık yapıldı')}</div>` : (() => {
        const maxAsk = Math.round(r.price * 1.6 / 10) * 10
        const cur = askVals.get(r.id) ?? Math.round(r.price * 1.2 / 10) * 10
        return `<div class="hsl">
        <input type="range" class="hrange" data-id="${r.id}" min="${r.price}" max="${maxAsk}" step="10" value="${cur}">
        <div class="hrow"><b class="hval">₺${tl(cur)}</b><span class="hrisk"></span>
        <button class="hask" data-id="${r.id}">${t('İSTE')}</button></div></div>`
      })()}
      ${tip ? `<div class="hint2 ${lever ? 'up' : 'dn'}">${tip}</div>` : ''}
      ${game.personel.mudur > 0 && !selUnplaceable(r) ? `<button class="mgr" data-mgr="${r.id}">${t('Müdüre Sal')}</button>` : ''}
      <button class="rej" data-rej="${r.id}">${t('geri çevir ✕')}</button>
      <div class="bar"><i></i></div>
    </div>`
  }).join('')
  if (html !== qCache) {
    qCache = html
    list.innerHTML = html
    for (const r of game.queue) seenCards.add(r.id)
    list.querySelectorAll<HTMLInputElement>('input.hrange').forEach(inp => {
      const wrap = inp.closest('.hsl')!
      const val = wrap.querySelector('.hval') as HTMLElement
      const risk = wrap.querySelector('.hrisk') as HTMLElement
      const paint = () => {
        const id = Number(inp.dataset.id)
        const r = game.queue.find(x => x.id === id); if (!r) return
        const ask = Number(inp.value)
        askVals.set(id, ask)
        val.textContent = `₺${tl(ask)}`
        const q = (ask - r.price) / r.price
        const tier = q <= 0.02 ? 0 : q <= 0.18 ? 1 : q <= 0.35 ? 2 : q <= 0.5 ? 3 : 4
        risk.textContent = t(['el sıkış', 'güvenli', 'dengeli', 'riskli', 'kumar'][tier])
        risk.className = 'hrisk r' + tier
        inp.style.accentColor = ['#8aa08d', '#2f9e57', '#e0a930', '#e07a4a', '#d64545'][tier]
      }
      paint()
      inp.addEventListener('input', paint)
      inp.addEventListener('pointerdown', ev => ev.stopPropagation()) // kart seçimini tetikleme
      inp.addEventListener('click', ev => ev.stopPropagation())
    })
    list.querySelectorAll<HTMLElement>('button.hask').forEach(b => {
      b.addEventListener('click', ev => {
        ev.stopPropagation()
        const id = Number(b.dataset.id)
        const ask = askVals.get(id) ?? 0
        const r0 = game.queue.find(x => x.id === id)
        const res = game.haggleAsk(id, ask || (r0 ? r0.price : 0))
        askVals.delete(id)
        if (res.ok) audio.cash(); else audio.bad()
        toast(res.msg, res.ok ? 'g' : 'b')
        renderAll()
        if (res.ok || (!res.walked && game.queue.some(x => x.id === id))) {
          selectCard(id)
        }
      })
    })
    list.querySelectorAll<HTMLElement>('button[data-mgr]').forEach(b => {
      b.addEventListener('click', ev => {
        ev.stopPropagation()
        const res = game.delegateToManager(Number(b.dataset.mgr))
        if (res.ok) { audio.place() } else { audio.bad(); toast(res.msg, 'b') }
        if (selected === Number(b.dataset.mgr)) selected = null
        save(); renderAll()
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
      const ratio = r.haggled ? 1 : r.patience / r.maxPatience
      bar.style.width = `${ratio * 100}%`
      bar.style.background = ratio > 0.5 ? 'var(--green)' : ratio > 0.25 ? 'var(--sun)' : '#d64545'
      el.classList.toggle('deal', r.haggled)
    }
  })
  // İLK OYUNCU KOÇU: hiç maç yerleştirmemiş oyuncu ilk kartı fark etmiyordu —
  // kart sarı nabız + yanında "karta tıkla" balonu. Kart seçilince mevcut
  // takvim rehberi (yanan saat + pickbar) devralır; ilk yerleştirmeyle kalıcı kapanır.
  const coach = $('coach')
  const firstCard = list.querySelector<HTMLElement>('.rcard[data-id]')
  const coachOn = game.placedCount === 0 && selected === null && !!firstCard
    && !$('gate').classList.contains('show') && !$('namemodal').classList.contains('show')
  list.querySelectorAll<HTMLElement>('.rcard.coach').forEach(el => { if (!coachOn || el !== firstCard) el.classList.remove('coach') })
  if (coachOn && firstCard) {
    firstCard.classList.add('coach')
    const r = firstCard.getBoundingClientRect()
    coach.innerHTML = '👈 ' + t('Takım saha istiyor — karta tıkla, saatini ver!')
    coach.style.left = `${Math.round(r.right + 10)}px`
    coach.style.top = `${Math.round(r.top + 6)}px`
    coach.classList.add('show')
  } else coach.classList.remove('show')
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
  let h = `<div class="gh"><span>${t('Günün Hedefleri')}</span><span>${done}/${gs.length}</span></div><div class="gb">`
  for (const g of gs) {
    const pct = Math.min(100, Math.round((g.now / g.need) * 100))
    h += `<div class="goal ${g.done ? 'ok' : ''}">
      <div class="gl"><span>${g.done ? '✓ ' : ''}${g.label}</span>
        <span class="gv">${g.done ? '<span class="grew">+₺' + tl(g.reward) + '</span>' : tl(g.now) + '/' + tl(g.need)}</span></div>
      <div class="gbar"><i style="width:${pct}%"></i></div></div>`
  }
  if (ms) {
    const pct = Math.min(100, Math.round((ms.have / ms.need) * 100))
    h += `<div class="mstone"><div class="ml">${t('Sıradaki:')} ${ms.label}</div>
      <div class="gbar"><i style="width:${pct}%"></i></div>
      <div class="mv">₺${tl(Math.max(0, ms.need - ms.have))} ${t('kaldı')}</div></div>`
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
      <div class="th">${s.urgent ? t('ACİL') : t('ÖNERİ')}</div>
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
// ---- İNŞAAT: görselli katalog + yerleştirme modu ----
let pendingBuild: BuildKind | null = null
let editMode = false
let moveFrom: { c: number; r: number; kind: BuildKind } | null = null
const THUMB: Record<BuildKind, string> = {
  pitch: `<svg width="62" height="44"><rect width="62" height="44" fill="#3c8d49"/><rect x="4" y="4" width="54" height="36" fill="none" stroke="#fff" stroke-width="2"/><line x1="31" y1="4" x2="31" y2="40" stroke="#fff" stroke-width="2"/><circle cx="31" cy="22" r="7" fill="none" stroke="#fff" stroke-width="2"/></svg>`,
  mini: `<svg width="62" height="44"><rect width="62" height="44" fill="#dff0e2"/><rect x="12" y="8" width="38" height="28" fill="#47a055"/><rect x="14" y="10" width="34" height="24" fill="none" stroke="#fff" stroke-width="1.5"/><line x1="31" y1="10" x2="31" y2="34" stroke="#fff" stroke-width="1.5"/></svg>`,
  basket: `<svg width="62" height="44"><rect width="62" height="44" fill="#c97a3d"/><rect x="4" y="4" width="54" height="36" fill="none" stroke="#f4efe2" stroke-width="2"/><circle cx="31" cy="22" r="8" fill="none" stroke="#f4efe2" stroke-width="2"/><rect x="2" y="16" width="4" height="12" fill="#f4efe2"/><rect x="56" y="16" width="4" height="12" fill="#f4efe2"/></svg>`,
  voley: `<svg width="62" height="44"><rect width="62" height="44" fill="#dcc492"/><rect x="4" y="4" width="54" height="36" fill="none" stroke="#fff" stroke-width="2"/><line x1="31" y1="2" x2="31" y2="42" stroke="#8d97a1" stroke-width="3"/><line x1="26" y1="8" x2="36" y2="8" stroke="#8d97a1" stroke-width="2"/></svg>`,
  parking: `<svg width="62" height="44"><rect width="62" height="44" fill="#585f66"/><line x1="14" y1="6" x2="14" y2="20" stroke="#e9e4d6" stroke-width="2"/><line x1="28" y1="6" x2="28" y2="20" stroke="#e9e4d6" stroke-width="2"/><line x1="42" y1="6" x2="42" y2="20" stroke="#e9e4d6" stroke-width="2"/><line x1="14" y1="26" x2="14" y2="40" stroke="#e9e4d6" stroke-width="2"/><line x1="28" y1="26" x2="28" y2="40" stroke="#e9e4d6" stroke-width="2"/><rect x="16" y="8" width="10" height="9" rx="2" fill="#d64545"/></svg>`,
  garden: `<svg width="62" height="44"><rect width="62" height="44" fill="#699a4d"/><circle cx="18" cy="18" r="8" fill="#3c7a3c"/><rect x="16.5" y="24" width="3" height="8" fill="#7a542f"/><circle cx="42" cy="26" r="6" fill="#3c7a3c"/><rect x="40.8" y="30" width="2.4" height="6" fill="#7a542f"/></svg>`,
  kantin: `<svg width="62" height="44"><rect width="62" height="44" fill="#e9f2e2"/><rect x="10" y="14" width="42" height="24" fill="#f2ece0" stroke="#c9c3b4"/><rect x="8" y="10" width="46" height="7" fill="#27a05a"/><rect x="26" y="24" width="9" height="14" fill="#33404a"/><circle cx="46" cy="30" r="4" fill="#f2b53c"/></svg>`,
  dus: `<svg width="62" height="44"><rect width="62" height="44" fill="#e9f2e2"/><rect x="12" y="12" width="38" height="26" fill="#f2ece0" stroke="#c9c3b4"/><rect x="10" y="8" width="42" height="7" fill="#3f8fe4"/><circle cx="24" cy="26" r="2" fill="#3f8fe4"/><circle cx="31" cy="30" r="2" fill="#3f8fe4"/><circle cx="38" cy="25" r="2" fill="#3f8fe4"/></svg>`,
  wc: `<svg width="62" height="44"><rect width="62" height="44" fill="#e9f2e2"/><rect x="16" y="14" width="30" height="24" fill="#f2ece0" stroke="#c9c3b4"/><rect x="14" y="10" width="34" height="6" fill="#8d97a1"/><rect x="27" y="24" width="8" height="14" fill="#33404a"/></svg>`,
}
const buildDone = (k: BuildKind): boolean =>
  k === 'kantin' ? game.hasCanteen : k === 'dus' ? game.hasShower : k === 'wc' ? game.hasWC : false

function startPlacing(k: BuildKind) {
  pendingBuild = k
  $('office').classList.remove('show')
  world.startGhost(k)
  toast(`${BUILDS[k].label} elinde — arsaya taşı, tıkla kur. Sağ tık / ESC: vazgeç.`)
  audio.click()
}
function cancelPlacing(msg = true) {
  if (!pendingBuild) return
  pendingBuild = null
  world.clearGhost()
  if (msg) toast('İnşaat iptal edildi.')
}
addEventListener('keydown', e => { if (e.key === 'Escape') { cancelPlacing(); cancelMove() } })
function cancelMove() {
  if (!moveFrom) return
  moveFrom = null
  world.clearGhost()
  toast('Taşıma iptal edildi.')
}
addEventListener('contextmenu', e => { if (pendingBuild) { e.preventDefault(); cancelPlacing() } })
addEventListener('pointermove', e => {
  if (!pendingBuild && !moveFrom) return
  const hit = world.moveGhost(e.clientX, e.clientY)
  if (hit) world.setGhostOk(game.ownsParcel(hit.c, hit.r) && (!moveFrom || !game.buildAt(hit.c, hit.r) || (hit.c === moveFrom.c && hit.r === moveFrom.r)))
})

function renderOffice() {
  const body = $('pbody')
  if (officeTab === 'yatirim') {
    body.innerHTML = game.shop().map(it => `
      <div class="srow">
        <span class="nm">${it.label}</span>
        <span class="gn">${it.gain}</span>
        ${it.upkeep ? `<span class="up">-₺${tl(it.upkeep)}/gün</span>` : ''}
        <button class="buy ${it.owned ? 'have' : ''}" data-buy="${it.id}" ${it.owned || it.locked ? 'disabled' : ''}>
          ${it.owned ? t('VAR ✓') : it.locked ? t(it.locked) : '₺' + tl(it.cost)}
        </button>
        <span class="ds">${it.desc}</span>
      </div>`).join('')
    body.querySelectorAll<HTMLElement>('button[data-buy]').forEach(b =>
      b.addEventListener('click', () => doBuy(b.dataset.buy as BuyId)))
  } else if (officeTab === 'ozet') {
    const seasonRow = `<div class="srow" style="background:#fff8e8"><span class="nm">⭐ ${'Şampiyonluk'}</span>
      <span class="gn">${game.stars > 0 ? game.stars + ' yıldız · fiyatlar +%' + (game.stars * 5) : t('henüz yıldız yok')}</span>
      <button class="buy" id="season" ${game.canCloseSeason() ? '' : 'disabled'}>${t('Sezonu Şampiyon Bitir')}</button>
      <span class="ds">${t('Şart: 30. gün + ₺1M kasa. Her şey sıfırlanır, yıldız KALIR — tüm fiyatlar kalıcı +%5.')}</span></div>`

    const occ = Math.round(game.occupancy() * 100)
    const sub = Math.round(game.subRatio() * 100)
    body.innerHTML = seasonRow + `
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
    const se = document.getElementById('season')
    if (se) se.addEventListener('click', () => {
      if (!confirm(t('SEZONU KAPATIYORSUN: tüm para/yapılar sıfırlanır, yıldızın kalır. Emin misin?'))) return
      const r = game.closeSeason()
      if (r.ok) {
        audio.cheer(); toast(r.msg, 'g')
        save(); $('office').classList.remove('show')
        world.setSignName(game.facilityName)
        applyLocSwitch()
      } else { audio.bad(); toast(r.msg, 'b') }
    })
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
        p.mudur === 0 ? '₺' + tl(ISE_ALIM.mudur1) : p.mudur === 1 ? '₺' + tl(ISE_ALIM.mudur2) : 'USTA ✓', 'mudur',
        'Pasif şubede geliri tam toplar (müdürsüz %70 kalır). Usta: yerleştirirken ufak zam koparır.', p.mudur === 2)}
      ${p.mudur > 0 ? row('Müdüre bırak', p.auto ? 'AÇIK' : 'KAPALI', p.auto ? 'Kapat' : 'Aç', 'auto',
        'Açıkken bu şubede gelen istekleri müdür anında en iyi slota yerleştirir — sen izlersin.') : ''}
      ${row('Çırak', p.cirak ? 'Çalışıyor · ₺' + tl(MAAS.cirak) + '/g' : 'Yok',
        p.cirak ? 'Çıkar' : '₺' + tl(ISE_ALIM.cirak), 'cirak',
        'Sabrı bitmek üzere olan isteği uygun boş saate yazar. Pazarlık yapmaz.')}
      ${row('Sekreter', p.sekreter ? 'Telefonda · ₺' + tl(MAAS.sekreter) + '/g' : 'Yok',
        p.sekreter ? 'Çıkar' : '₺' + tl(ISE_ALIM.sekreter), 'sekreter',
        'Kartların sabrı %25 yavaş erir; SEN YOKKEN aramaları not eder (dönüşte hazır istekler).')}
      ${row('Kantinci', p.kantinci ? 'Tezgâhta · ₺' + tl(MAAS.kantinci) + '/g' : 'Yok',
        p.kantinci ? 'Çıkar' : '₺' + tl(ISE_ALIM.kantinci), 'kantinci',
        'Kantin gelirlerini %25 artırır (kantin gerekli).')}`
    body.querySelectorAll<HTMLElement>('button[data-per]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.per!
        if (id === 'auto') { game.personel.auto = !game.personel.auto; audio.click(); renderOffice(); return }
        const role = id as 'mudur' | 'cirak' | 'kantinci' | 'sekreter'
        const already = role === 'mudur' ? false : role === 'cirak' ? game.personel.cirak : role === 'sekreter' ? game.personel.sekreter : game.personel.kantinci
        const res = already ? game.fire(role) : game.hire(role)
        if (res.ok) audio.build(); else audio.bad()
        toast(res.msg, res.ok ? 'g' : 'b')
        save(); renderOffice(); renderAll()
      }))
  } else if (officeTab === 'insaat') {
    body.innerHTML = `<div class="srow" style="background:#eefaf0"><span class="ds" style="flex:1">
      Seç → sahnede kendi boş arsana tıkla, kurulsun. Arsan yoksa önce dümdüz çimen
      parsele tıklayıp satın al.</span></div>
      <div class="bgrid">${(Object.keys(BUILDS) as BuildKind[]).map(k => {
        const b = BUILDS[k]
        const done = buildDone(k)
        return `<div class="bcard ${done ? 'done' : ''}"><img src="${world.renderThumb(k)}" width="74" height="55" style="border-radius:8px; flex-shrink:0" alt="">
          <div class="bi"><div class="bn">${b.label}</div>
            <div class="bg2">${b.gain}</div>
            <div class="bd">${b.desc}</div></div>
          <button data-place="${k}" ${done ? 'disabled' : ''}>${done ? t('VAR ✓') : '₺' + tl(b.cost)}</button>
        </div>`
      }).join('')}</div>`
    body.querySelectorAll<HTMLElement>('button[data-place]').forEach(b =>
      b.addEventListener('click', () => startPlacing(b.dataset.place as BuildKind)))
  } else if (officeTab === 'subeler') {
    body.innerHTML = `
      <div class="srow" style="background:#eefaf0"><span class="ds" style="flex:1">
        Kasa/gün ortak; takvim, arsalar, sahalar ve personel ŞUBEYE aittir. Yeni şube
        kurulu 1 saha + arsalarla gelir. Sol üstten şubeler arasında geçiş yaparsın.</span></div>
      ${LOCATIONS.map(l => {
        const owned = game.unlockedLocs.includes(l.id)
        const on = game.activeLoc === l.id
        const inc = game.locIncome[l.id]
        return `<div class="srow"><span class="nm">${l.label}</span>
          <span class="gn">${owned ? (on ? 'ŞU AN BURADASIN' : (inc !== undefined ? `dün ${inc < 0 ? '' : '+'}₺${tl(inc)}` : 'senin')) : `talep x${l.demandMult} · fiyat x${l.priceMult}`}</span>
          ${owned
            ? (on ? '' : `<button class="buy" data-locgo="${l.id}">Şubeye Geç</button>`)
            : `<button class="buy" data-locbuy="${l.id}">₺${tl(l.cost)}</button>`}
          <span class="ds">${l.desc}</span></div>`
      }).join('')}`
    body.querySelectorAll<HTMLElement>('button[data-locgo]').forEach(b =>
      b.addEventListener('click', () => {
        const r = game.switchLoc(b.dataset.locgo as LocId)
        if (r.ok) { audio.click(); toast(r.msg, 'g'); $('office').classList.remove('show'); applyLocSwitch() }
      }))
    body.querySelectorAll<HTMLElement>('button[data-locbuy]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.locbuy as LocId
        const r = game.buyLoc(id)
        if (r.ok) { audio.build(); toast(r.msg, 'g'); game.switchLoc(id); $('office').classList.remove('show'); applyLocSwitch() }
        else { audio.bad(); toast(r.msg, 'b') }
      }))
  } else if (officeTab === 'ayarlar') {
    const em = auth.currentEmail()
    body.innerHTML = `
      <div class="srow"><span class="nm">Hesap</span>
        <span class="gn">${em ? em : 'Misafir'}</span>
        ${em ? '<button class="buy" id="alogout" style="background:var(--paper-2);color:var(--ink)">Çıkış Yap</button>'
             : '<button class="buy" id="alogin">Giriş / Kayıt</button>'}
        <span class="ds">${em ? 'İlerlemen hesabında güvende — her cihazdan devam edebilirsin.'
             : 'Misafir ilerlemen bu cihazda. Hesap açarsan buluta taşınır.'}</span></div>
      ${em ? `<div class="srow"><span class="nm">Hesabı Sil</span>
        <button class="buy" id="adelete" style="background:var(--clay)">Kalıcı Sil</button>
        <span class="ds">Hesap + kayıt kalıcı silinir (geri alınamaz). App Store gereği.</span></div>` : ''}` + `
      <div class="srow"><span class="nm">Ses efektleri</span>
        <button class="buy" id="sfxrow">${audio.on ? 'AÇIK ✓' : 'KAPALI'}</button>
        <span class="ds">Telefon, para, yerleştirme sesleri.
          <input type="range" id="sfxvol" min="0" max="100" value="${Math.round(audio.sfxVol * 100)}" style="width:100%; margin-top:6px; accent-color:var(--green)"></span></div>
      <div class="srow"><span class="nm">Müzik seviyesi</span>
        <button class="buy" id="musrow2">${audio.musicOn ? 'AÇIK ✓' : 'KAPALI'}</button>
        <span class="ds">Arka plan melodisi.
          <input type="range" id="musvol" min="0" max="100" value="${Math.round(audio.musicVol * 100)}" style="width:100%; margin-top:6px; accent-color:var(--green)"></span></div>
      <div class="srow"><span class="nm">${t('Tesis Adı')}</span>
        <span class="gn">${game.facilityName || '—'}</span>
        <button class="buy" id="renamebtn">${t('Değiştir')}</button>
        <span class="ds">${t('Tabeladaki isim — sıralamada da bu görünür.')}</span></div>
      <div class="srow"><span class="nm">Dil / Language</span>
        <span style="display:flex; gap:6px">
          <button class="buy" id="langtr" style="background:${lang === 'tr' ? 'var(--green)' : 'var(--paper-2)'}; color:${lang === 'tr' ? '#fff' : 'var(--ink)'}">Türkçe</button>
          <button class="buy" id="langen" style="background:${lang === 'en' ? 'var(--green)' : 'var(--paper-2)'}; color:${lang === 'en' ? '#fff' : 'var(--ink)'}">English</button>
        </span>
        <span class="ds">UI language. Game flavor texts stay Turkish (it's a mahalle game).</span></div>
      <div class="srow"><span class="nm">Kamera</span>
        <button class="buy" id="camreset">Görünümü sıfırla</button>
        <span class="ds">Kaybolduysan: kamerayı tesise, zoom'u başlangıca döndürür.</span></div>`
    $('sfxrow').addEventListener('click', () => {
      const on = audio.toggle()
      ;($('sfxrow') as HTMLElement).textContent = on ? 'AÇIK ✓' : 'KAPALI'
    })
    $('musrow2').addEventListener('click', () => {
      const on = audio.toggleMusic()
      ;($('musrow2') as HTMLElement).textContent = on ? 'AÇIK ✓' : 'KAPALI'
    })
    ;($('sfxvol') as HTMLInputElement).addEventListener('input', e =>
      audio.setSfxVol(Number((e.target as HTMLInputElement).value) / 100))
    ;($('musvol') as HTMLInputElement).addEventListener('input', e =>
      audio.setMusicVol(Number((e.target as HTMLInputElement).value) / 100))
    $('renamebtn').addEventListener('click', () => {
      $('office').classList.remove('show')
      ;($('nameinput') as HTMLInputElement).value = game.facilityName
      $('namemodal').classList.add('show')
      setTimeout(() => ($('nameinput') as HTMLInputElement).focus(), 100)
    })
    $('langtr').addEventListener('click', () => { setLang('tr'); renderOffice(); renderAll(); toast('Dil: Türkçe', 'g') })
    $('langen').addEventListener('click', () => { setLang('en'); renderOffice(); renderAll(); toast('Language: English', 'g') })
    $('camreset').addEventListener('click', () => { world.resetCam(); audio.click() })
    const lo = document.getElementById('alogout')
    if (lo) lo.addEventListener('click', () => { auth.logout(); location.reload() })
    const li = document.getElementById('alogin')
    if (li) li.addEventListener('click', () => { $('office').classList.remove('show'); $('gate').classList.add('show') })
    const del = document.getElementById('adelete')
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Hesabın ve TÜM ilerlemen kalıcı olarak silinecek. Emin misin?')) return
      if (!confirm('Son kez: bu işlem GERİ ALINAMAZ. Silinsin mi?')) return
      try { await auth.deleteAccount(); localStorage.clear(); location.reload() }
      catch (e) { toast((e as Error).message, 'b') }
    })
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
    const isCourt = b.kind === 'basket' || b.kind === 'voley'
    const wearPct = Math.round((b.wear ?? 0) * 100)
    h += `<div class="srow"><span class="nm">${BUILDS[b.kind].label}</span>
      <span class="gn">${BUILDS[b.kind].gain}${isCourt ? ` · ${t('yıpranma')} %${wearPct}` : ''}</span>
      ${isCourt ? `<button class="buy" id="pservice" ${wearPct < 10 ? 'disabled' : ''}>₺4.000</button>` : ''}
      ${b.kind === 'mini' && (b.count ?? 1) < 3 ? `<button class="buy" id="pminiadd">${t('+ Mini Ekle')} (${b.count ?? 1}/3) ₺${tl(game.buildCostFor('mini'))}</button>` : ''}
      <button class="buy" id="pdemol" style="background:var(--clay);border-bottom-color:#b45c33">YIK · %40 iade</button>
      ${(() => {
        if (!['pitch', 'mini', 'basket', 'voley'].includes(b.kind)) return ''
        const key = `${c},${r}`
        const nowD = (game.day - 1) % 7
        const nowH = game.hourNow()
        const minute = Math.min(59, Math.floor(((game.t / DAY_SECONDS) * HOURS.length % 1) * 60))
        let rows = ''
        for (let l = 0; l < game.totalLanes(); l++) {
          const ref = game.laneBuildRef(l)
          if (!ref || ref.key !== key) continue
          const cur = game.laneTakenBy(nowD, nowH, l, 0)
          if (cur) {
            const [sa, sb] = liveScore(cur.team, nowD, cur.hour, minute)
            rows += `<div class="srow" style="background:#eefaf0"><span class="nm">${laneLabel(l)} · ${t('CANLI')}</span>
              <span class="gn">${cur.team} ${sa}-${sb}</span>
              <span class="ds">${minute}' · ${t('kalan')} ${60 - minute} dk · ₺${tl(cur.price)}${cur.sub ? ' · ' + t('abonelik') : ''}</span></div>`
          } else {
            const next = game.bookings.filter(x => x.day === nowD && (x.sub || (x.wk ?? 0) === 0) && x.hour > nowH && game.laneOf(x, nowD, x.hour) === l)
              .sort((a2, b2) => a2.hour - b2.hour)[0]
            rows += `<div class="srow"><span class="nm">${laneLabel(l)}</span>
              <span class="ds">${next ? `${t('sıradaki')} ${hourLabel(next.hour)} · ${next.team} · ₺${tl(next.price)}` : t('Şu an boş — takvimden saat sat.')}</span></div>`
          }
        }
        return rows
      })()}
      <span class="ds">${BUILDS[b.kind].desc} Yıkarsan arsa boşalır, yerine başka şey kurabilirsin.</span></div>`
  } else if (!owned) {
    const adj = game.parcelAdjacent(c, r)
    h += `<div class="srow"><span class="nm">${t('Boş arsa')}</span>
      ${adj ? `<button class="buy" id="pbuy">₺${tl(game.parcelPrice(c, r))}</button>`
            : `<button class="buy" disabled>${t('BİTİŞİK DEĞİL')}</button>`}
      <span class="ds">${adj ? 'Merkeze yakın arsalar daha pahalı. Aldıktan sonra üstüne saha ya da tesis kurabilirsin.'
            : t('Bu arsa arazine bitişik değil — önce aradaki arsayı al.')}</span></div>`
  } else {
    h += `<div class="srow" style="background:#eefaf0"><span class="ds" style="flex:1">Bu arsa senin — ne kuralım?</span></div>`
    for (const k of Object.keys(BUILDS) as BuildKind[]) {
      const it = BUILDS[k]
      h += `<div class="srow"><span class="nm">${it.label}</span><span class="gn">${it.gain}</span>
        <button class="buy" data-build="${k}">₺${tl(game.buildCostFor(k))}</button>
        <span class="ds">${it.desc}</span></div>`
    }
  }
  box.innerHTML = h + '</div>'
  box.classList.add('show')
  $('pclose').addEventListener('click', () => box.classList.remove('show'))
  const ps = document.getElementById('pservice')
  if (ps) ps.addEventListener('click', () => {
    const res = game.serviceBuild(c, r)
    if (res.ok) audio.build(); else audio.bad()
    toast(res.msg, res.ok ? 'g' : 'b')
    if (res.ok) { save(); openParcel(c, r); renderAll() }
  })
  const pma = document.getElementById('pminiadd')
  if (pma) pma.addEventListener('click', () => {
    const res = game.placeBuild(c, r, 'mini')
    if (res.ok) audio.build(); else audio.bad()
    toast(res.msg, res.ok ? 'g' : 'b')
    if (res.ok) { save(); syncWorldParcels(); openParcel(c, r); renderAll() }
  })
  const pd = document.getElementById('pdemol')
  if (pd) pd.addEventListener('click', () => {
    const res = game.removeBuild(c, r)
    if (res.ok) audio.build(); else audio.bad()
    toast(res.msg, res.ok ? 'g' : 'b')
    if (res.ok) { save(); syncWorldParcels(); openParcel(c, r); renderAll() }
  })
  const pb = document.getElementById('pbuy')
  if (pb) pb.addEventListener('click', () => {
    const res = game.buyParcel(c, r)
    if (res.ok) audio.build(); else audio.bad()
    toast(res.msg, res.ok ? 'g' : 'b')
    if (res.ok) { save(); syncWorldParcels(); openParcel(c, r) }
  })
  box.querySelectorAll<HTMLElement>('button[data-build]').forEach(btn =>
    btn.addEventListener('click', () => {
      const res = game.placeBuild(c, r, btn.dataset.build as BuildKind)
      if (res.ok) audio.build(); else audio.bad()
      toast(res.msg, res.ok ? 'g' : 'b')
      if (res.ok) { save(); syncWorldParcels(); box.classList.remove('show'); renderAll() }
    }))
}

// SAHNE GEZİNME: sürükle → kaydır, bırak → (hareket yoksa) arsa tıklaması
let dragging = false, dragMoved = 0, lastX = 0, lastY = 0
// PINCH-ZOOM (mobil): iki parmak — mesafe oranı zoom, orta nokta kayması pan.
// touch-action:none canvas'ta; tarayıcı jesti karışmaz.
const touchPts = new Map<number, { x: number; y: number }>()
let pinchD = 0, pinchMX = 0, pinchMY = 0
addEventListener('pointerdown', e => {
  if (pendingBuild) return
  if ((e.target as HTMLElement).closest('#desk,#queue,#office,#rail,#zoombar,#parcel,#hud,#fbbtn,#fbmodal,#namemodal')) return
  touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (touchPts.size === 2) {
    dragging = false // tek parmak pan'ı bırak, pinch devrede
    const [a, b] = [...touchPts.values()]
    pinchD = Math.hypot(a.x - b.x, a.y - b.y)
    pinchMX = (a.x + b.x) / 2; pinchMY = (a.y + b.y) / 2
    return
  }
  dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY
})
addEventListener('pointermove', e => {
  if (touchPts.has(e.pointerId)) touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (touchPts.size === 2) {
    const [a, b] = [...touchPts.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    if (pinchD > 8 && d > 8) world.zoomBy(Math.min(1.15, Math.max(0.87, pinchD / d)))
    world.pan(mx - pinchMX, my - pinchMY)
    pinchD = d; pinchMX = mx; pinchMY = my
    return
  }
  if (!dragging) return
  const dx = e.clientX - lastX, dy = e.clientY - lastY
  lastX = e.clientX; lastY = e.clientY
  dragMoved += Math.abs(dx) + Math.abs(dy)
  world.pan(dx, dy)
  document.body.style.cursor = 'grabbing'
})
addEventListener('pointercancel', e => { touchPts.delete(e.pointerId); if (touchPts.size < 2) pinchD = 0 })
addEventListener('pointerup', e => {
  touchPts.delete(e.pointerId); if (touchPts.size < 2) pinchD = 0
  document.body.style.cursor = ''
  // ELİNDE YAPI VARKEN: sürükleme kontrolünden ÖNCE yerleştir (pan bu modda kapalı)
  if (pendingBuild) {
    if ((e.target as HTMLElement).closest('#desk,#queue,#office,#rail,#zoombar,#parcel,#hud,#locbar,#fbbtn,#fbmodal,#namemodal')) return
    const hit = world.pickParcel(e.clientX, e.clientY)
    if (!hit) return
    const k = pendingBuild
    if (!game.ownsParcel(hit.c, hit.r)) { toast('Bu arsa senin değil — önce satın al.', 'b'); audio.bad(); openParcel(hit.c, hit.r); return }
    const res = game.placeBuild(hit.c, hit.r, k)
    if (res.ok) {
      pendingBuild = null
      world.clearGhost()
      audio.build(); toast(res.msg, 'g')
      save(); syncWorldParcels(); renderAll()
    } else { audio.bad(); toast(res.msg, 'b') }
    return
  }
  // DÜZENLEME MODU: yapı seç → boş arsaya taşı
  if (editMode && !pendingBuild) {
    if ((e.target as HTMLElement).closest('#desk,#queue,#office,#rail,#zoombar,#parcel,#hud,#locbar,#fbbtn,#fbmodal,#namemodal')) { /* UI */ }
    else {
      const hit = world.pickParcel(e.clientX, e.clientY)
      if (hit) {
        if (!moveFrom) {
          const b = game.buildAt(hit.c, hit.r)
          if (b) {
            moveFrom = { c: hit.c, r: hit.r, kind: b.kind }
            world.startGhost(b.kind)
            audio.click()
            toast(`${BUILDS[b.kind].label} elinde — boş arsana tıkla (ESC: vazgeç).`)
          } else toast('Taşımak için önce bir YAPIYA tıkla.')
          return
        }
        const res = game.moveBuild(moveFrom.c, moveFrom.r, hit.c, hit.r)
        if (res.ok) {
          moveFrom = null
          world.clearGhost()
          audio.build(); toast(res.msg, 'g')
          save(); syncWorldParcels(); renderAll()
        } else { audio.bad(); toast(res.msg, 'b') }
        return
      }
    }
  }
  if (!dragging) return
  dragging = false
  if (dragMoved > 6) return                    // sürükleme yaptıysa tıklama sayma
  if ((e.target as HTMLElement).closest('#desk,#queue,#office,#rail,#zoombar,#parcel,#hud,#fbbtn,#fbmodal,#namemodal')) return
  if (world.pickYazihane(e.clientX, e.clientY)) { openOffice(); return }
  const hit = world.pickParcel(e.clientX, e.clientY)
  if (hit) { audio.click(); openParcel(hit.c, hit.r) }
})

$('zin').addEventListener('click', () => { world.zoomBy(0.82); audio.click() })
$('zout').addEventListener('click', () => { world.zoomBy(1.22); audio.click() })
addEventListener('wheel', e => { if ((e.target as HTMLElement).closest('#desk,#queue,#office,#tips,#goals,#parcel')) return; world.zoomBy(e.deltaY > 0 ? 1.08 : 0.93) }, { passive: true })
// HER jestte idempotent: sayfa yenilenmesi/HMR sonrası ilk dokunuşta ses geri gelir
for (const ev of ['pointerdown', 'keydown', 'wheel'] as const)
  addEventListener(ev, () => audio.kick(game.activeLoc), { capture: true })
// sekme geri gelince de uyandır (tarayıcı arka planda bağlamı askıya alabiliyor)
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.kick(game.activeLoc) })
function openOffice() { audio.click(); $('office').classList.add('show'); renderOffice() }
$('yazpill').addEventListener('click', openOffice)
$('setbtn').addEventListener('click', () => openOfficeTab('ayarlar'))
$('phonebtn').addEventListener('click', () => {
  phoneOff = !phoneOff
  game.phonePaused = phoneOff
  $('phonebtn').classList.toggle('off', phoneOff)
  $('phonebtn').textContent = phoneOff ? '📵' : '📞'
  audio.click()
  toast(phoneOff ? t('Telefon KAPALI — yeni istek gelmez, bekleyenler küsmez.') : t('Telefon açık — istekler yeniden gelmeye başlar.'), phoneOff ? 'b' : 'g')
})
$('editbtn').addEventListener('click', () => {
  editMode = !editMode
  $('editbtn').classList.toggle('on', editMode)
  if (!editMode) cancelMove()
  audio.click()
  toast(editMode ? 'DÜZENLEME MODU: taşımak istediğin yapıya tıkla.' : 'Düzenleme modu kapandı.')
})
$('goalsbtn').addEventListener('click', () => { goalsOpen = !goalsOpen; if (goalsOpen) tipsOpen = false; audio.click(); renderGoals(); renderTips() })
$('tipsbtn').addEventListener('click', () => { tipsOpen = !tipsOpen; if (tipsOpen) goalsOpen = false; audio.click(); renderGoals(); renderTips() })
$('closeoffice').addEventListener('click', () => $('office').classList.remove('show'))
document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'))
  t.classList.add('on'); officeTab = t.dataset.tab!; renderOffice()
}))

// ---------- HUD ----------
function renderHud() {
  const hour = game.hourNow()
  $('h-money').textContent = '₺' + tl(game.money)
  $('h-day').textContent = `${DAY_NAMES[(game.day - 1) % 7]} · ${game.day}`
  // SADECE SAAT (dakika yok) — ve doğru gün uzunluğuyla (eski kod 15 saatlik güne sabitlenmişti)
  $('h-clock').textContent = hourLabel(game.hourNow())
  $('h-rep').textContent = game.rep.toFixed(1)
  $('h-occ').textContent = '%' + Math.round(game.occupancy() * 100)
  const rd = game.daysToRent()
  $('h-rent').textContent = `₺${tl(game.rentAmount())} · ${rd}g`
  ;($('h-rent').parentElement as HTMLElement).classList.toggle('warn', rd <= 2)
  const repChip = $('h-rep').parentElement as HTMLElement
  repChip.classList.toggle('warn', game.rep < 2.5)
}

// ---- ŞUBE ÇUBUĞU ----
function renderLocs() {
  const bar = $('locbar')
  const anyLocked = LOCATIONS.some(l => !game.unlockedLocs.includes(l.id))
  bar.innerHTML = `<span class="loclbl">${t('ŞUBELER')}</span>` + LOCATIONS
    .filter(l => game.unlockedLocs.includes(l.id))
    .map(l => {
      const on = game.activeLoc === l.id
      const inc = game.locIncome[l.id]
      return `<button class="loc ${on ? 'on' : ''}" data-loc="${l.id}" title="${l.desc}">${l.label}${inc !== undefined
        ? `<span class="linc ${inc < 0 ? 'neg' : ''}">${inc < 0 ? '' : '+'}₺${tl(inc)}</span>` : ''}</button>`
    }).join('')
    + (anyLocked ? `<button class="loc plus" id="locplus">${t('+ YENİ ŞUBE')}</button>` : '')
  bar.querySelectorAll<HTMLElement>('button[data-loc]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.loc as LocId
      if (id === game.activeLoc) return
      const r = game.switchLoc(id)
      if (r.ok) { audio.click(); toast(r.msg, 'g'); applyLocSwitch() }
    })
  })
  const plus = document.getElementById('locplus')
  if (plus) plus.addEventListener('click', () => openOfficeTab('subeler'))
}

/** Yazıhane'yi belirli sekmede aç (BenelOil alışkanlığı: şube işleri ofiste) */
function openOfficeTab(tab: string) {
  officeTab = tab
  document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab))
  openOffice()
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
  syncWorldParcels()
  save()
  renderAll()
}

function renderAll() { renderHud(); renderQueue(); renderCal(); renderGoals(); renderTips(); renderLocs() }

let lastPush = 0
let lastPushHash = ''
let lastBookWarnAt = 0
let lastPushErrAt = 0
let cloudBlocked = false
// BULUT KAYIT: girişliyse sunucuya (çakışmada sunucu kazanır)
// K7: kayıt diyeti — içerik DEĞİŞMEDİYSE buluta gönderme (400KB × her 10sn israfı)
// force: kritik anlar (tabela adı, çıkış) 20sn diyetini bekleyemez — hash kontrolü yine de korunur
function cloudPush(force = false, keepalive = false) {
  if (!auth.loggedIn() || auth.isKicked() || cloudBlocked) return
  if (!force && Date.now() - lastPush < 20_000) return
  const snap = game.save()
  const body = JSON.stringify(snap)
  if (body === lastPushHash) return
  lastPushHash = body
  lastPush = Date.now()
  auth.pushSave(snap, keepalive).then(r => {
    if (r.kicked) return // onKicked bildirimi zaten gösterildi; bu cihaz artık yazmaz
    if (r.conflict) {
      if (r.save) { game.load(r.save as never); applyLocSwitch(); toast('Diğer cihazdaki güncel kayıt yüklendi.') }
      else toast('Sunucu bu kaydı kabul etmedi — ilerleme buluta yazılamıyor.', 'b')
    }
  }).catch(() => {
    // sessiz yutma YOK (denetim K7): dakikada en çok bir kez uyar
    if (Date.now() - lastPushErrAt > 60_000) { lastPushErrAt = Date.now(); toast('Buluta kaydedilemedi — bağlantını kontrol et.', 'b') }
  })
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.save())) } catch { /* kota */ }
  if (game.bookings.length > 1800 && Date.now() - lastBookWarnAt > 300_000) {
    lastBookWarnAt = Date.now()
    toast(t('Takvim arşivi doluyor — en eski kayıtlar yakında düşecek.'), 'b')
  }
  cloudPush()
}
// ÇIKIŞ GARANTİSİ: sekme kapanırken son durum keepalive ile buluta gider —
// yoksa son ≤20 sn'lik ilerleme (özellikle 0. dakikada verilen tesis adı) kayboluyordu
window.addEventListener('pagehide', () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.save())) } catch { /* kota */ }
  cloudPush(true, true)
})

// ---------- döngü ----------
const clock = new THREE.Clock()
let spawnT = 2
// TELEFON KAPAT: yeni istek gelmez; MEVCUT kartların sabrı da donar (itibar cezası işlemez)
let phoneOff = false
let matchWasOn = false
let uiT = 0
let saveT = 0

let hiddenAt = 0
let hiddenMatchesBefore = 0
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); hiddenMatchesBefore = game.gMatches }
  else if (hiddenAt) {
    const mins = Math.round((Date.now() - hiddenAt) / 60000)
    const played = game.gMatches - hiddenMatchesBefore
    if (mins >= 1 && played > 0) toast(`${t('Sen yokken')}: ${played} ${t('maç oynandı')} (${mins} dk)`, 'g')
    hiddenAt = 0
  }
})
// K1: sekme arkadayken oyun DURMAZ — düşük frekanslı arka plan kalbi zamanı işletir
setInterval(() => {
  if (!document.hidden) return
  if ($('gate').classList.contains('show') || $('namemodal').classList.contains('show')) return
  const dt = clock.getDelta()           // gerçek geçen süre (rAF durunca da doğru)
  if (dt > 0 && dt < 120) {
    game.tick(Math.min(dt, 60))
    save()
  }
}, 5000)

function frame() {
  requestAnimationFrame(frame)
  if (document.hidden) { return }
  // SAAT HASSASİYETİ: görseller 50ms'e kırpılır ama OYUN SAATİ gerçek zamanı izler —
  // düşük FPS'te kırpma yüzünden '20 sn'lik saat' 24-25 sn sürüyordu.
  const rawDt = clock.getDelta()
  const dt = Math.min(rawDt, 0.05)

  const prevDay = game.day
  // İLK İŞ: tesise isim (gate kapalıyken, isim boşsa)
  if (!game.facilityName && !$('gate').classList.contains('show') && !$('namemodal').classList.contains('show')) {
    $('namemodal').classList.add('show')
    setTimeout(() => ($('nameinput') as HTMLInputElement).focus(), 100)
  }
  // misafir gün 3'e geldiyse: günde bir kez 'hesap aç' dürtmesi (ilerleme risk mesajıyla)
  if (!auth.loggedIn() && game.day >= 3 && localStorage.getItem('hs-regnudge') !== String(game.day)
      && !$('gate').classList.contains('show')) {
    localStorage.setItem('hs-regnudge', String(game.day))
    const gr = document.getElementById('greason')
    if (gr) {
      gr.style.display = 'block'
      gr.textContent = `${game.day}. ${t('gündesin ve ilerlemen SADECE bu cihazda. Hesap aç: buluta taşınsın + ₺2.500 hediye.')}`
    }
    $('gate').classList.add('show')
  }
  // MİSAFİR SINIRI: 5. günden sonra misafirlik biter — kapı kalıcı, 'misafir devam' gizli.
  // İlerleme KAYBOLMAZ: kayıt/girişte yerel kayıt buluta taşınır (mevcut akış).
  if (!auth.loggedIn() && game.day > 5 && !$('gate').classList.contains('show')) {
    const gr = document.getElementById('greason')
    if (gr) {
      gr.style.display = 'block'
      gr.textContent = t('Misafir deneme süresi bitti (5 gün). Ücretsiz hesap aç — tüm ilerlemen aynen taşınır, üstüne ₺2.500 hediye.')
    }
    ;($('gguest') as HTMLElement).style.display = 'none'
    $('gate').classList.add('show')
  }
  const gateOpen = $('gate').classList.contains('show') || $('verifylock').classList.contains('show')
  if (!gateOpen) game.tick(Math.min(rawDt, 1))
  // ANINDA ÖDEME bildirimi: maç bitti → "+₺X · takım" (çoksa tek toplu toast)
  if (game.payouts.length) {
    const tot = game.payouts.reduce((s, p) => s + p.amt, 0)
    toast(game.payouts.length === 1
      ? `+₺${tl(tot)} · ${game.payouts[0].team}`
      : `+₺${tl(tot)} · ${game.payouts.length} ${t('maç bitti')}`, 'g')
    audio.cash()
    game.payouts.length = 0
  }
  {
    let shown = 0
    while (game.notices.length && shown < 2) { toast(game.notices.shift()!, 'g'); if (shown === 0) audio.place(); shown++ }
    if (game.notices.length) {
      toast(`+${game.notices.length} ${t('bildirim daha — Defter\'de')}`)
      game.events.push(...game.notices)
      game.notices.length = 0
    }
  }
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
  for (const g of game.claimGoals()) { audio.cash(); toast(`${t('HEDEF TAMAM:')} ${g.label} · +₺${tl(g.reward)}`, 'g') }

  // rezervasyon üretimi — TELEFON KAPALIYSA çalmaz (ceza da yok, moladasın).
  // ÇAĞRI SIKLIĞI yatırımla artar: tabela/reklam/2. hat/itibar telefonu daha sık çaldırır
  if (!gateOpen && !phoneOff && game.isOpen()) spawnT -= dt
  if (spawnT <= 0) {
    const callMult = 1 + (game.hasRoadSign ? 0.25 : 0) + (game.adDays > 0 ? 0.5 : 0)
      + game.rep * 0.06 + (game.hasPhone2 ? 0.15 : 0)
      + (game.totalLanes() - 1) * 0.22 // saha/kort arttıkça telefon daha sık çalar
    spawnT = (6 + Math.random() * 6) / callMult
    for (let k = 0; k < 6; k++) if (game.spawnReservation()) {
      renderQueue(); audio.ring()
      const hd = document.querySelector('#queue .desk-head') as HTMLElement | null
      if (hd) { hd.classList.remove('ringing'); void hd.offsetWidth; hd.classList.add('ringing') }
      break
    } }

  // gün-gece
  const frac = game.t / DAY_SECONDS
  const nhF = 9 + game.t / 20 // kesirli saat
  const night = nhF < 19 ? (nhF >= 7 + 24 ? 0 : nhF < 9 ? 1 : 0)
    : nhF < 21 ? (nhF - 19) / 2
    : nhF < 31 ? 1
    : Math.max(0, 1 - (nhF - 31) / 2) // 07:00-09:00 gün doğumu
  world.setNight(night, game.hasLights)

  // o an maç var mı → botlar oynasın
  const hour = game.hourNow()
  const nowDay = (game.day - 1) % 7
  const nowMatch = !!game.bookingAt(nowDay, hour)
  // maç başladı → araba yoldan gelir, park eder, oyuncular inip YÜRÜYEREK sahaya girer
  if (nowMatch && !matchWasOn) { world.carArrival(() => world.sendArrivals(5)); audio.cheer() }
  matchWasOn = nowMatch
  world.updateMatch(dt, nowMatch)
  // DİĞER SAHALAR: o an maçı olan her şeridin fiziksel sahasına oyuncu gelsin
  {
    const acts: { id: string; key: string; kind: 'pitch' | 'mini' | 'basket' | 'voley'; sub: number; count: number }[] = []
    for (const b of game.bookingsAt(nowDay, hour)) {
      const l = game.laneOf(b, nowDay, hour)
      const ref = game.laneBuildRef(l)
      if (ref) acts.push({ id: 'L' + l, ...ref })
    }
    world.setFieldActivity(acts)
  }
  world.updateAmbient(dt)
  // MAÇ OLAYLARI: kavga → polis, sakatlanma → ambulans (siren + araç + toast)
  while (game.incidents.length) {
    const inc = game.incidents.shift()!
    const pol = inc.kind === 'kavga'
    world.emergency(pol ? 'polis' : 'ambulans')
    audio.siren(pol ? 'polis' : 'ambulans')
    toast(pol
      ? `🚨 ${inc.team} ${t('maçında kavga çıktı — polis geldi! İtibar -0.06')}`
      : `🚑 ${inc.team} ${t('maçında sakatlanma — ambulans yolda, geçmiş olsun.')}`, pol ? 'b' : '')
  }
  world.setBillboards(game.hasBillboard)
  world.setRoadSign(game.hasRoadSign)
  syncWorldParcels()

  uiT -= dt
  if (uiT <= 0) { uiT = 0.4; renderAll()
    audio.crowd(nowMatch ? 0.35 + world.matchHeat * 0.65 : 0)  // maç uğultusu heyecanla artar
  }
  const pp = world.project(-14.5, 7.2, 5.1)
  const yp = $('yazpill')
  yp.style.left = `${pp.x}px`; yp.style.top = `${pp.y}px`
  saveT -= dt
  if (saveT <= 0) { saveT = 10; save() }

  world.render()
}

(window as any).__g = game
;(window as any).__a = audio; (window as any).__w = world
renderAll()
frame()

// ilk açılışta yönlendirme
if (game.day === 1 && game.bookings.length === 0) {
  setTimeout(() => toast('Sağdan bir rezervasyon isteği seç, takvimde yerine tıkla.'), 900)
}

// ---------- GİRİŞ KAPISI + BULUT OTURUM (BenelOil akışının birebiri) ----------
const GUEST_OK = 'halisaha-guest-ok'
auth.onKicked(() => toast('Bu hesap başka cihazda açıldı — ilerleme oradan devam ediyor.', 'b'))

async function afterAuth(mode: 'register' | 'login' | 'oauth') {
  try {
    const local = game.save()
    if (mode === 'register') {
      await auth.pushSave(local)                 // yeni hesap → yerel ilerleme hesaba taşınır
    } else if (mode === 'oauth') {
      const acc = await auth.pullSave() as { day?: number } | null
      if (!acc || (acc.day ?? 1) <= 1) await auth.pushSave(local)  // boş hesap → taşı
    }
    // login: push YOK — hesaptan devam
  } catch { /* ağ hatası: yerel durur */ }
  localStorage.setItem(GUEST_OK, '1')
  location.reload()
}

function wireGate() {
  const gEmail = document.getElementById('gemail') as HTMLInputElement
  const gPass = document.getElementById('gpass') as HTMLInputElement
  const gErr = document.getElementById('gerr') as HTMLDivElement
  const wire = (id: string, fn: () => Promise<void>) =>
    (document.getElementById(id) as HTMLButtonElement).addEventListener('click', async () => {
      gErr.textContent = ''
      try { await fn() } catch (e) { gErr.textContent = (e as Error).message }
    })
  wire('glogin', async () => { await auth.login(gEmail.value, gPass.value); await afterAuth('login') })
  wire('gregister', async () => { await auth.register(gEmail.value, gPass.value); await afterAuth('register') })
  wire('gforgot', async () => {
    const em = gEmail.value.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(em)) { gErr.textContent = 'Önce e-postanı yaz.'; return }
    await auth.requestReset(em)
    gErr.style.color = '#2b8a4a'; gErr.textContent = 'Sıfırlama bağlantısı gönderildi (kayıtlıysa).'
  })
  ;(document.getElementById('gguest') as HTMLButtonElement).addEventListener('click', () => {
    localStorage.setItem(GUEST_OK, '1')
    $('gate').classList.remove('show')
    audio.click()
    fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guest: true }) }).catch(() => {})
  })
  gPass.addEventListener('keydown', e => { if (e.key === 'Enter') (document.getElementById('glogin') as HTMLButtonElement).click() })
  // sosyal kanıt + Google GIS
  fetch('/api/stats').then(r => r.json()).then(st => {
    if (st && typeof st.players === 'number' && st.players > 0) {
      const lc = document.getElementById('livecount')!
      lc.textContent = `${st.players.toLocaleString('tr-TR')} işletmeci sahasını kurdu` + (st.online > 1 ? ` · ${st.online} şu an oyunda` : '')
      lc.style.display = 'block'
    }
  }).catch(() => {})
  ;(async () => {
    try {
      const cfg = await (await fetch('/api/config')).json() as { googleClientId?: string }
      if (!cfg.googleClientId) return
      await new Promise<void>((res, rej) => {
        const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true
        sc.onload = () => res(); sc.onerror = () => rej(new Error('gis')); document.head.appendChild(sc)
      })
      const g = (window as unknown as { google: { accounts: { id: { initialize: (o: unknown) => void; renderButton: (el: HTMLElement, o: unknown) => void } } } }).google
      g.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async (resp: { credential: string }) => {
          gErr.textContent = ''
          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ idToken: resp.credential }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error ?? 'Google girişi başarısız.')
            localStorage.setItem('halisaha-token', d.token)
            localStorage.setItem('halisaha-email', d.email)
            await afterAuth('oauth')
          } catch (e) { gErr.textContent = (e as Error).message }
        },
      })
      // OYUNUN TASARIM DİLİNDE buton; gerçek GIS butonu üstünde görünmez katman (BenelOil tekniği)
      const gc = document.getElementById('gbtn-google') as HTMLDivElement
      gc.style.cssText = 'position:relative; overflow:hidden; border-radius:11px; margin-top:10px'
      gc.innerHTML = `
        <button type="button" style="width:100%; padding:11px 14px; border-radius:11px;
          border:1.5px solid #d7e5d2; border-bottom:3px solid #c8d6bd; background:#fff; color:var(--ink);
          font-family:var(--font); font-weight:800; font-size:13.5px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:9px">
          <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.4 44 30.2 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
          <span>Google ile devam et</span>
        </button>
        <div id="gis-real" style="position:absolute; inset:-4px; opacity:0.001; display:flex; justify-content:center; align-items:stretch"></div>`
      g.accounts.id.renderButton(document.getElementById('gis-real')!, {
        theme: 'outline', size: 'large', text: 'continue_with', shape: 'rect',
        width: Math.min(400, Math.max(220, gc.clientWidth || 320)),
      })
    } catch { /* GIS yok — e-posta yolu açık */ }
  })()
}
setLang(lang)
if (game.facilityName) world.setSignName(game.facilityName)
wireGate()
// TESİS İSMİ
$('nameok').addEventListener('click', () => {
  const nm = ($('nameinput') as HTMLInputElement).value.trim().slice(0, 14)
  if (nm.length < 2) { toast(t('En az 2 harf olsun kral.'), 'b'); return }
  game.facilityName = nm
  world.setSignName(nm)
  save()
  cloudPush(true) // tabela adı 0. dakikada verilir — 20sn diyetini beklerse reload'da kaybolur
  $('namemodal').classList.remove('show')
  audio.build()
  toast(`${nm.toUpperCase()} ${t('tabelası asıldı — hayırlı olsun!')}`, 'g')
})
;($('nameinput') as HTMLInputElement).addEventListener('keydown', e => { if (e.key === 'Enter') $('nameok').click() })

// SORUN/ÖNERİ BİLDİR (kırmızı buton — misafir dahil herkese açık)
$('fbbtn').addEventListener('click', () => { $('fbmodal').classList.add('show'); audio.click() })
$('fbclose').addEventListener('click', () => $('fbmodal').classList.remove('show'))
$('fbsend').addEventListener('click', async () => {
  const txt = ($('fbtext') as HTMLTextAreaElement).value.trim()
  const msg = $('fbmsg')
  if (txt.length < 5) { msg.style.color = 'var(--clay)'; msg.textContent = 'Biraz daha detay yaz kral.'; return }
  msg.style.color = 'var(--muted)'; msg.textContent = 'Gönderiliyor...'
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth': localStorage.getItem('halisaha-token') ?? '' },
      body: JSON.stringify({ message: txt, game: { day: game.day, money: game.money, loc: game.activeLoc, pitches: game.pitches } }),
    })
    if (!res.ok) throw new Error('Gönderilemedi, sonra tekrar dene.')
    msg.style.color = 'var(--green-dark)'; msg.textContent = 'Alındı! Teşekkürler — hepsini okuyoruz. ✓'
    ;($('fbtext') as HTMLTextAreaElement).value = ''
    setTimeout(() => $('fbmodal').classList.remove('show'), 1400)
  } catch (e) { msg.style.color = 'var(--clay)'; msg.textContent = (e as Error).message }
})

// OTURUM NABZI: dakikada bir — sunucu sayaçları oturum süresi/aktiflik ölçer
setInterval(() => {
  fetch('/api/metric', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: 'session_minutes' }) }).catch(() => {})
}, 60_000)
setInterval(() => {
  fetch('/api/metric', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: 'session_minutes' }) }).catch(() => {})
}, 60_000)

;(async () => {
  if (localStorage.getItem(auth.REG_BONUS_KEY) === '1') {
    localStorage.removeItem(auth.REG_BONUS_KEY)
    game.money += 2500
    save()
    setTimeout(() => toast('Hoş geldin! Kayıt hediyesi: +₺2.500 kasanda.', 'g'), 1600)
  }
  const utm = new URLSearchParams(location.search)
  fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    ref: document.referrer.slice(0, 200),
    utm: [utm.get('utm_source'), utm.get('utm_medium'), utm.get('utm_campaign')].filter(Boolean).join('/').slice(0, 120),
    lang, screen: `${screen.width}x${screen.height}`,
    guest: !auth.loggedIn(),
  }) }).catch(() => {})
  if (auth.loggedIn()) {
    // K8 (BenelOil cloudBlocked dersi): bulut OKUNMADAN oyun başlamaz — gerçek bir
    // override kazasından sonra eklendi; yerel gün-40, buluttaki gün-60'ı ezmesin
    const tryPull = async (): Promise<boolean> => {
      try {
        const sv = await auth.pullSave()
        if (sv) { game.load(sv as never); applyLocSwitch() }
        else await auth.pushSave(game.save())
        return true
      } catch { return false }
    }
    // E-POSTA DOĞRULAMA KAPISI: doğrulanmamış hesap OYNAYAMAZ (Resend maili + kontrol)
    const showVerify = () => {
      const ve = document.getElementById('vemail'); if (ve) ve.textContent = auth.currentEmail() ?? ''
      $('verifylock').classList.add('show')
    }
    $('vcheck').addEventListener('click', async () => {
      try {
        const sv = await auth.pullSave()
        $('verifylock').classList.remove('show')
        if (sv) { game.load(sv as never); applyLocSwitch() }
        toast(t('Doğrulandı — hoş geldin!'), 'g'); audio.cash(); renderAll()
      } catch { toast(t('Henüz doğrulanmamış görünüyor — mailindeki linke tıkla.'), 'b') }
    })
    $('vresend').addEventListener('click', async () => {
      try { await auth.sendVerify(); toast(t('Doğrulama maili yeniden gönderildi.'), 'g') }
      catch { toast(t('Gönderilemedi — birazdan tekrar dene.'), 'b') }
    })
    $('vlogout').addEventListener('click', () => { auth.logout(); location.reload() })
    if (!(await tryPull())) {
      if (auth.needsVerify()) { showVerify() }
      else {
      cloudBlocked = true
      $('cloudlock').classList.add('show')
      $('cloudretry').addEventListener('click', async () => {
        if (await tryPull()) { cloudBlocked = false; $('cloudlock').classList.remove('show'); toast(t('Bulut bağlandı — devam!'), 'g') }
        else toast(t('Hâlâ ulaşılamıyor.'), 'b')
      })
      $('cloudlogout').addEventListener('click', () => { auth.logout(); location.reload() })
      }
    }
  } else if (!localStorage.getItem(GUEST_OK)) {
    $('gate').classList.add('show')
  } else if (game.activeLoc !== 'mahalle') {
    applyLocSwitch()  // yenilemede doğru şube teması
  }
})()

// YÜKLEME MASKESİ kaldırma: Kenney kitleri sahneye uygulanınca (yazıhane pop'u görünmesin)
// VEYA 8 sn tavan — kit inmezse prosedürel yedek oynanabilir, maske oyunu rehin almasın
// (BenelOil dersi: kit'e koşulsuz bağlanan maske ağ hatasında hiç kalkmıyordu).
Promise.race([world.kitReady, new Promise(r => setTimeout(r, 8000))])
  .then(() => document.getElementById('boot')?.remove())
  .catch(() => document.getElementById('boot')?.remove())
