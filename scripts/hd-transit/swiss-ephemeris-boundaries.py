"""
HD TRANSİT — GERÇEK (Swiss Ephemeris) kapı / çizgi sınır anları → test planı. Ücretsiz; Roxy çağrısı YOK.
  python scripts/hd-transit/swiss-ephemeris-boundaries.py <ephe> <çıktı.json>
Her vaka: SE ile bulunan kesişim anı ± δ (δ = hedef yay-saniyesi / SE hızı, tam saniyeye yuvarlanır). Mandala swiss-ephemeris.py ile aynı.
"""
import json
import math
import sys
from datetime import datetime, timedelta, timezone

import swisseph as swe

WHEEL_FROM_41 = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53,
                 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60]
GATE = 360.0 / 64
LINE = GATE / 6
BODY = {"Sun": swe.SUN, "Moon": swe.MOON, "Mercury": swe.MERCURY, "Venus": swe.VENUS, "Mars": swe.MARS, "Jupiter": swe.JUPITER, "Saturn": swe.SATURN,
        "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO, "NorthNode": swe.TRUE_NODE}
STEP_H = {"Moon": 0.1, "Sun": 0.5, "Mercury": 1, "Venus": 1, "Mars": 3, "Jupiter": 12, "Saturn": 24, "Uranus": 48, "Neptune": 72, "Pluto": 96, "NorthNode": 6}
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def jd_of(ms):
    t = EPOCH + timedelta(milliseconds=ms)
    return swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60 + t.second / 3600 + t.microsecond / 3.6e9, swe.GREG_CAL)


def lon(body, ms):
    xx, flag = swe.calc_ut(jd_of(ms), BODY[body], swe.FLG_SWIEPH | swe.FLG_SPEED)
    if not (flag & swe.FLG_SWIEPH):
        raise SystemExit("SWIEPH yok")
    return xx[0], xx[3]


def key(body, ms, kind):
    rel = (lon(body, ms)[0] - 302.0) % 360.0
    gi = int(rel // GATE)
    li = min(int((rel - gi * GATE) // LINE), 5)
    return (WHEEL_FROM_41[gi],) if kind == "gate" else (WHEEL_FROM_41[gi], li)


def crossing(body, kind, start_ms):
    step = int(STEP_H[body] * 3600_000)
    a = start_ms
    for _ in range(200000):
        b = a + step
        ka, kb = key(body, a, kind), key(body, b, kind)
        if ka != kb:
            lo, hi = a, b
            while hi - lo > 5:
                mid = (lo + hi) // 2
                if key(body, mid, kind) == ka:
                    lo = mid
                else:
                    hi = mid
            if kind == "gate" or key(body, lo, "gate") == key(body, hi, "gate"):
                return hi
        a = b
    raise SystemExit(f"kesişim yok {body} {kind}")


def iso(ms):
    return (EPOCH + timedelta(milliseconds=ms)).strftime("%Y-%m-%dT%H:%M:%SZ")


def ms_of(s):
    t = datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return int((t - EPOCH).total_seconds() * 1000)


def main():
    swe.set_ephe_path(sys.argv[1])
    cases = []
    plan = []
    # 2061 sonrası Ay (ΔT bölgesi): 8 farklı tarih × çizgi sınırı, ±1″ ve ±5″
    for s in ["2061-02-03T00:00:00Z", "2066-06-06T00:00:00Z", "2071-09-09T00:00:00Z", "2077-12-12T00:00:00Z", "2083-03-03T00:00:00Z", "2089-08-08T00:00:00Z", "2095-05-05T00:00:00Z", "2100-11-11T00:00:00Z"]:
        cases.append(("Moon", "line", s, [1, 5]))
    # Her cisim: farklı dönemlerde kapı sınırı ±1″ (en sert vaka)
    for body, s in [("Sun", "1912-04-01T00:00:00Z"), ("Moon", "1933-07-07T00:00:00Z"), ("Mercury", "1958-10-10T00:00:00Z"), ("Venus", "1979-01-15T00:00:00Z"),
                    ("Mars", "2004-05-05T00:00:00Z"), ("Jupiter", "2033-02-02T00:00:00Z"), ("Saturn", "2045-06-06T00:00:00Z"), ("Uranus", "2052-09-09T00:00:00Z"),
                    ("Neptune", "2068-03-03T00:00:00Z"), ("Pluto", "2081-01-01T00:00:00Z"), ("NorthNode", "2093-07-07T00:00:00Z")]:
        cases.append((body, "gate", s, [1]))
    n = 0
    for body, kind, start, targets in cases:
        t = crossing(body, kind, ms_of(start))
        _, speed = lon(body, t)
        per_ms = abs(speed) * 3600 / 86_400_000
        n += 1
        for tgt in targets:
            d = max(1000, round(tgt / per_ms / 1000) * 1000)
            for side, sign in (("before", -1), ("after", 1)):
                ms = t + sign * d
                ms -= ms % 1000
                plan.append({"id": f"S{n:02d}-{tgt}{'a' if side == 'before' else 'b'}", "utc": iso(ms), "scenario": f"{body} {'kapı' if kind == 'gate' else 'çizgi'} sınırı {'öncesi' if side == 'before' else 'sonrası'} (SE ~{tgt}″)",
                             "boundary": {"body": body, "kind": kind, "side": side, "crossingUtc": iso(t), "targetArcsec": tgt}})
    json.dump(plan, open(sys.argv[2], "w", encoding="utf-8"), indent=1)
    print(f"{len(plan)} sınır anı -> {sys.argv[2]}")


if __name__ == "__main__":
    main()
