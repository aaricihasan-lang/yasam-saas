"""
HD VARIABLES — BAĞIMSIZ REFERANS FIXTURE ÜRETİCİ (Python; TypeScript kodu KULLANMAZ).

  python scripts/hd-variables/make-reference-fixtures.py <ephe_klasörü> <çıktı_klasörü>

1) math-reference.json — 2 400 boylam: rastgele + her Color/Tone/Base/çizgi/kapı sınırının ±1e-7° bitişiği.
   Beklenen kapı / çizgi / Color / Tone / Base, scripts/hd-variables/swiss-ephemeris-variables.py içindeki
   BAĞIMSIZ Python alt yapı hesabıyla (sub) üretilir.
2) se-births.json — 1 200 sentetik doğum anı (1900–2100, deterministik tohum): Swiss Ephemeris (JPL dosyaları)
   ile Personality / Design Güneş ve Gerçek Kuzey Düğüm → dört okun Color / Tone / Base + Tone sınır payı.
"""
import importlib.util
import json
import random
import sys
from datetime import datetime, timedelta, timezone

spec = importlib.util.spec_from_file_location("sev", __file__.replace("make-reference-fixtures.py", "swiss-ephemeris-variables.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import swisseph as swe


def main():
    ephe, out = sys.argv[1], sys.argv[2]
    swe.set_ephe_path(ephe)
    rng = random.Random(20261020)
    # 1) matematik
    lons = [rng.uniform(0, 360) for _ in range(1200)]
    for _ in range(300):
        base_k = rng.randrange(0, 64 * 6 * 6 * 6 * 5)
        edge = (m.START_41 + base_k * m.BASE) % 360.0
        lons += [(edge - 1e-7) % 360.0, (edge + 1e-7) % 360.0, (edge + m.BASE / 2) % 360.0, edge]
    math_cases = [dict(lon=l, **{k: v for k, v in m.sub(l).items() if k in ("gate", "line", "color", "tone", "base")}) for l in lons]
    json.dump({"source": "Python bağımsız alt yapı hesabı (swiss-ephemeris-variables.sub)", "cases": math_cases}, open(f"{out}/math-reference.json", "w", encoding="utf-8"))
    # 2) Swiss Ephemeris doğumları
    births = []
    t0 = datetime(1900, 3, 1, tzinfo=timezone.utc)
    span = (datetime(2100, 10, 1, tzinfo=timezone.utc) - t0).total_seconds()
    for i in range(1200):
        u = (t0 + timedelta(seconds=rng.uniform(0, span))).replace(second=0, microsecond=0)
        utc = u.strftime("%Y-%m-%dT%H:%M:%SZ")
        jb = m.jd_of(utc)
        jdd = m.design_jd(jb)
        row = {"id": f"S{i:04d}", "utc": utc}
        for key, jd, body in (("determination", jdd, swe.SUN), ("environment", jdd, swe.TRUE_NODE), ("motivation", jb, swe.SUN), ("perspective", jb, swe.TRUE_NODE)):
            s = m.sub(m.lon_at(jd, body))
            row[key] = {"lon": s["lon"], "color": s["color"], "tone": s["tone"], "base": s["base"], "toneMarginArcsec": s["toneMarginArcsec"]}
        births.append(row)
    json.dump({"source": f"pyswisseph {swe.version} SWIEPH (JPL), görünen, gerçek düğüm; Design = Güneş −88°", "births": births}, open(f"{out}/se-births.json", "w", encoding="utf-8"))
    print(f"math {len(math_cases)} · births {len(births)}")


if __name__ == "__main__":
    main()
