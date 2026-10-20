"""
HD TRANSİT — yoğun Swiss Ephemeris taraması (ücretsiz; Roxy çağrısı YOK). Yerel motorun hata sınırlarını ölçmek için.
  python scripts/hd-transit/swiss-ephemeris-sweep.py <ephe_klasörü> <adet> <çıktı.json> [kaydırma=7919]
An i: 1900-01-01T00:00Z + i * (2100-12-31T23:59Z - başlangıç) / adet  (+ i*7919 sn kaydırma; deterministik).
Çıktı: { utcMs: [...], lon: { Sun: [...], ... } } — görünen konum, true node, SWIEPH dosyaları (Moshier'e düşülmez).
"""
import json
import sys
from datetime import datetime, timedelta, timezone

import swisseph as swe

BODIES = [("Sun", swe.SUN), ("Moon", swe.MOON), ("Mercury", swe.MERCURY), ("Venus", swe.VENUS), ("Mars", swe.MARS), ("Jupiter", swe.JUPITER),
          ("Saturn", swe.SATURN), ("Uranus", swe.URANUS), ("Neptune", swe.NEPTUNE), ("Pluto", swe.PLUTO), ("NorthNode", swe.TRUE_NODE)]


def main():
    ephe, n, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    shift = int(sys.argv[4]) if len(sys.argv) > 4 else 7919  # farklı kaydırma = örnek DIŞI yeni anlar
    swe.set_ephe_path(ephe)
    start = int(datetime(1900, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime(2100, 12, 31, 23, 59, tzinfo=timezone.utc).timestamp() * 1000)
    ms_list, lon = [], {b: [] for b, _ in BODIES}
    for i in range(n):
        ms = start + (end - start) * i // n + (i * shift * 1000 + shift * 37_000) % 86_400_000
        ms -= ms % 1000
        t = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=ms)
        jd = swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60 + t.second / 3600, swe.GREG_CAL)
        ms_list.append(ms)
        for name, b in BODIES:
            xx, flag = swe.calc_ut(jd, b, swe.FLG_SWIEPH)
            if not (flag & swe.FLG_SWIEPH):
                raise SystemExit("SWIEPH dosyası kullanılmadı")
            lon[name].append(round(xx[0], 9))
    json.dump({"source": f"pyswisseph {swe.version} SWIEPH apparent true-node", "utcMs": ms_list, "lon": lon}, open(out, "w"))
    print(f"{n} an -> {out}")


if __name__ == "__main__":
    main()
