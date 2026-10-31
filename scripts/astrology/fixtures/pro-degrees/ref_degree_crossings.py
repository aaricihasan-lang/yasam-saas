"""
BAĞIMSIZ REFERANS — derece geçişleri (1920-01-01 – 2151-01-01). Depo dışı motorlar; YALNIZ test referansı.

  • JPL DE440 (skyfield 1.55): yer merkezli GÖRÜNÜR konum (ışık zamanı + yıllık sapma + ışık bükülmesi), GERÇEK ekliptik ve ekinoks
    (skyfield framelib.ecliptic_frame = "ecliptic and equinox of date"). Gerçek düğüm: DE440 Ay yer merkezli durum vektöründen
    oskülasyon düğümü (h = r × v, tarih ekliptiği; Ω = atan2(hx, −hy)). Dosya: DE440 tam sürüm. Yol: ortam değişkeni DE440_BSP.
  • Ortalama düğüm: Swiss Ephemeris 2.10.03 (pyswisseph) MEAN_NODE (analitik formül, Moshier bayrağı) — gerçek ekinoksa göre.
  • Lahiri sidereal örneği: DE440 tropikal boylam − Swiss Ephemeris get_ayanamsa_ex (SIDM_LAHIRI, gerçek = nütasyonlu).

Yöntem (ürün motorundan BAĞIMSIZ): yoğun vektörel örnekleme (Ay/düğümler 1 sa, Güneş–Mars 3 sa, diğerleri 6 sa) → işaret değişimi →
vektörel ikiye bölme (60 adım, < 1 ms). İstasyon yakınında örnek adımından kısa ileri-geri geçişler kaçabilir → harness bunları
"istasyon sınırı" kuralıyla ayrı sayar (gizlenmez).

Çıktı (bu klasöre): ref-degree-crossings-2026-11-01.json — zamanlar TT ms (ms = (JD_TT − 2440587.5) × 86400000), yön +1/−1.

Çalıştırma: DE440_BSP=<yol>/de440.bsp python scripts/astrology/fixtures/pro-degrees/ref_degree_crossings.py
"""
import json
import os

import numpy as np
import swisseph as swe
from skyfield.api import load
from skyfield.framelib import ecliptic_frame

HERE = os.path.dirname(os.path.abspath(__file__))
UNIX_JD = 2440587.5
ts = load.timescale(builtin=True)
eph = load(os.environ["DE440_BSP"])
earth = eph["earth"]
TARGET = {
    "sun": eph["sun"], "moon": eph["moon"], "mercury": eph["mercury"], "venus": eph["venus"], "mars": eph["mars barycenter"],
    "jupiter": eph["jupiter barycenter"], "saturn": eph["saturn barycenter"], "uranus": eph["uranus barycenter"],
    "neptune": eph["neptune barycenter"], "pluto": eph["pluto barycenter"],
}
STEP_H = {"moon": 1, "true_node": 1, "mean_node": 6, "sun": 3, "mercury": 3, "venus": 3, "mars": 3}

# Önceden seçilmiş dereceler (0°/360° kenarı, burç sınırı yakını, kesirli, karşıt noktalar).
DEGREES = [0.0, 29.5, 123.456789, 180.0, 299.999, 359.95]
JD_A = 2422324.5  # 1920-01-01 TT
JD_B = 2506697.5  # 2151-01-01 TT


def lon_tt(body, jd_tt):
    t = ts.tt_jd(jd_tt)
    if body == "true_node":
        st = (eph["moon"] - earth).at(t)
        r, v = st.frame_xyz_and_velocity(ecliptic_frame)
        r, v = r.au, v.au_per_d
        h = np.cross(r.T, v.T).T if r.ndim > 1 else np.cross(r, v)
        return np.degrees(np.arctan2(h[0], -h[1])) % 360
    if body == "mean_node":
        jd = np.atleast_1d(jd_tt)
        return np.array([swe.calc(j, swe.MEAN_NODE, swe.FLG_MOSEPH)[0][0] for j in jd])
    lat, lon, _ = earth.at(t).observe(TARGET[body]).apparent().frame_latlon(ecliptic_frame)
    return lon.degrees % 360


def ayan(jd_tt):
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    return np.array([swe.get_ayanamsa_ex(j, swe.FLG_MOSEPH)[1] for j in np.atleast_1d(jd_tt)])


def w180(x):
    return (x + 180.0) % 360.0 - 180.0


def crossings(body, ja, jb, sidereal=False):
    f = (lambda j: (lon_tt(body, j) - ayan(j)) % 360) if sidereal else (lambda j: lon_tt(body, j))
    step = STEP_H.get(body, 6) / 24.0
    out = []
    chunk = 3650.0
    a = ja
    while a < jb:
        b = min(a + chunk, jb)
        jd = np.arange(a, b + step / 2, step)
        if jd[-1] < b:
            jd = np.append(jd, b)
        L = f(jd)
        for D in DEGREES:
            g = w180(L - D)
            idx = np.where((np.sign(g[:-1]) != np.sign(g[1:])) & (np.abs(g[:-1] - g[1:]) < 90))[0]
            if not len(idx):
                continue
            lo = jd[idx].copy()
            hi = jd[idx + 1].copy()
            glo = g[idx].copy()
            for _ in range(60):
                m = (lo + hi) / 2
                gm = w180(f(m) - D)
                same = np.sign(gm) == np.sign(glo)
                lo = np.where(same, m, lo)
                glo = np.where(same, gm, glo)
                hi = np.where(same, hi, m)
            root = (lo + hi) / 2
            direction = np.where(g[idx + 1] > g[idx], 1, -1)
            for r, d in zip(root, direction):
                out.append([D, round((r - UNIX_JD) * 86400000), int(d)])
        a = b
    out.sort(key=lambda x: x[1])
    # Parça sınırında aynı kökü iki kez saymayı engelle.
    ded = []
    for e in out:
        if ded and ded[-1][0] == e[0] and abs(ded[-1][1] - e[1]) < 1000 and ded[-1][2] == e[2]:
            continue
        ded.append(e)
    return ded


ref = {"meta": {"de440": os.path.basename(os.environ["DE440_BSP"]), "skyfield": "1.55", "swisseph": swe.version, "degrees": DEGREES}, "windows": []}
FULL = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "mean_node", "true_node"]
for b in FULL:
    ref["windows"].append({"body": b, "zodiac": "tropical", "jdA": JD_A, "jdB": JD_B, "events": crossings(b, JD_A, JD_B)})
    print(b, len(ref["windows"][-1]["events"]), flush=True)
# Ay: aralığa yayılmış 1'er yıllık pencereler (yoğun örnek maliyeti).
for y in [1920, 1945, 1961, 1972, 1999, 2016, 2026, 2050, 2077, 2100, 2101, 2125, 2150]:
    ja = swe.julday(y, 1, 1, 0.0)
    jb = swe.julday(y + 1, 1, 1, 0.0)
    for b in ["moon"]:
        ref["windows"].append({"body": b, "zodiac": "tropical", "jdA": ja, "jdB": jb, "events": crossings(b, ja, jb)})
    print(y, flush=True)
# Lahiri sidereal örneği
for b in ["sun", "mercury", "saturn"]:
    ja = swe.julday(2000, 1, 1, 0.0)
    jb = swe.julday(2030, 1, 1, 0.0)
    ref["windows"].append({"body": b, "zodiac": "sidereal_lahiri", "jdA": ja, "jdB": jb, "events": crossings(b, ja, jb, True)})

with open(os.path.join(HERE, "ref-degree-crossings-2026-11-01.json"), "w") as fh:
    json.dump(ref, fh, separators=(",", ":"))
print("tamam", sum(len(w["events"]) for w in ref["windows"]))
