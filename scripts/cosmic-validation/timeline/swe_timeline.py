#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Gunluk exact-aspect TIMELINE — BAGIMSIZ REFERANS (Swiss Ephemeris + zoneinfo).

Iki bagimsiz referans tek dosyada:
  1) PENCERE: Python `zoneinfo` (IANA tz DB) ile her fixture gununun
     [00:00, ertesi 00:00) yerel araligini UTC'ye cevirir. Bu, production
     getZonedDayRange (lib/location/tz.ts) DST mantigini BAGIMSIZ dogrular.
  2) OLAYLAR: Swiss Ephemeris (pyswisseph, FLG_MOSEPH) ile o UTC penceresindeki
     45 cift × 5 major acinin TUM exact anlarini bagimsiz enumere eder. Bu,
     production getExactAspectsInRange set-completeness'ini dogrular.

Cikti: swe-timeline.json  (compare_timeline.mjs, timeline-prod.json ile kiyaslar)

Production'a DOKUNMAZ; scripts/ app tarafindan import edilmez; .py derlenmez.
swe_reference.py ile AYNI efemeris yontemi (of-date apparent lon + speed) kullanilir.

Calistir:  python scripts/cosmic-validation/timeline/swe_timeline.py
"""

import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))

FLAG = swe.FLG_MOSEPH | swe.FLG_SPEED
BODY_ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
SWE_BODY = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mercury": swe.MERCURY, "Venus": swe.VENUS,
    "Mars": swe.MARS, "Jupiter": swe.JUPITER, "Saturn": swe.SATURN,
    "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO,
}
ASPECTS = [
    {"name": "Kavusum", "angle": 0}, {"name": "Sekstil", "angle": 60}, {"name": "Kare", "angle": 90},
    {"name": "Ucgen", "angle": 120}, {"name": "Karsit", "angle": 180},
]
BODY_INDEX = {n: i for i, n in enumerate(BODY_ORDER)}


def norm360(x):
    return ((x % 360.0) + 360.0) % 360.0


def wrap180(x):
    return norm360(x + 180.0) - 180.0


def lon_speed(jd, body):
    xx, _ = swe.calc_ut(jd, SWE_BODY[body], FLAG)
    return xx[0], xx[3]


def lon(jd, body):
    return lon_speed(jd, body)[0]


def signed_residual(jd, a, b, target):
    return wrap180((lon(jd, a) - lon(jd, b)) - target)


def targets_for(angle):
    if angle == 0:
        return [0.0]
    if angle == 180:
        return [180.0]
    return [float(angle), float(360 - angle)]


def step_for(a, b):
    if "Moon" in (a, b):
        return 0.1
    if any(x in ("Sun", "Mercury", "Venus", "Mars") for x in (a, b)):
        return 0.5
    return 2.0


def bisect(a, b, target, lo, hi):
    flo = signed_residual(lo, a, b, target)
    for _ in range(60):
        if (hi - lo) < (1.0 / 86400.0):
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


def jd_from_dt_utc(dt):
    """UTC datetime -> Julian Gun (UT)."""
    frac_hour = dt.hour + dt.minute / 60.0 + dt.second / 3600.0 + dt.microsecond / 3.6e9
    return swe.julday(dt.year, dt.month, dt.day, frac_hour, swe.GREG_CAL)


def iso_utc_from_jd(jd):
    y, m, d, h = swe.revjul(jd, swe.GREG_CAL)
    hh = int(h)
    mrem = (h - hh) * 60.0
    mm = int(mrem)
    ss = int(round((mrem - mm) * 60.0))
    if ss >= 60:
        ss -= 60; mm += 1
    if mm >= 60:
        mm -= 60; hh += 1
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, m, d, hh, mm, ss)


def iso_utc_from_dt(dt):
    u = dt.astimezone(timezone.utc)
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (u.year, u.month, u.day, u.hour, u.minute, u.second)


def zoned_day_window(year, month, day, tz):
    """Yerel [00:00, ertesi 00:00) -> (start_utc, end_utc) datetime (bagimsiz zoneinfo)."""
    z = ZoneInfo(tz)
    start_local = datetime(year, month, day, 0, 0, 0, tzinfo=z)
    nxt = (datetime(year, month, day) + timedelta(days=1))
    end_local = datetime(nxt.year, nxt.month, nxt.day, 0, 0, 0, tzinfo=z)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def enumerate_window(jd_start, jd_end):
    """[jd_start, jd_end) icindeki tum major exact olaylar (45 cift × 5 aci)."""
    events = []
    for i in range(len(BODY_ORDER)):
        for j in range(i + 1, len(BODY_ORDER)):
            ba, bb = BODY_ORDER[i], BODY_ORDER[j]  # zaten kanonik sira
            step = step_for(ba, bb)
            for asp in ASPECTS:
                for T in targets_for(asp["angle"]):
                    prev_jd = jd_start
                    prev_f = signed_residual(prev_jd, ba, bb, T)
                    t = jd_start
                    while t < jd_end:
                        nt = min(t + step, jd_end)
                        fn = signed_residual(nt, ba, bb, T)
                        if prev_f != 0.0 and (prev_f < 0.0) != (fn < 0.0) and abs(fn - prev_f) < 180.0:
                            x = bisect(ba, bb, T, prev_jd, nt)
                            # yari-acik: [jd_start, jd_end)
                            if jd_start <= x < jd_end:
                                la, sa = lon_speed(x, ba)
                                lb, sb = lon_speed(x, bb)
                                events.append({
                                    "bodyA": ba, "bodyB": bb,
                                    "aspect": asp["name"], "angle": asp["angle"],
                                    "jd": x, "iso": iso_utc_from_jd(x),
                                    "retroA": sa < 0, "retroB": sb < 0,
                                    "relSpeed": round(abs(sa - sb), 6),
                                    "residualArcsec": round(abs(signed_residual(x, ba, bb, T)) * 3600.0, 3),
                                })
                        prev_jd, prev_f = nt, fn
                        t = nt
    events.sort(key=lambda e: e["jd"])
    return events


def main():
    with open(os.path.join(HERE, "timeline-fixtures.json"), "r", encoding="utf-8") as fh:
        fs = json.load(fh)

    out_days = []
    for f in fs["days"]:
        s_utc, e_utc = zoned_day_window(f["year"], f["month"], f["day"], f["tz"])
        jd_start = jd_from_dt_utc(s_utc)
        jd_end = jd_from_dt_utc(e_utc)
        dur_h = round((e_utc - s_utc).total_seconds() / 3600.0, 4)
        evs = enumerate_window(jd_start, jd_end)
        print("  [%s] %s -> %.4gs, %d olay  [%s .. %s)" % (
            f["id"], f["tz"], dur_h, len(evs), iso_utc_from_dt(s_utc), iso_utc_from_dt(e_utc)))
        out_days.append({
            "id": f["id"], "label": f["label"], "tz": f["tz"], "category": f["category"],
            "year": f["year"], "month": f["month"], "day": f["day"],
            "startIso": iso_utc_from_dt(s_utc), "endIso": iso_utc_from_dt(e_utc),
            "durationHours": dur_h, "count": len(evs), "events": evs,
        })

    out = {
        "engine": "Swiss Ephemeris (pyswisseph %s, FLG_MOSEPH) + Python zoneinfo" % swe.version,
        "days": out_days,
    }
    path = os.path.join(HERE, "swe-timeline.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("\nBAGIMSIZ referans -> %s" % path)


if __name__ == "__main__":
    main()
