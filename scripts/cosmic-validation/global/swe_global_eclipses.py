#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FAZ 5 / P5e-2 — GLOBAL yerel güneş tutulması referansı (Swiss Ephemeris / pyswisseph)

Astronomy Engine production motorundan BAĞIMSIZ olarak, 10 pilot global şehir için
2026–2050 arası yerel güneş tutulması şartlarını üretir:
  - peakUTC   (yerel maksimum anı, UTC)
  - altitude  (o an güneşin ufuk yüksekliği, derece)
  - obscuration (örtülme oranı — ALAN; magnitude DEĞİL)
  - magnitude (attr[0]; ayrı alan, yanlış-etiketleme kontrolü için)
  - visible   (ECL_VISIBLE bayrağı)

Çıktı: swe-global-eclipses.json (compare_global_eclipses.mjs kıyaslar).

ÖNEMLI:
  - Production'a / lib/cosmic/*'a DOKUNMAZ. Efemeris dosyası gerektirmez (FLG_MOSEPH).
  - FAZ 3A eclipses/swe_eclipses.py'nin enumerate_local_solar mantığının GLOBAL kopyasıdır;
    3A dosyasına dokunulmaz. Koordinatlar global-eclipse-testset.json'dan (world.ts kopyası).
  - Şehir anahtarı = testset "id" (aynı-isimli Paris/FR vs Paris/TX ayrımı için).

Çalıştır:  python scripts/cosmic-validation/global/swe_global_eclipses.py
"""

import json
import os
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
F = swe.FLG_MOSEPH


def iso(jd):
    y, mo, d, h = swe.revjul(jd, swe.GREG_CAL)
    hh = int(h); mi = int((h - hh) * 60); ss = int(round((((h - hh) * 60) - mi) * 60))
    if ss >= 60: ss -= 60; mi += 1
    if mi >= 60: mi -= 60; hh += 1
    if hh >= 24: hh -= 24
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, mo, d, hh, mi, ss)


def solar_type(rf):
    if rf & swe.ECL_ANNULAR_TOTAL: return "hybrid"
    if rf & swe.ECL_TOTAL:         return "total"
    if rf & swe.ECL_ANNULAR:       return "annular"
    if rf & swe.ECL_PARTIAL:       return "partial"
    return "unknown(%d)" % rf


def enumerate_local_solar(start_jd, end_jd, city):
    """FAZ 3A enumerate_local_solar ile birebir aynı mantık (koordinat + elev bazlı)."""
    out = []
    geopos = [city["lon"], city["lat"], city["elev"]]
    jd = start_jd
    while jd < end_jd and len(out) < 250:
        try:
            rf, tret, attr = swe.sol_eclipse_when_loc(jd, geopos, F, False)
        except Exception:
            break
        if rf == 0:
            break
        lmax = tret[0]
        if lmax >= end_jd:
            break
        out.append({
            "kind": solar_type(rf),
            "peakUTC": iso(lmax),
            "peakTR": iso(lmax + 3.0 / 24.0),
            "altitude": round(attr[5], 2),        # gerçek ufuk yüksekliği (derece)
            "magnitude": round(attr[0], 4),
            "obscuration": round(attr[2], 4),     # ALAN örtülme oranı
            "visible": bool(rf & swe.ECL_VISIBLE),
        })
        jd = lmax + 1.0
    return out


def main():
    with open(os.path.join(HERE, "global-eclipse-testset.json"), "r", encoding="utf-8") as fh:
        ts = json.load(fh)
    start_jd = swe.julday(ts["startYear"], 1, 1, 0.0)
    end_jd = swe.julday(ts["endYear"] + 1, 1, 1, 0.0)

    local = {}
    for city in ts["cities"]:
        rows = enumerate_local_solar(start_jd, end_jd, city)
        local[city["id"]] = rows
        vis = sum(1 for r in rows if r["altitude"] > 0)
        print("  [%-15s] %2d yerel güneş tutulması (%d ufuk üstü)" % (city["id"], len(rows), vis))

    out = {
        "engine": "Swiss Ephemeris (pyswisseph %s, FLG_MOSEPH)" % swe.version,
        "range": {"startYear": ts["startYear"], "endYear": ts["endYear"]},
        "cityCount": len(ts["cities"]),
        "localSolar": local,
    }
    with open(os.path.join(HERE, "swe-global-eclipses.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("SWE GLOBAL: %d şehir -> swe-global-eclipses.json" % len(ts["cities"]))


if __name__ == "__main__":
    main()
