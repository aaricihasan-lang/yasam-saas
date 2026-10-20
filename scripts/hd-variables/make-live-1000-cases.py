"""
HD VARIABLES — 1 000 ÇAĞRILIK GERÇEK DOĞRULAMA İÇİN SENTETİK VAKALAR + BAĞIMSIZ BEKLENEN SONUÇLAR (Swiss Ephemeris).
Roxy yanıtı BİLİNMEDEN üretilir ve dosyaya sabitlenir; karşılaştırma sonradan bu dosyaya göre yapılır (beklenen değer
Roxy'ye göre DEĞİŞTİRİLMEZ). Gerçek kişi yok: koordinatlar şehir merkezlerine yakın yuvarlak değerler, anlar rastgele.

  python scripts/hd-variables/make-live-1000-cases.py <ephe_klasörü> <aşama> <çıktı.json>
    aşama 1: 41 çeşitli vaka (1950–2025, altı kıta)
    aşama 2: 150 vaka (1900–2035, tarihsel saat dilimleri, yüksek enlem / güney yarıküre)
    aşama 3: 300 SINIR vakası — seçilen okun boylamı Color / Tone / Base sınırına belirli yay-saniye uzaklıkta
    aşama 4: 120 SINIR vakası — Kuzey Düğüm okları + güven eşiği (≈ 9,86″) çevresi ağırlıklı
    aşama 5: 42 TARİHSEL LMT vakası — UTC ofsetinde saniye olan dönemler (±), Güneş oku Base sınırına 0,3–2,6″ uzaklıkta
             (sağlayıcının ofsetin saniyesini atıp atmadığını ayırt etmek için)
Yerel saat Python zoneinfo ile UTC'den türetilir; DST boşluğu / çakışması olan yerel saatler ATLANIR (ürün bunları 422 ile
reddeder; sağlayıcıya gönderilmez).
"""
import hashlib
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import swisseph as swe

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from importlib import util as _u  # noqa: E402

_spec = _u.spec_from_file_location("sev", __file__.replace("make-live-1000-cases.py", "swiss-ephemeris-variables.py"))
sev = _u.module_from_spec(_spec)
_spec.loader.exec_module(sev)

PLACES = [
    ("Europe/Istanbul", 41.01, 28.98), ("Europe/Istanbul", 39.93, 32.86), ("Europe/London", 51.51, -0.13), ("Europe/Berlin", 52.52, 13.40),
    ("Europe/Madrid", 40.42, -3.70), ("Europe/Moscow", 55.76, 37.62), ("Atlantic/Reykjavik", 64.15, -21.94), ("Europe/Oslo", 69.65, 18.96),
    ("America/New_York", 40.71, -74.01), ("America/Chicago", 41.88, -87.63), ("America/Los_Angeles", 34.05, -118.24), ("America/Anchorage", 61.22, -149.90),
    ("America/Mexico_City", 19.43, -99.13), ("America/Sao_Paulo", -23.55, -46.63), ("America/Argentina/Buenos_Aires", -34.60, -58.38), ("America/Santiago", -33.45, -70.67),
    ("America/St_Johns", 47.56, -52.71), ("Africa/Cairo", 30.04, 31.24), ("Africa/Lagos", 6.52, 3.38), ("Africa/Johannesburg", -26.20, 28.05),
    ("Africa/Nairobi", -1.29, 36.82), ("Asia/Dubai", 25.20, 55.27), ("Asia/Tehran", 35.69, 51.39), ("Asia/Kolkata", 28.61, 77.21),
    ("Asia/Kathmandu", 27.72, 85.32), ("Asia/Shanghai", 31.23, 121.47), ("Asia/Tokyo", 35.68, 139.69), ("Asia/Jakarta", -6.21, 106.85),
    ("Australia/Sydney", -33.87, 151.21), ("Australia/Adelaide", -34.93, 138.60), ("Australia/Lord_Howe", -31.55, 159.08), ("Pacific/Auckland", -36.85, 174.76),
    ("Pacific/Chatham", -43.95, -176.55), ("Pacific/Honolulu", 21.31, -157.86), ("Pacific/Kiritimati", 1.87, -157.36), ("Pacific/Apia", -13.83, -171.76),
]
SIGNIFICANT = {"determination": ("design", swe.SUN), "environment": ("design", swe.TRUE_NODE), "motivation": ("birth", swe.SUN), "perspective": ("birth", swe.TRUE_NODE)}
MARGIN_DEG = 0.002737909255830788  # sağlayıcının belgelenmiş güven payı (≈ 9,86″) — yalnız beklenen bayrak için


def jd_from_dt(dt):
    return swe.julday(dt.year, dt.month, dt.day, dt.hour + dt.minute / 60 + dt.second / 3600, swe.GREG_CAL)


def local_of(dt_utc, tz):
    """UTC → yerel (saniye); yerel saat boşluk / çakışmadaysa None."""
    z = ZoneInfo(tz)
    loc = dt_utc.astimezone(z)
    naive = loc.replace(tzinfo=None)
    a = naive.replace(tzinfo=z, fold=0)
    b = naive.replace(tzinfo=z, fold=1)
    if a.utcoffset() != b.utcoffset():
        return None  # çakışma (iki kez yaşanan saat)
    if a.astimezone(timezone.utc) != dt_utc:
        return None
    return loc


def arrow_lon(dt_utc, key):
    jb = jd_from_dt(dt_utc)
    side, body = SIGNIFICANT[key]
    jd = sev.design_jd(jb) if side == "design" else jb
    return sev.lon_at(jd, body)


def expected(dt_utc):
    jb = jd_from_dt(dt_utc)
    jdd = sev.design_jd(jb)
    out = {}
    for key, (side, body) in SIGNIFICANT.items():
        s = sev.sub(sev.lon_at(jdd if side == "design" else jb, body))
        s["direction"] = "left" if s["tone"] <= 3 else "right"
        s["expectedConfident"] = s["toneMarginArcsec"] > MARGIN_DEG * 3600
        out[key] = s
    return {"designJd": jdd, "arrows": out}


def make_case(cid, stage, dt_utc, place, extra=None):
    tz, lat, lon = place
    loc = local_of(dt_utc, tz)
    if loc is None:
        return None
    c = {"id": cid, "stage": stage, "utc": dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "date": loc.strftime("%Y-%m-%d"), "time": loc.strftime("%H:%M:%S"),
         "timezone": tz, "latitude": lat, "longitude": lon, "nodeType": "true", "expected": expected(dt_utc)}
    if extra:
        c["target"] = extra
    return c


def rand_dt(rng, y0, y1):
    start = datetime(y0, 1, 1, tzinfo=timezone.utc)
    span = (datetime(y1, 12, 31, 23, 59, 59, tzinfo=timezone.utc) - start).total_seconds()
    return start + timedelta(seconds=int(rng.random() * span))


def boundary_target(lon, level, offset_arcsec):
    """lon'a en yakın `level` sınırı + işaretli uzaklık (yay-saniye) → hedef boylam."""
    step = {"color": sev.COLOR, "tone": sev.TONE, "base": sev.BASE}[level]
    rel = (lon - sev.START_41) % 360.0
    k = round(rel / step)
    if level == "base" and k % 5 == 0:  # Tone sınırı olmayan iç Base sınırını seç
        k += 1 if rel / step >= k else -1
    if level == "tone" and k % 6 == 0:
        k += 1 if rel / step >= k else -1
    return (sev.START_41 + k * step + offset_arcsec / 3600.0) % 360.0


def solve_time(dt0, key, target, window_h):
    """dt0 çevresinde arrow_lon(t) = target olan anı bul (tarama + ikiye bölme); bulunamazsa None."""
    step = timedelta(minutes=20 if SIGNIFICANT[key][1] == swe.SUN else 360)
    t = dt0 - timedelta(hours=window_h)
    end = dt0 + timedelta(hours=window_h)
    f = lambda tt: sev.angdiff(arrow_lon(tt, key), target)  # noqa: E731
    prev_t, prev_f = t, f(t)
    while t < end:
        t = t + step
        ft = f(t)
        if prev_f == 0:
            return prev_t
        if (prev_f < 0) != (ft < 0) and abs(prev_f - ft) < 5:
            lo, hi, flo = prev_t, t, prev_f
            for _ in range(60):
                mid = lo + (hi - lo) / 2
                fm = f(mid)
                if (fm < 0) == (flo < 0):
                    lo, flo = mid, fm
                else:
                    hi = mid
            return lo + (hi - lo) / 2
        prev_t, prev_f = t, ft
    return None


# Aşama 5: standart saatten ÖNCEKİ yerel ortalama saat (ofsetinde SANİYE olan) dönemler — pozitif ve negatif ofsetler.
LMT_PLACES = [
    ("Europe/Istanbul", 41.01, 28.98, 1901, 1909), ("Asia/Tehran", 35.69, 51.39, 1901, 1934), ("Europe/Moscow", 55.76, 37.62, 1901, 1915),
    ("Africa/Nairobi", -1.29, 36.82, 1901, 1907), ("Asia/Dubai", 25.20, 55.27, 1901, 1919), ("Asia/Kathmandu", 27.72, 85.32, 1901, 1919),
    ("Asia/Jakarta", -6.21, 106.85, 1901, 1922), ("America/Caracas", 10.49, -66.88, 1901, 1911), ("America/Sao_Paulo", -23.55, -46.63, 1901, 1913),
    ("America/Argentina/Buenos_Aires", -34.60, -58.38, 1901, 1919), ("America/Mexico_City", 19.43, -99.13, 1901, 1921), ("Pacific/Apia", -13.83, -171.76, 1901, 1910),
    ("America/Santiago", -33.45, -70.67, 1901, 1909), ("Africa/Lagos", 6.52, 3.38, 1901, 1904),
]


def stage_cases(stage, rng, n):
    cases = []
    i = 0
    while len(cases) < n:
        i += 1
        place = rng.choice(PLACES)
        cid = f"S{stage}-{len(cases) + 1:03d}"
        if stage == 5:
            tz, lat, lon, y0, y1 = LMT_PLACES[len(cases) % len(LMT_PLACES)]
            key = "motivation" if len(cases) % 2 == 0 else "determination"
            off = rng.choice([0.3, 0.6, 1.0, 1.4, 1.8, 2.2, 2.6]) * rng.choice([-1, 1])
            dt0 = rand_dt(rng, y0, y1)
            sol = solve_time(dt0, key, boundary_target(arrow_lon(dt0, key), "base", off), 30)
            if sol is None:
                continue
            sol = sol.replace(microsecond=0) + timedelta(seconds=1 if sol.microsecond >= 500000 else 0)
            offs = sol.astimezone(ZoneInfo(tz)).utcoffset().total_seconds()
            if offs % 60 == 0:
                continue  # bu anda ofsette saniye yok — LMT vakası değil
            c = make_case(cid, 5, sol, (tz, lat, lon), {"arrow": key, "level": "base", "requestedOffsetArcsec": off, "utcOffsetSeconds": offs})
            if c is not None:
                cases.append(c)
            continue
        if stage == 1:
            c = make_case(cid, 1, rand_dt(rng, 1950, 2025), place)
        elif stage == 2:
            c = make_case(cid, 2, rand_dt(rng, 1900, 2035), place)
        else:
            keys = ["determination", "environment", "motivation", "perspective"]
            if stage == 4:
                keys = ["environment", "perspective", "environment", "perspective", "determination", "motivation"]
            key = keys[len(cases) % len(keys)]
            level = rng.choice(["color", "tone", "tone", "base"] if stage == 3 else ["tone", "tone", "color", "base"])
            if stage == 3:
                mag = rng.choice([0.2, 0.5, 1, 2, 3, 5, 8, 9.5, 10.5, 12, 15, 20, 30])
            else:
                mag = rng.choice([8.5, 9.3, 9.7, 10.0, 10.4, 11.0, 0.5, 2.0, 5.0])
            if level == "base":
                mag = min(mag, 9.0)
            off = mag * rng.choice([-1, 1])
            dt0 = rand_dt(rng, 1930, 2030)
            tgt = boundary_target(arrow_lon(dt0, key), level, off)
            sol = solve_time(dt0, key, tgt, 30 if SIGNIFICANT[key][1] == swe.SUN else 24 * 40)
            if sol is None:
                continue
            sol = sol.replace(microsecond=0) + timedelta(seconds=1 if sol.microsecond >= 500000 else 0)
            c = make_case(cid, stage, sol, place, {"arrow": key, "level": level, "requestedOffsetArcsec": off})
        if c is None:
            continue
        cases.append(c)
    return cases


def main():
    ephe, stage, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    swe.set_ephe_path(ephe)
    n = {1: 41, 2: 150, 3: 300, 4: 120, 5: 42}[stage]
    rng = random.Random(20261020 + stage)
    cases = stage_cases(stage, rng, n)
    body = {"source": f"pyswisseph {swe.version} SWIEPH; görünen; gerçek düğüm; Design = Güneş −88° (ikiye bölme); tzdata zoneinfo",
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "stage": stage, "cases": cases}
    raw = json.dumps(body, ensure_ascii=False, indent=1)
    open(out, "w", encoding="utf-8").write(raw)
    print(f"aşama {stage}: {len(cases)} vaka, sha256 {hashlib.sha256(raw.encode('utf-8')).hexdigest()} -> {out}")


if __name__ == "__main__":
    main()
