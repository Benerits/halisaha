# HALI SAHA — Geliştirme Notları ve Yol Haritası

> Canlı tasarım defteri. Her maddenin yanında durum: ✅ bitti · 🔨 sırada · 💡 tasarım

## ÖZELLİK ENVANTERİ (tam liste)

### Rezervasyon & Pazarlık
- Telefon çalar → kart soldan kayar (yumuşak zil, kaçan müşteride üzgün ses)
- Esnek (%60: "hafta içi 19-22") / katı istekler; 2 SAATLİK maçlar (%18, fiyat x1.9,
  ardışık iki slotu kaplar, tek tıkla)
- Pazarlık: +%25 güvenli / +%50 riskli (gerçek rakamlı butonlar), gizli tavan
  okunur sinyallerden; ortayı bulma / "çok oldu abi" çekip gitme
- El sıkışınca süre donar; 45sn sonra nazik hatırlatma; GERİ ÇEVİR supabı
  (uygun slot kalmadıysa şerit açıkça söyler)
- Çırak: sabrı biten isteği kendisi yerleştirir; 2. hat: kuyruk 6

### Takvim
- Gün sekmeli tek şerit; BUGÜN rozeti; HUD "Pzt · 8" (aynı dil); başlıkta günün
  özeti ("Bugün Pazartesi · 2 maç · sıradaki 14:00 Emekliler"); geçmiş saat soluk
- Kapasite = saha sayısı; yarı dolu çapraz yeşil; dolu saate net red + shake
- Adaptif vurgu: ilk 12 yerleştirmede nabız, sonra sakin
- Yerleştirme modu: sarı halka + zıplayan şerit; "Cuma 21:00 seçildi ✓" onayı

### Ekonomi & Mağaza
- Kantin → Soğuk Su Dolabı, TOST MAKİNESİ (+₺45), BAKLAVA TEZGÂHI (+₺55)
- Krampon (+₺45), KALECİ KİRALAMA (+₺70, ₺150/g yevmiye), LED, Duş, Panolar,
  Yol Tabelası, Segment anlaşmaları (okul/çay ocağı/kurumsal fatura)
- Sosyal medya reklamı (tekrarlanabilir, 2 gün +%50)
- Haftalık kira (şube+saha ile artar), kesintisiz saat primi, günlük hedefler+ödül

### Arsa & Şubeler
- 3x3 parsel/şube; tapu şeridi; kur/YIK(%40); halı saha/mini/basket/voley/otopark/yeşil
- Mahalle / Sanayi(₺150k) / Sahil(₺400k); pasif şubeler müdürle gelir yazar

### Sahne
- Kenney: karakterler(halkalı forma), yollar(T-kavşak, yaya geçidi, lambalar),
  çift sıralı otopark, yeşil çatılı kulüp binası(tıklanabilir=YAZIHANE), ayaklı tabela
- Bot maç (akıcı), maça yürüyen oyuncular, iki yönlü+dikey trafik, gün/gece(yumuşak),
  sentez müzik+SFX (telifsiz)

## Mevcut Çekirdek (✅)
- Zero-friction döngü: telefon → kart → (pazarlık) → yanan slota tıkla → para
- Esnek/katı istekler, gizli tavanlı pazarlık (okunur ipuçları), müdavim sadakati
- Gün sekmeli çizelge, kapasite (2 saha = aynı saate 2 maç, yarı dolu slot görseli)
- Arsa sistemi: 3x3 parsel, tapu sınırı, kur/YIK (%40 iade): halı saha, mini saha,
  basketbol (₺800/g), voleybol (₺550/g), otopark, yeşil alan
- ŞUBELER: Mahalle / Sanayi (₺150k) / Sahil (₺400k) — kasa ortak, takvim+arsa şubeye ait,
  pasif şube müdür geliriyle işler, kira şube+saha sayısıyla artar
- Retention: günlük hedefler, milestone, haftalık kira baskısı, kesintisiz saat primi
- Çırak (telefona bakar), 2. hat, sosyal medya reklamı, sentez müzik (telifsiz)

## BİRDEN FAZLA SAHA — nasıl çalışıyor (✅ TAMAMLANDI)
✅ Şu an: saha sayısı = saat başına kapasite. Müşteri saat ister, saha atamasını
   tesis yapar (gerçek hayat da böyle). Yarı dolu slot çapraz yeşil, tam dolu "+1".
✅ SAHA TİPLERİ ayrıştı: kurumsalın %70'i "TAM SAHA" rozetiyle gelir — mini
   sahalara konamaz, tam saha kapasitesinden düşer. Karar: "tam sahayı şirkete mi
   saklayayım?" Saha seçtirme yok; canPlaceAt her şeyi bilir.

## PERSONEL SİSTEMİ (✅ TAMAMLANDI)
Amaç: büyüyünce mikro-yönetim cehennemine dönmesin; personel = otomasyonun fiziği.
✅ Şube Müdürü: ₺25k işe alım (₺600/g), ₺60k usta terfisi (₺1.000/g).
   Müdürsüz pasif şube gelirin %70'ini toplar; acemi %100, usta %110 + aktif
   şubede yerleştirirken %50 şansla +%10 zam koparır.
✅ "Müdüre bırak" modu: açıkken gelen istekleri müdür anında en iyi slota koyar.
✅ Çırak şube başına (₺8k + ₺350/g); Kantinci ₺6k + ₺400/g → kantin gelirleri +%25.
✅ Yazıhane > PERSONEL sekmesi: durum/maaş/etki + işe al-çıkar; personel şubeyle taşınır.
💡 v2: bakımcı şube başına; maaş/pasif oran uyarısı.

## ÇEVRE / GÖRSEL (🔨)
✅ Ev bahçeleri: beyaz kazıklı çit + eve dik yol + köşe ağacı + saksılar (düzenli)
✅ Sahil: kumsal + deniz + 5 şezlong + şemsiyeler; ✅ Sanayi: renkli konteynerler
✅ Gece: sokak lambaları gece parlıyor (glow); ✅ Maç: 3 kenar izleyicisi +
   sentez tezahürat (kalabalık uğultusu + düdük)
💡 v2: sahil plaj voleybolu, sanayi depo binaları (industrial kit)
💡 SAHA KALİTE BASAMAĞI: 'Zemin Yenileme' (₺20k: çim dokusunu tazele → taban fiyat
   +%8, itibar +0.2; 3 haftada eskir). Büyüme merdivenindeki eksik halka: gelir
   eklentileri → talep → KALİTE → kapasite → şube

## SES (✅)
✅ Şube geçişinde süpürme sesi; şube geliri raporu toast+ses
✅ Müzik şube ruhuna göre: mahalle sakin, sahil açık majör, sanayi koyu ritmik

## KISA VADELİ PÜRÜZLER (✅ hepsi kapandı)
- [x] Ev bahçeleri redesign
- [x] Tabela şubeye göre: HALI/SANAYİ/SAHİL SAHA
- [x] Şube çubuğunda dünkü net gelir rozeti (+/− renkli)
- [x] bestSlot/çırak/vurgular tek doğruluk kaynağında (canPlaceAt)

## TASARIM İLKELERİ (değişmez)
1. Sıfır sürtünme: oyuncu asla "şimdi ne yapacağım?" demez
2. Karar kıtlıktan doğar; kırtasiye otomasyona devredilir (personelin varlık sebebi)
3. Her yatırım sahnede FİZİKSEL iz bırakır
4. Yeşil=para, sarı=şimdi buraya bak, füme=çerçeve
5. Negatifsiz güç yok: her otomasyonun maaşı/riski var
