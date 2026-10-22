# Sade Sati — Satürn geçiş kataloğu araçları (YALNIZ GELİŞTİRME / DOĞRULAMA)

Üretim kodu bu betikleri ÇALIŞTIRMAZ ve efemeris kütüphanesi İÇERMEZ; üretim yalnız sürümlü veri dosyasını
(`lib/astrology/sadeSati/saturnCatalog.ts`) okur.

| Betik | İş |
|---|---|
| `katalog_uret.py [yıl0] [yıl1]` | Satürn sidereal (Lahiri) burç geçişlerini Swiss Ephemeris (pyswisseph, `sepl_18.se1`) ile hesaplar: istasyonlar ikiye bölmeyle, monoton aralıklarda her 30° sınırı ikiye bölmeyle (1e-7 gün). Çıktı `catalog.json` + SHA-256. Aynı girdi → bayt bayt aynı çıktı. |
| `jpl_dogrula.py` | Her geçişi NASA/JPL Horizons (DE441) görünür ekliptik boylamıyla bağımsız doğrular (yalnız Satürn + zaman; kişisel veri yok). |
| `ts_uret.py <hedef.ts>` | `catalog.json` + `jpl_dogrulama.json` → `saturnCatalog.ts` (elle düzenlenmez). |

Sürüm 1 (22.10.2026): kapsam 1900–2100, 176 olay (tarama 1898–2103), SHA-256 `ef6852a8…`; Horizons 176/176, medyan |fark|
0,33 dk, en büyük 8,08 dk (≤2,5″ konum eşdeğeri; uzak yıllarda ΔT öngörü farkı). Katalog değişirse sürüm ve
`SADE_SATI_PERIODS_METHOD` damgası artırılmalıdır (eski kayıtlar eski damgayla kalır).

Lisans notu: Swiss Ephemeris (AGPL / ücretli profesyonel lisans) bir GELİŞTİRME aracı olarak kullanılır; ürün paketine girmez.
Katalog yalnız sayısal geçiş anlarıdır ve JPL Horizons (ABD kamu verisi) ile bağımsız teyit edilmiştir. Ticari dağıtım için
hukuki teyit owner kararıdır.
