"""
HD TRANSİT — BAĞIMSIZ SAAT DİLİMİ REFERANSI (Python zoneinfo + IANA tzdata paketi). TypeScript / Intl / ICU kodu KULLANMAZ.

  python scripts/hd-transit/timezone-reference.py <çıktı.json> [tohum]

Her örnek: IANA bölgesi + yerel tarih + yerel saat (dakika) → beklenen sonuç:
  • "ok"        → tek UTC anı + ofset (saniye)
  • "gap"       → yerel saat o bölgede hiç yaşanmadı (ileri alma / atlanan gün)
  • "ambiguous" → iki kez yaşandı; iki ofset (saniye)
Yöntem: naive yerel saat fold=0 ve fold=1 ile UTC'ye çevrilir; geri dönüşümde aynı yerel saat çıkmazsa "gap";
iki geçerli farklı UTC varsa "ambiguous". Ayrıca her bölgede gerçek ofset geçişleri taranarak geçişin hemen
önü / içi / sonrası örneklenir (sessiz DST düzeltmesi testi).
"""
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, available_timezones

import tzdata

UTC = timezone.utc


def classify(tzname, y, mo, d, h, mi):
    z = ZoneInfo(tzname)
    naive = datetime(y, mo, d, h, mi)
    valid = []
    for fold in (0, 1):
        aware = naive.replace(tzinfo=z, fold=fold)
        u = aware.astimezone(UTC)
        back = u.astimezone(z).replace(tzinfo=None)
        if back == naive:
            off = int(aware.utcoffset().total_seconds())
            if not any(v[0] == u for v in valid):
                valid.append((u, off))
    if not valid:
        return {"kind": "gap"}
    if len(valid) > 1:
        return {"kind": "ambiguous", "offsets": sorted(v[1] for v in valid)}
    u, off = valid[0]
    return {"kind": "ok", "utc": u.strftime("%Y-%m-%dT%H:%M:%S.000Z"), "offset": off}


def transitions(tzname, year):
    """Yıl içindeki ofset değişimleri (UTC saat taraması + dakika hassasiyetinde ikili arama)."""
    z = ZoneInfo(tzname)
    out = []
    t = datetime(year, 1, 1, tzinfo=UTC)
    end = datetime(year + 1, 1, 1, tzinfo=UTC)
    prev = t.astimezone(z).utcoffset()
    step = timedelta(hours=6)
    while t < end:
        n = t + step
        off = n.astimezone(z).utcoffset()
        if off != prev:
            lo, hi = t, n
            while hi - lo > timedelta(minutes=1):
                mid = lo + (hi - lo) / 2
                mid = mid.replace(second=0, microsecond=0)
                if mid <= lo:
                    break
                if mid.astimezone(z).utcoffset() == prev:
                    lo = mid
                else:
                    hi = mid
            out.append((hi, prev, off))
            prev = off
        t = n
    return out


def main():
    out_path = sys.argv[1]
    rng = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 20261020)
    zones = sorted(z for z in available_timezones() if "/" in z and not z.startswith(("Etc/", "SystemV/", "posix", "right")))
    picked = rng.sample(zones, 160)
    must = ["Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Amsterdam", "America/New_York", "America/Los_Angeles",
            "America/Sao_Paulo", "Africa/Johannesburg", "Africa/Nairobi", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata", "Asia/Kathmandu",
            "Asia/Tokyo", "Australia/Sydney", "Australia/Lord_Howe", "Pacific/Auckland", "Pacific/Kiritimati", "Pacific/Apia", "Pacific/Chatham"]
    for m in must:
        if m not in picked:
            picked.append(m)
    cases = []
    # 1) Rastgele tarih + saat (1900–2100)
    for tzname in picked:
        for _ in range(6):
            y = rng.randint(1900, 2100)
            mo = rng.randint(1, 12)
            d = rng.randint(1, 28)
            h = rng.randint(0, 23)
            mi = rng.randint(0, 59)
            cases.append({"tz": tzname, "date": f"{y:04d}-{mo:02d}-{d:02d}", "time": f"{h:02d}:{mi:02d}", "group": "random", **classify(tzname, y, mo, d, h, mi)})
    # 2) Gerçek geçişlerin çevresi (her bölgede rastgele bir yıl + güncel yıllar)
    for tzname in picked:
        for year in {rng.randint(1900, 2100), 2026, 1995}:
            for (u, before, after) in transitions(tzname, year)[:4]:
                local_before = (u + before).replace(tzinfo=None)
                local_after = (u + after).replace(tzinfo=None)
                lo = min(local_before, local_after)
                hi = max(local_before, local_after)
                probes = [lo - timedelta(minutes=1), lo, lo + (hi - lo) / 2, hi - timedelta(minutes=1), hi, hi + timedelta(minutes=1)]
                for p in probes:
                    p = p.replace(second=0, microsecond=0)
                    if p.year < 1900 or p.year > 2100:
                        continue
                    cases.append({"tz": tzname, "date": p.strftime("%Y-%m-%d"), "time": p.strftime("%H:%M"), "group": "transition",
                                  **classify(tzname, p.year, p.month, p.day, p.hour, p.minute)})
    # Tekrarları at
    seen = set()
    uniq = []
    for c in cases:
        k = (c["tz"], c["date"], c["time"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(c)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"source": f"python {sys.version.split()[0]} zoneinfo + tzdata {tzdata.IANA_VERSION}", "zones": len(set(c["tz"] for c in uniq)), "cases": uniq}, f, ensure_ascii=False)
    print(json.dumps({"cases": len(uniq), "zones": len(set(c["tz"] for c in uniq)),
                      "ok": sum(1 for c in uniq if c["kind"] == "ok"), "gap": sum(1 for c in uniq if c["kind"] == "gap"),
                      "ambiguous": sum(1 for c in uniq if c["kind"] == "ambiguous"),
                      "random": sum(1 for c in uniq if c["group"] == "random"), "transition": sum(1 for c in uniq if c["group"] == "transition")}))


if __name__ == "__main__":
    main()
