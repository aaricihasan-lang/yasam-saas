# -*- coding: utf-8 -*-
"""
scripts/cosmic-longrange/compare.py — 01.01.2026–31.12.2100 UZUN DÖNEM BAĞIMSIZ KARŞILAŞTIRMA.

Referanslar:
  • Swiss Ephemeris 2.10 (.se1 DE431 dosyaları; SE_EPHE_PATH) — konum, faz, giriş, istasyon, tutulma,
    gün doğumu/batımı. Tanım eşitlemesi: tropikal, yer merkezli, görünür, tarihin gerçek ekliptiği.
  • hijridate 2.6 (resmî Umm al-Qura tablosu, ≤1500 AH) + Umm al-Qura kuralının bağımsız SWE uygulaması.
  • JPL Horizons ve USNO: jpl_cmp.ts / regression.ts içinde.

Kullanım:
  python compare.py ref-stays <outDir>     # getPlanetSignPeriod sorgu noktaları (prod_dump signperiod öncesi)
  python compare.py all <outDir>           # tüm karşılaştırmalar → <outDir>/results.json (+ exit 1 FAIL)

TOLERANS GEREKÇELERİ (kafadan değil):
  • Boylam: astronomy-engine belgelenmiş doğruluğu ±1′ (60″). JPL ile AYNI TT anında ölçülen en büyük
    fark ≤30″ (jpl_cmp). UT karşılaştırmasında ek fark ΔT MODELİ kaynaklıdır (AE Espenak–Meeus vs SWE);
    bu yüzden kabul ölçütü TT-eşitlenmiş farka uygulanır (≤60″), UT farkı ayrıca raporlanır.
  • Burç/faz etiketi: fark YALNIZ referans değer sınırdan, iki motor arasındaki o anki boylam farkından
    daha yakınsa "sınır toleransı"dır; aksi FAIL.
  • Olay zamanları (Ay fazı/girişi): TT-eşitlenmiş ≤60 sn (AE MoonPhase aberasyonsuz tanım ~40 sn + model).
  • Gün doğumu/batımı: orta enlem (≤60°) ≤90 sn — NOAA algoritma doğruluğu ~1 dk; USNO dakika yuvarlamalı.
  • Tarih-düzeyi (retro başlangıç/bitiş, burç giriş günü): 0 fark hedefi; fark varsa anın TR gece
    yarısına uzaklığı raporlanır (G5 kataloğunun kaynağı).
"""
import csv, glob, json, os, sys, bisect, datetime, collections, zoneinfo
import swisseph as swe
EPHE = os.environ.get("SE_EPHE_PATH")
if not EPHE or not os.path.isdir(EPHE): sys.exit("SE_EPHE_PATH gerekli (Swiss Ephemeris .se1 klasörü)")
swe.set_ephe_path(EPHE)
FL = swe.FLG_SWIEPH | swe.FLG_SPEED
TRMS = 3 * 3600 * 1000
Y0, Y1 = 2026, 2100
BODIES = ["Güneş","Ay","Merkür","Venüs","Mars","Jüpiter","Satürn","Uranüs","Neptün","Plüton"]
SWB = [swe.SUN, swe.MOON, swe.MERCURY, swe.VENUS, swe.MARS, swe.JUPITER, swe.SATURN, swe.URANUS, swe.NEPTUNE, swe.PLUTO]
PK = {"Güneş": swe.SUN, "Merkür": swe.MERCURY, "Venüs": swe.VENUS, "Mars": swe.MARS, "Jüpiter": swe.JUPITER,
      "Satürn": swe.SATURN, "Uranüs": swe.URANUS, "Neptün": swe.NEPTUNE, "Plüton": swe.PLUTO}
RETRO8 = ["Merkür","Venüs","Mars","Jüpiter","Satürn","Uranüs","Neptün","Plüton"]
def jd_of(ms): return 2440587.5 + ms / 86400000.0
def ms_of(jd): return (jd - 2440587.5) * 86400000.0
def wrap(d): return (d + 180.0) % 360.0 - 180.0
def lon(jd, b): return swe.calc_ut(jd, b, FL)[0][0]
def speed(jd, b): return swe.calc_ut(jd, b, FL)[0][3]
def trdate_ms(ms):
    t = datetime.datetime.fromtimestamp((ms + TRMS) / 1000, datetime.UTC); return t.strftime("%Y-%m-%d")
def tr_min_from_midnight(ms):
    t = datetime.datetime.fromtimestamp((ms + TRMS) / 1000, datetime.UTC); return t.hour * 60 + t.minute + t.second / 60
def era(y): return "2026-2050" if y <= 2050 else "2051-2075" if y <= 2075 else "2076-2099" if y <= 2099 else "2100"
def year_of(ms): return datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).year
def bis(f, a, b, pred_a):
    for _ in range(60):
        m = (a + b) / 2
        if pred_a(f(m)): a = m
        else: b = m
    return (a + b) / 2

J0 = swe.julday(2024, 1, 1, 0); J1 = swe.julday(2102, 1, 1, 0)

def ref_ingresses(b, j0=J0, j1=J1, step=0.5):
    out = []; t = j0; l0 = lon(t, b)
    while t < j1:
        t2 = t + step; l1 = lon(t2, b)
        if int(l0 // 30) != int(l1 // 30):
            s0 = int(l0 // 30)
            tj = bis(lambda x: int(lon(x, b) // 30), t, t2, lambda s: s == s0)
            out.append((ms_of(tj), int(l1 // 30) % 12))
        t, l0 = t2, l1
    return out

def cmd_ref_stays(od):
    stays = []; ingress = {}
    for name, b in PK.items():
        ing = ref_ingresses(b, step=0.25 if name in ("Güneş","Merkür","Venüs","Mars") else 1.0)
        ingress[name] = ing
        for i in range(len(ing) - 1):
            a, c = ing[i][0], ing[i + 1][0]
            mid = (a + c) / 2
            if Y0 <= year_of(mid) <= Y1:
                stays.append({"planet": name, "mid_ms": int(mid), "from_ms": a, "to_ms": c})
    json.dump(stays, open(os.path.join(od, "ref_stays.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({k: v for k, v in ingress.items()}, open(os.path.join(od, "ref_ingress.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("ref stays", len(stays))

# ────────────────────────────────────────────────────────────────────────────
def cmp_positions(od, R):
    files = sorted(glob.glob(os.path.join(od, "positions_*.csv")))
    st = {"instants": 0, "lon_checks": 0, "max_ut_arcsec": [0.0] * 10, "max_tt_arcsec": [0.0] * 10,
          "by_era_ut": {}, "by_era_tt": {}, "sign_checks": 0, "sign_boundary": 0, "sign_fail": [],
          "phase_checks": 0, "phase_boundary": 0, "phase_fail": [], "illum_checks": 0, "illum_max_diff": 0, "nan": 0,
          "dT_ae_minus_swe_s": {}}
    SIGN_IDX = [0, 2, 3, 4, 5, 6, 7, 8, 9]
    for fn in files:
        for row in csv.DictReader(open(fn, encoding="utf-8")):
            ms = int(row["utc_ms"]); dT = float(row["deltaT_s"]); jd = jd_of(ms); y = year_of(ms)
            if y < Y0 or y > Y1: continue
            st["instants"] += 1; E = era(y)
            st["dT_ae_minus_swe_s"][str(y)] = round(dT - swe.deltat(jd) * 86400, 2)
            ref = []; prod = []
            for i, b in enumerate(SWB):
                p = float(row[f"lon{i}"])
                if p != p: st["nan"] += 1; ref.append(None); prod.append(None); continue
                lu = swe.calc_ut(jd, b, FL)[0][0]; lt = swe.calc(jd + dT / 86400.0, b, FL)[0][0]
                du = abs(wrap(p - lu)) * 3600; dtt = abs(wrap(p - lt)) * 3600
                st["lon_checks"] += 1
                st["max_ut_arcsec"][i] = max(st["max_ut_arcsec"][i], du); st["max_tt_arcsec"][i] = max(st["max_tt_arcsec"][i], dtt)
                st["by_era_ut"].setdefault(E, [0.0] * 10); st["by_era_tt"].setdefault(E, [0.0] * 10)
                st["by_era_ut"][E][i] = max(st["by_era_ut"][E][i], du); st["by_era_tt"][E][i] = max(st["by_era_tt"][E][i], dtt)
                ref.append(lu); prod.append(p)
            def sign_check(bi, ps):
                st["sign_checks"] += 1
                rs = int(ref[bi] // 30) % 12
                if rs == ps: return
                cusp = min(ref[bi] % 30, 30 - ref[bi] % 30) * 3600
                diff = abs(wrap(prod[bi] - ref[bi])) * 3600
                if cusp <= diff + 1.0: st["sign_boundary"] += 1
                else: st["sign_fail"].append({"ms": ms, "body": BODIES[bi], "prod": ps, "ref": rs, "cusp_arcsec": round(cusp, 2)})
            for k, bi in enumerate(SIGN_IDX): sign_check(bi, int(row[f"sign{k}"]))
            sign_check(1, int(row["moonSign"]))
            # faz
            st["phase_checks"] += 1
            el = (ref[1] - ref[0]) % 360.0; rp = int(el // 45) % 8; pp = int(row["moonPhase"])
            if rp != pp:
                edge = min(el % 45, 45 - el % 45) * 3600
                pel = float(row["moonPhaseDeg"]); d = abs(wrap(pel - el)) * 3600
                if edge <= d + 1.0: st["phase_boundary"] += 1
                else: st["phase_fail"].append({"ms": ms, "prod": pp, "ref": rp, "edge_arcsec": round(edge, 2)})
            fr = swe.pheno_ut(jd, swe.MOON, FL)[1]
            st["illum_checks"] += 1; st["illum_max_diff"] = max(st["illum_max_diff"], abs(round(fr * 100) - int(row["illum"])))
    for k in ("max_ut_arcsec", "max_tt_arcsec"): st[k] = [round(x, 2) for x in st[k]]
    for k in ("by_era_ut", "by_era_tt"): st[k] = {e: [round(x, 2) for x in v] for e, v in st[k].items()}
    R["positions_PASS"] = st["PASS"] = (max(st["max_tt_arcsec"]) <= 60.0 and not st["sign_fail"] and not st["phase_fail"]
                  and st["illum_max_diff"] <= 1 and st["nan"] == 0)
    R["positions"] = st

# ────────────────────────────────────────────────────────────────────────────
def load_dT(od):
    m = {}
    for fn in glob.glob(os.path.join(od, "positions_*.csv")):
        for row in csv.DictReader(open(fn, encoding="utf-8")): m[int(row["utc_ms"]) // 86400000] = float(row["deltaT_s"])
    return m

def cmp_moon(od, R):
    dT = load_dT(od)
    dTae = lambda ms: dT.get(int(ms) // 86400000) or dT.get(int(ms) // 86400000 - 1) or dT.get(int(ms) // 86400000 + 1)
    def elong(jd): return (lon(jd, swe.MOON) - lon(jd, swe.SUN)) % 360.0
    j0 = swe.julday(Y0, 1, 1, 0) - 3 / 24 - 1; j1 = swe.julday(Y1 + 1, 1, 1, 0) - 3 / 24 + 1
    ref = []; t = j0; e0 = elong(t)
    while t < j1:
        t2 = t + 0.25; e1 = elong(t2)
        if int(e0 // 45) != int(e1 // 45):
            k = int(e1 // 45) % 8; tgt = k * 45.0
            tj = bis(lambda x: (elong(x) - tgt + 180) % 360 - 180, t, t2, lambda v: v < 0)
            ref.append((ms_of(tj), k))
        t, e0 = t2, e1
    prod = []
    for row in csv.DictReader(open(os.path.join(od, f"moonphase_{Y0}_{Y1}.csv"))):
        ms = datetime.datetime.fromisoformat(row["timeUTC"].replace("Z", "+00:00")).timestamp() * 1000
        prod.append((ms, int(row["phase"]), f'{row["year"]}-{int(row["month"]):02d}-{int(row["day"]):02d}'))
    prod.sort(); pm = [p[0] for p in prod]; used = set()
    st = {"ref": 0, "prod": len(prod), "matched": 0, "unmatched": 0, "label_mismatch": 0, "tr_date_mismatch": [],
          "max_ut_s": {}, "max_tt_s": {}}
    for ms, k in ref:
        y = year_of(ms)
        if y < Y0 or y > Y1: continue
        st["ref"] += 1
        i = bisect.bisect_left(pm, ms - 86400000); best = None
        while i < len(pm) and pm[i] <= ms + 86400000:
            if prod[i][1] == k and i not in used and (best is None or abs(pm[i] - ms) < abs(pm[best] - ms)): best = i
            i += 1
        if best is None: st["unmatched"] += 1; continue
        used.add(best); st["matched"] += 1; p = prod[best]
        dut = (p[0] - ms) / 1000; dtt = ((p[0] + dTae(p[0]) * 1000) - (ms + swe.deltat(jd_of(ms)) * 86400000)) / 1000
        E = era(y); st["max_ut_s"][E] = round(max(st["max_ut_s"].get(E, 0), abs(dut)), 1); st["max_tt_s"][E] = round(max(st["max_tt_s"].get(E, 0), abs(dtt)), 1)
        if trdate_ms(ms) != p[2]:
            st["tr_date_mismatch"].append({"ref": trdate_ms(ms), "prod": p[2], "phase": k, "d_s": round(dut, 1), "ref_min_from_TR_midnight": round(tr_min_from_midnight(ms), 2)})
    st["unmatched_prod"] = len(prod) - len(used)
    # Ay burç girişleri
    ing = ref_ingresses(swe.MOON, swe.julday(Y0, 1, 1, 0) - 3 / 24 - 1, swe.julday(Y1 + 1, 1, 1, 0), step=1 / 12)
    pi = [int(r["from_ms"]) for r in csv.DictReader(open(os.path.join(od, f"mooningress_{Y0}_{Y1}.csv")))]
    si = {"ref": 0, "matched": 0, "unmatched": 0, "max_ut_s": {}, "max_tt_s": {}}
    for ms, s in ing:
        y = year_of(ms)
        if y < Y0 or y > Y1: continue
        si["ref"] += 1
        i = bisect.bisect_left(pi, ms - 6 * 3600000)
        cands = [j for j in (i, i + 1) if j < len(pi) and abs(pi[j] - ms) <= 6 * 3600000]
        if not cands: si["unmatched"] += 1; continue
        j = min(cands, key=lambda j: abs(pi[j] - ms)); si["matched"] += 1
        dut = (pi[j] - ms) / 1000; dtt = ((pi[j] + dTae(pi[j]) * 1000) - (ms + swe.deltat(jd_of(ms)) * 86400000)) / 1000
        E = era(y); si["max_ut_s"][E] = round(max(si["max_ut_s"].get(E, 0), abs(dut)), 1); si["max_tt_s"][E] = round(max(si["max_tt_s"].get(E, 0), abs(dtt)), 1)
    # Ay yaşı (G6): önceki referans Yeni Ay'dan geçen gün (kelepçe YOK)
    nm = [m for m, k in ref if k == 0]
    age = {"checks": 0, "max_abs_h": 0.0, "over_29_53": 0}
    for fn in sorted(glob.glob(os.path.join(od, "positions_*.csv"))):
        for row in csv.DictReader(open(fn, encoding="utf-8")):
            ms = int(row["utc_ms"]); i = bisect.bisect_right(nm, ms) - 1
            if i < 0 or i + 1 >= len(nm): continue
            lun = (nm[i + 1] - nm[i]) / 86400000; ra = (ms - nm[i]) / 86400000; pa = float(row["moonAge"])
            d = min(abs(pa - ra), abs(pa - ra - lun), abs(pa - ra + lun)) * 24
            age["checks"] += 1; age["max_abs_h"] = max(age["max_abs_h"], d)
            if pa > 29.53059: age["over_29_53"] += 1
    age["max_abs_h"] = round(age["max_abs_h"], 3)
    tt_all = max(list(st["max_tt_s"].values()) + list(si["max_tt_s"].values()))
    R["moon_phase_events"] = st; R["moon_ingress"] = si; R["moon_age"] = age
    R["moon_PASS"] = (st["unmatched"] == 0 and st["unmatched_prod"] == 0 and si["unmatched"] == 0 and tt_all <= 60.0
                      and age["max_abs_h"] <= 0.1 and all(abs(x["ref_min_from_TR_midnight"] - 1440) < 2 or x["ref_min_from_TR_midnight"] < 2 for x in st["tr_date_mismatch"]))

# ────────────────────────────────────────────────────────────────────────────
def cmp_retro(od, R):
    stations = {}
    for name in RETRO8:
        b = PK[name]; out = []; t = J0 - 200; v0 = speed(t, b)
        while t < J1 + 400:
            t2 = t + 0.5; v1 = speed(t2, b)
            if (v0 < 0) != (v1 < 0):
                s0 = v0 < 0
                tj = bis(lambda x: speed(x, b), t, t2, lambda v: (v < 0) == s0)
                out.append(("R" if v0 > 0 else "D", ms_of(tj)))
            t, v0 = t2, v1
        stations[name] = out
    refp = collections.defaultdict(list)
    for name, s in stations.items():
        for i, (k, ms) in enumerate(s):
            if k != "R": continue
            d = next((x for x in s[i + 1:] if x[0] == "D"), None)
            if d: refp[name].append((ms, d[1]))
    prod = collections.defaultdict(list)
    for r in csv.DictReader(open(os.path.join(od, "retro_periods.csv"), encoding="utf-8")): prod[r["planet"]].append((r["start"], r["end"]))
    st = {"prod_periods": sum(len(v) for v in prod.values()), "ref_periods": 0, "start_equal": 0, "end_equal": 0,
          "diffs": [], "missing": [], "extra": [], "by_planet": {}}
    for name in RETRO8:
        refs = [(trdate_ms(a), trdate_ms(b), a, b) for a, b in refp[name] if trdate_ms(b) >= f"{Y0}-01-01" and trdate_ms(a) <= f"{Y1}-12-31"]
        st["ref_periods"] += len(refs); ps = list(prod[name]); used = set(); bp = {"ref": len(refs), "prod": len(ps), "equal_both": 0}
        for rs, re_, a, b in refs:
            m = next((i for i, p in enumerate(ps) if i not in used and abs((datetime.date.fromisoformat(p[0]) - datetime.date.fromisoformat(rs)).days) <= 3), None)
            if m is None: st["missing"].append({"planet": name, "start": rs, "end": re_}); continue
            used.add(m); p = ps[m]
            if p[0] == rs: st["start_equal"] += 1
            else: st["diffs"].append({"planet": name, "kind": "start", "prod": p[0], "ref": rs, "ref_min_from_TR_midnight": round(tr_min_from_midnight(a), 1)})
            if p[1] == re_: st["end_equal"] += 1
            else: st["diffs"].append({"planet": name, "kind": "end", "prod": p[1], "ref": re_, "ref_min_from_TR_midnight": round(tr_min_from_midnight(b), 1)})
            if p[0] == rs and p[1] == re_: bp["equal_both"] += 1
        st["extra"] += [{"planet": name, "start": p[0], "end": p[1]} for i, p in enumerate(ps) if i not in used]
        st["by_planet"][name] = bp
    # günlük durum (UI getRetroStatus) — aynı gün-semantiği
    daily = {"days": 0, "planet_day_checks": 0, "mismatch_days": 0, "unsupported_in_range": 0, "samples": []}
    ref_sets = collections.defaultdict(set)
    for name in RETRO8:
        for a, b in refp[name]:
            d = datetime.date.fromisoformat(trdate_ms(a)); e = datetime.date.fromisoformat(trdate_ms(b))
            while d <= e:
                ref_sets[d.isoformat()].add(name); d += datetime.timedelta(days=1)
    for r in csv.DictReader(open(os.path.join(od, f"retro_daily_{Y0}_{Y1}.csv"), encoding="utf-8")):
        daily["days"] += 1; daily["planet_day_checks"] += 8
        if r["supported"] != "1": daily["unsupported_in_range"] += 1; continue
        p = set(x for x in r["active"].split("|") if x)
        if p != ref_sets.get(r["date"], set()):
            daily["mismatch_days"] += 1
            if len(daily["samples"]) < 10: daily["samples"].append({"date": r["date"], "prod": sorted(p), "ref": sorted(ref_sets.get(r["date"], set()))})
    R["retro_periods"] = st; R["retro_daily"] = daily
    R["retro_PASS"] = not st["missing"] and not st["extra"] and daily["unsupported_in_range"] == 0 and \
        all(min(x["ref_min_from_TR_midnight"], 1440 - x["ref_min_from_TR_midnight"]) <= 30 for x in st["diffs"]) and \
        daily["mismatch_days"] <= 2 * len(st["diffs"])

# ────────────────────────────────────────────────────────────────────────────
def cmp_ingress(od, R):
    ing = json.load(open(os.path.join(od, "ref_ingress.json"), encoding="utf-8"))
    # (1) dış gezegen burç geçiş OLAYLARI (events.ts)
    prod = collections.defaultdict(list)
    for r in csv.DictReader(open(os.path.join(od, "signchange_events.csv"), encoding="utf-8")): prod[r["planet"]].append(r["date"])
    ev = {"ref": 0, "prod": 0, "date_equal": 0, "diffs": [], "missing": [], "extra": []}
    for name in ["Jüpiter","Satürn","Uranüs","Neptün","Plüton"]:
        refs = [(trdate_ms(ms), s, ms) for ms, s in ing[name] if f"{Y0}-01-01" <= trdate_ms(ms) <= f"{Y1}-12-31"]
        p = [d for d in prod[name] if f"{Y0}-01-01" <= d <= f"{Y1}-12-31"]
        ev["ref"] += len(refs); ev["prod"] += len(p)
        for d, s, ms in refs:
            if d in p: ev["date_equal"] += 1; p.remove(d); continue
            near = [x for x in p if abs((datetime.date.fromisoformat(x) - datetime.date.fromisoformat(d)).days) <= 3]
            if near:
                ev["diffs"].append({"planet": name, "toSign": s, "prod": near[0], "ref": d, "ref_utc": datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).isoformat(), "ref_min_from_TR_midnight": round(tr_min_from_midnight(ms), 1)})
                p.remove(near[0])
            else: ev["missing"].append({"planet": name, "ref": d})
        ev["extra"] += [{"planet": name, "date": x} for x in p]
    R["signchange_events"] = ev
    # (2) getPlanetSignPeriod from/to (9 cisim, tüm bitişik kalışlar)
    stays = json.load(open(os.path.join(od, "ref_stays.json"), encoding="utf-8"))
    rows = {(r["planet"], int(r["mid_ms"])): r for r in csv.DictReader(open(os.path.join(od, "signperiod_prod.csv"), encoding="utf-8"))}
    sp = {"stays": 0, "checks": 0, "equal": 0, "null": 0, "diffs": []}
    for s in stays:
        r = rows.get((s["planet"], int(s["mid_ms"])))
        sp["stays"] += 1
        if not r or not r["from"]: sp["null"] += 1; continue
        for kind, pv, ref_ms in (("from", r["from"], s["from_ms"]), ("to", r["to"], s["to_ms"])):
            sp["checks"] += 1
            rv = trdate_ms(ref_ms)
            if pv == rv: sp["equal"] += 1
            else: sp["diffs"].append({"planet": s["planet"], "kind": kind, "prod": pv, "ref": rv, "ref_utc": datetime.datetime.fromtimestamp(ref_ms / 1000, datetime.UTC).isoformat(), "ref_min_from_TR_midnight": round(tr_min_from_midnight(ref_ms), 1)})
    R["sign_period"] = sp
    R["ingress_PASS"] = not ev["diffs"] and not ev["missing"] and not ev["extra"] and not sp["diffs"] and sp["null"] == 0

# ────────────────────────────────────────────────────────────────────────────
CITIES = {"istanbul": (41.0082, 28.9784, "Europe/Istanbul"), "ankara": (39.9334, 32.8597, "Europe/Istanbul"),
          "van": (38.4942, 43.38, "Europe/Istanbul"), "berlin": (52.52, 13.405, "Europe/Berlin"),
          "london": (51.5074, -0.1278, "Europe/London"), "newyork": (40.7128, -74.006, "America/New_York"),
          "sydney": (-33.8688, 151.2093, "Australia/Sydney"), "singapore": (1.3521, 103.8198, "Asia/Singapore"),
          "reykjavik": (64.1466, -21.9426, "Atlantic/Reykjavik"), "tromso": (69.6492, 18.9553, "Europe/Oslo")}
DAY_START_IDX = [3, 6, 2, 5, 1, 4, 0]
_sun = {}
def ref_sun(city, date):
    k = (city, date)
    if k in _sun: return _sun[k]
    lat, lo, tz = CITIES[city]; z = zoneinfo.ZoneInfo(tz)
    mid = datetime.datetime(date.year, date.month, date.day, tzinfo=z).timestamp() * 1000
    nxt = (datetime.datetime(date.year, date.month, date.day, tzinfo=z) + datetime.timedelta(days=1)).timestamp() * 1000
    res, tr = swe.rise_trans(jd_of(mid), swe.SUN, swe.CALC_RISE, (lo, lat, 0), 0, 0, swe.FLG_SWIEPH)
    rise = ms_of(tr[0]) if res == 0 and ms_of(tr[0]) < nxt else None
    st = None
    if rise is not None:
        res, tr = swe.rise_trans(jd_of(rise), swe.SUN, swe.CALC_SET, (lo, lat, 0), 0, 0, swe.FLG_SWIEPH)
        st = ms_of(tr[0]) if res == 0 else None
    _sun[k] = (rise, st); return _sun[k]

def cmp_phours(od, R):
    S = {"city_days": 0, "sun_checks": 0, "rise_max_s": {}, "set_max_s": {}, "midlat_by_era_max_s": {}, "struct_fail": 0,
         "ruler_mismatch": 0, "first_slot_not_ruler": 0, "polar_no_slots": collections.Counter(), "istanbul_2100_max_s": 0.0}
    for r in csv.DictReader(open(os.path.join(od, f"phours_{Y0}_{Y1}.csv"))):
        c = r["city"]; d = datetime.date.fromisoformat(r["date"]); S["city_days"] += 1
        wd = (d.weekday() + 1) % 7
        if int(r["ruler_idx"]) != DAY_START_IDX[wd]: S["ruler_mismatch"] += 1
        if not r["sunrise_ms"]: S["polar_no_slots"][c] += 1; continue
        if int(r["first_idx"]) != DAY_START_IDX[wd]: S["first_slot_not_ruler"] += 1
        if r["slot_ok"] != "1": S["struct_fail"] += 1
        rr, rs = ref_sun(c, d)
        if rr is None or rs is None: continue
        S["sun_checks"] += 2
        dr = abs(float(r["sunrise_ms"]) - rr) / 1000; ds = abs(float(r["sunset_ms"]) - rs) / 1000
        S["rise_max_s"][c] = round(max(S["rise_max_s"].get(c, 0), dr), 1); S["set_max_s"][c] = round(max(S["set_max_s"].get(c, 0), ds), 1)
        if abs(CITIES[c][0]) <= 60:
            E = era(d.year); S["midlat_by_era_max_s"][E] = round(max(S["midlat_by_era_max_s"].get(E, 0), dr, ds), 1)
        if c == "istanbul" and d.year == 2100: S["istanbul_2100_max_s"] = round(max(S["istanbul_2100_max_s"], dr, ds), 1)
    S["polar_no_slots"] = dict(S["polar_no_slots"])
    def ref_hour(city, ms):
        z = zoneinfo.ZoneInfo(CITIES[city][2]); ld = datetime.datetime.fromtimestamp(ms / 1000, z).date()
        rr, _ = ref_sun(city, ld)
        if rr is None: return None
        D = ld if ms >= rr else ld - datetime.timedelta(days=1)
        r0, s0 = ref_sun(city, D); r1, _ = ref_sun(city, D + datetime.timedelta(days=1))
        if None in (r0, s0, r1): return None
        wd = (D.weekday() + 1) % 7
        if ms < s0: L = (s0 - r0) / 12; h = int((ms - r0) // L); b0 = r0 + h * L
        else: L = (r1 - s0) / 12; h = 12 + int((ms - s0) // L); b0 = s0 + (h - 12) * L
        return (DAY_START_IDX[wd] + h) % 7, min(ms - b0, b0 + L - ms), ms < rr
    P = {"probes": 0, "match": 0, "mismatch": 0, "predawn_probes": 0, "predawn_mismatch": 0, "midlat_mismatch_far": 0,
         "midlat_mismatch_max_boundary_s": 0.0, "highlat_mismatch": 0, "fallback": 0}
    for r in csv.DictReader(open(os.path.join(od, f"phours_probe_{Y0}_{Y1}.csv"))):
        if r["fallback"] == "1": P["fallback"] += 1; continue
        c = r["city"]; ms = int(r["probe_ms"]); ref = ref_hour(c, ms)
        if ref is None: continue
        P["probes"] += 1; P["predawn_probes"] += ref[2]
        if int(r["planet_idx"]) == ref[0]: P["match"] += 1; continue
        P["mismatch"] += 1; P["predawn_mismatch"] += ref[2]
        if abs(CITIES[c][0]) <= 60:
            P["midlat_mismatch_max_boundary_s"] = max(P["midlat_mismatch_max_boundary_s"], ref[1] / 1000)
            if ref[1] > 90_000: P["midlat_mismatch_far"] += 1
        else: P["highlat_mismatch"] += 1
    P["midlat_mismatch_max_boundary_s"] = round(P["midlat_mismatch_max_boundary_s"], 1)
    R["sun"] = S; R["planetary_hour_probes"] = P
    midmax = max(S["midlat_by_era_max_s"].values())
    R["phours_PASS"] = (S["struct_fail"] == 0 and S["ruler_mismatch"] == 0 and S["first_slot_not_ruler"] == 0
                        and midmax <= 90 and P["midlat_mismatch_far"] == 0)

# ────────────────────────────────────────────────────────────────────────────
def cmp_hijri(od, R):
    sys.path.insert(0, os.environ.get("HIJRIDATE_PATH", ""))
    from hijridate import Gregorian
    TRM = ["Muharrem","Safer","Rebiülevvel","Rebiülahir","Cemaziyelevvel","Cemaziyelahir","Recep","Şaban","Ramazan","Şevval","Zilkade","Zilhicce"]
    H = {"files": {}, "cross_tz_inconsistent": 0, "cross_path_inconsistent": 0, "null_in_range": 0}
    rows_by = {}
    for fn in sorted(glob.glob(os.path.join(od, f"hijri_*_{Y0}_{Y1}.csv"))):
        tz = os.path.basename(fn)[6:-(len(f"_{Y0}_{Y1}.csv"))]
        rows = list(csv.DictReader(open(fn, encoding="utf-8"))); rows_by[tz] = rows
        st = {"days": 0, "official_ref_days": 0, "official_equal": 0, "mismatch": [], "method_counts": collections.Counter(),
              "ramadan_1": 0, "ramadan_1_equal": 0, "muharrem_1": 0, "muharrem_1_equal": 0}
        for r in rows:
            y, m, d = map(int, r["date"].split("-")); st["days"] += 1; st["method_counts"][r["method"]] += 1
            if not (r["cosmic"] == r["hacamat"] == r["cupping"]): H["cross_path_inconsistent"] += 1
            if r["cosmic"] == "—": H["null_in_range"] += 1
            try: h = Gregorian(y, m, d).to_hijri()
            except OverflowError: continue
            ref = f"{h.day} {TRM[h.month - 1]} {h.year}"; st["official_ref_days"] += 1
            if r["cosmic"] == ref: st["official_equal"] += 1
            elif len(st["mismatch"]) < 10: st["mismatch"].append({"date": r["date"], "prod": r["cosmic"], "ref": ref})
            if h.day == 1 and h.month == 9: st["ramadan_1"] += 1; st["ramadan_1_equal"] += (r["cosmic"] == ref)
            if h.day == 1 and h.month == 1: st["muharrem_1"] += 1; st["muharrem_1_equal"] += (r["cosmic"] == ref)
        st["method_counts"] = dict(st["method_counts"]); H["files"][tz] = st
    tzs = list(rows_by)
    for i in range(len(rows_by[tzs[0]])):
        if len({rows_by[t][i]["cosmic"] for t in tzs}) > 1: H["cross_tz_inconsistent"] += 1
    # Kural segmenti (2077-11-17…2100-12-31) bağımsız UQ kuralı ile — Mekke gün batımı/Ay batışı/kavuşum
    MECCA = (39.8262, 21.4225, 277.0)
    def event(jd, body, flag):
        res, t = swe.rise_trans(jd, body, flag, MECCA, 0.0, 0.0, swe.FLG_SWIEPH); return t[0] if res == 0 else None
    def el(jd): return (swe.calc_ut(jd, swe.MOON, swe.FLG_SWIEPH)[0][0] - swe.calc_ut(jd, swe.SUN, swe.FLG_SWIEPH)[0][0] + 180) % 360 - 180
    first = rows_by[tzs[0]]
    starts = [r["date"] for r in first if r["cosmic"].startswith("1 ") and r["date"] >= "2077-11-17"]
    rule = {"months": 0, "agree": 0, "disagree": []}
    for k in range(len(starts) - 1):
        d1 = datetime.date.fromisoformat(starts[k]); d29 = d1 + datetime.timedelta(days=28)
        j0 = swe.julday(d29.year, d29.month, d29.day, 0) - 3 / 24
        ss = event(j0, swe.SUN, swe.CALC_SET); ms_ = event(j0, swe.MOON, swe.CALC_SET)
        t = ss - 4; cj = None
        while t < ss + 4:
            if el(t) < 0 <= el(t + 0.25):
                cj = bis(el, t, t + 0.25, lambda v: v < 0); break
            t += 0.25
        ok29 = cj is not None and cj < ss and ms_ is not None and ss < ms_ < j0 + 1
        pred = d1 + datetime.timedelta(days=29 if ok29 else 30)
        rule["months"] += 1
        if pred.isoformat() == starts[k + 1]: rule["agree"] += 1
        else: rule["disagree"].append({"month_start": starts[k], "table_next": starts[k + 1], "rule_next": pred.isoformat(),
                                       "moonset_minus_sunset_min": round((ms_ - ss) * 1440, 2) if ms_ else None})
    H["criterion_segment_rule_check"] = rule
    # Hacamat statüsü yeniden doğrulama (bağımsız Hicri gün ile)
    hac = {"days": 0, "status_mismatch": 0, "altin_days": 0}
    YAS = {3, 5, 6}; SUN = {17, 19, 21}; UYG = {18, 20, 22, 23, 24}
    def status(wd, hd):
        if wd in YAS: return "yasakli"
        if hd == 17 and wd == 2: return "altin"
        if hd in SUN: return "sunnet"
        if hd in UYG: return "uygun"
        return "normal"
    for r in csv.DictReader(open(os.path.join(od, f"hacamat_{Y0}_{Y1}.csv"), encoding="utf-8")):
        y, m, d = map(int, r["date"].split("-"))
        try: hd = Gregorian(y, m, d).to_hijri().day
        except OverflowError: hd = int(r["hijri_day"])    # kural segmenti: tablo değeri (kural kontrolü yukarıda)
        hac["days"] += 1; s = status(int(r["weekday"]), hd); hac["altin_days"] += (s == "altin")
        if s != r["status"]: hac["status_mismatch"] += 1
    H["hacamat"] = hac
    R["hijri"] = H
    f = H["files"][tzs[0]]
    R["hijri_PASS"] = (H["cross_tz_inconsistent"] == 0 and H["cross_path_inconsistent"] == 0 and H["null_in_range"] == 0
                       and f["official_equal"] == f["official_ref_days"] and hac["status_mismatch"] == 0)

# ────────────────────────────────────────────────────────────────────────────
def cmp_eclipses(od, R):
    def ms(jd): return (jd - 2440587.5) * 864e5
    rf = []; t = swe.julday(Y0, 1, 1, 0); end = swe.julday(Y1 + 1, 1, 1, 0)
    while True:
        res, tr = swe.sol_eclipse_when_glob(t, swe.FLG_SWIEPH, 0)
        if tr[0] >= end: break
        ty = "hybrid" if res & swe.ECL_ANNULAR_TOTAL else "total" if res & swe.ECL_TOTAL else "annular" if res & swe.ECL_ANNULAR else "partial"
        rf.append(("solar", ty, ms(tr[0]))); t = tr[0] + 20
    t = swe.julday(Y0, 1, 1, 0)
    while True:
        res, tr = swe.lun_eclipse_when(t, swe.FLG_SWIEPH, 0)
        if tr[0] >= end: break
        ty = "total" if res & swe.ECL_TOTAL else "partial" if res & swe.ECL_PARTIAL else "penumbral"
        rf.append(("lunar", ty, ms(tr[0]))); t = tr[0] + 20
    prod = [(r["kind"], r["type"], datetime.datetime.fromisoformat(r["peakUTC"].replace("Z", "+00:00")).timestamp() * 1000)
            for r in csv.DictReader(open(os.path.join(od, "eclipses.csv")))]
    rep = {"prod": len(prod), "ref": len(rf), "matched": 0, "type_mismatch": [], "missing": [], "max_peak_s": {}}
    used = set()
    for k, ty, t in rf:
        m = next((i for i, p in enumerate(prod) if i not in used and p[0] == k and abs(p[2] - t) < 864e5), None)
        if m is None: rep["missing"].append((k, ty, datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).isoformat())); continue
        used.add(m); rep["matched"] += 1
        E = era(year_of(t)); rep["max_peak_s"][E] = round(max(rep["max_peak_s"].get(E, 0), abs(prod[m][2] - t) / 1000), 1)
        if prod[m][1] != ty: rep["type_mismatch"].append((k, datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).date().isoformat(), prod[m][1], ty))
    rep["extra"] = [p for i, p in enumerate(prod) if i not in used]
    R["eclipses"] = rep
    R["eclipses_PASS"] = rep["matched"] == rep["ref"] == rep["prod"] and not rep["type_mismatch"] and max(rep["max_peak_s"].values()) <= 180

# ────────────────────────────────────────────────────────────────────────────
def cmp_aspects(od, R):
    orb = lambda b: 6 if b in ("Güneş","Ay") else 4 if b in ("Merkür","Venüs","Mars") else 3
    A = {"days": 0, "pair_checks": 0, "equal_days": 0, "diff_items": 0, "boundary_items": 0, "fail_items": []}
    for r in csv.DictReader(open(os.path.join(od, f"aspects_{Y0}_{Y1}.csv"), encoding="utf-8")):
        ms = int(r["utc_ms"]); jd = jd_of(ms)
        L = [swe.calc_ut(jd, b, swe.FLG_SWIEPH)[0][0] for b in SWB]
        ref = set(); margin = {}
        for i in range(10):
            for j in range(i + 1, 10):
                d = abs(L[i] - L[j]) % 360; d = 360 - d if d > 180 else d
                best = min((0, 60, 90, 120, 180), key=lambda a: abs(d - a)); o = abs(d - best); lim = max(orb(BODIES[i]), orb(BODIES[j]))
                key = f"{BODIES[i]}-{BODIES[j]}-{best}"; margin[key] = abs(o - lim) * 3600
                if o <= lim: ref.add(key)
        prod = set(x for x in r["set"].split("|") if x)
        A["days"] += 1; A["pair_checks"] += 45
        diff = prod ^ ref
        if not diff: A["equal_days"] += 1; continue
        for k in diff:
            A["diff_items"] += 1
            m = margin.get(k)
            if m is not None and m <= 200: A["boundary_items"] += 1        # ≤200″ = Ay ΔT/model farkı bandı
            elif len(A["fail_items"]) < 20: A["fail_items"].append((ms, k, round(m or -1, 1)))
    R["aspects"] = A
    R["aspects_PASS"] = not A["fail_items"]

def main():
    cmd, od = sys.argv[1], sys.argv[2]
    if cmd == "ref-stays": cmd_ref_stays(od); return
    R = {}
    for f in (cmp_positions, cmp_moon, cmp_retro, cmp_ingress, cmp_phours, cmp_hijri, cmp_eclipses, cmp_aspects):
        f(od, R); print("✓", f.__name__, flush=True)
    passes = {k: v for k, v in R.items() if k.endswith("_PASS")}
    R["OVERALL_PASS"] = all(passes.values())
    json.dump(R, open(os.path.join(od, "results.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    print(json.dumps(passes, indent=1)); print("OVERALL", R["OVERALL_PASS"])
    sys.exit(0 if R["OVERALL_PASS"] else 1)

if __name__ == "__main__":
    main()
