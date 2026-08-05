/** Hafif i18n: UI kabuğu TR/EN. Oyun simülasyon replikleri v1'de TR (tema gereği). */
export type Lang = 'tr' | 'en'
export let lang: Lang = (localStorage.getItem('hs-lang') as Lang) || 'tr'

export const EN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const EN_DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TR_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TR_DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export function dayName(i: number): string { return (lang === 'en' ? EN_DAYS : TR_DAYS)[i] ?? '' }
export function dayFull(i: number): string { return (lang === 'en' ? EN_DAYS_FULL : TR_DAYS_FULL)[i] ?? '' }

const EN: Record<string, string> = {
  'Çizelge — boş saate tıkla': 'Schedule — tap a free hour',
  'için saat seç — yanan kutuya tıkla': '— pick an hour, tap a glowing box',
  'yanan saate tıkla': 'tap a glowing hour',
  'seçildi ✓': 'booked ✓',
  'Bugün': 'Today',
  'maç': 'match',
  'maç yok, telefonu bekle': 'no matches — wait for the phone',
  'sıradaki': 'next up',
  'bugünkü maçlar bitti': "today's matches are done",
  'BUGÜN': 'TODAY',
  'Önce soldan bir istek seç.': 'Pick a request on the left first.',
  'Çizelgede yanan saate tıkla.': 'Tap a glowing hour in the schedule.',
  'Hafta içi': 'Weekdays',
  'Hafta sonu': 'Weekend',
  'Her gün': 'Any day',
  'teklifi': 'offers',
  '/hafta': '/week',
  'HAFTA': 'WK',
  'ESNEK': 'FLEX',
  '2 SAAT': '2 HRS',
  'TAM SAHA': 'FULL PITCH',
  'geri çevir ✕': 'decline ✕',
  'pazarlık yapıldı': 'deal made',
  'pazarlık bitti': 'deal done',
  'sıkı müşteri — pazarlık şansı yüksek': 'eager customer — good haggle odds',
  'acelesi var, üstüne gitme': "in a hurry — don't push",
  'iste · güvenli': 'ask · safe',
  'iste · riskli': 'ask · risky',
  'Şu an istek yok.': 'No requests right now.',
  'Birazdan telefon çalar…': 'The phone will ring soon…',
  'Günün Hedefleri': "Today's Goals",
  'maç oynat': 'matches played',
  'kazan': 'earned',
  'Bir abonelik bağla': 'Sign one subscription',
  'Sıradaki:': 'Next:',
  'kaldı': 'to go',
  'HEDEF TAMAM:': 'GOAL DONE:',
  'ÖNERİ': 'TIP',
  'ACİL': 'URGENT',
  'VAR ✓': 'OWNED ✓',
  'Önce kantin gerekli': 'Canteen required first',
  'Çıkar': 'Fire',
  'USTA ✓': 'MASTER ✓',
  'AÇIK ✓': 'ON ✓',
  'KAPALI': 'OFF',
  'Şubeye Geç': 'Switch',
  'ŞU AN BURADASIN': 'YOU ARE HERE',
  'YIK · %40 iade': 'DEMOLISH · 40% back',
  'Boş arsa': 'Empty lot',
  'Müdüre bırak': 'Auto-manage',
  'Aç': 'Enable',
  'Kapat': 'Disable',
  'SAHANA İSİM VER': 'NAME YOUR PITCH',
  'Tabelaya yazılacak — mahalle seni bu isimle tanıyacak.': 'Goes on the sign — the whole neighborhood will know this name.',
  'Örn: ARENA 34, GOL KRALI...': 'e.g. ARENA 34, GOAL KINGS...',
  'Tabelayı As': 'Hang the Sign',
  'En az 2 harf olsun kral.': 'At least 2 letters, boss.',
  'tabelası asıldı — hayırlı olsun!': 'sign is up — good luck out there!',
  ' rezervasyonu alındı.': ' booking confirmed.',
  ' hafta abone oldu!': '-week subscription signed!',
  ' 2 saatlik maç aldı': ' booked a 2-hour match',
  ' kabul etti — ': ' accepted — ',
  ' ortada buluştu — ': ' met you halfway — ',
  ' "çok oldu abi" deyip kapattı.': ' said "too much, man" and hung up.',
  ' bekledi, başka sahaya gitti.': ' got tired of waiting and went elsewhere.',
  ' beklemekten sıkıldı, başka sahaya gitti.': ' got tired of waiting and went elsewhere.',
  ' geri çevrildi — küsmedi ama not etti.': ' was turned down — no hard feelings, but noted.',
  ' 1 saati kabul etti — ': ' accepted a single hour — ',
  'Çırak telefona baktı: ': 'Apprentice took the call: ',
  'Müdür yerleştirdi: ': 'Manager booked it: ',
  'Sen yokken tesis çalıştı: ': 'While you were away: ',
  ' kasada': ' earned',
  'Haftalık kira ödendi: ': 'Weekly rent paid: ',
  'KİRA ÖDENEMEDİ!': 'RENT UNPAID!',
  'Anlaşma tamam — şimdi çizelgede yanan saate tıkla.': 'Deal done — now tap a glowing hour in the schedule.',
  'takvimde yerini bekliyor — hazır olunca koy.': 'is waiting for a slot — place when ready.',
  'İnşaat iptal edildi.': 'Construction cancelled.',
  'Taşıma iptal edildi.': 'Move cancelled.',
  'Bu arsa senin değil — önce satın al.': 'Not your lot — buy it first.',
  'Hoş geldin! Kayıt hediyesi: +₺2.500 kasanda.': 'Welcome! Signup gift: +₺2,500 in the till.',
  'Buluta kaydedilemedi — bağlantını kontrol et.': 'Cloud save failed — check your connection.',
  'DÜZENLEME MODU: taşımak istediğin yapıya tıkla.': 'EDIT MODE: tap a building to move it.',
  'Düzenleme modu kapandı.': 'Edit mode off.',
  'elinde — arsaya taşı, tıkla kur. Sağ tık / ESC: vazgeç.': 'in hand — drag to a lot, click to build. Right-click / ESC: cancel.',

  'Gelen İstekler': 'Incoming Requests',
  'Çizelge — soldan istek seç': 'Schedule — pick a request',
  'YAZIHANE': 'FRONT OFFICE',
  'Yatırım': 'Upgrades', 'İnşaat': 'Build', 'Özet': 'Summary', 'Personel': 'Staff',
  'Şubeler': 'Branches', 'Defter': 'Ledger', 'Ayarlar': 'Settings',
  'HEDEFLER': 'GOALS', 'ŞUBELER': 'BRANCHES',
  '+ YENİ ŞUBE': '+ NEW BRANCH',
  'Sorun / Öneri Bildir': 'Report / Suggest',
  'SORUN / ÖNERİ BİLDİR': 'REPORT A PROBLEM / IDEA',
  'Gönder': 'Send', 'Kapat ✕': 'Close ✕',
  'Misafir olarak oyna': 'Play as guest',
  'Kayıt yok, kurulum yok — 3 saniyede sahadasın.': 'No signup, no setup — on the pitch in 3 seconds.',
  'veya hesabınla devam et': 'or continue with your account',
  'e-posta': 'e-mail', 'şifre': 'password',
  'Giriş Yap': 'Log In', 'Kayıt Ol': 'Sign Up', 'Şifremi unuttum': 'Forgot password',
  'Google ile devam et': 'Continue with Google',
  'Sahanı kur, mahallenin efsanesi ol. İlerlemen hesabında güvende.':
    'Build your pitch, become the local legend. Progress saved to your account.',
  'Kasa': 'Cash', 'Gün': 'Day', 'Saat': 'Time', 'İtibar': 'Rep', 'Doluluk': 'Occup.', 'Kira': 'Rent',
  'Ses efektleri': 'Sound effects', 'Müzik': 'Music', 'Dil / Language': 'Language',
  'Kamera': 'Camera', 'Görünümü sıfırla': 'Reset view',
  'Hesap': 'Account', 'Çıkış Yap': 'Log Out', 'Hesabı Sil': 'Delete Account', 'Kalıcı Sil': 'Delete Forever',
  'Giriş / Kayıt': 'Log In / Sign Up', 'Misafir': 'Guest',
  'bugün': 'today',
}
export function t(s: string): string { return lang === 'en' ? (EN[s] ?? s) : s }
export function setLang(l: Lang) {
  lang = l
  localStorage.setItem('hs-lang', l)
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n!
    el.textContent = l === 'en' ? (EN[k] ?? k) : k
  })
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach(el => {
    const k = el.dataset.i18nPh!
    el.placeholder = l === 'en' ? (EN[k] ?? k) : k
  })
}
