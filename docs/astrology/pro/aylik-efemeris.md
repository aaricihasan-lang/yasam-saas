# Gökyüzü Atlası — Aylık Efemeris (Batı tropikal · Vedik sideral)

2026-11-24 · Owner talimatı "Batı ve Vedik aylık efemerislerin tam geliştirilmesi".

## 1. Kapsam

| | Batı (Tropikal) | Vedik (Sideral) |
|---|---|---|
| Sağlayıcı ucu | `POST /astrology/planets/monthly` `{year, month}` | `POST /vedic-astrology/planetary-positions/monthly` `{year, month, coordinateSystem: "sidereal"}` |
| Cisimler | 14: Güneş…Plüton, Kuzey/Güney Ay Düğümü, Kiron, Kara Ay Lilith | 9: Güneş, Ay, Mars, Merkür, Jüpiter, Venüs, Satürn, Rahu, Ketu |
| Zodyak / ayanamsa | tropikal / yok | sideral / **yalnız Lahiri** (uçta başka seçenek yok) |
| Düğüm | **gerçek (oskülasyon)** — ölçüldü; belgedeki "düğümler hep retro" ifadesi verilerle çelişir | **ortalama** (belgeyle uyumlu, ölçüldü) |
| Satır anı | her gün **12:00 UTC** | her gün **12:00 UTC** |
| Alanlar | boylam (4 ondalık), burç, burç içi derece, retro | aynı |
| Ürün yıl aralığı | 1600–2600 (sağlayıcı belgesi 1551–2649; yerel bağımsız kontrolün ΔT tablosu 1600–2600) | aynı |

Bir ay = sağlayıcıya **en çok 1 istek** (ayın tamamı tek yanıt). Gün gün istek yoktur.

## 2. Kod

- `lib/astrology/pro/monthly/contract.ts` — istek doğrulama, gövde, katı izdüşüm (yankı, gün sayısı, tarih sırası, cisimler, burç/derece
  tutarlılığı, düğüm karşıtlığı; Kiron "ay bazında ya hep ya hiç").
- `crossCheck.ts` — her satırın aynı 12:00 UTC anında yerel JPL DE440 motoruyla bağımsız karşılaştırması (sunucu; tolerans aşağıda).
- `service.ts` — önbellek: süreç belleği → `astro_sky_monthly_cache` (tenant'sız) → sağlayıcı (tek uçuş, yeniden deneme yok).
- `records.ts` — kayıt/arşiv (`astro_sky_monthly_ephemeris`), içerik yalnız sunucu önbelleğinden.
- `format.ts`, `reportModel.ts`, `reportRender.ts` — ekran ve Word/PDF tek biçimleyiciyi kullanır (değerler birebir); rapor yatay A4.
- Rotalar: `app/api/admin/astroloji/efemeris/aylik/**` + uzman aynaları `app/api/astroloji/efemeris/aylik/**`.
- Ekran: `app/admin/astroloji/_components/ephemeris/MonthlyEphemerisDesk.tsx` (Gökyüzü Araçları → Efemeris sekmesi; mevcut ayrıntılı
  yerel tablo katlanır bölümde aynen korunur).
- Migration taslağı: `supabase/migrations/20280125000000_astro_sky_monthly_ephemeris.sql` (production'a UYGULANMADI).

## 3. Bağımsız doğrulama

Referanslar sağlayıcıdan bağımsızdır: Yaşam Sistemi yerel motoru (değiştirilmemiş NASA/JPL DE440 kerneli + IAU 2006/2000A; ayrıca
skyfield/SE/Horizons ile ≤0,1″ doğrulanmış) ve Kiron için NASA/JPL Horizons. Toleranslar ücretli çağrılardan ÖNCE kodda sabitlendi:

- Batı: |Δ| ≤ 1,0″ + ΔT payı; Vedik: |Δ| ≤ 1,5″ + ΔT payı (sağlayıcı Lahiri ↔ yerel ICRC-1956 Lahiri farkı dahil).
- ΔT payı = ΔT belirsizliği (1961–2027-06: 0) × cismin en büyük hızı (`accuracy.ts`).
- Retro bayrağı yerel anlık hızın işaretiyle aynı olmalı; |hız| < 2″/gün istasyon günü karşılaştırılmaz.

Kanıt testleri: `scripts/astrology/pro-monthly-ephemeris-provider.harness.ts` (gerçek yanıtlar; yerel kanıt) ve
`scripts/astrology/pro-monthly-ephemeris.harness.ts` (CI; sentetik).

Kiron ve Kara Ay Lilith'in çalışma anında yerel bağımsız motoru yoktur. Doğrulama durumu tek kaynaktan gelir
(`contract.ts` → `bodyVerification`):

- **Kiron — doğrulandı (1600–2100).** Referans: JPL Horizons ham ICRF vektörleri (geosantrik, ışık zamanı düzeltmeli, TDB) + yerel
  göreli sapma + IAU 2006/2000A gerçek ekliptik/ekinoks (gezegenlerle aynı çerçeve). 9 gerçek ay, 270 gün: en büyük fark 0,22″.
  İlk ölçümdeki 1600 "1,27″" farkı Horizons `QUANTITIES=31` çıktısının **IAU76/80 ekliptiğinden** geliyordu (hesap hatası değil):
  aynı çıktı DE440 ile doğrulanmış Mars'ta da 1600-01'de −1,07″, 2100-02'de −0,43″ verir. Tolerans değişmedi (1,0″).
  Sağlayıcının Kiron'u Swiss Ephemeris `seas_*.se1` dosyalarıyla birebir DEĞİLDİR (1600/1900/2100'de 0,6–0,9″ fark) — JPL'e daha yakındır.
  2101 ve sonrası için örnek yoktur (2600-12'de sağlayıcı Kiron vermez) → "⚠ doğrulanmamış".
- **Kara Ay Lilith — DOĞRULANAMADI.** Tanım: ortalama Ay apojesi; değerler Swiss Ephemeris `MEAN_APOG` ile 1900–2100'de ≤0,7″,
  1600/2600'de ≤2,4″ eşleşir (tanımı belirler, bağımsız kanıt sayılmaz). Meeus/ELP2000 ortalama perige polinomu 2–7′ farklıdır
  (tanım farkı). Aynı tanımı paylaşıp modeli paylaşmayan bağımsız referans bulunamadı → varsayılan görünümde gizli, kullanıcı
  açarsa "⚠" ile görünür, Word/PDF'e girmez (künyede adıyla yazılır); ham değer kayıtta saklanır.

**Doğrulama zorunlu (Owner kararı 2026-11-25).** Kullanıcıya, önbelleğe ve kayda yalnız bağımsız DE440 kontrolünden PASS
alan sonuç gider. DE440 motoru seçili değilse ya da kernel okunamıyorsa sağlayıcı HİÇ çağrılmaz (`independentCheckReady`;
`CROSSCHECK_UNAVAILABLE`, 503, geçici hata). Çağrıdan sonra kontrol yapılamazsa / istisna / NaN / eksik karşılaştırma olursa sonuç
reddedilir, hiçbir yere yazılmaz, yeniden denenmez. Önceden PASS almış önbellek ve kayıtlar aynen kullanılır; PASS dışı eski
satır/kayıt yerelde yeniden kontrol edilir (sağlayıcı çağrısı yok) — PASS değilse gösterilmez (`CROSSCHECK_FAILED` 502 /
`CROSSCHECK_UNAVAILABLE` 503).

## 4. Gösterim kuralları

- "Günlük konumlar: 12.00 UTC" her zaman görünür; Türkiye saati notu yalnız 2016-10 ve sonrası aylar için (öncesinde TR UTC+3 değildi).
- Art arda iki günde farklı burç = geçiş bu iki örnek arasında; kesin geçiş / retro başlama saati **türetilmez ve gösterilmez**.
- Derece ve dakika aşağı yuvarlanır (kesilir); saklanan değer 0,0001° tam boylamdır ("Tam boylam" görünümü).
- Gezegen gizle/göster ve gösterim biçimi yalnız görünüm filtresidir (istek yok).
- ΔT notu (`format.ts` → `deltaTNote`): ΔT öngörüsünün Ay'da ≥ 30″ kayma yaratabildiği dönemlerde (≈ 2070 sonrası) yöntem
  metninde ve rapor notlarında olası en büyük kayma açıkça yazılır (ör. 2600-12: Ay ±39′). Tablo değerleri değişmez.
- Erişilebilirlik: tablo kabı odaklanabilir adlandırılmış bölgedir (ok tuşlarıyla kayar) + görünmez `caption`; dokunmatik
  cihazlarda düğme/çip yüksekliği ≥ 40 px. Ekran matrisi: `scripts/astrology/monthly-ephemeris-ui-matrix.e2e.cjs`
  (1366/1440/1920 masaüstü, 320–412 telefon, 768 tablet — Playwright öykünmesi; fiziksel cihaz kabulü canlı yayın sonrasıdır).

## 4b. Maliyet koruması

- Bir ay = en çok 1 ücretli istek (ayın tamamı); süreç belleği → kalıcı önbellek → sağlayıcı; aynı ay için eşzamanlı istekler tek
  uçuşta birleşir; kalıcı önbellek okuması sırasında tamamlanan istek belleğe yeniden bakılarak ikinci kez ödenmez. Yeniden deneme yok.
- Filtre, gösterim biçimi, kayıt, arşivden açma ve Word/PDF sağlayıcıyı ÇAĞIRAMAZ (`allowProvider: false` / kayıtlı anlık görüntü).
- Yeni ay hesabından hemen önce sırayla: kullanıcı 30/saat → kullanıcı 150/gün → sistem geneli 200/saat → sistem geneli 1000/gün
  (`routeKit.ts` → `MONTHLY_PROVIDER_CAPS`). Önbellekteki aylar sayılmaz. Tüm olası farklı aylar 2 × 1001 × 12 = 24 024'tür; her biri
  kalıcı önbelleğe bir kez yazılır. Ayrıca tüm istekler kullanıcı 240/saat; uzman aynası deneme üyelik sayacından geçer.

## 5. Yayına geçiş sırası

1. Migration 20280125000000 (yedek + Owner onayı). Tablo yoksa: tablo yine görüntülenir (yalnız süreç belleği önbelleği), **kayıt 503**,
   sunucu örnekleri arasında önbellek paylaşılmaz (aynı ay birden çok kez ücretli istek üretebilir).
2. Deploy. Acil kapatma: `ATLAS_MONTHLY_EPHEMERIS_PROVIDER=0` (yeni sağlayıcı isteği yok; önbellek/kayıtlar açılır) ya da
   `ATLAS_PRO_EPHEMERIS_ENABLED=0` (Gökyüzü Araçları tamamen kapalı).
