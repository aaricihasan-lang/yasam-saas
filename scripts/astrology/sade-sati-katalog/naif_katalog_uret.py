"""Satürn sidereal (Lahiri) burç geçiş kataloğu üreticisi — NAIF DE440 + Skyfield (GELİŞTİRME aracı; üretimde çalışmaz).

Swiss Ephemeris / pyswisseph KULLANMAZ. Bağımlılıklar: skyfield (MIT), jplephem (MIT), numpy (BSD-3).
Efemeris: NAIF genel çekirdeği `de440s.bsp` (değiştirilmemiş; SHA-256 aşağıda doğrulanır, uyuşmazsa DURUR).
  Kaynak: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp

Konum modeli:
  • Geosantrik GÖRÜNÜR konum: Skyfield `earth.at(t).observe(saturn barycenter).apparent()` — ışık zamanı, yıllık
    sapma (aberration) ve Güneş/Jüpiter/Satürn ışık bükülmesi dahil.
  • Çerçeve: Skyfield `ecliptic_frame` = gerçek ekliptik ve GERÇEK ekinoks of date (IAU2006 presesyon + IAU2000A nütasyon).
  • Hedef: "saturn barycenter" (de440s Satürn merkezini içermez; merkez–barisantır farkı < 0,05″).
  • Zaman: argüman UT1 (Skyfield yerleşik ΔT/IERS verisi); çıktı "utc" alanı UT1'in saniyeye yuvarlanmışıdır.
    1972+ geçmiş: |UT1−UTC| < 0,9 sn · 1972 öncesi: UT · gelecek: öngörülen UT1 (artık saniye uygulaması kaldırılırsa sivil
    UTC 2100'e kadar ~1 dk'ya varan fark gösterebilir; ekran dakikaya yuvarlar ve bu notu taşır).

Ayanamsa — Lahiri (ICRC 1955 / IAE 1985 düzeltmesi), IAE gerçekleştirimi (bkz. README §Ayanamsa):
  A0  = 23°15'00,658"  → 21 Mart 1956 0h TT (JD 2435553,5) anındaki GERÇEK ayanamsa (IAE 1989 s.556 dipnotu).
  ort(T0)     = A0 − Δψ80(T0)                      Δψ80: IAU1980 (Wahr) nütasyonu — IAE'nin kullandığı model.
  ort(J2000)  = ort(T0) + p76(T0 → J2000,0)        p76: IAU1976 (Lieske 1977) genel presesyon — IAE'nin kullandığı model.
  ort(t)      = ort(J2000) + p06(t)                 p06: IAU2006 (Capitaine vd. 2003) genel presesyon, J2000,0'dan.
  gerçek(t)   = ort(t) + Δψ00A(t)                   (Skyfield IAU2000A; görünür boylamın nütasyonuyla aynı model → sadeleşir)
  Gerekçe: IAU1976 ve IAU2006 presesyon serileri J2000,0'da çakışacak biçimde tanımlıdır. IAE'nin 1956 değerini kendi
  modeliyle (IAU1976/1980) J2000,0'a taşımak ve oradan güncel modelle (IAU2006) sürdürmek, sabit sidereal başlangıç
  noktasını IAE gerçekleştirimine sadık biçimde modern sisteme aktarır. Sabit hiçbir hedef çıktıya göre AYARLANMAZ.
  Sidereal boylam = görünür boylam (gerçek ekinoks) − gerçek(t).

Kök bulma (deterministik; olay atlanamaz):
  1. İstasyonlar: sidereal boylam hızının işaret değişimi 1 günlük ızgarada aranır; ikiye bölmeyle 1e-7 gün.
     (Satürn istasyonları arası en kısa süre > 100 gün; 1 günlük ızgara bir istasyon çiftini atlayamaz.)
  2. İki istasyon arası hareket monotondur → her 30° sınırı o aralıkta EN FAZLA bir kez geçilir; uç burç farkından
     geçilen her sınır ikiye bölmeyle (1e-7 gün) çözülür. Aynı gün içindeki çift geçişler de bulunur.
Çıktı: catalog.json (+ SHA-256). SHA-256 = TS kataloğundaki olay listesinin kanonik metni (`catalog_canon`) — çalışma
  anında (attach.ts, fail-closed) ve harness'ta aynı kural ile yeniden hesaplanır.
Kullanım: python -X utf8 naif_katalog_uret.py <de440s.bsp yolu> [başlangıç_yılı=1900] [bitiş_yılı=2100]
"""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import skyfield
from skyfield.api import load
from skyfield.framelib import ecliptic_frame
from skyfield.nutationlib import iau2000a_radians

GENERATOR = "naif_katalog_uret.py v2.0"
BSP_SHA256 = "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2"
BSP = sys.argv[1] if len(sys.argv) > 1 else "de440s.bsp"
Y0 = int(sys.argv[2]) if len(sys.argv) > 2 else 1900
Y1 = int(sys.argv[3]) if len(sys.argv) > 3 else 2100
SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]

AS = 1.0 / 3600.0
J2000 = 2451545.0
T0_TT = 2435553.5  # 21 Mart 1956 0h TT (Ephemeris Time)
A0_TRUE_AS = 23 * 3600 + 15 * 60 + 0.658
# Δψ IAU1980 (Wahr) @ T0 = 16,768926843″ — ERFA/SOFA `nut80(2435553.5, 0)` ile hesaplandı (sabit; tek sayı).
DPSI80_T0_AS = 16.768926843


def p76(t):
    """IAU1976 genel presesyon (boylam), J2000,0'dan t Jülyen yüzyılı (Lieske vd. 1977, başlangıç J2000 için), ″."""
    return 5029.0966 * t + 1.11113 * t**2 - 0.000006 * t**3


def p06(t):
    """IAU2006 genel presesyon (boylam) p_A, J2000,0'dan t Jülyen yüzyılı (Capitaine vd. 2003), ″."""
    return 5028.796195 * t + 1.1054348 * t**2 + 0.00007964 * t**3 - 0.000023857 * t**4 - 0.0000000383 * t**5


MEAN_J2000_AS = A0_TRUE_AS - DPSI80_T0_AS + (p76(0.0) - p76((T0_TT - J2000) / 36525.0))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


if sha256_file(BSP) != BSP_SHA256:
    sys.exit(f"DUR: {BSP} SHA-256 beklenen NAIF de440s.bsp değil")

ts = load.timescale()
eph = load(BSP)
EARTH, SATURN = eph["earth"], eph["saturn barycenter"]


def ayan_true_deg(t):
    tc = (t.tt - J2000) / 36525.0
    dpsi, _ = iau2000a_radians(t)
    return (MEAN_J2000_AS + p06(tc)) * AS + np.degrees(dpsi)


def sid_lon(jd):
    """Sidereal (Lahiri) görünür boylam, derece [0,360). jd: UT1 Jülyen günü (skaler ya da dizi)."""
    t = ts.ut1_jd(np.asarray(jd, dtype=float))
    _, lon, _ = EARTH.at(t).observe(SATURN).apparent().frame_latlon(ecliptic_frame)
    return (lon.degrees - ayan_true_deg(t)) % 360.0


H = 0.01  # hız için merkezi fark adımı (gün)


def speed(jd):
    a, b = sid_lon(np.asarray(jd) - H), sid_lon(np.asarray(jd) + H)
    return (((b - a + 180.0) % 360.0) - 180.0) / (2 * H)


def bisect(f, a, b, tol=1e-7):
    fa = f(a)
    for _ in range(200):
        if b - a <= tol:
            break
        m = (a + b) / 2
        fm = f(m)
        if (fm < 0) == (fa < 0):
            a, fa = m, fm
        else:
            b = m
    return (a + b) / 2


def jd_ut1(y, m=1, d=1):
    return float(ts.ut1(y, m, d).ut1)


def iso(jd):
    base = datetime(2000, 1, 1, 12, tzinfo=timezone.utc) + timedelta(days=float(jd) - J2000)
    base = (base + timedelta(microseconds=500_000)).replace(microsecond=0)
    return base.strftime("%Y-%m-%dT%H:%M:%SZ")


def catalog_canon(events):
    """SHA-256 girdisi: her olay için `utc|from|to|motion|tol(2 ondalık)` satırı, satır sonu (LF) ile birleşik (TS ile birebir)."""
    return "\n".join(f'{e["utc"]}|{e["from"]}|{e["to"]}|{e["motion"]}|{e["toleranceMinutesPer1Arcsec"]:.2f}' for e in events)


def main():
    j0, j1 = jd_ut1(Y0 - 2), jd_ut1(Y1 + 3)
    grid = np.arange(j0, j1 + 0.5, 1.0)
    v = speed(grid)
    st = [bisect(lambda t: float(speed(t)), grid[i], grid[i + 1]) for i in np.nonzero(np.sign(v[1:]) != np.sign(v[:-1]))[0]]
    edges = [float(j0)] + st + [float(j1)]
    events = []
    for a, b in zip(edges, edges[1:]):
        la = float(sid_lon(a))
        # Monoton aralıkta Satürn < 20° yol alır (istasyonlar arası ≤ ~9 ay) → ±180° sarma güvenli.
        unwrap = lambda t, R=la: R + ((float(sid_lon(t)) - R + 180.0) % 360.0) - 180.0
        lb = unwrap(b)
        if abs(lb - la) >= 30.0:
            sys.exit(f"DUR: monoton aralık beklenenden uzun ({a}–{b})")
        direct = lb > la
        lo, hi = (la, lb) if direct else (lb, la)
        k = int(lo // 30) + 1
        while k * 30 <= hi:
            B = k * 30.0
            f = lambda t, B=B: unwrap(t) - B
            t = bisect(f, a, b)
            sp = float(speed(t))
            idx = int(round(B / 30))
            to_sign = SIGNS[idx % 12] if direct else SIGNS[(idx - 1) % 12]
            from_sign = SIGNS[(idx - 1) % 12] if direct else SIGNS[idx % 12]
            tol_min = AS / max(abs(sp), 1e-9) * 1440.0
            events.append({
                "jd": round(t, 7),
                "utc": iso(t),
                "from": from_sign,
                "to": to_sign,
                "motion": "direct" if direct else "retrograde",
                "speedDegPerDay": round(sp, 6),
                "toleranceMinutesPer1Arcsec": round(tol_min, 2),
            })
            k += 1
    events.sort(key=lambda e: e["jd"])
    canon = catalog_canon(events)
    meta = {
        "catalog": "saturn-sidereal-lahiri",
        "version": "2",
        "generator": GENERATOR,
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "coverageUtc": {"from": f"{Y0}-01-01T00:00:00Z", "to": f"{Y1}-12-31T23:59:59Z"},
        "scanUtc": {"from": iso(j0), "to": iso(j1)},
        "ephemeris": f"NASA/JPL NAIF DE440 (de440s.bsp, SHA-256 {BSP_SHA256[:12]}…) + Skyfield {skyfield.__version__}",
        "frame": "geocentric apparent (light-time, aberration, deflection), true ecliptic & equinox of date (IAU2006/2000A); Saturn barycenter",
        "ayanamsa": "Lahiri (ICRC/IAE): 23°15'00.658\" true @ 1956-03-21 0h TT; IAE models (IAU1976 precession, IAU1980 nutation) to J2000.0, IAU2006 precession thereafter",
        "timeScale": "UT1 (Skyfield built-in IERS/ΔT model); utc field = UT1 rounded to 1 s. Past (1972+): |UTC-UT1| < 0.9 s; before 1972 = UT; future = predicted UT1 (civil UTC may drift up to ~1 min by 2100 if leap seconds are discontinued)",
        "method": "stations by bisection (1e-7 d) on 1-day grid; monotonic segments; each 30° boundary by bisection (1e-7 d)",
        "stations": len(st),
        "bspSha256": BSP_SHA256,
        "skyfield": skyfield.__version__,
        "eventCount": len(events),
        "sha256": hashlib.sha256(canon.encode()).hexdigest(),
    }
    with open("catalog.json", "w", encoding="utf-8") as fh:
        json.dump({"meta": meta, "stations": [iso(s) for s in st], "events": events}, fh, ensure_ascii=False, indent=1)
    inside = [e for e in events if meta["coverageUtc"]["from"] <= e["utc"] <= meta["coverageUtc"]["to"]]
    print(f"olay {len(events)} (kapsamda {len(inside)}), istasyon {len(st)}, sha256 {meta['sha256']}")
    print("ayanamsa 1990-07-15T11:30Z =", float(ayan_true_deg(ts.utc(1990, 7, 15, 11, 30))), "°")


if __name__ == "__main__":
    main()
