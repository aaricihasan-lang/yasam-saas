"""Gelismis Transit Taramasi - BAGIMSIZ Swiss Ephemeris (SWIEPH, se1 dosyalari) referans fiksturu ureticisi.
Motor kodu KULLANILMAZ. Konum: swe.calc(JD_TT, govde, FLG_SWIEPH|FLG_SPEED) - geosantrik gorunur boylam (isik zamani, sapinma,
kutlecekimsel sapma, nutasyon; gercek ekliptik ve ekinoks). Her cagrida donus bayragi FLG_SWIEPH olmali (Moshier'e dusus = hata).
ZAMAN EKSENI: TT. Tarama araligi uclari UTC->TT ortak politikayla (lib/astrology/time scalesFromUtc, pre1961=civil_as_ut) cevrilmis
olarak girer (tt.json); butun kokler dogrudan TT'de bulunur -> DeltaT/artik saniye modeli karsilastirmadan elenir.
Kok bulma: yogun izgara (Ay varsa 600 s, yoksa 7200 s) -> SE hiz isaret degisimi = donus (ikiye bolme) -> donuslerle monoton
parcalar -> parca basina seviye kesisimi (ikiye bolme, <= 0,01 s).
Tanimlar (WT-04 sozlesmesi, docs/astrology/pro/ileri-transit.md): d = lam_a - lam_b (b natal sabit ya da govde), hedef T (0/180 tek;
digerleri T ve 360-T ayri aile), pencere = T+-orb kesisimleriyle acilip kapanan durum, kesinlesme = d=T, aile = ardisik iki kesinlesme
arasinda TAM BIR donus, istasyon = govde hizi isaret degisimi (Gunes/Ay haric), burc girisi = lam'nin 30k kesisimi."""
import json, os, sys, time, math
import numpy as np
import swisseph as swe

HERE = os.path.dirname(os.path.abspath(__file__))
EPHE = os.environ["SE_EPHE_PATH"]  # sepl/semo/seas *.se1 (Astrodienst)
swe.set_ephe_path(EPHE)
SW = {"sun": 0, "moon": 1, "mercury": 2, "venus": 3, "mars": 4, "jupiter": 5, "saturn": 6, "uranus": 7, "neptune": 8, "pluto": 9}
FL = swe.FLG_SWIEPH | swe.FLG_SPEED
ASP = {"conjunction": 0, "semi_sextile": 30, "semi_square": 45, "sextile": 60, "square": 90, "trine": 120, "sesquiquadrate": 135, "quincunx": 150, "opposition": 180}
DAYS = 86400.0
PAD = 800 * DAYS
TOL = 0.01
NCALL = [0]
_c = {}


def pos(b, t):
    k = (b, t)
    v = _c.get(k)
    if v is None:
        xx, rf = swe.calc(t / DAYS + 2440587.5, SW[b], FL)
        if rf & 7 != swe.FLG_SWIEPH:
            raise RuntimeError(f"SWIEPH degil: {b} {t} rf={rf}")
        NCALL[0] += 1
        v = (xx[0], xx[3])
        if len(_c) > 3_000_000:
            _c.clear()
        _c[k] = v
    return v


def w180(x):
    return (x + 180.0) % 360.0 - 180.0


def bisect(f, lo, hi):
    flo = f(lo)
    while hi - lo > TOL:
        m = 0.5 * (lo + hi)
        fm = f(m)
        if fm == 0:
            return m
        if (fm > 0) == (flo > 0):
            lo, flo = m, fm
        else:
            hi = m
    return 0.5 * (lo + hi)


class Track:
    def __init__(self, a, b, natal):
        self.a, self.b, self.natal = a, b, natal

    def d(self, t):
        return pos(self.a, t)[0] - (self.natal if self.b is None else pos(self.b, t)[0])

    def g(self, t):
        return pos(self.a, t)[1] - (0.0 if self.b is None else pos(self.b, t)[1])

    def scan(self, t0, t1, step):
        grid = [float(x) for x in np.arange(t0, t1, step)] + [t1]
        G = [self.g(t) for t in grid]
        turns = []
        for i in range(len(grid) - 1):
            if (G[i] > 0) != (G[i + 1] > 0) and G[i] != 0 and G[i + 1] != 0:
                turns.append(bisect(self.g, grid[i], grid[i + 1]))
        cuts = sorted(set(grid) | set(turns))
        D = [self.d(t) for t in cuts]
        U = [D[0]]
        for i in range(1, len(D)):
            U.append(U[-1] + w180(D[i] - D[i - 1]))
        return turns, cuts, U


def crossings(dfun, cuts, U, levels, first=0):
    """first=+1: yalniz ilk kesisim; -1: yalniz son kesisim (aralik disi aile taramasi icin)."""
    out = []
    idx = range(len(cuts) - 1)
    if first < 0:
        idx = reversed(idx)
    for i in idx:
        if first and out:
            break
        ua, ub = U[i], U[i + 1]
        if ua == ub:
            continue
        lo, hi = min(ua, ub), max(ua, ub)
        up = ub > ua
        for L in levels:
            k0 = math.floor((lo - L) / 360.0) - 1
            for k in range(k0, k0 + 4):
                v = L + 360.0 * k
                inside = (lo < v <= hi) if up else (lo <= v < hi)
                if not inside:
                    continue
                out.append((bisect(lambda t, v=v: w180(dfun(t) - v), cuts[i], cuts[i + 1]), L % 360.0, 1 if up else -1))
    out.sort()
    return out


def families(exacts, turns):
    fams = []
    for t in exacts:
        if fams and sum(1 for x in turns if fams[-1][-1] < x < t) == 1:
            fams[-1].append(t)
        else:
            fams.append([t])
    return fams


def run_case(c, tt):
    t0, t1 = tt["tt0"] / 1000.0, tt["tt1"] / 1000.0
    bodies = c["bodies"]
    inc = c["include"]
    mb = c.get("mundaneBodies") or bodies
    moon = "moon" in bodies or (inc.get("mundane") and "moon" in mb)
    step = 600.0 if moon else 7200.0
    orbs = c.get("orbs") or {}

    def orb_of(a):
        return orbs.get(a, c.get("defaultOrb", 1))

    tracks = []
    if inc.get("natal"):
        for a in bodies:
            for p in c.get("natalPoints", []):
                tracks.append((f"{a}>{p['id']}", Track(a, None, p["lon"])))
    if inc.get("mundane"):
        for i in range(len(mb)):
            for j in range(i + 1, len(mb)):
                tracks.append((f"{mb[i]}~{mb[j]}", Track(mb[i], mb[j], None)))
    W, MARG = [], {}
    for key, tr in tracks:
        turns, cuts, U = tr.scan(t0, t1, step)
        ext = None
        if "moon" not in (tr.a, tr.b):  # Ay iceren izler hic donmez -> aile her zaman tek
            ext = (tr.scan(t0 - PAD, t0, 7200.0), tr.scan(t1, t1 + PAD, 7200.0))
            if not (turns or ext[0][0] or ext[1][0]):
                ext = None  # hic donus yok -> her aile tek gecis, kirpilma olamaz

        def sep(t, T):
            return abs(w180(tr.d(t) - T))

        inr = [t for t in turns if t0 < t < t1]
        for asp in c["aspects"]:
            orb = orb_of(asp)
            A = ASP[asp]
            for T in ([A] if A in (0, 180) else [A, 360 - A]):
                xs = crossings(tr.d, cuts, U, [(T - orb) % 360, T % 360, (T + orb) % 360])
                inorb = sep(t0, T) <= orb
                cur = {"en": None, "ex": []} if inorb else None
                closed = []
                for t, L, _ in xs:
                    if abs(w180(L - T)) < 1e-9:
                        if cur is not None:
                            cur["ex"].append(t)
                        continue
                    inorb = not inorb
                    if inorb:
                        cur = {"en": t, "ex": []}
                    elif cur is not None:
                        closed.append((cur["en"], t, cur["ex"]))
                        cur = None
                if cur is not None:
                    closed.append((cur["en"], None, cur["ex"]))
                ex_in = sorted(x for w in closed for x in w[2])
                full_ex, full_turns = list(ex_in), list(turns)
                if ext:
                    (bt, bc, bu), (at, ac, au) = ext
                    xb = [x[0] for x in crossings(tr.d, bc, bu, [T % 360], -1) if x[0] < t0]
                    xa = [x[0] for x in crossings(tr.d, ac, au, [T % 360], 1) if x[0] > t1]
                    full_ex = sorted(xb[-1:] + ex_in + xa[:1])
                    full_turns = sorted(set(bt) | set(turns) | set(at))
                fam_in = families(ex_in, turns)
                famfull = families(full_ex, full_turns)
                info = {}
                for f in fam_in:
                    big = next(F for F in famfull if f[0] in F)
                    for k, x in enumerate(f):
                        info[x] = (k + 1, len(f), 1 if len(big) > len(f) else 0)
                for en, exi, exs in closed:
                    lo = en if en is not None else t0
                    hi = exi if exi is not None else t1
                    inside = [(t, sep(t, T)) for t in inr if lo <= t <= hi]
                    na = [[round(t, 2), round(s * 3600, 3)] for t, s in inside if s > 0 and sep(t - 3600, T) > s and sep(t + 3600, T) > s]
                    cls = 2 if len(exs) >= 2 else 1 if len(exs) == 1 else 3 if (en is not None and exi is not None) else 0
                    cl = None
                    if not exs:
                        cands = inside + [(lo, sep(lo, T)), (hi, sep(hi, T))]
                        m = min(cands, key=lambda x: x[1])
                        cl = [round(m[0], 2), round(m[1] * 3600, 3)]
                    W.append([f"{key}|{asp}|{T}", None if en is None else round(en, 2), None if exi is None else round(exi, 2),
                              [[round(x, 2), i + 1, len(exs), *info[x]] for i, x in enumerate(exs)], cls, na, cl])
                m = [[round(t, 2), round(sep(t, T) * 3600, 3)] for t in inr if min(sep(t, T), abs(sep(t, T) - orb)) * 3600 < 120]
                if m:
                    MARG[f"{key}|{asp}|{T}"] = m
    ST, IN = [], []
    for b in bodies:
        tr = Track(b, None, 0.0)
        turns, cuts, U = tr.scan(t0, t1, step)
        if inc.get("stations") and b not in ("sun", "moon"):
            for t in turns:
                if t0 < t < t1:
                    ST.append([b, round(t, 2), "retrograde" if pos(b, t + 3600)[1] < 0 else "direct", round(pos(b, t)[0], 7)])
        if inc.get("ingresses"):
            for t, L, dr in crossings(tr.d, cuts, U, [30.0 * k for k in range(12)]):
                IN.append([b, round(t, 2), int(round(L)) % 360, dr])
    return {"id": c["id"], "group": c["group"], "tt0": round(t0, 3), "tt1": round(t1, 3), "W": W, "ST": ST, "IN": IN, "M": MARG}


if __name__ == "__main__":
    cases = json.load(open(os.path.join(HERE, "cases.json"), encoding="utf8"))
    TT = json.load(open(os.path.join(HERE, "tt.json"), encoding="utf8"))
    only = sys.argv[1].split(",") if len(sys.argv) > 1 else None
    out = []
    for c in cases:
        if only and c["id"] not in only:
            continue
        s = time.time()
        n0 = NCALL[0]
        r = run_case(c, TT[c["id"]])
        r["req"] = c
        out.append(r)
        print(c["id"], "W", len(r["W"]), "ST", len(r["ST"]), "IN", len(r["IN"]), "calls", NCALL[0] - n0, round(time.time() - s, 1), "s", flush=True)
    meta = {
        "schema": "astro.pro.transit-scan.ref-se.v1",
        "reference": {
            "engine": f"Swiss Ephemeris {swe.version} (pyswisseph), FLG_SWIEPH|FLG_SPEED, se1 sepl/semo/seas; return flag checked == FLG_SWIEPH on every call",
            "position": "geocentric apparent ecliptic longitude, true ecliptic & equinox of date (light-time, aberration, deflection, nutation); Jupiter..Pluto = SE default",
            "timeAxis": "TT seconds since 1970-01-01T00:00:00 on the TT scale (= TimeScales.ttMs/1000); range ends converted from UTC with lib/astrology/time scalesFromUtc(pre1961=civil_as_ut)",
            "method": "dense grid (600 s with Moon, else 7200 s); SE speed sign change -> turn (bisection); monotone segments; level-crossing bisection to 0.01 s; families via 800-day outside scan (7200 s)",
            "independentOf": "lib/astrology/transits (no engine code)",
        },
        "legend": {
            "W": "[key 'a>b|aspect|T' (natal) or 'a~b|aspect|T' (mundane), enterTT|null (startsBeforeRange), exitTT|null (endsAfterRange), passes [[tt, pass, of, cyclePass, cycleOf, cycleClippedByRange]], cls 1=single 2=multiple 3=tangential 0=none_in_range, nearApproaches [[tt, sepArcsec]], closest [tt, sepArcsec] (only when no exact) | null]",
            "ST": "[body, tt, retrograde|direct, lonDeg]",
            "IN": "[body, tt, signBoundaryDeg, dir +1 forward / -1 retrograde]",
            "M": "key -> [[tt, sepArcsec]]: in-range turns whose |d-T| lies within 120 arcsec of 0 or of the orb (pass-count / window sensitivity)",
            "req": "ScanRequest exactly as passed to the engine (UTC ms) + group/seStation/seLoop notes",
        },
        "cases": out,
    }
    s = json.dumps(meta, separators=(",", ":"), ensure_ascii=False)
    open(os.path.join(HERE, sys.argv[2] if len(sys.argv) > 2 else ("ref-se-partial.json" if only else "ref-se-transit.json")), "w", encoding="utf8").write(s)
    print("bytes", len(s), "calls", NCALL[0])
