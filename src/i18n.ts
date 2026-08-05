/** Hafif i18n: UI kabuğu TR/EN. Oyun simülasyon replikleri v1'de TR (tema gereği). */
export type Lang = 'tr' | 'en'
export let lang: Lang = (localStorage.getItem('hs-lang') as Lang) || 'tr'

const EN: Record<string, string> = {
  'Gelen İstekler': 'Incoming Requests',
  'Çizelge — soldan istek seç': 'Schedule — pick a request',
  'YAZIHANE': 'FRONT OFFICE',
  'Yatırım': 'Upgrades', 'İnşaat': 'Build', 'Özet': 'Summary', 'Personel': 'Staff',
  'Şubeler': 'Branches', 'Defter': 'Ledger', 'Ayarlar': 'Settings',
  'HEDEFLER': 'GOALS', 'ÖNERİ': 'TIPS', 'ŞUBELER': 'BRANCHES',
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
