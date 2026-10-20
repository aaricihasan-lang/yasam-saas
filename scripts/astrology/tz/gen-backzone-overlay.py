# ATL-P1-01 / TZ-01 — IANA backzone ofset tablosu üretici (deterministik).
#
# ICU/Node Intl, IANA "backzone" verisini kullanmaz; 1970 öncesi birçok bölgede (Kampala, Reykjavik, Oslo, Amsterdam, ...)
# tarihsel ofset yanlış. Bu script resmî IANA kaynak metninden iki derleme yapar (tzcomp.py: default ve default+backzone),
# yalnız UYGULAMADA SEÇİLEBİLEN ve iki derlemenin farklı olduğu bölgeler için "cutoff + tam backzone geçiş listesi" üretir.
# Cutoff sonrası iki derleme birebir aynıdır → uygulama orada Intl yolunu kullanmaya devam eder.
#
# Kullanım (repo kökünden):
#   TZDATA_SRC=<tzdata-2026e açılmış klasör> python scripts/astrology/tz/gen-backzone-overlay.py [ref-fixture-çıktısı.json]
# Çıktı: lib/astrology/birth/tzBackzoneOverlay.generated.ts (+ isteğe bağlı harness referans fikstürü).
import hashlib, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tzcomp  # noqa: E402

SRC = os.environ.get("TZDATA_SRC", "")
if not SRC or not os.path.isfile(os.path.join(SRC, "backzone")):
    raise SystemExit("TZDATA_SRC: IANA tzdata klasörü (backzone dosyası içeren) gerekli")
HI = 1767225600  # 2026-01-01T00:00:00Z — karşılaştırma üst sınırı
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "lib", "astrology", "birth", "tzBackzoneOverlay.generated.ts")


def sha256(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def app_zones():
    tzs = set(re.findall(r'tz:\s*"([^"]+)"', open(os.path.join(ROOT, "lib/location/tr.ts"), encoding="utf-8").read()))
    tzs |= set(re.findall(r'tz:\s*"([^"]+)"', open(os.path.join(ROOT, "lib/location/world.ts"), encoding="utf-8").read()))
    g = json.load(open(os.path.join(ROOT, "lib/location/server-data/global-cities.json"), encoding="utf-8"))
    tzs |= {x["tz"] for x in g["locations"]}
    return tzs


def cutoff(dflt, bz):
    """Son farklı aralığın bitişi (bu andan sonra iki derleme aynı); fark yoksa None."""
    pts = sorted({t for t, _ in dflt if tzcomp.NEG_INF < t < HI} | {t for t, _ in bz if tzcomp.NEG_INF < t < HI})
    starts = [tzcomp.NEG_INF] + pts
    last = None
    for i, s in enumerate(starts):
        probe = s if s != tzcomp.NEG_INF else (pts[0] - 1 if pts else 0)
        if tzcomp.offset_at(dflt, probe) != tzcomp.offset_at(bz, probe):
            last = starts[i + 1] if i + 1 < len(starts) else HI
    return last


tzcomp.SRC = SRC
dflt_all, _, _ = tzcomp.build(False)
bz_all, _, _ = tzcomp.build(True)
zones = {}
for z in sorted(app_zones()):
    if z not in dflt_all or z not in bz_all:
        continue
    c = cutoff(dflt_all[z], bz_all[z])
    if c is None:
        continue
    trs = [[None if t <= tzcomp.NEG_INF else t, o] for t, o in bz_all[z] if t < c]
    zones[z] = {"cutoff": c, "t": trs}
assert "Europe/Istanbul" not in zones
version = open(os.path.join(SRC, "version"), encoding="utf-8").read().strip()
tar = os.path.join(SRC, "tzdata-latest.tar.gz")
meta = {
    "tzdataVersion": version,
    "tarballSha256": sha256(tar) if os.path.isfile(tar) else None,
    "backzoneSha256": sha256(os.path.join(SRC, "backzone")),
    "generator": "scripts/astrology/tz/gen-backzone-overlay.py",
    "zoneCount": len(zones),
    "transitionCount": sum(len(v["t"]) for v in zones.values()),
}
lines = [
    "// ÜRETİLMİŞ DOSYA — elle düzenleme. Üretici: scripts/astrology/tz/gen-backzone-overlay.py (ATL-P1-01 / TZ-01).",
    "// IANA tzdata backzone ofsetleri: yalnız uygulamada seçilebilen ve ICU/Intl (backzone'suz) sonucundan FARKLI olan",
    "// bölgeler. Her bölge: cutoff (UTC sn; bu andan sonra Intl ile birebir aynı) + o ana kadarki tam geçiş listesi",
    "// [utcSaniye | null (−∞), ofsetSaniye]. Europe/Istanbul tabloda YOK (fark yok).",
    "",
    f"export const TZ_BACKZONE_META = {json.dumps(meta, ensure_ascii=False)} as const;",
    "",
    "export type BackzoneZone = { cutoff: number; t: ReadonlyArray<readonly [number | null, number]> };",
    "",
    "export const TZ_BACKZONE_OVERLAY: Readonly<Record<string, BackzoneZone>> = {",
]
for z, v in zones.items():
    lines.append(f'  "{z}": {{ cutoff: {v["cutoff"]}, t: {json.dumps(v["t"], separators=(",", ":"))} }},')
lines.append("};")
lines.append("")
open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print(json.dumps(meta), os.path.getsize(OUT))

# ─── Harness referans fikstürü (isteğe bağlı) ───────────────────────────────
# Uygulama algoritmasının (±36 sa yoklama) Python aynası; ofset kaynağı: cutoff öncesi backzone, sonrası default derleme.
if len(sys.argv) > 1:
    def off(z, u):
        v = zones[z]
        return tzcomp.offset_at(bz_all[z] if u < v["cutoff"] else dflt_all[z], u)

    def resolve(z, local):
        offs = {off(z, local + p * 3600) for p in (-36, -12, 0, 12, 36)}
        valid = sorted({local - o for o in offs if off(z, local - o) == o})
        if not valid:
            return ["gap"]
        if len(valid) == 1:
            return ["ok", valid[0], off(z, valid[0])]
        return ["ambiguous", valid[0], off(z, valid[0]), valid[-1], off(z, valid[-1])]

    cases = []
    for z, v in zones.items():
        for t, o in v["t"]:
            if t is None:
                continue
            prev = tzcomp.offset_at(bz_all[z], t - 1)
            for base in {t + prev, t + o}:  # geçişin iki yanındaki yerel saat
                for d in (-60, 0, 60):
                    local = base + d
                    cases.append([z, local, *resolve(z, local)])
    json.dump({"meta": meta, "format": "[zone, localNaiveSec, kind, utcSec?, offsetSec?, laterUtcSec?, laterOffsetSec?]", "cases": cases},
              open(sys.argv[1], "w", encoding="utf-8"), separators=(",", ":"))
    print("ref cases", len(cases), os.path.getsize(sys.argv[1]))
