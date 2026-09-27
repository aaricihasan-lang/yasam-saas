#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
§19 GOLDEN DATASET üreteci — BAĞIMSIZ referans (Swiss Ephemeris).
Seçili anlar için Güneş burcu, Ay burcu, retro-aktif gezegenler ve Güneş-Ay elongasyonunu
(faz çeyreği) SWE ile üretir. Çıktı stdout JSON → golden-dataset.json'a elle gömülür (immutable).
Production motorundan BAĞIMSIZ (ayrı ephemeris) → döngüsel doğrulama değil.
"""
import json
import swisseph as swe

FLAG = swe.FLG_MOSEPH | swe.FLG_SPEED
ZODIAC = ["Koç","Boğa","İkizler","Yengeç","Aslan","Başak","Terazi","Akrep","Yay","Oğlak","Kova","Balık"]
RETRO_BODIES = {"Merkür": swe.MERCURY, "Venüs": swe.VENUS, "Mars": swe.MARS, "Jüpiter": swe.JUPITER, "Satürn": swe.SATURN}

def norm(x): return ((x % 360.0) + 360.0) % 360.0

# (etiket, UTC y,m,d,h) — TR = UTC+3 ; buradaki saatler UTC.
INSTANTS = [
    ("2026-07-15 12:00 TR", 2026, 7, 15, 9.0),
    ("2030-11-10 09:00 TR", 2030, 11, 10, 6.0),
    ("2045-03-05 20:00 TR", 2045, 3, 5, 17.0),
]

def lon_speed(jd, body):
    xx, _ = swe.calc_ut(jd, body, FLAG)
    return xx[0], xx[3]

out = []
for label, y, m, d, h in INSTANTS:
    jd = swe.julday(y, m, d, h)
    sun_lon = lon_speed(jd, swe.SUN)[0]
    moon_lon = lon_speed(jd, swe.MOON)[0]
    sun_sign = ZODIAC[int(norm(sun_lon) // 30)]
    moon_sign = ZODIAC[int(norm(moon_lon) // 30)]
    elong = norm(moon_lon - sun_lon)  # 0=Yeni,90=İlk Dördün,180=Dolunay,270=Son Dördün
    retro = sorted([name for name, b in RETRO_BODIES.items() if lon_speed(jd, b)[1] < 0])
    out.append({
        "label": label, "utc": f"{y:04d}-{m:02d}-{d:02d}T{h:05.2f}Z",
        "sunSign": sun_sign, "moonSign": moon_sign,
        "sunMoonElongationDeg": round(elong, 2), "retroActive": retro,
    })

print(json.dumps(out, ensure_ascii=False, indent=2))
