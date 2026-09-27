# -*- coding: utf-8 -*-
"""
scripts/cosmic-longrange/fetch_jpl.py — NASA/JPL Horizons (DE441) referans efemerisini indirir (salt okuma).
Görünür, yer merkezli, tarihin ekliptiği (QUANTITIES=31, ObsEcLon), TT zaman ölçeği.
  • 10 cisim: 2026-01-01…2100-12-31, 5 günlük adım
  • Ay: ayrıca 6 saatlik adım (2026–2100)
Kullanım: python fetch_jpl.py <outDir>   (mevcut dosyalar yeniden indirilmez)
"""
import urllib.request, urllib.parse, os, sys, time
OUT = os.path.join(sys.argv[1], "jpl"); os.makedirs(OUT, exist_ok=True)
BODIES = {"sun": "10", "moon": "301", "mercury": "199", "venus": "299", "mars": "499", "jupiter": "599",
          "saturn": "699", "uranus": "799", "neptune": "899", "pluto": "999"}
def fetch(body, cmd, start, stop, step, tag):
    fn = os.path.join(OUT, f"{body}_{tag}.csv")
    if os.path.exists(fn) and os.path.getsize(fn) > 1000: return
    q = {"format": "text", "COMMAND": f"'{cmd}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'500@399'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
         "QUANTITIES": "'31'", "TIME_TYPE": "'TT'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'"}
    txt = urllib.request.urlopen("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q, safe="'"), timeout=300).read().decode()
    a, b = txt.find("$$SOE"), txt.find("$$EOE")
    if a < 0: raise SystemExit(f"JPL hata {body} {tag}: {txt[:300]}")
    with open(fn, "w") as f:
        for r in txt[a + 5:b].strip().splitlines():
            p = [x.strip() for x in r.strip().split(",")]
            f.write(f"{p[0]},{p[3]},{p[4]}\n")
    print(body, tag); time.sleep(1)
for body, cmd in BODIES.items():
    fetch(body, cmd, "2026-01-01", "2100-12-31", "5d", "2026_2100_5d")
for a, b in [("2026-01-01", "2050-12-31"), ("2051-01-01", "2075-12-31"), ("2076-01-01", "2100-12-31")]:
    fetch("moon", "301", a, b, "6h", f"{a[:4]}_{b[:4]}_6h")
