"""
BAĞIMSIZ REFERANS — ephemerisTime kayan nokta sınırları (Z21–Z23). Depo dışı motor; YALNIZ test referansı.

astronomy-engine 2.1.19 AstroTime.FromTerrestrialTime, TT ile kütüphane-içi UT'nin J2000 ± 2^k gün sınırının iki yanına düştüğü
anlarda yakınsamaz (1920–2150'de 1955-02-22 11:59:29,5–12:00:00,6 UTC). Bu dosya o pencere ve diğer 2^k sınırları için JPL DE440
(skyfield 1.55) değerlerini üretir:
  • TT (skyfield ΔT) — girilen an UT1 kabul edilir (1961 öncesi `civil_as_ut` politikasıyla aynı tanım; 1961 sonrası an UTC'dir ve
    skyfield TT'si UTC'den kurulur),
  • Güneş / Ay / Merkür yer merkezli GÖRÜNÜR gerçek ekliptik boylamı (DE440, tarih ekliptiği),
  • GAST (skyfield, UT1).

Çıktı (bu klasör):
  • fp-boundaries-2026-11-01.json — 1955 penceresi + 1920–2150 içindeki 2^k sınırları (Z24).
  • fp-boundaries-historical-2026-11-01.json — 1920 öncesi takılma pencereleri (Z26): 2^15 − 1910-04-15, 2^16 − 1820-07-27,
    2^17 − 1641-02-19; her biri merkez ± (ΔT + 60 s) aralığında 4 s adım + kütüphanenin ölçülmüş takıldığı merkez anı.
Çalıştırma: DE440_BSP=<yol>/de440.bsp python scripts/astrology/fixtures/pro-time/gen_fp_boundaries.py
"""
import json
import os
from datetime import datetime, timedelta, timezone

from skyfield.api import load
from skyfield.framelib import ecliptic_frame

HERE = os.path.dirname(os.path.abspath(__file__))
ts = load.timescale(builtin=True)
eph = load(os.environ["DE440_BSP"])
earth = eph["earth"]
BODIES = {"sun": eph["sun"], "moon": eph["moon"], "mercury": eph["mercury"]}
UNIX = datetime(1970, 1, 1, tzinfo=timezone.utc)
J2000_MS = int((datetime(2000, 1, 1, 12, tzinfo=timezone.utc) - UNIX).total_seconds() * 1000)


def row(ms):
    jd = 2440587.5 + ms / 86_400_000
    if ms < int((datetime(1961, 1, 1, tzinfo=timezone.utc) - UNIX).total_seconds() * 1000):
        t = ts.ut1_jd(jd)  # 1961 öncesi: an UT kabul edilir (civil_as_ut)
    else:
        d = UNIX + timedelta(milliseconds=ms)
        t = ts.utc(d.year, d.month, d.day, d.hour, d.minute, d.second + d.microsecond / 1e6)
    lon = {}
    for k, b in BODIES.items():
        _, L, _ = earth.at(t).observe(b).apparent().frame_latlon(ecliptic_frame)
        lon[k] = L.degrees % 360
    return {"utcMs": ms, "ttJd": float(t.tt), "gastDeg": float(t.gast) * 15, "lon": lon}


rows = []
# 1) 1955-02-22 penceresi: 11:59:29 – 12:00:01 UTC, 0,5 s adım + ölçülmüş takılan anlar (12:00:00.000, 11:59:29.544, 12:00:00.549).
c = J2000_MS - 2 ** 14 * 86_400_000
for i in range(-62, 3):
    rows.append(row(c + i * 500))
for extra in (c - 30_456, c + 549):
    rows.append(row(extra))
# 2) Diğer 2^k sınırları (k = 0 … 15, ±) — 1920–2150 içinde kalanlar; merkez ve ±60 s.
lo = int((datetime(1920, 1, 1, tzinfo=timezone.utc) - UNIX).total_seconds() * 1000)
hi = int((datetime(2151, 1, 1, tzinfo=timezone.utc) - UNIX).total_seconds() * 1000)
for k in range(16):
    for sg in (-1, 1):
        m = J2000_MS + sg * 2 ** k * 86_400_000
        if lo <= m < hi:
            for off in (-60_000, 0, 60_000):
                rows.append(row(m + off))

with open(os.path.join(HERE, "fp-boundaries-2026-11-01.json"), "w") as fh:
    json.dump({"tool": "skyfield 1.55 + JPL DE440", "rows": rows}, fh, separators=(",", ":"))
print(len(rows))

# 3) 1920 öncesi takılma pencereleri (Z26). Pencere genişliği ≈ ΔT (TT ile UT 2^k sınırının iki yanına düşer); ±(ΔT + 60 s) taranır.
hist = []
for k, half_s in ((15, 72), (16, 76), (17, 113)):
    m = J2000_MS - 2 ** k * 86_400_000
    offs = sorted(set(range(-half_s * 1000, half_s * 1000 + 1, 4000)) | {0})
    for off in offs:
        r = row(m + off)
        r["k"] = k
        hist.append(r)
with open(os.path.join(HERE, "fp-boundaries-historical-2026-11-01.json"), "w") as fh:
    json.dump({"tool": "skyfield 1.55 + JPL DE440", "rows": hist}, fh, separators=(",", ":"))
print(len(hist))
