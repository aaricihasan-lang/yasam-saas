"""
BAĞIMSIZ REFERANS — Ay evreleri ve tutulmalar (1920-01-01 – 2151-01-01). Depo dışı motorlar; YALNIZ test referansı.

  • JPL DE440 (skyfield 1.55): almanac.moon_phases (görünür, gerçek ekliptik boylam farkı) ve eclipselib.lunar_eclipses.
    Dosya: DE440 tam sürüm (1550–2650). Yol: ortam değişkeni DE440_BSP.
  • Swiss Ephemeris 2.10.03 (pyswisseph) MOSHIER (dosyasız analitik efemeris, FLG_MOSEPH): lun_eclipse_when, sol_eclipse_when_glob.
    Swiss UT değerini KENDİ ΔT'siyle verir → TT = UT + swe.deltat(UT) ile TT'ye çevrilir (karşılaştırma TT'de; ΔT modeli farkı ayrı).

Çıktı (bu klasöre): ref-lunations-2026-11-01.json — tüm zamanlar TT ms (J2000 ms ekseni: ms = (JD_TT − 2440587.5) × 86400000).

Çalıştırma: DE440_BSP=<yol>/de440.bsp python scripts/astrology/fixtures/pro-lunations/ref_lunations.py
"""
import json
import os

import swisseph as swe
from skyfield import almanac, eclipselib
from skyfield.api import load

HERE = os.path.dirname(os.path.abspath(__file__))
UNIX_JD = 2440587.5
ms_of_jd = lambda jd: round((jd - UNIX_JD) * 86400000)

ts = load.timescale(builtin=True)
eph = load(os.environ["DE440_BSP"])
t0 = ts.utc(1920, 1, 1)
t1 = ts.utc(2151, 1, 1)

# 1) Evreler (DE440)
t, y = almanac.find_discrete(t0, t1, almanac.moon_phases(eph))
phases = [[int(p), ms_of_jd(tt), ms_of_jd(ut)] for p, tt, ut in zip(y, t.tt, t.ut1)]

# 2) Ay tutulmaları (DE440, skyfield eclipselib): 0 yarı gölge, 1 parçalı, 2 tam
lt, ly, ld = eclipselib.lunar_eclipses(t0, t1, eph)
lunar_de440 = [[int(k), ms_of_jd(tt), float(ld["umbral_magnitude"][i]), float(ld["penumbral_magnitude"][i])] for i, (k, tt) in enumerate(zip(ly, lt.tt))]

# 3) Swiss Moshier tutulmaları
FL = swe.FLG_MOSEPH
jd_start = swe.julday(1920, 1, 1, 0.0)
jd_end = swe.julday(2151, 1, 1, 0.0)


def lunar_kind(f):
    return "total" if f & swe.ECL_TOTAL else "partial" if f & swe.ECL_PARTIAL else "penumbral" if f & swe.ECL_PENUMBRAL else "?"


def solar_kind(f):
    if f & swe.ECL_ANNULAR_TOTAL:
        return "hybrid"
    return "total" if f & swe.ECL_TOTAL else "annular" if f & swe.ECL_ANNULAR else "partial" if f & swe.ECL_PARTIAL else "?"


def tt_ms_from_ut(jd_ut):
    return ms_of_jd(jd_ut + swe.deltat_ex(jd_ut, FL))


lunar_swe = []
jd = jd_start
while True:
    res, tret = swe.lun_eclipse_when(jd, FL, 0)
    if tret[0] >= jd_end:
        break
    # tret: 0 max, 2 partial begin, 3 partial end, 4 total begin, 5 total end, 6 penumbral begin, 7 penumbral end (UT)
    lunar_swe.append({
        "kind": lunar_kind(res),
        "peakTt": tt_ms_from_ut(tret[0]),
        "contactsTt": [tt_ms_from_ut(x) if x > 0 else None for x in (tret[6], tret[7], tret[2], tret[3], tret[4], tret[5])],
    })
    jd = tret[0] + 10

solar_swe = []
jd = jd_start
while True:
    res, tret = swe.sol_eclipse_when_glob(jd, FL, 0, False)
    if tret[0] >= jd_end:
        break
    solar_swe.append({"kind": solar_kind(res), "peakTt": tt_ms_from_ut(tret[0])})
    jd = tret[0] + 10

json.dump(
    {
        "source": {
            "de440": "JPL DE440 (skyfield 1.55; almanac.moon_phases, eclipselib.lunar_eclipses)",
            "swiss": f"Swiss Ephemeris {swe.version} MOSHIER (FLG_MOSEPH; lun_eclipse_when, sol_eclipse_when_glob); UT→TT swe.deltat_ex",
            "range": "1920-01-01 – 2151-01-01",
            "timeAxis": "TT ms (JD_TT − 2440587.5) × 86400000",
        },
        "phasesDe440": phases,
        "lunarDe440": lunar_de440,
        "lunarSwe": lunar_swe,
        "solarSwe": solar_swe,
    },
    open(os.path.join(HERE, "ref-lunations-2026-11-01.json"), "w", encoding="utf-8"),
)
print(f"evre {len(phases)} · Ay tutulması DE440 {len(lunar_de440)} / Swiss {len(lunar_swe)} · Güneş tutulması Swiss {len(solar_swe)}")
