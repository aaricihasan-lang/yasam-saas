"""
BAĞIMSIZ REFERANS — Güneş tutulması GLOBAL başlangıç/bitiş (1920-01-01 – 2151-01-01). Depo dışı motor; YALNIZ test referansı.

  • Swiss Ephemeris 2.10.03 (pyswisseph) MOSHIER (dosyasız, FLG_MOSEPH): sol_eclipse_when_glob → tret[0] tepe, tret[2] başlangıç,
    tret[3] bitiş (UT). Swiss UT'yi KENDİ ΔT'siyle verir → TT = UT + swe.deltat_ex(UT) (karşılaştırma TT'de).
  • Ay tutulması temas referansı ayrı üretilmez: ref-lunations-2026-11-01.json "lunarSwe.contactsTt" (aynı Swiss sürümü) kullanılır.

Çıktı (bu klasöre): ref-solar-contacts-2026-11-02.json — tüm zamanlar TT ms (ms = (JD_TT − 2440587.5) × 86400000).
Çalıştırma: python scripts/astrology/fixtures/pro-lunations/ref_solar_contacts.py
"""
import json
import os

import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
FL = swe.FLG_MOSEPH
UNIX_JD = 2440587.5


def tt_ms(jd_ut):
    return round((jd_ut + swe.deltat_ex(jd_ut, FL) - UNIX_JD) * 86400000) if jd_ut > 0 else None


jd, jd_end = swe.julday(1920, 1, 1, 0.0), swe.julday(2151, 1, 1, 0.0)
solar = []
while True:
    res, tret = swe.sol_eclipse_when_glob(jd, FL, 0, False)
    if tret[0] >= jd_end:
        break
    solar.append([tt_ms(tret[0]), tt_ms(tret[2]), tt_ms(tret[3])])
    jd = tret[0] + 10

with open(os.path.join(HERE, "ref-solar-contacts-2026-11-02.json"), "w") as f:
    json.dump({"source": "Swiss Ephemeris %s Moshier sol_eclipse_when_glob" % swe.version, "fields": ["peakTt", "beginTt", "endTt"], "solar": solar}, f, separators=(",", ":"))
print(len(solar))
