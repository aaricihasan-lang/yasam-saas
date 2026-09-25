#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
§21 — RETRO STATION BAGIMSIZ REFERANS (Swiss Ephemeris / pyswisseph)

Merkur/Venus/Mars/Jupiter/Saturn icin 2024-2050 arasindaki TUM retrograde/direct
station (donus) anlarini Swiss Ephemeris ile EXACT bulur. Station = ekliptik boylam
HIZININ (lon_speed) isaret degistirdigi an. Cikti: swe-retro-stations.json

Astronomy Engine'den BAGIMSIZ (ayri ephemeris). Production koduna DOKUNMAZ.
FLG_MOSEPH -> efemeris dosyasi gerektirmez, deterministik.

Calistir: python scripts/cosmic-presale/swe_retro_stations.py
"""
import json, os
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
FLAG = swe.FLG_MOSEPH | swe.FLG_SPEED

BODIES = {
    "Merkür": swe.MERCURY, "Venüs": swe.VENUS, "Mars": swe.MARS,
    "Jüpiter": swe.JUPITER, "Satürn": swe.SATURN,
}
# Tarama adimi (gun) — en kisa retro suresinden kucuk olmali.
STEP_DAYS = {"Merkür": 2, "Venüs": 3, "Mars": 3, "Jüpiter": 5, "Satürn": 5}

FROM_JD = swe.julday(2024, 1, 1, 0.0)
TO_JD   = swe.julday(2051, 1, 1, 0.0)  # 2050 dahil (exclusive ust sinir)

def speed(jd, body):
    xx, _ = swe.calc_ut(jd, body, FLAG)
    return xx[3]  # lon_speed (derece/gun)

def jd_to_iso(jd):
    y, m, d, h = swe.revjul(jd)
    hh = int(h); mm = int((h - hh) * 60); ss = int(round((((h - hh) * 60) - mm) * 60))
    if ss == 60: ss = 59
    return f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}:{ss:02d}Z"

def find_stations(body_name, body):
    step = STEP_DAYS[body_name]
    out = []
    prev = speed(FROM_JD, body)
    jd = FROM_JD
    while jd < TO_JD:
        njd = min(jd + step, TO_JD)
        cur = speed(njd, body)
        if prev != 0 and (cur > 0) != (prev > 0):
            # isaret degisti -> bisection ile station ani
            lo, hi = jd, njd
            for _ in range(40):
                mid = (lo + hi) / 2.0
                if (speed(mid, body) > 0) == (prev > 0):
                    lo = mid
                else:
                    hi = mid
            kind = "R" if prev > 0 else "D"  # +→- retrograde basladi ; -→+ direct
            out.append({"planet": body_name, "kind": kind, "jd": hi, "iso_utc": jd_to_iso(hi)})
        prev = cur
        jd = njd
    return out

def main():
    result = []
    for name, body in BODIES.items():
        result.extend(find_stations(name, body))
    path = os.path.join(HERE, "swe-retro-stations.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"SWE retro stations: {len(result)} -> {path}")

if __name__ == "__main__":
    main()
