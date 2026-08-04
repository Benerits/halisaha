# HALI SAHA — Geliştirme Notları ve Yol Haritası

> Canlı tasarım defteri. Her maddenin yanında durum: ✅ bitti · 🔨 sırada · 💡 tasarım

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

## BİRDEN FAZLA SAHA — nasıl çalışıyor (✅ / 💡 sıradaki katman)
✅ Şu an: saha sayısı = saat başına kapasite. Müşteri saat ister, saha atamasını
   tesis yapar (gerçek hayat da böyle). Yarı dolu slot çapraz yeşil, tam dolu "+1".
💡 Sıradaki: SAHA TİPLERİ ayrışsın — kurumsal "tam saha şart" der (miniye konamaz),
   gençlik miniye razı. Karar: "tam sahayı şirkete mi saklayayım?" Uygunluk etiketi
   kartta görünür; saha SEÇTİRME yok (kırtasiye değil karar).

## PERSONEL SİSTEMİ (🔨 majör — bir sonraki büyük iş)
Amaç: büyüyünce mikro-yönetim cehennemine dönmesin; personel = otomasyonun fiziği.
- **Şube Müdürü** (şube başına 1, maaş ₺X/gün):
  - Pasif şubede zaten var (gelir işletiyor) → görünür karaktere dönüşecek
  - Seviyesi: acemi müdür geliri %80 toplar, usta %100 + hafif pazarlık yapar
  - Aktif şubede: "müdüre bırak" modu — istekleri bestSlot'a otomatik koyar
- **Çırak** ✅ → her şubeye ayrı çırak gereksin (şube başına istihdam)
- **Kantinci**: kantin gelirini +%25 (yoksa akşam yoğunluğunda kantin geliri yarım)
- **Bakımcı** ✅ (tesis görevlisi) → şube başına; bakımsız saha itibar kanatır
- UI: Yazıhane > PERSONEL sekmesi — kart görünümü: isim, maaş, etki, işe al/çıkar
- Ekonomi kuralı: toplam maaş, pasif gelirin %60'ını geçmesin (idle'a kaymasın)

## ÇEVRE / GÖRSEL (🔨)
- **Ev bahçeleri yeniden**: mevcut lawn+path yamalık duruyor. Plan: ev başına
  çit (fence-low), düzgün bahçe yolu (eve dik), 1 ağaç + 2 çalı köşelere,
  bahçeye rastgele değil ızgara yerleşim; evle yol arasına kaldırım bağlantısı
- Sahil şubesi: plaj voleybolu görseli, şezlong/şemsiye, deniz kenarı yolu
- Sanayi şubesi: depo/fabrika binaları (kenney industrial kiti indirilebilir),
  tel örgü estetiği, konteyner dekorları
- Gece: sokak lambaları gece ışık halkası versin
- Maç kalabalığı: kenar izleyici karakterleri (2-3), tezahürat sesi (sentez)

## SES (💡)
- Şube geçişinde kısa "vınn" geçiş sesi; müdür raporu "cha-ching"
- Müzik: şube başına ton varyasyonu (sahil: daha açık majör; sanayi: ritmik)

## KISA VADELİ PÜRÜZLER
- [ ] Ev bahçeleri redesign (yukarıda)
- [ ] Sahil/sanayi şubelerinde tabela metni şubeye göre değişsin
- [ ] Şube çubuğunda her şubenin günlük geliri mini rozet olarak görünsün
- [ ] bestSlot çırak ile aynı mantığı kullansın (şu an ayrı tarama)

## TASARIM İLKELERİ (değişmez)
1. Sıfır sürtünme: oyuncu asla "şimdi ne yapacağım?" demez
2. Karar kıtlıktan doğar; kırtasiye otomasyona devredilir (personelin varlık sebebi)
3. Her yatırım sahnede FİZİKSEL iz bırakır
4. Yeşil=para, sarı=şimdi buraya bak, füme=çerçeve
5. Negatifsiz güç yok: her otomasyonun maaşı/riski var
