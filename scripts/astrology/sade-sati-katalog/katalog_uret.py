"""Satürn sidereal (Lahiri) burç geçiş kataloğu üreticisi — GELİŞTİRME/DOĞRULAMA aracı (üretimde çalışmaz).

Yöntem (deterministik):
  1. Satürn'ün istasyonları (ekliptik boylam hızının işaret değiştirdiği anlar) 1 günlük taramayla
     kaba bulunur, ikiye bölmeyle 1e-7 gün hassasiyetine indirilir.
  2. İki ardışık istasyon arasında hareket tek yönlüdür (monoton) → her 30° burç sınırı o aralıkta EN
     FAZLA BİR KEZ geçilir. Aralığın uçlarındaki burç farkından geçilen sınırlar bulunur ve her biri
     ikiye bölmeyle (1e-7 gün) çözülür. Böylece retro kaynaklı çoklu geçişlerin hiçbiri atlanmaz.
  3. Boylam: Swiss Ephemeris, geosantrik görünür, FLG_SIDEREAL + SIDM_LAHIRI (ortalama ekinoks;
     görünür boylam − gerçek ayanamsa ile eşdeğer, nütasyon iki tarafta sadeleşir).
Çıktı: catalog.json (olaylar + istasyonlar + üst veri) ve SHA-256 özeti. Aynı girdi → aynı çıktı.
Kullanım: python -X utf8 katalog_uret.py [başlangıç_yılı] [bitiş_yılı]
"""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone

import swisseph as swe

EPHE = "C:/ast80/ephem"
Y0 = int(sys.argv[1]) if len(sys.argv) > 1 else 1900
Y1 = int(sys.argv[2]) if len(sys.argv) > 2 else 2100
SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]

swe.set_ephe_path(EPHE)
swe.set_sid_mode(swe.SIDM_LAHIRI)
FLAGS = swe.FLG_SWIEPH | swe.FLG_SIDEREAL | swe.FLG_SPEED
EPH_USED = set()


def calc(jd):
    r, ret = swe.calc_ut(jd, swe.SATURN, FLAGS)
    EPH_USED.add("SWIEPH" if ret & swe.FLG_SWIEPH else ("MOSEPH" if ret & swe.FLG_MOSEPH else "OTHER"))
    return r[0] % 360.0, r[3]


def jd_of(y, m=1, d=1):
    return swe.julday(y, m, d, 0.0)


def iso(jd):
    y, mo, d, h = swe.revjul(jd)
    base = datetime(y, mo, d, tzinfo=timezone.utc) + timedelta(hours=h)
    base = (base + timedelta(microseconds=500_000)).replace(microsecond=0)
    return base.strftime("%Y-%m-%dT%H:%M:%SZ")


def bisect(f, a, b, tol=1e-7):
    fa = f(a)
    for _ in range(200):
        if b - a <= tol:
            break
        m = (a + b) / 2
        fm = f(m)
        if (fm < 0) == (fa < 0):
            a, fa = m, fm
        else:
            b = m
    return (a + b) / 2


def stations(j0, j1):
    out = []
    prev_j, prev_v = j0, calc(j0)[1]
    j = j0 + 1.0
    while j <= j1:
        v = calc(j)[1]
        if (v < 0) != (prev_v < 0):
            out.append(bisect(lambda t: calc(t)[1], prev_j, j))
        prev_j, prev_v = j, v
        j += 1.0
    return out


def unwrap_lon(jd, ref):
    lon = calc(jd)[0]
    return ref + ((lon - ref + 180.0) % 360.0) - 180.0


def crossings(j0, j1):
    st = stations(j0, j1)
    edges = [j0] + st + [j1]
    events = []
    for a, b in zip(edges, edges[1:]):
        la = calc(a)[0]
        lb = unwrap_lon(b, la)
        direct = lb > la
        lo, hi = (la, lb) if direct else (lb, la)
        k = int(lo // 30) + 1
        while k * 30 <= hi:
            boundary = k * 30.0
            f = lambda t, B=boundary, R=la: unwrap_lon(t, R) - B
            t = bisect(f, a, b)
            lon, speed = calc(t)
            to_sign = SIGNS[int(round(boundary / 30)) % 12] if direct else SIGNS[(int(round(boundary / 30)) - 1) % 12]
            from_sign = SIGNS[(int(round(boundary / 30)) - 1) % 12] if direct else SIGNS[int(round(boundary / 30)) % 12]
            # Belirsizlik: 1″ konum hatasının bu hızda doğurduğu zaman kayması (dakika) — duraklamaya yakın geçişlerde büyür.
            tol_min = (1.0 / 3600.0) / max(abs(speed), 1e-9) * 1440.0
            events.append({
                "jd": round(t, 7),
                "utc": iso(t),
                "from": from_sign,
                "to": to_sign,
                "motion": "direct" if direct else "retrograde",
                "speedDegPerDay": round(speed, 6),
                "toleranceMinutesPer1Arcsec": round(tol_min, 2),
            })
            k += 1
    events.sort(key=lambda e: e["jd"])
    return events, st


def main():
    j0, j1 = jd_of(Y0 - 2), jd_of(Y1 + 3)
    events, st = crossings(j0, j1)
    meta = {
        "catalog": "saturn-sidereal-lahiri",
        "version": "1",
        "coverageUtc": {"from": f"{Y0}-01-01T00:00:00Z", "to": f"{Y1}-12-31T23:59:59Z"},
        "scanUtc": {"from": iso(j0), "to": iso(j1)},
        "ephemeris": f"Swiss Ephemeris {swe.version} ({'/'.join(sorted(EPH_USED))}, sepl_18)",
        "frame": "geocentric apparent, sidereal Lahiri (SIDM_LAHIRI, mean equinox; equivalent to apparent − true ayanamsa)",
        "method": "stations by bisection (1e-7 d); monotonic segments; each 30° boundary solved by bisection (1e-7 d)",
        "bodies": "Saturn",
    }
    payload = {"meta": meta, "stations": [iso(s) for s in st], "events": events}
    canon = json.dumps({"stations": payload["stations"], "events": [{k: e[k] for k in ("utc", "from", "to", "motion")} for e in events]}, sort_keys=True, separators=(",", ":"))
    payload["meta"]["sha256"] = hashlib.sha256(canon.encode()).hexdigest()
    with open("catalog.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    inside = [e for e in events if meta["coverageUtc"]["from"] <= e["utc"] <= meta["coverageUtc"]["to"]]
    print(f"olay {len(events)} (kapsamda {len(inside)}), istasyon {len(st)}, efemeris {EPH_USED}, sha256 {payload['meta']['sha256']}")


if __name__ == "__main__":
    main()
