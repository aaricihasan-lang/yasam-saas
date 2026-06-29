#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FAZ 3B / Adım 1 — BAĞIMSIZ VOID OF COURSE referansı (Swiss Ephemeris / pyswisseph)

Astronomy Engine'den BAĞIMSIZ olarak:
  1A — Ay burç girişlerini (ingress) ve burç periyotlarını üretir.
  1B — Klasik VOC pencerelerini (Ay'ın klasik 6 cisme son exact majör aspekti → sonraki
       burç girişi) üretir. Dış gezegen/minör HARİÇ.
Çıktı: swe-voc.json  (compare_voc.mjs kıyaslar).

ÖNEMLI: Production'a DOKUNMAZ. Efemeris dosyası gerektirmez (FLG_MOSEPH).

Çalıştır:  python scripts/cosmic-validation/voidmoon/swe_voc.py
"""

import json
import os
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
F = swe.FLG_MOSEPH | swe.FLG_SPEED

SIGNS = ["Koç", "Boğa", "İkizler", "Yengeç", "Aslan", "Başak",
         "Terazi", "Akrep", "Yay", "Oğlak", "Kova", "Balık"]

SWE_BODY = {
    "Güneş": swe.SUN, "Merkür": swe.MERCURY, "Venüs": swe.VENUS,
    "Mars": swe.MARS, "Jüpiter": swe.JUPITER, "Satürn": swe.SATURN,
}

def moon_lon(jd):
    xx, _ = swe.calc_ut(jd, swe.MOON, F)
    return xx[0]

def body_lon(jd, body_id):
    xx, _ = swe.calc_ut(jd, body_id, F)
    return xx[0]

def sign_idx(jd):
    return int(moon_lon(jd) // 30) % 12

def wrap180(x):
    return ((x + 180.0) % 360.0) - 180.0

def iso(jd):
    y, mo, d, h = swe.revjul(jd, swe.GREG_CAL)
    hh = int(h); mi = int((h - hh) * 60); ss = int(round((((h - hh) * 60) - mi) * 60))
    if ss >= 60: ss -= 60; mi += 1
    if mi >= 60: mi -= 60; hh += 1
    if hh >= 24: hh -= 24
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, mo, d, hh, mi, ss)

def iso_tr(jd):
    return iso(jd + 3.0 / 24.0).replace("Z", "+03:00")

def targets(angle):
    if angle == 0: return [0.0]
    if angle == 180: return [180.0]
    return [float(angle), float(360 - angle)]

# ─── 1A: ingress / burç periyotları ─────────────────────────────────────────────

def bisect_ingress(lo, hi, prev_idx):
    for _ in range(50):
        if hi - lo < 1.0 / 86400.0: break
        mid = (lo + hi) / 2.0
        if sign_idx(mid) == prev_idx: lo = mid
        else: hi = mid
    return hi  # yeni burçtaki ilk an

def enumerate_occupancies(jd0, jd1):
    """[jd0,jd1] içindeki ingress'leri bulup ardışık burç periyotlarını döner."""
    ingresses = []  # (jd, signIdx)
    step = 0.25
    prev = sign_idx(jd0)
    t = jd0
    while t < jd1:
        nt = min(t + step, jd1)
        cur = sign_idx(nt)
        if cur != prev:
            ijd = bisect_ingress(t, nt, prev)
            ingresses.append((ijd, cur))
            prev = cur
        t = nt
    occ = []
    for i in range(len(ingresses) - 1):
        enter_jd, sidx = ingresses[i]
        exit_jd, nidx = ingresses[i + 1]
        occ.append({"sign": SIGNS[sidx], "nextSign": SIGNS[nidx],
                    "enterJd": enter_jd, "exitJd": exit_jd})
    return occ

# ─── 1B: VOC penceresi ──────────────────────────────────────────────────────────

ASPECTS = [(0, "Kavuşum"), (60, "Sekstil"), (90, "Kare"), (120, "Üçgen"), (180, "Karşıt")]

def bisect_aspect(lo, hi, body_id, T):
    def f(jd): return wrap180(moon_lon(jd) - body_lon(jd, body_id) - T)
    flo = f(lo)
    for _ in range(50):
        if hi - lo < 1.0 / 86400.0: break
        mid = (lo + hi) / 2.0
        fm = f(mid)
        if fm == 0.0: return mid
        if (flo < 0.0) == (fm < 0.0): lo, flo = mid, fm
        else: hi = mid
    return (lo + hi) / 2.0

def moon_exact_aspects(enter_jd, exit_jd):
    """Penceredeki tüm Ay×klasik6 exact majör aspektleri: (jd, body, aspect)."""
    res = []
    for bname, bid in SWE_BODY.items():
        for ang, aname in ASPECTS:
            for T in targets(ang):
                prev_jd = enter_jd
                prev_f = wrap180(moon_lon(prev_jd) - body_lon(prev_jd, bid) - T)
                t = enter_jd
                while t < exit_jd:
                    nt = min(t + 0.05, exit_jd)
                    fn = wrap180(moon_lon(nt) - body_lon(nt, bid) - T)
                    if prev_f != 0.0 and (prev_f < 0.0) != (fn < 0.0) and abs(fn - prev_f) < 180.0:
                        x = bisect_aspect(prev_jd, nt, bid, T)
                        res.append((x, bname, aname))
                    prev_jd = nt; prev_f = fn; t = nt
    return res

def build_voc(occ):
    asp = moon_exact_aspects(occ["enterJd"], occ["exitJd"])
    if asp:
        last = max(asp, key=lambda a: a[0])
        voc_start = last[0]; last_body = last[1]; last_type = last[2]; no_asp = False
    else:
        voc_start = occ["enterJd"]; last_body = None; last_type = None; no_asp = True
    voc_end = occ["exitJd"]
    return {
        "sign": occ["sign"], "nextSign": occ["nextSign"],
        "enterUTC": iso(occ["enterJd"]), "exitUTC": iso(occ["exitJd"]),
        "vocStartUTC": iso(voc_start), "vocStartTR": iso_tr(voc_start),
        "vocEndUTC": iso(voc_end), "vocEndTR": iso_tr(voc_end),
        "durationMin": round((voc_end - voc_start) * 1440.0, 1),
        "lastAspectBody": last_body, "lastAspectType": last_type,
        "noAspect": no_asp,
        "crosses0_360": occ["sign"] == "Balık" and occ["nextSign"] == "Koç",
    }

def main():
    with open(os.path.join(HERE, "voc-testset.json"), "r", encoding="utf-8") as fh:
        ts = json.load(fh)
    vocs = []
    for w in ts["windows"]:
        sy, sm, sd = [int(x) for x in w["start"].split("-")]
        ey, em, ed = [int(x) for x in w["end"].split("-")]
        jd0 = swe.julday(sy, sm, sd, 0.0)
        jd1 = swe.julday(ey, em, ed, 0.0)
        # Pencere sonundan ~4 gün öteye tara: son periyodun ÇIKIŞ ingress'i pencere dışında
        # olsa bile yakalanır (AE tarafıyla simetri).
        occ = enumerate_occupancies(jd0, jd1 + 4.0)
        # yalnız enter'ı pencere içinde olan tam periyotlar
        win = [o for o in occ if jd0 <= o["enterJd"] < jd1]
        for o in win:
            vocs.append(build_voc(o))
        print("  [%s] %d burç periyodu" % (w["id"], len(win)))
    out = {"engine": "Swiss Ephemeris (pyswisseph %s, FLG_MOSEPH)" % swe.version, "voc": vocs}
    with open(os.path.join(HERE, "swe-voc.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("SWE: %d VOC penceresi -> swe-voc.json" % len(vocs))

if __name__ == "__main__":
    main()
