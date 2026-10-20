"""
HD VARIABLES — BAĞIMSIZ ASTRONOMİK REFERANS (Swiss Ephemeris, pyswisseph). TypeScript motorundan / Roxy'den kod KULLANMAZ.

  python scripts/hd-variables/swiss-ephemeris-variables.py <ephe_klasörü> <girdi.json> <çıktı.json>

Girdi: {"cases": [{"id": ..., "utc": "YYYY-MM-DDTHH:MM:SSZ"}]}
Her an için:
  • Personality: doğum anında Güneş ve Gerçek Kuzey Düğüm (SE_TRUE_NODE) — görünen, tarihin tropikal ekliptiği.
  • Design: Güneş'in doğum boylamından tam 88° geride olduğu an (ikiye bölme, < 0,001″) ve o andaki Güneş / Kuzey Düğüm.
  • Rave Mandala: Kapı 41 2°00′ Kova'da (302°); kapı 5°37′30″, çizgi 56′15″; Color = çizginin 1/6'sı, Tone = Color'ın 1/6'sı,
    Base = Tone'un 1/5'i (yayımlanmış alt yapı; Roxy sözleşmesiyle aynı tanım). Sınır mesafeleri yay-saniye.
Efemeris dosyası bulunamazsa HATA (Moshier'e düşülmez).
"""
import json
import sys

import swisseph as swe

WHEEL_FROM_41 = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53,
                 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60]
START_41 = 302.0
GATE = 360.0 / 64
LINE = GATE / 6
COLOR = LINE / 6
TONE = COLOR / 6
BASE = TONE / 5


def sub(lon):
    rel = (lon - START_41) % 360.0
    gi = min(int(rel // GATE), 63)
    pg = rel - gi * GATE
    li = min(int(pg // LINE), 5)
    pl = pg - li * LINE
    ci = min(int(pl // COLOR), 5)
    pc = pl - ci * COLOR
    ti = min(int(pc // TONE), 5)
    pt = pc - ti * TONE
    bi = min(int(pt // BASE), 4)
    return {
        "lon": lon, "gate": WHEEL_FROM_41[gi], "line": li + 1, "color": ci + 1, "tone": ti + 1, "base": bi + 1,
        "colorMarginArcsec": min(pc, COLOR - pc) * 3600.0, "toneMarginArcsec": min(pt, TONE - pt) * 3600.0,
        "baseMarginArcsec": min(pt - bi * BASE, (bi + 1) * BASE - pt) * 3600.0,
    }


def lon_at(jd, body):
    xx, rf = swe.calc_ut(jd, body, swe.FLG_SWIEPH)
    if not (rf & swe.FLG_SWIEPH):
        raise SystemExit("Swiss Ephemeris dosyası kullanılmadı — Moshier'e düşülmez")
    return xx[0] % 360.0


def jd_of(utc):
    y, mo, d = int(utc[0:4]), int(utc[5:7]), int(utc[8:10])
    hh, mm, ss = int(utc[11:13]), int(utc[14:16]), int(utc[17:19])
    return swe.julday(y, mo, d, hh + mm / 60 + ss / 3600, swe.GREG_CAL)


def angdiff(a, b):
    return ((a - b + 540.0) % 360.0) - 180.0


def design_jd(jd_birth):
    target = (lon_at(jd_birth, swe.SUN) - 88.0) % 360.0
    lo, hi = jd_birth - 95.0, jd_birth
    for _ in range(80):
        mid = (lo + hi) / 2
        if angdiff(lon_at(mid, swe.SUN), target) > 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def main():
    ephe, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    swe.set_ephe_path(ephe)
    cases = json.load(open(src, encoding="utf-8"))["cases"]
    res = {}
    for c in cases:
        jb = jd_of(c["utc"])
        jdd = design_jd(jb)
        res[c["id"]] = {
            "utc": c["utc"],
            "designJd": jdd,
            "determination": sub(lon_at(jdd, swe.SUN)),
            "environment": sub(lon_at(jdd, swe.TRUE_NODE)),
            "motivation": sub(lon_at(jb, swe.SUN)),
            "perspective": sub(lon_at(jb, swe.TRUE_NODE)),
        }
    json.dump({"source": f"pyswisseph {swe.version} SWIEPH (JPL tabanlı dosyalar), görünen, gerçek düğüm; Design = Güneş −88°",
               "results": res}, open(out, "w", encoding="utf-8"), indent=1)
    print(f"{len(res)} an hesaplandı -> {out}")


if __name__ == "__main__":
    main()
