"""
BAĞIMSIZ REFERANS — Swiss Ephemeris (pyswisseph 2.10.03; yalnız depo dışı test referansı, üründe YOK).

roxy-natal-technical-2026-10-31.json içindeki her Placidus vakası için, TypeScript koduna dokunmadan:
  • ε (gerçek eğiklik): swe.calc_ut(jd_ut, swe.ECL_NUT)[0][0]
  • RAMC: sağlayıcı MC'sinden kapalı formül  RAMC = atan2(sin MC · cos ε, cos MC)
  • cusp'lar: swe.houses_armc(RAMC, φ, ε, b'R'|b'C'|b'O'|b'B')  (Regiomontanus, Campanus, Porphyry, Alcabitius)
  • ev yerleşimi: swe.house_pos(RAMC, φ, ε, (λ, 0), hsys) → int  (ekliptik boylam izdüşümü; enlem 0)
Çıktı: swe-natal-ref-2026-10-31.json

Çalıştırma: python scripts/astrology/fixtures/pro-natal-houses/swe_natal_ref.py
"""
import json
import math
import os
from datetime import datetime, timedelta, timezone

import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
SYS = {"regiomontanus": b"R", "campanus": b"C", "porphyry": b"O", "alcabitius": b"B"}


def jd_ut_of(echo):
    t = echo["time"] if len(echo["time"]) == 8 else echo["time"] + ":00"
    y, mo, d = (int(x) for x in echo["date"].split("-"))
    hh, mm, ss = (int(x) for x in t.split(":"))
    # Negatif timestamp / 1970 öncesi için datetime aritmetiği (Windows fromtimestamp tuzağı yok).
    local = datetime(y, mo, d, hh, mm, ss, tzinfo=timezone.utc)
    utc = local - timedelta(hours=echo["utcOffsetHours"])
    frac = (utc.hour + utc.minute / 60 + (utc.second + utc.microsecond / 1e6) / 3600)
    return swe.julday(utc.year, utc.month, utc.day, frac, swe.GREG_CAL)


def main():
    src = json.load(open(os.path.join(HERE, "roxy-natal-technical-2026-10-31.json"), encoding="utf-8"))
    out = []
    for c in src["cases"]:
        t = c["technical"]
        if t["houseSystem"] != "placidus" or not t.get("angles"):
            continue
        e = t["echo"]
        jd = jd_ut_of(e)
        eps = swe.calc_ut(jd, swe.ECL_NUT)[0][0]
        mc = t["angles"]["midheaven"]["longitude"]
        ramc = math.degrees(math.atan2(math.sin(math.radians(mc)) * math.cos(math.radians(eps)), math.cos(math.radians(mc)))) % 360
        lat = e["latitude"]
        pts = [(b["id"], b["longitude"]) for b in t["bodies"]]
        if t["points"].get("partOfFortune"):
            pts.append(("part_of_fortune", t["points"]["partOfFortune"]["longitude"]))
        if t["points"].get("vertex"):
            pts.append(("vertex", t["points"]["vertex"]["longitude"]))
        systems = {}
        for name, code in SYS.items():
            cusps, ascmc = swe.houses_armc(ramc, lat, eps, code)
            houses = {pid: int(math.floor(swe.house_pos(ramc, lat, eps, (lon, 0.0), code))) for pid, lon in pts}
            systems[name] = {"cusps": list(cusps[:12]), "asc": ascmc[0], "mc": ascmc[1], "houses": houses}
        out.append({"id": c["id"], "eps": eps, "ramc": ramc, "systems": systems})
    json.dump(
        {"source": f"pyswisseph {swe.version} houses_armc + house_pos; ε = swe ECL_NUT; RAMC = sağlayıcı MC kapalı formül", "cases": out},
        open(os.path.join(HERE, "swe-natal-ref-2026-10-31.json"), "w", encoding="utf-8"),
    )
    print(f"yazıldı: {len(out)} vaka")


if __name__ == "__main__":
    main()
