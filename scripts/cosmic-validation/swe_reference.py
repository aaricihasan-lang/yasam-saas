#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FAZ 2C / Adim 0 — BAGIMSIZ REFERANS URETICI (Swiss Ephemeris / pyswisseph)

Bu script, Astronomy Engine'den TAMAMEN BAGIMSIZ olarak, verilen test setindeki
pencerelerde her majur acinin EXACT (tam aci) anini Swiss Ephemeris ile bulur.
Cikti: swe-reference.json  (ae_exact.mjs ayni olaylari uretip compare.mjs kiyaslar)

ONEMLI:
  - Production koduna DOKUNMAZ. lib/, app/, UI ile iliskisi yoktur.
  - Next.js bundle'ina GIRMEZ (scripts/ asla app tarafindan import edilmez, .py derlenmez).
  - Efemeris dosyasi GEREKTIRMEZ: FLG_MOSEPH (Moshier) kullanir -> tasinabilir, deterministik.
    (Probe'da SWIEPH ile Moshier Gunes icin birebir ayni cikti; modern cag icin ~yay-saniye.)

Calistir:  python scripts/cosmic-validation/swe_reference.py
"""

import json
import os
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))

# Tropikal, jeosentrik, gorunur (apparent) boylam + hiz. Moshier -> dosyasiz.
FLAG = swe.FLG_MOSEPH | swe.FLG_SPEED

SWE_BODY = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mercury": swe.MERCURY, "Venus": swe.VENUS,
    "Mars": swe.MARS, "Jupiter": swe.JUPITER, "Saturn": swe.SATURN,
    "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO,
}

# ─── Aci yardimcilari ──────────────────────────────────────────────────────────

def norm360(x):
    return ((x % 360.0) + 360.0) % 360.0

def wrap180(x):
    """(-180, 180] araligina indir."""
    r = norm360(x + 180.0) - 180.0
    return r

def lon_speed(jd, body):
    """Tropikal ekliptik boylam (derece) ve gunluk hiz (derece/gun)."""
    xx, _rf = swe.calc_ut(jd, SWE_BODY[body], FLAG)
    return xx[0], xx[3]

def lon(jd, body):
    return lon_speed(jd, body)[0]

def signed_residual(jd, a, b, target):
    """f(jd) = wrap180( (lonA - lonB) - target ). Exact anda 0."""
    return wrap180((lon(jd, a) - lon(jd, b)) - target)

def targets_for(angle):
    if angle == 0:
        return [0.0]
    if angle == 180:
        return [180.0]
    return [float(angle), float(360 - angle)]

def step_for(a, b, override):
    if override is not None:
        return float(override)
    if "Moon" in (a, b):
        return 0.1            # ~2.4 saat (Ay hizli; uclu gecisi kacirmamak icin ince)
    if any(x in ("Sun", "Mercury", "Venus", "Mars") for x in (a, b)):
        return 0.5
    return 2.0

# ─── Tarih <-> Julian Gun (UT) ─────────────────────────────────────────────────

def jd_from_ymd(y, m, d):
    return swe.julday(y, m, d, 0.0, swe.GREG_CAL)

def iso_utc_from_jd(jd):
    y, m, d, h = swe.revjul(jd, swe.GREG_CAL)
    hh = int(h)
    mrem = (h - hh) * 60.0
    mm = int(mrem)
    ss = int(round((mrem - mm) * 60.0))
    if ss >= 60:
        ss -= 60
        mm += 1
    if mm >= 60:
        mm -= 60
        hh += 1
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, m, d, hh, mm, ss)

# ─── Kok bulma (bisection) ─────────────────────────────────────────────────────

def bisect(a, b, target, lo, hi):
    flo = signed_residual(lo, a, b, target)
    for _ in range(60):
        if (hi - lo) < (1.0 / 86400.0):   # 1 saniye hassasiyet
            break
        mid = (lo + hi) / 2.0
        fm = signed_residual(mid, a, b, target)
        if fm == 0.0:
            return mid
        if (flo < 0.0) == (fm < 0.0):
            lo, flo = mid, fm
        else:
            hi = mid
    return (lo + hi) / 2.0

# ─── Enumerasyon ───────────────────────────────────────────────────────────────

def enumerate_case(case, aspects, body_index):
    events = []
    bodies = case["bodies"]
    sy, sm, sd = [int(p) for p in case["start"].split("-")]
    ey, em, ed = [int(p) for p in case["end"].split("-")]
    jd_start = jd_from_ymd(sy, sm, sd)
    jd_end = jd_from_ymd(ey, em, ed)
    override = case.get("stepDays")

    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            # Kanonik sira (sabit body_index) -> id'ler iki tarafta da ayni
            ba, bb = bodies[i], bodies[j]
            if body_index[ba] > body_index[bb]:
                ba, bb = bb, ba
            step = step_for(ba, bb, override)

            for asp in aspects:
                for T in targets_for(asp["angle"]):
                    prev_jd = jd_start
                    prev_f = signed_residual(prev_jd, ba, bb, T)
                    t = jd_start
                    while t < jd_end:
                        nt = min(t + step, jd_end)
                        fn = signed_residual(nt, ba, bb, T)
                        # Isaret degisimi + sarma (wrap) atlamasi DEGIL -> gercek gecis
                        if prev_f != 0.0 and (prev_f < 0.0) != (fn < 0.0) and abs(fn - prev_f) < 180.0:
                            x = bisect(ba, bb, T, prev_jd, nt)
                            la, sa = lon_speed(x, ba)
                            lb, sb = lon_speed(x, bb)
                            events.append({
                                "case": case["id"],
                                "bodyA": ba, "bodyB": bb,
                                "aspect": asp["name"], "angle": asp["angle"],
                                "jd": x,
                                "iso": iso_utc_from_jd(x),
                                "lonA": round(la, 6), "lonB": round(lb, 6),
                                "speedA": round(sa, 6), "speedB": round(sb, 6),
                                "retroA": sa < 0, "retroB": sb < 0,
                                "relSpeed": round(abs(sa - sb), 6),
                                "residualArcsec": round(abs(signed_residual(x, ba, bb, T)) * 3600.0, 3),
                            })
                        prev_jd, prev_f = nt, fn
                        t = nt
    return events

def main():
    with open(os.path.join(HERE, "testset.json"), "r", encoding="utf-8") as fh:
        ts = json.load(fh)
    body_index = {name: idx for idx, name in enumerate(ts["bodyOrder"])}
    aspects = ts["aspects"]

    all_events = []
    for case in ts["cases"]:
        evs = enumerate_case(case, aspects, body_index)
        all_events.extend(evs)
        print("  [%s] %d olay" % (case["id"], len(evs)))

    all_events.sort(key=lambda e: (e["bodyA"], e["bodyB"], e["angle"], e["jd"]))
    out = {
        "engine": "Swiss Ephemeris (pyswisseph %s, FLG_MOSEPH)" % swe.version,
        "count": len(all_events),
        "events": all_events,
    }
    out_path = os.path.join(HERE, "swe-reference.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("TOPLAM %d referans olay -> %s" % (len(all_events), out_path))

if __name__ == "__main__":
    main()
