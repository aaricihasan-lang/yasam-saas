"""Gökyüzü Atlası — DE440 konum motoru için BAĞIMSIZ referans üretici (03.11.2026). Ürün kodu KULLANILMAZ.

Kaynaklar (DE440 + skyfield ile AYNI veri/kod DEĞİL):
  K-SE  Swiss Ephemeris 2.10.03 (pyswisseph) SWIEPH dosyaları (sepl/semo_06,12,18,24 — Astrodienst, JPL DE431'den sıkıştırılmış;
        farklı veri sürümü + farklı indirgeme kodu, SE kendi presesyon/nütasyon modeli). Varsayılan: görünür, gerçek ekliptik/ekinoks.
  K-HZ  JPL Horizons API (DE441, JPL'in kendi indirgeme yazılımı): astrometrik ICRF α/δ (QUANTITIES=1) — ışık zamanı dahil, bükülme ve
        sapma YOK. Görünür α/δ (QUANTITIES=2) yalnız bilgi amaçlı (Horizons IAU76/80 + −53 mas ekinoks ofseti; model farkı beklenir).
  K-IERS IERS Conventions 2010 Tablo 5.3a/5.3b (IAU 2000_R06) — nütasyonun bu dosyadaki AYRI uygulaması (IERS 2003 temel argümanları).
  K-MO  Swiss Ephemeris Moshier (analitik, JPL'den tamamen bağımsız) — yalnız kaba sağlama (yay saniyesi düzeyi).
Olaylar (burç girişi, istasyon, derece geçişi) K-SE ile TT zaman ölçeğinde kök bulunarak üretilir (ΔT ayrıca ölçülür).

Çalıştırma:  SE_EPHE_PATH=<se1 klasörü> IERS_TAB_DIR=<tab5.3a/b klasörü> QA_DERECE=<ref-derece-kompakt.json> \
             python scripts/astrology/fixtures/pro-ephemeris-de440/ref_independent.py
Çıktı: scripts/astrology/fixtures/pro-ephemeris-de440/independent-ref.json
"""
import json, math, os, random, time, urllib.parse, urllib.request
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
swe.set_ephe_path(os.environ["SE_EPHE_PATH"])
SW = {"sun": swe.SUN, "moon": swe.MOON, "mercury": swe.MERCURY, "venus": swe.VENUS, "mars": swe.MARS, "jupiter": swe.JUPITER,
      "saturn": swe.SATURN, "uranus": swe.URANUS, "neptune": swe.NEPTUNE, "pluto": swe.PLUTO, "true_node": swe.TRUE_NODE, "mean_node": swe.MEAN_NODE}
PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]
HZ = {"sun": "10", "moon": "301", "mercury": "1", "venus": "2", "mars": "4", "jupiter": "5", "saturn": "6", "uranus": "7", "neptune": "8", "pluto": "9"}
J2000 = 2451545.0
DAYMS = 86400000.0
w180 = lambda x: (x + 180) % 360 - 180


def se(body, jd_tt, flags=0, eph=swe.FLG_SWIEPH):
    x, f = swe.calc(jd_tt, SW[body], eph | swe.FLG_SPEED | flags)
    if eph == swe.FLG_SWIEPH and (f & 7) != swe.FLG_SWIEPH:
        raise RuntimeError(f"SWIEPH dosyası kullanılmadı: {body} {jd_tt}")
    return x


# ─── 1. Anlar ───────────────────────────────────────────────────────────────────────────────────────
random.seed(20261103)
J1920, J2150 = 2422324.5, 2506696.5
J1600, J2600 = 2305447.5, 2670692.5
epochs = [J1920, J2150 - 1, J2000, 2471250.5] + [random.uniform(J1920, J2150 - 1) for _ in range(300)]
epochs += [random.uniform(J1600 + 1, J1920) for _ in range(40)] + [random.uniform(J2150, J2600 - 1) for _ in range(40)]
epochs = sorted(round(e, 6) for e in epochs)

# ─── 2. IERS 2010 Tablo 5.3a/b nütasyonu (bağımsız uygulama) ──────────────────────────────────────────
def load_iers(path, sin_first):
    blocks, cur = [], None
    for line in open(path, encoding="latin1"):
        s = line.split()
        if line.startswith("j = "):
            cur = []
            blocks.append(cur)
            continue
        if cur is None or len(s) != 17:
            continue
        try:
            i = int(s[0])
        except ValueError:
            continue
        a, b = float(s[1]), float(s[2])
        cur.append((a, b, [int(k) for k in s[3:]]))
    return blocks


TD = os.environ["IERS_TAB_DIR"]
PSI = load_iers(os.path.join(TD, "tab5.3a.txt"), True)   # A_i (sin), A"_i (cos)
EPS = load_iers(os.path.join(TD, "tab5.3b.txt"), False)  # B"_i (sin), B_i (cos)
ASR = math.pi / 180 / 3600


def fund_args(t):
    # IERS Conventions 2010 Bölüm 5.7.2 eş. 5.43 (Delaunay, Simon vd. 1994) ve 5.44 (gezegen boylamları, IERS 2003)
    l = (485868.249036 + 1717915923.2178 * t + 31.8792 * t**2 + 0.051635 * t**3 - 0.00024470 * t**4) * ASR
    lp = (1287104.79305 + 129596581.0481 * t - 0.5532 * t**2 + 0.000136 * t**3 - 0.00001149 * t**4) * ASR
    F = (335779.526232 + 1739527262.8478 * t - 12.7512 * t**2 - 0.001037 * t**3 + 0.00000417 * t**4) * ASR
    D = (1072260.70369 + 1602961601.2090 * t - 6.3706 * t**2 + 0.006593 * t**3 - 0.00003169 * t**4) * ASR
    Om = (450160.398036 - 6962890.5431 * t + 7.4722 * t**2 + 0.007702 * t**3 - 0.00005939 * t**4) * ASR
    pl = [4.402608842 + 2608.7903141574 * t, 3.176146697 + 1021.3285546211 * t, 1.753470314 + 628.3075849991 * t,
          6.203480913 + 334.0612426700 * t, 0.599546497 + 52.9690962641 * t, 0.874016757 + 21.3299104960 * t,
          5.481293872 + 7.4781598567 * t, 5.311886287 + 3.8133035638 * t, 0.02438175 * t + 0.00000538691 * t**2]
    return [l, lp, F, D, Om] + pl


def iers_nut(jd_tt):
    t = (jd_tt - J2000) / 36525
    fa = fund_args(t)
    dpsi = deps = 0.0
    for j, blk in enumerate(PSI):
        for a, b, m in blk:
            arg = sum(k * x for k, x in zip(m, fa))
            dpsi += (a * math.sin(arg) + b * math.cos(arg)) * t**j
    for j, blk in enumerate(EPS):
        for bs, bc, m in blk:
            arg = sum(k * x for k, x in zip(m, fa))
            deps += (bc * math.cos(arg) + bs * math.sin(arg)) * t**j
    return dpsi * 1e-6, deps * 1e-6  # yay saniyesi


# ─── 3. Konum satırları ─────────────────────────────────────────────────────────────────────────────
rows = []
for jd in epochs:
    b = {}
    for k in PLANETS:
        ec = se(k, jd)
        eq = se(k, jd, swe.FLG_EQUATORIAL)
        mo = se(k, jd, 0, swe.FLG_MOSEPH)
        b[k] = {"se": [ec[0], ec[1], eq[0], eq[1], ec[3]], "mo": [mo[0], mo[1]]}
    b["true_node"] = {"se": [se("true_node", jd)[0]]}
    b["mean_node"] = {"se": [se("mean_node", jd)[0]]}
    dpsi, deps = iers_nut(jd)
    nut = swe.calc(jd, swe.ECL_NUT, 0)[0]
    rows.append({"tt_jd": jd, "b": b, "nut_iers": [dpsi, deps], "se_true_obliquity": nut[0], "se_dpsi_arcsec": nut[2] * 3600})

# ─── 4. JPL Horizons (DE441) ────────────────────────────────────────────────────────────────────────
hz_epochs = epochs[::8]
hz = {}
for k, code in HZ.items():
    q = {"format": "text", "COMMAND": f"'{code}'", "CENTER": "'500@399'", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "TIME_TYPE": "TT",
         "TLIST": "'" + "' '".join(f"{e:.6f}" for e in hz_epochs) + "'", "QUANTITIES": "'1,2'", "ANG_FORMAT": "DEG", "EXTRA_PREC": "YES",
         "CSV_FORMAT": "YES", "OBJ_DATA": "NO", "TLIST_TYPE": "JD"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    txt = urllib.request.urlopen(url, timeout=120).read().decode()
    body = txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    vals = []
    for line in body:
        c = [x.strip() for x in line.split(",")]
        nums = [float(x) for x in c[1:] if x and x.replace(".", "").replace("-", "").replace("+", "").isdigit()]
        vals.append(nums[:4])  # astrometrik α, δ ; görünür α, δ
    assert len(vals) == len(hz_epochs), (k, len(vals))
    src = [l for l in txt.splitlines() if "Target body name" in l][0]
    hz[k] = {"source": src.strip(), "rows": vals}
    time.sleep(1)

# ─── 5. Olaylar (K-SE, TT) ─────────────────────────────────────────────────────────────────────────
def lon_tt(b, jd):
    return se(b, jd)[0]


def spd_tt(b, jd):
    return se(b, jd)[3]


def roots(f, a, z, step):
    out = []
    t, fa = a, f(a)
    while t < z:
        u = min(t + step, z)
        fu = f(u)
        if fa != 0 and (fa < 0) != (fu < 0) and abs(fa - fu) < 90:
            lo, hi, flo = t, u, fa
            while (hi - lo) * 86400 > 0.001:
                m = (lo + hi) / 2
                fm = f(m)
                if (fm < 0) == (flo < 0):
                    lo, flo = m, fm
                else:
                    hi = m
            out.append((lo + hi) / 2)
        t, fa = u, fu
    return out


STEP = {"moon": 1 / 24, "mercury": 0.25, "venus": 0.25, "sun": 0.25, "mars": 0.25, "true_node": 0.125}
jd_of = lambda y, m, d: swe.julday(y, m, d, 0.0)
ut2tt = lambda jd_ut: jd_ut + swe.deltat(jd_ut)


def ingresses(b, a, z):
    ev = []
    for k in range(12):
        D = k * 30.0
        for r in roots(lambda j: w180(lon_tt(b, j) - D), a, z, STEP.get(b, 0.5)):
            ev.append({"body": b, "kind": "ingress", "tt_jd": r, "toSign": k if spd_tt(b, r) >= 0 else (k + 11) % 12, "retro": spd_tt(b, r) < 0})
    return ev


def stations(b, a, z):
    if b in ("sun", "moon", "mean_node", "true_node"):
        return []
    return [{"body": b, "kind": "station", "tt_jd": r, "direction": "direct" if spd_tt(b, r + 0.01) > 0 else "retrograde"}
            for r in roots(lambda j: spd_tt(b, j), a, z, 0.25 if b in ("mercury", "venus") else 0.5)]


groups = [((2024, 1, 1), (2028, 1, 1), PLANETS + ["true_node", "mean_node"]), ((1900, 1, 1), (1901, 1, 1), ["mercury", "mars"]),
          ((2100, 1, 1), (2101, 1, 1), ["mercury", "venus"]), ((1650, 1, 1), (1651, 1, 1), ["sun", "mercury", "venus", "mars", "jupiter"]),
          ((2550, 1, 1), (2551, 1, 1), ["sun", "mercury", "venus", "mars", "saturn"]), ((1983, 6, 1), (1985, 6, 1), ["neptune", "uranus", "pluto"])]
events = []
for a, z, bodies in groups:
    A, Z = ut2tt(jd_of(*a)), ut2tt(jd_of(*z))
    for b in bodies:
        for e in ingresses(b, A, Z) + stations(b, A, Z):
            e["window"] = [list(a), list(z)]
            events.append(e)

pluto = {"D": 346.99, "start": "2052-03-17", "end": "2060-03-14",
         "tt_jd": roots(lambda j: w180(lon_tt("pluto", j) - 346.99), ut2tt(jd_of(2052, 3, 17)), ut2tt(jd_of(2060, 3, 15)), 1 / 24)}
pluto["dir"] = [1 if spd_tt("pluto", r) >= 0 else -1 for r in pluto["tt_jd"]]
st = roots(lambda j: spd_tt("pluto", j), ut2tt(jd_of(2055, 6, 1)), ut2tt(jd_of(2055, 7, 1)), 1 / 24)[0]
pluto["station_tt_jd"] = st
pluto["station_excess_arcsec"] = w180(lon_tt("pluto", st) - 346.99) * 3600

# ─── 6. 03.11 canlı QA derece vakaları (aynı vaka tanımları; K-SE TT ile yeniden kök) ─────────────────────
deg_cases = {}
qa = json.load(open(os.environ["QA_DERECE"]))
for group, cases in qa.items():
    out = []
    for body, degs, start, end, _moshier in cases:
        y0, m0, d0 = map(int, start.split("-"))
        y1, m1, d1 = map(int, end.split("-"))
        A, Z = ut2tt(jd_of(y0, m0, d0)), ut2tt(jd_of(y1, m1, d1) + 1)
        ev = []
        for D in degs:
            for r in roots(lambda j: w180(lon_tt(body, j) - D), A, Z, STEP.get(body, 0.5)):
                ev.append([D, r, 1 if spd_tt(body, r) >= 0 else -1])
        ev.sort(key=lambda e: e[1])
        out.append({"body": body, "degrees": degs, "start": start, "end": end, "events": ev, "moshier_ref": _moshier})
    deg_cases[group] = out

res = {"generated": "2026-11-03", "swisseph": swe.version, "ephe_files": sorted(os.listdir(os.environ["SE_EPHE_PATH"])),
       "rows": rows, "horizons": {"epochs_tt_jd": hz_epochs, "bodies": hz}, "events": events, "pluto_2055": pluto, "degree_cases": deg_cases,
       "deltat_se_sample": {str(y): swe.deltat(jd_of(y, 1, 1)) * 86400 for y in (1600, 1700, 1800, 1900, 1950, 2000, 2026, 2050, 2100, 2150, 2300, 2600)}}
json.dump(res, open(os.path.join(HERE, "independent-ref.json"), "w"), separators=(",", ":"))
print("ok", len(rows), "satır,", len(events), "olay, Plüton", len(pluto["tt_jd"]), "geçiş, aşım", round(pluto["station_excess_arcsec"], 3), "″")
