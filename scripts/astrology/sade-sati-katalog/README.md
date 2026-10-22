# Sade Sati — Satürn geçiş kataloğu araçları (YALNIZ GELİŞTİRME / DOĞRULAMA)

Üretim kodu bu betikleri ÇALIŞTIRMAZ ve efemeris kütüphanesi İÇERMEZ; üretim yalnız sürümlü veri dosyasını
(`lib/astrology/sadeSati/saturnCatalog.ts`) okur.

| Betik | İş |
|---|---|
| `katalog_uret.py [yıl0] [yıl1]` | Satürn sidereal (Lahiri) burç geçişlerini Swiss Ephemeris (pyswisseph, `sepl_18.se1`) ile hesaplar: istasyonlar ikiye bölmeyle, monoton aralıklarda her 30° sınırı ikiye bölmeyle (1e-7 gün). Çıktı `catalog.json` + SHA-256. Aynı girdi → bayt bayt aynı çıktı. |
| `jpl_dogrula.py` | Her geçişi NASA/JPL Horizons (DE441) görünür ekliptik boylamıyla bağımsız doğrular (yalnız Satürn + zaman; kişisel veri yok). |
| `ts_uret.py <hedef.ts>` | `catalog.json` + `jpl_dogrulama.json` → `saturnCatalog.ts` (elle düzenlenmez). |

Sürüm 1 (22.10.2026): kapsam 1900–2100, 176 olay (tarama 1898–2103), SHA-256 `ef6852a8…`; Horizons 176/176, medyan |fark|
0,33 dk, en büyük 8,08 dk (≤2,5″ konum eşdeğeri; en büyük fark 2079 Güneş kavuşumu yakınında Horizons ışık sapması farkı, ΔT değil; NAIF DE440 çapraz kontrolü en büyük 0.16 dk). Katalog değişirse sürüm ve
`SADE_SATI_PERIODS_METHOD` damgası artırılmalıdır (eski kayıtlar eski damgayla kalır).

Lisans notu: Swiss Ephemeris (AGPL / ücretli profesyonel lisans) bir GELİŞTİRME aracı olarak kullanılır; ürün paketine girmez.
Katalog yalnız sayısal geçiş anlarıdır. JPL Horizons çıktısı kamu malı olarak BEYAN EDİLMEMİŞTİR (JPL/SSD SSS:
yayın için izin gerekebilir); Horizons yalnız çapraz doğrulamadır. Belgeli ticari yol: NAIF DE440 SPICE çekirdeği
(ticari kullanım serbest) + MIT kütüphane ile yeniden üretim — 176/176 olay aynı, en büyük fark 0,16 dk. Çıktı
verisinin lisans durumu ve pyswisseph betiklerinin depoda kalması owner/hukuk kararıdır (hukuki görüş değildir).
