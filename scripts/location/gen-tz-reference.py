# KZM-TZ-01 — lib/location/tz.ts için BAĞIMSIZ IANA referansı (TS çekirdeği lib/time/tzdb KULLANILMAZ).
#   TZDATA_SRC=<IANA tzdata kaynak klasörü (version dosyası içeren)> python scripts/location/gen-tz-reference.py
# Derleyici: scripts/astrology/tz/tzcomp.py (resmî IANA kaynak metninden zic-benzeri derleme; backzone YOK — 2026–2100 aralığında
# backzone etkisizdir). tzcomp kural olaylarını 2040'a kadar üretir; Kozmik desteği 2100'e uzandığı için aynı derleme 2102'ye
# kadar yapılır (yalnız üst yıl sınırı değişir). Çıktı: bölge başına [utc_saniye, ofset_saniye] geçişleri (2025-01-01 öncesindeki
# son durum dahil) — beklenen değerler TS harness'ında bu tablodan HESAPLANIR.
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "..", "astrology", "tz", "tzcomp.py"), encoding="utf-8").read()
assert src.count("else 2040") == 1, "tzcomp.py beklenen biçimde değil"
ns = {"__name__": "tzcomp"}
exec(compile(src.replace("else 2040", "else 2102"), "tzcomp.py", "exec"), ns)
SRC = os.environ["TZDATA_SRC"]
version = open(os.path.join(SRC, "version"), encoding="utf-8").read().strip()
ZONES = ["America/Havana", "America/Winnipeg", "America/Vancouver", "America/Edmonton", "Africa/Casablanca", "Africa/El_Aaiun",
         "Europe/Istanbul", "Europe/Berlin", "Europe/London", "America/New_York", "America/Santiago", "Asia/Tokyo",
         "Asia/Kathmandu", "Pacific/Apia", "America/Asuncion", "Africa/Cairo", "Asia/Beirut", "Asia/Gaza", "Australia/Lord_Howe"]
comp, _, _ = ns["build"](False)
LO, HI = 1735689600, 4133980800 + 2 * 86400  # 2025-01-01 .. 2101-01-03
out = {"source": f"IANA tzdata {version} kaynak metni, scripts/astrology/tz/tzcomp.py (backzone yok, üst yıl 2102)", "tzdataVersion": version, "range": [LO, HI], "zones": {}}
for z in ZONES:
    trs = comp[z]
    before = [t for t in trs if t[0] <= LO]
    rows = [[LO, before[-1][1]]] + [[t, o] for (t, o) in trs if LO < t < HI]
    out["zones"][z] = rows
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "fixtures", "iana-2026f-kozmik.json")
with open(dst, "w", encoding="utf-8", newline="\n") as f:
    json.dump(out, f, separators=(",", ":"))
    f.write("\n")
print(version, {z: len(v) for z, v in out["zones"].items()})
