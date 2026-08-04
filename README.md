# HALI SAHA

> **"Salı 21:00 senindir."**
> Mahallenin tek halı sahasından şehrin spor kompleksine.

İzometrik tarayıcı tycoon oyunu. Bir halı saha tesisi işletiyorsun: rezervasyon isteklerini
takvime yerleştiriyor, abonelik anlaşmaları yapıyor, kantini çeviriyor ve ölü saatleri
dolduracak yatırımları planlıyorsun.

## Tasarım ilkesi: SIFIR SÜRTÜNME

BenelOil'den çıkardığımız en önemli ders: **oyuncu ne yapacağını tahmin etmek zorunda kalmasın.**
(BenelOil'de ilk 10 dakikayı geçen oyuncu oranı %61,9 — tutorial olmadan.)

Bu oyunda aynı ilke üç şekilde uygulanıyor:

1. **Tanıdık tema.** Halı saha herkesin bildiği bir yer; öğrenme maliyeti sıfır.
2. **Öneri kartları.** Ekranın solunda her zaman "şimdi ne yapmalıyım" cevabı var — ne yap,
   neden, kaça, ne kazandırır.
3. **Getiri/götürü yazılı.** Hiçbir yatırımın etkisi gizli değil: her satırda kazancı ve
   günlük gideri açıkça yazıyor.

## Çekirdek döngü

```
REZERVASYON İSTEĞİ  →  TAKVİME YERLEŞTİR  →  MAÇ OYNANIR
        ↑                                          ↓
   YATIRIM YAP  ←  PARA + İTİBAR  ←  GÜN SONU RAPORU
```

**Asıl beceri:** Prime time (20:00–23:00) zaten dolu. Oyunun zorluğu **ölü saatleri** (09:00–17:00)
doldurmak ve bunu ancak yeni müşteri segmentleri açarak yapabilmen:

| Segment | Saat | Nasıl açılır |
|---|---|---|
| Akşamcı takımlar | 18–23 | Başlangıç |
| Gençlik / okul | 14–18 | Okul anlaşması |
| Veteran / emekli | 09–13 | Çay ocağı |
| Şirket takımları | 12–17 | Kurumsal fatura |

## Abonelik sistemi

Gerçek halı saha işletmeciliğinin can damarı. "Her Salı 21:00, 8 hafta" diyen takım tek maçtan
%18 daha az öder ama slotu garantiler. Fazla abone bağlarsan prime-time esnekliğini kaybedersin
— optimal nokta %45-55 abonelik.

## Evrak sistemi

Ruhsat, spor tesisi izni, ilk yardım, yangın raporu… Belgeler zamanla eskiyor. Kimse durup
dururken sormaz — **olay çıkınca sorarlar.** Belge Takip Servisi bu riski kapatır.

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # ekonomi çekirdeği testleri (34 test)
npm run build
```

## Mimari

| Dosya | Sorumluluk |
|---|---|
| `src/state.ts` | Ekonomi, rezervasyon, abonelik, mağaza, öneri motoru — **three.js bilmez, test edilebilir** |
| `src/world.ts` | İzometrik three.js sahnesi: saha, bina, projektörler, bot futbolcular |
| `src/main.ts` | Arayüz + oyun döngüsü |
| `tools/tests/core-check.mjs` | Ekonomi testleri |

Kamera kurulumu ve tasarım dili BenelOil'den devralındı (ortografik izometrik ~24°,
krem/kırmızı tabela estetiği).

## Yol haritası

- **Faz 0** — prototip: çizelge mekaniği tek başına eğlenceli mi? ✅
- **Faz 1** — MVP: abonelik, evrak, kantin, bot maçlar ✅
- **Faz 2** — maç özeti paylaşım kartı, 2. lokasyon, kapalı test
- **Faz 3** — çok spor: voleybol, basketbol, tenis, padel (her biri farklı saat dilimini açar)
- **Faz 4** — lig modu: arkadaşlar kendi tesislerini kurar, aralarında lig
- **Faz 5** — Steam

## Durum

MVP çalışıyor: izometrik sahne, rezervasyon/takvim, abonelik, 11 yatırım kalemi,
öneri kartları, evrak/denetim, gün-gece döngüsü, bot futbol simülasyonu, otomatik kayıt.
