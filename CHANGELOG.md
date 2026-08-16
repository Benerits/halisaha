# CHANGELOG

## 2026-08-16 — Lansman geri bildirimi temizliği (141 oyuncu bildirimi tarandı)

Prod'daki `halisaha_feedback` tablosundaki tüm kayıtlar (141 adet) sınıflandırıldı:
**sorunlar bu sürümde düzeltildi**, öneriler aşağıda yol haritası adayı olarak listelendi.

### 🔴 KAYIT (SAVE) SİSTEMİ — kritik küme
Şikâyetler: "oyunum sürekli sıfırlanıyor", "refresh'te 28. güne dönüyorum", "şubelerim
kayboldu", "sezonu bitir çalışmıyor, eski kayıt geri geliyor", "çıkınca kaydetmemiş".

- **Çıkış push'u 64KB limitinde sessizce ölüyordu.** `keepalive` fetch 64KB üstü gövdeyi
  anında reddeder; orta oyun save'i ~90KB. Sekme kapanırken kayıt buluta HİÇ gitmiyordu.
  Artık büyük gövdede keepalive'sız en-iyi-çaba push atılıyor (`auth.ts`).
- **Sekme gizlenince zorunlu push** eklendi ("çay molası" sigortası): `visibilitychange`
  → yerel + bulut kayıt. Sayfa o anda canlı olduğu için fetch güvenle tamamlanıyor.
- **Açılışta yerel-önde kurtarma:** bulut kaydı yereldeki AYNI hesabın kaydından
  gerideyse (yıldız > gün > saat sırasıyla kıyas) artık bayat bulut yereli ezmiyor;
  yerel oynatılıp buluta yazılıyor (`main.ts` `localAhead`). Kayıt sahibi
  `halisaha-save-owner` anahtarıyla doğrulanıyor — başka hesabın kaydı asla taşınmaz.
- **"Sezonu Şampiyon Bitir" artık geri alınmıyor:** sunucudaki regresyon guard'ı
  prestij sıfırlamasını "silinmiş kayıt" sanıp 409 ile ESKİ save'i geri yüklüyordu.
  +1 yıldız + gerçek sıfırlama şekli meşru prestij sayılıyor ve `halisaha_starlog`'a
  loglanıyor; şekle uymayan yıldız artışı hile kabul edilip kırpılıyor (`server`).
- **Başarısız push'un hash zehri:** push hata verince aynı içerik bir daha hiç
  denenmiyordu — hata/çakışmada hash sıfırlanıp yeniden deneniyor (`cloudPush`).
- **Kritik anlar 20 sn kayıt diyetini beklemiyor:** şube satın alma, inşaat, personel,
  yatırım, sezon kapanışı anında buluta yazılıyor (`saveNow`, 3 sn'lik burst tamponuyla).
- (2026-08-10'dan) İlk save'de gün 8'e kırpılmıyor; misafir→hesap taşıma ödeneği
  gün tavanı 8→30.

### 🟠 SUNUCU / HİLE FRENİ
- `clampBranchVault` ölü kodu silindi — benzinlik oyunundan kalmıştı ve loc whitelist'i
  yanlıştı (mahalle/sanayi/sahil yerine kasaba/otoyol/...); ileride bağlansa tüm şube
  kasalarını sessizce silecekti.
- Sunucu fiyat tablosu istemciyle eşitlendi (okul anlaşması 9.000 → 12.000) — servet
  hesabı meşru harcamayı eksik sayıp clamp tetikleyebiliyordu.
- Yıldız değişimleri artık `halisaha_starlog`'a yazılıyor ("yıldızım silindi"
  şikâyetleri kanıtla incelenebilir).

### 🟡 EKONOMİ / SATIN ALMA
- **Tuvalet çift ücret (#88):** iki kök neden kapatıldı — (1) aynı türden tekil bina
  dolu parsele "yıkıp yeniden kur" diye tam fiyat + %40 iade farkı ödetiyordu; tekil
  kontrol artık paradan ÖNCE. (2) Bayrağı düşmüş kayıt/şube snapshot'ı sahadaki binayı
  "yok" sayıp yeniden sattırıyordu — `healFlags()` binadan bayrağı geri türetiyor.
- **İtibar farmi (#73):** tuvalet/duş kur-yık döngüsü her turda +itibar veriyordu
  (₺2.400'e +0,2). Yıkım artık verdiği itibarı geri alıyor; tek-seferlik bonuslar
  (otopark/yeşil alan/kort) türün son yapısı yıkılınca iade edilip yeniden kazanılabilir.
- **Esnek inşada sıralama:** yeni yapının parası yıkımdan ÖNCE doğrulanıyor — parası
  yetmeyen oyuncu artık yapısını kaybedip eli boş kalmıyor.
- **Fiyat tutarsızlıkları (#130, #100, #116):** İnşaat kataloğu artık taban değil
  GÜNCEL (kademeli) fiyatı gösteriyor; öneri kartı/hedef bardaki elle yazılmış eski
  fiyatlar (`₺9.000 okul anlaşması` vb.) tek kaynaktan (`shopCost`) türetiliyor;
  "eksik" mesajları yuvarlanmış tutar + gerçek fiyatla geliyor.

### 🟢 ŞUBELER
- **Reklam "2 gün kaldı" donması (#105, #93):** pasif şubelerin `adDays` sayacı gün
  sonunda hiç işlemiyordu — artık tüm şubelerde azalıyor.
- **Tabela ismi (#127):** şube değişiminde yeni sahne özel tesis adını unutup
  "SANAYİ SAHA" basıyordu — `applyLocSwitch` ismi her şubede geri yazıyor.
- **Şube rozeti yanlış rakam:** şube başına gelir rozetine BİRİKİMLİ toplam yazılıyordu
  (2. şube 1.'nin gelirini de gösteriyordu) — şube başına ayrı defter tutuluyor.
- **Pasif şube zararı yutuluyordu:** toplam negatifse maaşlar hiç düşülmüyordu — artık
  zarar da işleniyor ve "Şubeler zarar yazdı" diye raporlanıyor.
- **Müdürlü pasif şube ölmüyor (#74, #22, #86):** pasif şube yalnız mevcut abonelikle
  dönüyor, havuz eriyince kalıcı zarara dönüşüyordu. Müdür artık günde seviyesi kadar
  yeni tek maç bağlıyor (bölge çarpanı + yıldız markası işler).

### 🔵 ARAYÜZ / YERLEŞTİRME
- **Düzenleme/taşıma modu (#133, #48, #46, #85, #59):** 4 kök neden — (1) erken
  return'lü dallar `dragging` bayrağını söndürmüyordu, kamera fareye yapışıyordu;
  (2) pan jesti "tıklama" sayılıyordu; (3) şube değişimi elde kalan yapı/taşıma/düzenleme
  modunu sıfırlamıyordu (pan ölüyordu); (4) her şube değişiminde ölü resize handler
  birikiyordu (`world.destroy()` eklendi).
- **Sessiz yıkım (#128, #20):** dolu arsaya inşaatta mevcut yapı onay sorulmadan
  yıkılıyordu ("tıkladım mini saham gitti") — artık yıkılacak yapıyı adıyla söyleyen
  onay soruluyor; YIK butonu istifli minide kaç saha gideceğini söylüyor.
- **Ana sahanın içine inşaat (#128):** ana saha parseli (1,1) inşaata kapatıldı.
- **Doluluk %109 (#20, #57):** pay ve payda farklı evrenleri sayıyordu — gelecek hafta
  kayıtları payda dışıydı, kortlar sayılmıyordu, LED'siz gece saatleri paydada duruyordu.
  Formül düzeltildi, %100 tavanlı.
- **Müdüre bırak takılması (#78):** `bestSlot` gelecek haftayı önerince `place`'e hafta
  parametresi geçilmiyordu → kart sonsuza dek deniyordu. Ayrıca yeri olmayan el-sıkışılmış
  kart 30 sn sonra müdür tarafından kibarca geri çevriliyor (kuyruk tıkanmıyor).
- **Kayıt kapısı (#16):** açılış yarışında isim modalı gate'in odağını çalıyordu —
  gate açılan her yer isim modalını kapatıyor; kayıt kartı kısa ekranda kaydırılabilir.
- **Hesap silme (#107):** çift `confirm()` bazı webview'larda sessizce iptal oluyordu —
  tek yazılı onay ("SIL" ya da "0") ile değiştirildi.
- **25:00 etiketi kalıntıları (#8):** kalan iki mesajda saat `1:00` formatına çevrildi.

### Testler
161 test geçiyor (öncekiler + bu sürümün 7 regresyon testi: itibar simetrisi,
healFlags, rezerve parsel, parasız esnek inşa, saat etiketi).

---

### 📋 ÖNERİLER (yol haritası adayları — henüz yapılmadı, karar bekliyor)

En çok istenenden aza doğru:

1. **Zaman hızlandırma / gece atlama** — açık ara 1 numara: 25+ ayrı bildirim
   ("2x/3x hız", "geceyi atla", "boş saatleri sar"). Gece 03:00-09:00 bandı boş bekleniyor.
2. **Pause / durdur-devam et** (#140, #113, #31, #32, #60) — iş yerinde oynayanlar bırakıp dönmek istiyor.
3. **Dakika göstergesi** (#112) + gün akış hissi.
4. **Doluluk / gelir göstergelerinin şube-bazlı ve saha-bazlı kırılımı** (#57, #51, #119 nakit projeksiyonu).
5. **İtibar şeffaflığı** (#94, #78): neyin artırıp neyin düşürdüğünü gösteren tooltip; müşteri yorumları sistemi (#68).
6. **Otopark ücretli olsun / vale / otopark görevlisi** (#126, #40, #95).
7. **Turnuva / organizasyon istekleri** (#38), tenis kortu (#40), saha rengi özelleştirme (#38).
8. **Reklam panosu anlaşmaları** (pazarlıklı, tekrarlanabilir) (#96).
9. **Müdüre minimum fiyat eşiği** ("maliyet kurtarmayan teklifi kabul etmesin") (#124).
10. **Şube gelirinin kasaya otomatik akması** (#123) — şu an gün sonu raporuyla geliyor.
11. **Kantin/tuvalet/duş görsel yerleşimi**: tek "sosyal tesis" binası ya da kenar dikey format (#125).
12. **Tam ekran modu** (#36), alt takvimi küçültme/katlama (#114).
13. **Tutorial / ilk 5 dakika yönlendirmesi** (#50, #6).
14. **Yıkımda kırmızı uyarı** (#26) — bu sürümde onay eklendi, görsel vurgusu tasarım isteği olarak duruyor.
15. **Kampanya/indirim mekanikleri** ("günleri dolduramazsak indirim yapalım") (#19).
16. **Basket/voleybol talep dengesi** (#89, #39, #51) — kortlara istek çok seyrek geliyor; talep üretimi ayarlanmalı (ekonomi ayarı, ayrıca bakılacak).
17. **Geç oyun pazarlık duvarı** (#87) — tesis büyüyünce gizli tavan fiyat artışına yetişemiyor; eğri ayarı gerekiyor.
18. **İngilizce çeviri eksikleri** (#24) — bazı metinler TR kalıyor; i18n taraması yapılmalı.
19. **FPS / performans modu** (#76, #43 mini saha animasyonu) — düşük cihaz profili.
20. **Karakter görselleri** (#35 kutu karakterler — sanayi sonrası model yükleme hatası; #51 polis üniformalı oyuncu) — sahne varlık taraması ayrıca yapılmalı.

### Bilinen eksikler (bu sürüme girmedi)
- #35 "adamlar kutuya dönüştü" (sanayi teması sonrası model yüklemesi) — görsel repro gerektiriyor.
- #33 mini saha takvim şeridi kayması — tekil repro bulunamadı; şerit ataması izlemede.
- #70 gün geçişinin gece yarısı yerine sabah 09:00'da olması tasarım gereği (yeni gün tesisin açılışında başlar).
- Pasif şubede evrak (`docs`) aşınması işlemiyor — bilinçli bırakıldı (oyuncu aleyhine işleyen bir sayacı pasifken çalıştırmak ceza gibi olurdu).
