"""
HD TRANSİT — BAĞIMSIZ ASTRONOMİK REFERANS (Swiss Ephemeris, pyswisseph). Yerel TypeScript motorundan HİÇBİR kod kullanmaz.

  python scripts/hd-transit/swiss-ephemeris.py <ephe_klasörü> <roxy-live-validation.json> <çıktı.json>

- Efemeris: Swiss Ephemeris veri dosyaları (sepl_18/semo_18 ...; JPL DE tabanlı). Bulunamazsa HATA (Moshier'e düşülmez).
- Konum: geosentrik, görünen (aberasyon + nütasyon), tarihin tropikal ekliptiği; Kuzey Düğüm = SE_TRUE_NODE (osküle eden).
- Dünya = Güneş + 180°, Güney Düğüm = Kuzey Düğüm + 180°.
- Mandala: yayımlanmış Rave Mandala sırası — Kapı 41 2°00′ Kova'da (302°) başlar; her kapı 5°37′30″, her çizgi 56′15″.
"""
import json
import sys

import swisseph as swe

WHEEL_FROM_41 = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53,
                 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60]
assert sorted(WHEEL_FROM_41) == list(range(1, 65))
START_41 = 302.0
GATE = 360.0 / 64
LINE = GATE / 6

BODIES = [("Sun", swe.SUN), ("Moon", swe.MOON), ("Mercury", swe.MERCURY), ("Venus", swe.VENUS), ("Mars", swe.MARS), ("Jupiter", swe.JUPITER),
          ("Saturn", swe.SATURN), ("Uranus", swe.URANUS), ("Neptune", swe.NEPTUNE), ("Pluto", swe.PLUTO), ("NorthNode", swe.TRUE_NODE)]


def gate_line(lon):
    rel = (lon - START_41) % 360.0
    gi = int(rel // GATE)
    pos = rel - gi * GATE
    li = min(int(pos // LINE), 5)
    pl = pos - li * LINE
    return WHEEL_FROM_41[gi], li + 1, min(pl, LINE - pl) * 3600.0


def main():
    ephe, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    swe.set_ephe_path(ephe)
    data = json.load(open(src, encoding="utf-8"))
    res = {}
    for rid, r in data["results"].items():
        y, mo, d = int(r["utc"][0:4]), int(r["utc"][5:7]), int(r["utc"][8:10])
        hh, mm, ss = int(r["utc"][11:13]), int(r["utc"][14:16]), int(r["utc"][17:19])
        jd = swe.julday(y, mo, d, hh + mm / 60 + ss / 3600, swe.GREG_CAL)
        lons = {}
        for name, b in BODIES:
            xx, retflag = swe.calc_ut(jd, b, swe.FLG_SWIEPH | swe.FLG_SPEED)
            if not (retflag & swe.FLG_SWIEPH):
                raise SystemExit(f"Swiss Ephemeris dosyası kullanılmadı ({name} {r['utc']}) — Moshier'e düşülmez")
            lons[name] = (xx[0], xx[3])
        lons["Earth"] = ((lons["Sun"][0] + 180) % 360, lons["Sun"][1])
        lons["SouthNode"] = ((lons["NorthNode"][0] + 180) % 360, lons["NorthNode"][1])
        res[rid] = {name: {"lon": v[0], "speed": v[1], "gate": gate_line(v[0])[0], "line": gate_line(v[0])[1], "lineMarginArcsec": gate_line(v[0])[2]} for name, v in lons.items()}
    json.dump({"source": f"pyswisseph {swe.version} SWIEPH (JPL tabanlı dosyalar), apparent, true node", "results": res}, open(out, "w", encoding="utf-8"), indent=1)
    print(f"{len(res)} an hesaplandi -> {out}")


if __name__ == "__main__":
    main()
