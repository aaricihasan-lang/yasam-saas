# WT-04 bağımsız referans: skyfield + JPL DE440, YOĞUN ÖRNEKLEME (motorun monoton-parça algoritmasından bağımsız kod).
# Geosantrik görünür boylam, gerçek ekliptik ve ekinoks (skyfield ecliptic_frame = true ecliptic & equinox of date).
# Zaman: girdi UTC; skyfield UTC→TT (artık saniye + IERS/ΔT). Kök: ızgara işaret değişimi + skaler ikiye bölme (≤0,5 sn).
# Kullanım: DE440_BSP=<de440.bsp> python de440_ref_v2.py scenarios.json <çıktı klasörü> [id1,id2]
import json, sys, math
import numpy as np
from skyfield.api import load
from skyfield.framelib import ecliptic_frame

import os
EPH = load(os.environ.get('DE440_BSP', 'C:/YasamSistemi-QA/ATLAS-ROXY-KABUL-2026-10-24/ham/de440.bsp'))  # JPL DE440 (kamu malı); CI'da ÇALIŞTIRILMAZ, yalnız fixture üretimi
ts = load.timescale()
earth = EPH['earth']
NAMES = {'sun': 'sun', 'moon': 'moon', 'mercury': 'mercury', 'venus': 'venus', 'mars': 'mars barycenter',
         'jupiter': 'jupiter barycenter', 'saturn': 'saturn barycenter', 'uranus': 'uranus barycenter',
         'neptune': 'neptune barycenter', 'pluto': 'pluto barycenter'}
ASP = {'conjunction': 0, 'semi_sextile': 30, 'semi_square': 45, 'sextile': 60, 'square': 90, 'trine': 120,
       'sesquiquadrate': 135, 'quincunx': 150, 'opposition': 180}

# AŞAMA 2 DÜZELTME (v2): eski `ts.utc(1970,1,1,0,0,ms/1000)` ARTIK SANİYELERİ SAYIYORDU → 1972 sonrası anlar 22–27 s ERKEN
# kuruluyordu. v2: TT, ortak zaman katmanının politikasıyla AYNI tanımla kurulur (lib/astrology/pro/time/scales.ts):
#   1972-01-01 ≤ UTC < 2027-06-28: TT = UTC + 32,184 + (TAI−UTC, IERS) · 1961–1971: USNO formülü · diğer: UT1 = an, TT = UT1 + ΔT_skyfield.
# Böylece motor ↔ referans farkı YALNIZ efemeris MODEL hatasını ölçer (zaman ölçeği farkı elenir).
_LEAP_JD = np.array([float(x) for x in ts.leap_dates]); _LEAP_OFF = np.array([float(x) for x in ts.leap_offsets])
_DRIFT = [(37300.0,1.4228180,37300,0.001296),(37512.0,1.3728180,37300,0.001296),(37665.0,1.8458580,37665,0.0011232),
          (38334.0,1.9458580,37665,0.0011232),(38395.0,3.2401300,38761,0.001296),(38486.0,3.3401300,38761,0.001296),
          (38639.0,3.4401300,38761,0.001296),(38761.0,3.5401300,38761,0.001296),(38820.0,3.6401300,38761,0.001296),
          (38942.0,3.7401300,38761,0.001296),(39004.0,3.8401300,38761,0.001296),(39126.0,4.3131700,39126,0.002592),
          (39887.0,4.2131700,39126,0.002592)]
_MS1961 = -283996800000.0; _MS1972 = 63072000000.0; _MSVALID = 1814140800000.0  # 1961-01-01, 1972-01-01, 2027-06-28 (UTC ms)
def tt_jd_policy(ms):
    ms = np.atleast_1d(np.asarray(ms, dtype=float)); jd = ms / 86400000.0 + 2440587.5; mjd = jd - 2400000.5
    out = np.empty_like(jd)
    leap = (ms >= _MS1972) & (ms < _MSVALID)
    if leap.any():
        i = np.searchsorted(_LEAP_JD, jd[leap], side='right') - 1
        off = np.where(i >= 0, _LEAP_OFF[np.clip(i, 0, None)], 10.0)
        out[leap] = jd[leap] + (off + 32.184) / 86400.0
    drift = (ms >= _MS1961) & (ms < _MS1972)
    if drift.any():
        v = np.zeros(drift.sum()); m = mjd[drift]
        for start, base, ref, rate in _DRIFT:
            sel = m >= start; v[sel] = base + (m[sel] - ref) * rate
        out[drift] = jd[drift] + (v + 32.184) / 86400.0
    other = ~(leap | drift)
    if other.any():
        out[other] = ts.ut1_jd(jd[other]).tt
    return out
def tms(ms):
    return ts.tt_jd(tt_jd_policy(ms))

def lon(body, ms):
    t = tms(ms)
    a = earth.at(t).observe(EPH[NAMES[body]]).apparent()
    _, l, _ = a.frame_latlon(ecliptic_frame)
    return l.degrees % 360.0

def wrap(x):
    return (x + 180.0) % 360.0 - 180.0

def bisect(f, lo, hi):
    flo = f(lo)
    for _ in range(80):
        if hi - lo <= 500: break
        m = (lo + hi) / 2
        fm = f(m)
        if (fm > 0) == (flo > 0): lo, flo = m, fm
        else: hi = m
    return (lo + hi) / 2

def speed(body, ms):
    # °/gün (TT): payda gerçek geçen TT (v2)
    d = (tt_jd_policy(ms + 3600e3)[0] - tt_jd_policy(ms - 3600e3)[0])
    return wrap(lon(body, ms + 3600e3)[0] - lon(body, ms - 3600e3)[0]) / d

def run(sc, outpath):
    t0, t1 = sc['startUtcMs'], sc['endUtcMs']
    bodies = sc['bodies']
    mb = sc.get('mundaneBodies') or bodies
    inc = sc['include']
    moon = 'moon' in bodies or (inc.get('mundane') and 'moon' in mb)
    step = 10 * 60e3 if moon else 2 * 3600e3
    grid = np.arange(t0, t1 + step, step)
    grid[-1] = t1
    allb = sorted(set(bodies) | (set(mb) if inc.get('mundane') else set()))
    L = {b: lon(b, grid) for b in allb}
    events = []
    orbs = sc.get('orbs') or {}
    def orb_of(a): return orbs.get(a, sc.get('defaultOrb', 1))

    tracks = []
    if inc.get('natal'):
        for a in bodies:
            for p in sc.get('natalPoints', []):
                tracks.append((f"{a}>{p['id']}", L[a] - p['lon'], (lambda ms, a=a, pl=p['lon']: lon(a, ms)[0] - pl)))
    if inc.get('mundane'):
        for i in range(len(mb)):
            for j in range(i + 1, len(mb)):
                a, b = mb[i], mb[j]
                tracks.append((f"{a}~{b}", L[a] - L[b], (lambda ms, a=a, b=b: lon(a, ms)[0] - lon(b, ms)[0])))

    def crossings(dgrid, dfun, level):
        f = wrap(dgrid - level)
        out = []
        idx = np.where((np.sign(f[:-1]) != np.sign(f[1:])) & (np.abs(f[:-1] - f[1:]) < 90))[0]
        for i in idx:
            r = bisect(lambda ms: wrap(dfun(ms) - level), grid[i], grid[i + 1])
            out.append((r, 1 if f[i + 1] > f[i] else -1))
        return out

    for key, dg, dfun in tracks:
        for asp in sc['aspects']:
            orb = orb_of(asp)
            T0 = ASP[asp]
            for T in ([T0] if T0 in (0, 180) else [T0, 360 - T0]):
                ex = crossings(dg, dfun, T)
                bnd = sorted(crossings(dg, dfun, T - orb) + crossings(dg, dfun, T + orb))
                inside = abs(wrap(dg[0] - T)) <= orb
                for ms, _ in ex:
                    events.append({'type': 'exact', 'key': f'{key}|{asp}|{T}', 'ms': ms})
                for ms, _ in bnd:
                    inside = not inside
                    events.append({'type': 'orb_enter' if inside else 'orb_exit', 'key': f'{key}|{asp}|{T}', 'ms': ms})
    for b in bodies:
        lg = L[b]
        if inc.get('stations') and b not in ('sun', 'moon'):
            sp = wrap(np.diff(lg))
            idx = np.where(np.sign(sp[:-1]) != np.sign(sp[1:]))[0]
            for i in idx:
                r = bisect(lambda ms: speed(b, ms), grid[i], grid[i + 2])
                events.append({'type': 'station', 'key': b, 'ms': r, 'station': 'retrograde' if sp[i + 1] < 0 else 'direct'})
        if inc.get('ingresses'):
            for k in range(12):
                for ms, d in crossings(lg, lambda ms, b=b: lon(b, ms)[0], 30 * k):
                    events.append({'type': 'ingress', 'key': b, 'ms': ms, 'level': 30 * k, 'dir': d})
    events.sort(key=lambda e: e['ms'])
    json.dump({'scenario': sc.get('id'), 'reference': 'JPL DE440 via skyfield 1.55 (apparent, true ecliptic of date); dense grid; v2 time policy = lib/astrology/pro/time (leap-second exact TT; no ts.utc seconds bug)', 'gridStepMs': step, 'count': len(events), 'events': [{**e, 'ms': round(e['ms'])} for e in events]}, open(outpath, 'w', encoding='utf8'))
    print(sc.get('id'), 'events', len(events), flush=True)

if __name__ == '__main__':
    import time
    scs = json.load(open(sys.argv[1], encoding='utf8'))
    only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
    for sc in scs:
        if only and sc['id'] not in only: continue
        t = time.time()
        run(sc, f"{sys.argv[2]}/ref-{sc['id']}.json")
        print('  sure', round(time.time() - t, 1), 's', flush=True)
