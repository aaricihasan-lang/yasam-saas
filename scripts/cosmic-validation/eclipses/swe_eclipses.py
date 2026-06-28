#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FAZ 3A / Adım 1A — BAĞIMSIZ ECLIPSE REFERANSI (Swiss Ephemeris / pyswisseph)

Astronomy Engine'den BAĞIMSIZ olarak 2026–2050 arası güneş (global + şehir-yerel)
ve ay tutulmalarını üretir. Cikti: swe-eclipses.json (compare_eclipses.mjs kıyaslar).

ÖNEMLI: Production'a DOKUNMAZ. Efemeris dosyası gerektirmez (FLG_MOSEPH).
SWE hibridi ECL_ANNULAR_TOTAL olarak verir; magnitude (attr[0]) ile obscuration
(attr[2]) AYRI alanlardır — yanlış etiketleme kontrolü için ikisi de kaydedilir.

Çalıştır:  python scripts/cosmic-validation/eclipses/swe_eclipses.py
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

def lunar_type(rf):
    if rf & swe.ECL_TOTAL:     return "total"
    if rf & swe.ECL_PARTIAL:   return "partial"
    if rf & swe.ECL_PENUMBRAL: return "penumbral"
    return "unknown(%d)" % rf

def enumerate_solar_global(start_jd, end_jd):
    out = []
    jd = start_jd
    while jd < end_jd and len(out) < 400:
        rf, tret = swe.sol_eclipse_when_glob(jd, F, 0, False)
        peak = tret[0]
        if peak >= end_jd: break
        clat = clon = mag = obsc = None
        try:
            rfw, geopos, attrw = swe.sol_eclipse_where(peak, F)
            clon, clat = geopos[0], geopos[1]
            if not (rf & swe.ECL_PARTIAL):   # partial globalde obscuration tanımsız (AE de undefined döner)
                mag, obsc = attrw[0], attrw[2]
        except Exception:
            pass
        out.append({
            "kind": solar_type(rf), "rawflag": rf,
            "peakUTC": iso(peak), "peakTR": iso(peak + 3.0 / 24.0),
            "centerLat": clat, "centerLon": clon,
            "magnitude": mag, "obscuration": obsc,
        })
        jd = peak + 2.0
    return out

def enumerate_lunar(start_jd, end_jd):
    out = []
    jd = start_jd
    while jd < end_jd and len(out) < 400:
        rf, tret = swe.lun_eclipse_when(jd, F, 0, False)
        peak = tret[0]
        if peak >= end_jd: break
        umbral = penumbral = None
        try:
            rfh, attr = swe.lun_eclipse_how(peak, [0.0, 0.0, 0.0], F)
            umbral, penumbral = attr[0], attr[1]
        except Exception:
            pass
        # süreler: tret[2..3]=partial begin/end, tret[4..5]=total begin/end, tret[6..7]=penumbral begin/end
        def dur(a, b):
            return None if (tret[a] == 0 or tret[b] == 0) else round((tret[b] - tret[a]) * 1440.0, 1)
        out.append({
            "kind": lunar_type(rf), "rawflag": rf,
            "peakUTC": iso(peak), "peakTR": iso(peak + 3.0 / 24.0),
            "umbralMag": umbral, "penumbralMag": penumbral,
            "durPenumMin": dur(6, 7), "durPartialMin": dur(2, 3), "durTotalMin": dur(4, 5),
        })
        jd = peak + 2.0
    return out

def enumerate_local_solar(start_jd, end_jd, city):
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
        if lmax >= end_jd: break
        out.append({
            "kind": solar_type(rf),
            "peakUTC": iso(lmax), "peakTR": iso(lmax + 3.0 / 24.0),
            "altitude": round(attr[5], 2),          # gerçek yükseklik (derece)
            "magnitude": round(attr[0], 4),
            "obscuration": round(attr[2], 4),
            "visible": bool(rf & swe.ECL_VISIBLE),
        })
        jd = lmax + 1.0
    return out

def main():
    with open(os.path.join(HERE, "eclipse-testset.json"), "r", encoding="utf-8") as fh:
        ts = json.load(fh)
    start_jd = swe.julday(ts["startYear"], 1, 1, 0.0)
    end_jd = swe.julday(ts["endYear"] + 1, 1, 1, 0.0)

    solar = enumerate_solar_global(start_jd, end_jd)
    lunar = enumerate_lunar(start_jd, end_jd)
    local = {}
    for city in ts["cities"]:
        local[city["name"]] = enumerate_local_solar(start_jd, end_jd, city)
        print("  [%s] %d yerel güneş tutulması" % (city["name"], len(local[city["name"]])))

    out = {
        "engine": "Swiss Ephemeris (pyswisseph %s, FLG_MOSEPH)" % swe.version,
        "solarGlobal": solar, "lunar": lunar, "localSolar": local,
    }
    with open(os.path.join(HERE, "swe-eclipses.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("SWE: %d global güneş, %d ay tutulması -> swe-eclipses.json" % (len(solar), len(lunar)))

if __name__ == "__main__":
    main()
