#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FAZ 3C / Adim 1 — BAGIMSIZ LUNAR ORBIT referansi (Swiss Ephemeris / pyswisseph)

Astronomy Engine'den BAGIMSIZ olarak:
  1A — Ay-Dunya GEOCENTRIC merkez-merkez mesafe + apsisler (perigee/apogee).
  1B — Yeniay/Dolunay (syzygy) zamanlari + o andaki mesafe + Nolle/Espenak %90
       supermoon/micromoon siniflandirmasi + sabit-esik capraz kontrol.
Cikti: swe-lunarorbit.json  (compare_lunarorbit.mjs kiyaslar).

ONEMLI: Production'a DOKUNMAZ. Efemeris dosyasi gerektirmez (FLG_MOSEPH).
SWE'de dogrudan ay-apsis fonksiyonu YOK -> mesafe ekstremumu (turev isaret degisimi
+ ikili arama) ile bagimsiz bulunur. Mesafe = xx[2] (AU) * auKm (geocentric).

Calistir:  python scripts/cosmic-validation/lunarorbit/swe_lunarorbit.py
"""

import json
import os
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
F = swe.FLG_MOSEPH | swe.FLG_SPEED

with open(os.path.join(HERE, "lunarorbit-testset.json"), "r", encoding="utf-8") as fh:
    TS = json.load(fh)
AU = TS["auKm"]
NOLLE = TS["nollePct"]
FIX_SUPER = TS["fixedSuperKm"]
FIX_MICRO = TS["fixedMicroKm"]

def moon_dist_km(jd):
    xx, _ = swe.calc_ut(jd, swe.MOON, F)
    return xx[2] * AU

def lon_diff(jd, target):
    m, _ = swe.calc_ut(jd, swe.MOON, F)
    s, _ = swe.calc_ut(jd, swe.SUN, F)
    return ((m[0] - s[0] - target + 180.0) % 360.0) - 180.0

def iso(jd):
    y, mo, d, h = swe.revjul(jd, swe.GREG_CAL)
    hh = int(h); mi = int((h - hh) * 60); ss = int(round((((h - hh) * 60) - mi) * 60))
    if ss >= 60: ss -= 60; mi += 1
    if mi >= 60: mi -= 60; hh += 1
    if hh >= 24: hh -= 24
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, mo, d, hh, mi, ss)

def jd_ymd(y, m, d):
    return swe.julday(y, m, d, 0.0, swe.GREG_CAL)

# ---- 1A: apsisler (mesafe ekstremumu) ----
H_DERIV = 1.0 / 1440.0  # 1 dk

def dist_deriv(jd):
    return moon_dist_km(jd + H_DERIV) - moon_dist_km(jd - H_DERIV)

def bisect_apsis(lo, hi):
    flo = dist_deriv(lo)
    for _ in range(50):
        if hi - lo < 1.0 / 86400.0: break
        mid = (lo + hi) / 2.0
        fm = dist_deriv(mid)
        if fm == 0.0: return mid
        if (flo < 0.0) == (fm < 0.0): lo, flo = mid, fm
        else: hi = mid
    return (lo + hi) / 2.0

def enumerate_apsides(jd0, jd1):
    out = []
    step = 0.25
    prev_jd = jd0
    prev = dist_deriv(jd0)
    t = jd0
    while t < jd1:
        nt = min(t + step, jd1)
        cur = dist_deriv(nt)
        if prev != 0.0 and (prev < 0.0) != (cur < 0.0):
            x = bisect_apsis(prev_jd, nt)
            kind = "perigee" if prev < 0.0 else "apogee"  # - to + = min
            out.append({"kind": kind, "timeJd": x, "timeUTC": iso(x), "distKm": round(moon_dist_km(x), 1)})
        prev_jd = nt; prev = cur; t = nt
    return out

# ---- 1B: syzygy + siniflandirma ----

def bisect_syzygy(lo, hi, target):
    flo = lon_diff(lo, target)
    for _ in range(50):
        if hi - lo < 1.0 / 86400.0: break
        mid = (lo + hi) / 2.0
        fm = lon_diff(mid, target)
        if fm == 0.0: return mid
        if (flo < 0.0) == (fm < 0.0): lo, flo = mid, fm
        else: hi = mid
    return (lo + hi) / 2.0

def enumerate_syzygies(jd0, jd1):
    out = []
    for target, phase in [(0.0, "yeniay"), (180.0, "dolunay")]:
        step = 0.5
        prev_jd = jd0
        prev = lon_diff(jd0, target)
        t = jd0
        while t < jd1:
            nt = min(t + step, jd1)
            cur = lon_diff(nt, target)
            if prev != 0.0 and (prev < 0.0) != (cur < 0.0) and abs(cur - prev) < 180.0:
                x = bisect_syzygy(prev_jd, nt, target)
                out.append({"phase": phase, "timeJd": x, "timeUTC": iso(x), "distKm": round(moon_dist_km(x), 1)})
            prev_jd = nt; prev = cur; t = nt
    out.sort(key=lambda s: s["timeJd"])
    return out

def bracketing_apsides(syz_jd, apsides):
    """syzygy'yi zamanca cevreleyen ardisik perigee+apogee."""
    perigee = apogee = None
    for i in range(len(apsides) - 1):
        if apsides[i]["timeJd"] <= syz_jd <= apsides[i + 1]["timeJd"]:
            a, b = apsides[i], apsides[i + 1]
            perigee = a if a["kind"] == "perigee" else b
            apogee = a if a["kind"] == "apogee" else b
            return perigee, apogee
    return None, None

def classify(syz, apsides):
    P, A = bracketing_apsides(syz["timeJd"], apsides)
    if P is None or A is None:
        return None
    pdist, adist = P["distKm"], A["distKm"]
    rng = adist - pdist
    pct = (syz["distKm"] - pdist) / rng if rng > 0 else 0.0
    return {
        "bracketPerigeeKm": pdist, "bracketApogeeKm": adist,
        "nollePct": round(pct, 4),
        "supermoon": pct <= NOLLE,
        "micromoon": pct >= (1.0 - NOLLE),
        "fixedSuper": syz["distKm"] <= FIX_SUPER,
        "fixedMicro": syz["distKm"] >= FIX_MICRO,
    }

def main():
    out_windows = []
    for w in TS["windows"]:
        sy, sm, sd = [int(x) for x in w["start"].split("-")]
        ey, em, ed = [int(x) for x in w["end"].split("-")]
        jd0 = jd_ymd(sy, sm, sd); jd1 = jd_ymd(ey, em, ed)
        # apsisleri pencereden +-20 gun genis tara (syzygy'leri cevrelemek icin)
        apsides_wide = enumerate_apsides(jd0 - 20.0, jd1 + 20.0)
        apsides = [a for a in apsides_wide if jd0 <= a["timeJd"] < jd1]
        syz = enumerate_syzygies(jd0, jd1)
        for s in syz:
            c = classify(s, apsides_wide)
            if c: s.update(c)
            else: s["noBracket"] = True
        # mesafe ornekleri (esit araliklarla)
        n = w.get("distanceSamples", 8)
        samples = []
        for k in range(n):
            jd = jd0 + (jd1 - jd0) * (k + 0.5) / n
            samples.append({"timeUTC": iso(jd), "distKm": round(moon_dist_km(jd), 1)})
        # yil ici en yakin/en uzak (apsis listesinden)
        peris = [a["distKm"] for a in apsides if a["kind"] == "perigee"]
        apos = [a["distKm"] for a in apsides if a["kind"] == "apogee"]
        out_windows.append({
            "id": w["id"], "apsides": apsides, "syzygies": syz, "distanceSamples": samples,
            "closestKm": min(peris) if peris else None, "farthestKm": max(apos) if apos else None,
        })
        print("  [%s] %d apsis, %d syzygy, %d mesafe ornegi" % (w["id"], len(apsides), len(syz), len(samples)))
    out = {"engine": "Swiss Ephemeris (pyswisseph %s, FLG_MOSEPH)" % swe.version,
           "auKm": AU, "nollePct": NOLLE, "windows": out_windows}
    with open(os.path.join(HERE, "swe-lunarorbit.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    tot_a = sum(len(x["apsides"]) for x in out_windows)
    tot_s = sum(len(x["syzygies"]) for x in out_windows)
    print("SWE: %d apsis, %d syzygy -> swe-lunarorbit.json" % (tot_a, tot_s))

if __name__ == "__main__":
    main()
