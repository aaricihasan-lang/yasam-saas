"""Vaka listesi: (A) harness senaryoları S1–S10, (B) canlı ana set 20 profil (03.11), (C) canlı ek set 20 profil, (D) sınır vakaları.
Sınır vakalarının natal boylamları Swiss Ephemeris SWIEPH istasyon boylamından türetilir (motordan DEĞİL)."""
import json, os, random, datetime
import swisseph as swe
HERE = os.path.dirname(os.path.abspath(__file__))
EPHE = os.environ["SE_EPHE_PATH"]  # sepl/semo/seas *.se1 (Astrodienst)
swe.set_ephe_path(EPHE)
FX = os.path.join(HERE, "..", "pro-transits", "scenarios.json")
QA = os.environ.get("QA_CANLI_HAM", "C:/YasamSistemi-QA/ATLAS-CANLI-DOGRULAMA-2026-11-03/ham")  # 03.11 canlı QA vaka tanımları
DAY = 86400000
SW = {"sun": 0, "moon": 1, "mercury": 2, "venus": 3, "mars": 4, "jupiter": 5, "saturn": 6, "uranus": 7, "neptune": 8, "pluto": 9}
FL = swe.FLG_SWIEPH | swe.FLG_SPEED
def ms_of(d): return int(datetime.datetime.fromisoformat(d + "T00:00:00+00:00").timestamp() * 1000)
def iso(ms): return (datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc) + datetime.timedelta(milliseconds=ms)).strftime("%Y-%m-%d")
def calc(b, jd_tt):
    xx, rf = swe.calc(jd_tt, SW[b], FL)
    assert rf & 7 == swe.FLG_SWIEPH, (b, jd_tt, rf)
    return xx
def jd_of_ms(ms): return ms / DAY + 2440587.5 + 69.0 / 86400  # yalnız vaka seçimi için yaklaşık TT
def stations(b, y0, y1):
    out = []; t = ms_of(f"{y0}-01-01"); end = ms_of(f"{y1}-01-01")
    sp = calc(b, jd_of_ms(t))[3]
    while t < end:
        t2 = t + DAY; sp2 = calc(b, jd_of_ms(t2))[3]
        if (sp > 0) != (sp2 > 0):
            lo, hi, slo = t, t2, sp
            while hi - lo > 1000:
                m = (lo + hi) / 2; s = calc(b, jd_of_ms(m))[3]
                if (s > 0) == (slo > 0): lo, slo = m, s
                else: hi = m
            m = (lo + hi) / 2
            out.append((m, "retrograde" if sp > 0 else "direct", calc(b, jd_of_ms(m))[0]))
        t, sp = t2, sp2
    return out
cases = []
# (A)
for s in json.load(open(FX, encoding="utf8")):
    c = {k: v for k, v in s.items() if k != "note"}; c["group"] = "harness"; cases.append(c)
# (B) canlı ana set — r_transit.py ile aynı: 9 gövde (Ay yok) × 9 natal nokta × 5 açı, orb 1, aralık [başlangıç 00Z, bitiş+1 gün 00Z)
N = json.load(open(f"{QA}/canli-transit-natal.json"))
R = json.load(open(f"{QA}/transit-araliklar.json"))
B9 = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]
A5 = ["conjunction", "sextile", "square", "trine", "opposition"]
def live(id_, natal, r, bodies):
    return {"id": id_, "group": "canli", "startUtcMs": ms_of(r[0]), "endUtcMs": ms_of(r[1]) + DAY, "bodies": bodies,
            "natalPoints": [{"id": p, "lon": l} for p, l in natal], "aspects": A5, "defaultOrb": 1,
            "include": {"natal": True, "mundane": False, "stations": True, "ingresses": True}}
for i, n in enumerate(sorted(N)): cases.append(live(f"L{n}-ana", N[n], R[i], B9))
# (C) canlı ek set — r_transit_ek.py: tohum 202611035, 365 gün, mars..pluto
random.seed(202611035); RE = []
for i in range(20):
    t0 = random.randint(int(datetime.datetime(1930, 1, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000),
                        int(datetime.datetime(2090, 1, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)) // DAY * DAY
    RE.append([iso(t0), iso(t0 + 364 * DAY)])
for i, n in enumerate(sorted(N)): cases.append(live(f"L{n}-ek", N[n], RE[i], ["mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]))
# (D1) istasyonda teğet: istasyon boylamına ±δ natal (kavuşum, orb 1) + orb sınırına ±δ'
PAD = {"mercury": 40, "venus": 70, "mars": 100, "jupiter": 160, "saturn": 200, "uranus": 260, "neptune": 280, "pluto": 300}
D_T = [1, 3, 5, 10, 30]; D_O = [5, 30]
def st_case(b, st):
    ms, kind, L = st
    sgn = 1 if kind == "retrograde" else -1  # geri istasyon = yerel maksimum boylam; doğrudan = minimum
    pts = []
    for d in D_T:
        pts.append({"id": f"miss{d}", "lon": round((L + sgn * d / 3600) % 360, 9)})   # hedefe hiç ulaşmaz, en yakın d″ (teğet)
        pts.append({"id": f"hit{d}", "lon": round((L - sgn * d / 3600) % 360, 9)})    # iki kesinleşme, çok yakın
    for d in D_O:
        pts.append({"id": f"orbout{d}", "lon": round((L + sgn * (1 + d / 3600)) % 360, 9)})  # orb dışı uç: olası fazla pencere (nearMiss)
        pts.append({"id": f"orbin{d}", "lon": round((L + sgn * (1 - d / 3600)) % 360, 9)})   # orb içi uç: teğet pencere
    p = PAD[b] * DAY
    return {"id": f"B-ist-{b}-{iso(ms).replace('-','')}-{kind[0]}", "group": "sinir-istasyon",
            "startUtcMs": int(ms - p) // 60000 * 60000, "endUtcMs": int(ms + p) // 60000 * 60000, "bodies": [b], "natalPoints": pts,
            "aspects": ["conjunction"], "defaultOrb": 1, "include": {"natal": True, "mundane": False, "stations": True, "ingresses": True},
            "seStation": {"tApproxUtcMs": round(ms), "kind": kind, "lon": L}}
picks = [("mercury", 2026, 0), ("venus", 2025, 0), ("mars", 2024, 0), ("mars", 2025, 0), ("jupiter", 2030, 0), ("saturn", 2033, 1),
         ("uranus", 2041, 0), ("neptune", 2060, 1), ("pluto", 2055, 0), ("pluto", 2055, 1), ("pluto", 1930, 0)]
for b, y, k in picks:
    st = stations(b, y, y + 2)[k]
    cases.append(st_case(b, st))
# (D2) yavaş gezegen çoklu geçiş + pencere bölünmesi: bir geri döngünün (R → D) içine natal noktalar
def multi_case(b, y0, y1, yloop):
    sts = stations(b, yloop, yloop + 2)
    i = next(i for i, s in enumerate(sts) if s[1] == "retrograde")
    Lr, Ld = sts[i][2], sts[i + 1][2]
    arc = (Lr - Ld) % 360
    pts = [{"id": "mid", "lon": (Ld + arc / 2) % 360}, {"id": "nr", "lon": (Lr - 0.15) % 360}, {"id": "nd", "lon": (Ld + 0.15) % 360},
           {"id": "nr1", "lon": (Lr - 0.02) % 360}, {"id": "nd1", "lon": (Ld + 0.02) % 360}, {"id": "out", "lon": (Lr + 0.6) % 360},
           {"id": "q14", "lon": (Ld + arc / 4) % 360}]
    return {"id": f"B-coklu-{b}-{yloop}", "group": "sinir-coklu", "startUtcMs": ms_of(f"{y0}-01-01"), "endUtcMs": ms_of(f"{y1}-01-01"),
            "bodies": [b], "natalPoints": [{"id": p["id"], "lon": round(p["lon"], 9)} for p in pts],
            "aspects": ["conjunction", "square", "opposition"], "orbs": {"square": 0.5}, "defaultOrb": 1,
            "include": {"natal": True, "mundane": False, "stations": True, "ingresses": True},
            "seLoop": {"retroLon": Lr, "directLon": Ld, "arcDeg": arc}}
for b, y0, y1, yl in [("pluto", 2052, 2059, 2055), ("neptune", 2060, 2066, 2062), ("uranus", 1990, 1996, 1992), ("saturn", 2027, 2031, 2028), ("pluto", 1905, 1912, 1908)]:
    cases.append(multi_case(b, y0, y1, yl))
json.dump(cases, open(os.path.join(HERE, "cases.json"), "w", encoding="utf8"), indent=0)
print(len(cases), [c["id"] for c in cases if c["group"].startswith("sinir")])
for c in cases:
    if "seLoop" in c: print(c["id"], round(c["seLoop"]["arcDeg"], 3))
