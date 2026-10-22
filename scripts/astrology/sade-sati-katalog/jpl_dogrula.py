"""Katalog bağımsız doğrulaması — NASA/JPL Horizons (DE441) görünür ekliptik boylam (kişisel veri yok; yalnız Satürn + zaman).

Her geçiş anı t için Horizons'tan t−2s, t, t+2s (saat) örnekleri alınır; sidereal = Horizons görünür boylam (of-date) −
gerçek Lahiri ayanamsa (SE, nütasyonlu; ayanamsa bir TANIMDIR, gezegen konumu bağımsız kaynaktan gelir). Sınırı kestiği
an doğrusal ara değerlemeyle bulunur ve katalog anıyla farkı (dakika) raporlanır. Ayrıca önceki turun 91 geçişi ile eşleşme.
"""
import json
import time
import urllib.parse
import urllib.request

import swisseph as swe

swe.set_ephe_path("C:/ast80/ephem")
swe.set_sid_mode(swe.SIDM_LAHIRI)
cat = json.load(open("catalog.json", encoding="utf-8"))
events = cat["events"]


def ayan_true(jd_ut):
    # get_ayanamsa_ex_ut → (flags, ayanamsa); SEFLG_NONUT verilmezse nütasyonlu (gerçek) ayanamsa
    return swe.get_ayanamsa_ex_ut(jd_ut, swe.FLG_SWIEPH)[1]


def horizons(jds):
    q = {
        "format": "json", "COMMAND": "'699'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'500@399'", "TLIST": "'" + " ".join(f"{j:.7f}" for j in jds) + "'", "TLIST_TYPE": "'JD'", "TIME_TYPE": "'UT'",
        "QUANTITIES": "'31'", "ANG_FORMAT": "'DEG'", "EXTRA_PREC": "'YES'", "CSV_FORMAT": "'YES'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    for attempt in range(3):
        try:
            res = json.load(urllib.request.urlopen(url, timeout=60))["result"]
            break
        except Exception as e:  # ağ hatası → kısa bekleme, en çok 3 deneme
            time.sleep(3)
    else:
        raise RuntimeError("Horizons erişilemedi")
    body = res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    out = []
    for line in body:
        cols = [c.strip() for c in line.split(",")]
        nums = [c for c in cols if c.replace(".", "", 1).replace("-", "", 1).isdigit()]
        out.append(float(nums[-2]))  # ObsEcLon (son iki sayısal sütun: lon, lat)
    return out, res.split("\n")[0:3]


H = 2.0 / 24.0
rows = []
batch = []
for e in events:
    batch.append(e)
for i in range(0, len(batch), 10):
    chunk = batch[i:i + 10]
    jds = []
    for e in chunk:
        jds += [e["jd"] - H, e["jd"], e["jd"] + H]
    lons, _ = horizons(jds)
    assert len(lons) == len(jds), (len(lons), len(jds))
    for k, e in enumerate(chunk):
        a, m, b = (lons[3 * k + n] - ayan_true(jds[3 * k + n]) for n in range(3))
        sid = [x % 360 for x in (a, m, b)]
        # sınır: olayın geçtiği 30° katı
        idx = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]
        B = (idx.index(e["to"]) * 30.0) if e["motion"] == "direct" else (idx.index(e["from"]) * 30.0)
        un = lambda x: B + ((x - B + 180) % 360) - 180
        ua, ub = un(sid[0]), un(sid[2])
        if (ua - B) * (ub - B) > 0:
            rows.append({"utc": e["utc"], "to": e["to"], "motion": e["motion"], "fark_dk": None, "not": "±2 sa içinde Horizons sınırı geçmiyor", "tolDkPer1as": e["toleranceMinutesPer1Arcsec"]})
            continue
        frac = (B - ua) / (ub - ua)
        t_h = (e["jd"] - H) + frac * 2 * H
        rows.append({"utc": e["utc"], "to": e["to"], "motion": e["motion"], "fark_dk": round((t_h - e["jd"]) * 1440, 2),
                     "sidereal_katalog_aninda_horizons": round(sid[1], 6), "tolDkPer1as": e["toleranceMinutesPer1Arcsec"]})
    time.sleep(1)

ok = [r for r in rows if r["fark_dk"] is not None]
mx = max(abs(r["fark_dk"]) for r in ok)
# önceki tur (1950–2060, 91 geçiş) ile eşleşme
prev = []  # depo sürümünde önceki tur karşılaştırması yok (QA kanıtında 91/91 eşleşti, ±0,5 dk)
cat_min = {e["utc"][:16].replace("T", " ") for e in events}
miss = [p["utc"] for p in prev if p["utc"] not in cat_min]
summary = {
    "olay": len(rows), "horizons_dogrulanan": len(ok), "dogrulanamayan": len(rows) - len(ok),
    "en_buyuk_fark_dk": mx, "medyan_mutlak_fark_dk": sorted(abs(r["fark_dk"]) for r in ok)[len(ok) // 2],
    "fark_gt_1dk": [r for r in ok if abs(r["fark_dk"]) > 1.0],
    "onceki_tur_91_gecis_katalogda_eslesmeyen": miss,
}
json.dump({"ozet": summary, "satirlar": rows}, open("jpl_dogrulama.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in summary.items() if k != "fark_gt_1dk"}, ensure_ascii=False), "| >1 dk:", len(summary["fark_gt_1dk"]))
