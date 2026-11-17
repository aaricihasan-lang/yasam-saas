# ATL-TZ-2026F — IANA tzdata saat dilimi tablosu üretici (deterministik, ağsız çalışır).
#
# Sorun: uygulama 1970 sonrası (ve backzone tablosu dışındaki) ofsetleri çalışma ortamının ICU/Intl verisinden alıyordu.
# Node 24.15 = ICU 78.2 / tz 2026a; tarayıcı ve Vercel çalışma ortamı da kendi (eski) sürümünü taşır. IANA 2026b–2026f
# değişiklikleri (Küba 2026-11-01'de geri almıyor, Kanada'da kalıcı saatler, Fas, Brezilya 1965/66, ...) bu yüzden
# uygulanmıyordu (Havana 10.11.2026: Atlas UTC−5, doğrusu UTC−4).
#
# Bu betik, sürümü sabitlenmiş resmî IANA TZif derlemesinden (PyPI `tzdata` paketi: IANA kaynağının zic çıktısı,
# backzone'suz varsayılan veri — ICU ile aynı seçim) her bölge için TAM geçiş listesini ve TZif "footer" kalıcı kuralını
# (RFC 9636 §3.3, POSIX TZ) çıkarır. Çıktı: lib/time/tzdb/ianaTable.generated.ts (HD-TZ-00 ortak katman).
# Doğrulama (TZDATA_SRC verilirse): bağımsız kaynak derleyicisi tzcomp.py (resmî kaynak metninden) ile 2037 sonuna kadar
# birebir karşılaştırma; fark varsa üretim DURUR.
#
# Kullanım (repo kökünden; tzdata sürümü IANA ile eşleşmeli):
#   python -m pip install --target <dizin> "tzdata==2026.6"
#   PYTHONPATH=<dizin> TZDATA_SRC=<tzdata2026f açılmış klasör> python scripts/astrology/tz/gen-tz-table.py [ref-fikstür.json]
import hashlib, importlib.resources as ir, json, os, re, struct, sys

import tzdata  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "lib", "time", "tzdb", "ianaTable.generated.ts")  # HD-TZ-00: ortak katman (tek kaynak)
NAME_RE = re.compile(r"^[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+$|^UTC$")  # timeResolution.isValidIanaTimeZone ile aynı
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def b36(n):
    neg, n, s = n < 0, abs(n), ""
    while True:
        n, r = divmod(n, 36)
        s = B36[r] + s
        if n == 0:
            return ("-" if neg else "") + s


def zone_names():
    raw = ir.files("tzdata").joinpath("zones").read_text(encoding="utf-8").split()
    return sorted(z for z in raw if NAME_RE.match(z))


def read_tzif(name):
    """RFC 8536 TZif v2+ 64-bit bölümü: (geçiş anları, her geçişin ofseti, ilk dönem ofseti, footer)."""
    b = ir.files("tzdata.zoneinfo").joinpath(*name.split("/")).read_bytes()

    def hdr(o):
        assert b[o:o + 4] == b"TZif", name
        return struct.unpack(">6l", b[o + 20:o + 44])

    isutc, isstd, leap, timecnt, typecnt, charcnt = hdr(0)
    o = 44 + timecnt * 5 + typecnt * 6 + charcnt + leap * 8 + isstd + isutc
    assert b[o + 4] >= ord("2"), name
    isutc, isstd, leap, timecnt, typecnt, charcnt = hdr(o)
    o += 44
    ts = struct.unpack(">%dq" % timecnt, b[o:o + 8 * timecnt])
    o += 8 * timecnt
    idx = b[o:o + timecnt]
    o += timecnt
    types = [struct.unpack(">lBB", b[o + 6 * i:o + 6 * i + 6])[0] for i in range(typecnt)]
    o += 6 * typecnt + charcnt + leap * 12 + isstd + isutc
    footer = b[o:].decode("ascii").strip("\n")
    return list(ts), [types[i] for i in idx], types[0], footer


_NAME = r"(?:<[A-Za-z0-9+\-]+>|[A-Za-z]{3,})"
_OFF = r"([+-]?\d{1,3}(?::\d{1,2}){0,2})"
_DATE = r"M(\d{1,2})\.(\d)\.(\d)(?:/" + _OFF + r")?"
TZ_RE = re.compile(r"^" + _NAME + _OFF + r"(?:" + _NAME + r"(?:" + _OFF + r")?," + _DATE + r"," + _DATE + r")?$")


def hms(s):
    neg = s.startswith("-")
    p = [int(x) for x in s.lstrip("+-").split(":")] + [0, 0]
    v = p[0] * 3600 + p[1] * 60 + p[2]
    return -v if neg else v


def parse_footer(f, name):
    """POSIX TZ → [stdDoğuSn] | [stdDoğuSn, dstDoğuSn, sAy, sHafta, sGün, sSaatSn, bAy, bHafta, bGün, bSaatSn]."""
    m = TZ_RE.match(f)
    if not m:
        raise SystemExit(f"{name}: desteklenmeyen footer {f!r}")
    std = -hms(m.group(1))
    if m.group(3) is None:
        return [std]
    dst = -hms(m.group(2)) if m.group(2) else std + 3600
    sm, sw, sd = int(m.group(3)), int(m.group(4)), int(m.group(5))
    st = hms(m.group(6)) if m.group(6) else 7200
    em, ew, ed = int(m.group(7)), int(m.group(8)), int(m.group(9))
    et = hms(m.group(10)) if m.group(10) else 7200
    assert 1 <= sm <= 12 and 1 <= em <= 12 and 1 <= sw <= 5 and 1 <= ew <= 5 and 0 <= sd <= 6 and 0 <= ed <= 6, name
    return [std, dst, sm, sw, sd, st, em, ew, ed, et]


def _days(y, m, d):
    import datetime as _dt
    return (_dt.date(y, m, d) - _dt.date(1970, 1, 1)).days


def rule_day(y, m, w, d):
    """Mm.w.d: m. ayın w. (5 = son) d gününün (0 = Pazar) 1970'ten gün sayısı."""
    import calendar
    first = _days(y, m, 1)
    day = 1 + (d - (first + 4) % 7 + 7) % 7 + (w - 1) * 7
    while day > calendar.monthrange(y, m)[1]:
        day -= 7
    return first + day - 1


def expand(trs, rule, until):
    """Açık geçişler + kalıcı kural (timeResolution.ts ile aynı mantık) → `until` öncesi tam liste."""
    out = list(trs)
    if len(rule) == 1:
        return out
    std, dst, sm, sw, sd, st, em, ew, ed, et = rule
    import datetime as _dt
    last = out[-1][0] if out[-1][0] is not None else -(1 << 62)
    y0 = (_dt.datetime(1970, 1, 1) + _dt.timedelta(seconds=max(last, -(1 << 40)))).year - 1 if last > -(1 << 40) else 1550
    ev = []
    for y in range(y0, (_dt.datetime(1970, 1, 1) + _dt.timedelta(seconds=until)).year + 2):
        ev.append((rule_day(y, sm, sw, sd) * 86400 + st - std, dst))
        ev.append((rule_day(y, em, ew, ed) * 86400 + et - dst, std))
    for t, o in sorted(ev):
        if last < t < until and o != out[-1][1]:
            out.append((t, o))
    return out


def encode(name):
    ts, offs, first, footer = read_tzif(name)
    trs = [(None, first)]
    for t, o in zip(ts, offs):
        if o != trs[-1][1]:
            trs.append((t, o))
    if ts and trs[-1][0] != ts[-1]:  # kalıcı kural SON TZif geçişinden sonra başlar → aynı ofsetli olsa da son geçiş korunur
        trs.append((ts[-1], offs[-1]))
    pal = sorted({o for _, o in trs})
    assert len(pal) <= 36, name
    prev, deltas = 0, []
    for t, _ in trs[1:]:
        deltas.append(b36(t - prev))
        prev = t
    return [pal, "".join(B36[pal.index(o)] for _, o in trs), ".".join(deltas), parse_footer(footer, name)], trs, footer


SRC = os.environ.get("TZDATA_SRC", "")
if not SRC or not os.path.isfile(os.path.join(SRC, "backward")):
    raise SystemExit("TZDATA_SRC: IANA tzdata kaynak klasörü (paketle aynı sürüm) gerekli")
# Aynı veriyi paylaşan adlarda tablo anahtarı IANA'nın asıl bölge adı olsun (`backward` Link adları takma ad).
LINK_NAMES = {ln.split()[2] for f in ("backward", "africa", "antarctica", "asia", "australasia", "europe", "northamerica",
              "southamerica", "etcetera") for ln in open(os.path.join(SRC, f), encoding="utf-8") if ln.startswith("Link")}
names = zone_names()
data, links, trs_of, footers = {}, {}, {}, {}
by_key = {}
for z in sorted(names, key=lambda n: (n in LINK_NAMES, n)):
    enc, trs, footer = encode(z)
    trs_of[z], footers[z] = trs, footer
    key = json.dumps(enc, separators=(",", ":"))
    if key in by_key:
        links[z] = by_key[key]
    else:
        by_key[key] = z
        data[z] = enc

# ─── Bağımsız kaynak derlemesiyle (tzcomp.py, resmî metin) karşılaştırma ───────────────────────────────────────────────
src_meta = {}
if SRC:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import tzcomp  # noqa: E402

    ver = open(os.path.join(SRC, "version"), encoding="utf-8").read().strip()
    assert ver == tzdata.IANA_VERSION, f"kaynak {ver} ≠ paket {tzdata.IANA_VERSION}"
    tzcomp.SRC = SRC
    dflt, _, _ = tzcomp.build(False)
    HI = 2145916800  # 2038-01-01Z
    bad = []
    for z in names:
        if z not in dflt:
            continue
        a = [(tzcomp.NEG_INF if t is None else t, o) for t, o in expand(trs_of[z], parse_footer(footers[z], z), HI)]
        b = dflt[z]
        pts = sorted({t for t, _ in a + b if tzcomp.NEG_INF < t < HI})
        for p in [pts[0] - 1 if pts else 0] + pts:
            if tzcomp.offset_at(a, p) != tzcomp.offset_at(b, p):
                bad.append((z, p))
                break
    if bad:
        raise SystemExit(f"TZif ≠ kaynak derlemesi: {bad[:10]} (toplam {len(bad)})")
    tar = os.path.join(SRC, "tzdata-latest.tar.gz")
    src_meta = {"tarballSha256": hashlib.sha256(open(tar, "rb").read()).hexdigest() if os.path.isfile(tar) else None, "sourceCrossCheck": "tzcomp<2038"}

meta = {
    "tzdataVersion": tzdata.IANA_VERSION,
    "source": f"PyPI tzdata {tzdata.__version__} (IANA zic TZif, backzone'suz)",
    **src_meta,
    "generator": "scripts/astrology/tz/gen-tz-table.py",
    "zoneCount": len(data),
    "linkCount": len(links),
    "transitionCount": sum(len(v[1]) - 1 for v in data.values()),
}
lines = [
    "// ÜRETİLMİŞ DOSYA — elle düzenleme. Üretici: scripts/astrology/tz/gen-tz-table.py (ATL-TZ-2026F).",
    "// Sürümü sabitlenmiş IANA tzdata (backzone'suz varsayılan veri) — çalışma ortamının ICU/Intl sürümünden BAĞIMSIZ ofset kaynağı.",
    "// Bölge: [ofset paleti (sn, doğu +), ofset indeksleri (base36; ilk = −∞ dönemi), geçiş anları (UTC sn; base36 ardışık farklar,",
    "// \".\" ayraçlı; ilki 0'dan), son geçişten sonraki kalıcı kural (TZif footer: [std] | [std, dst, ay, hafta, gün, saatSn ×2])].",
    "// TZ_IANA_LINKS: verisi birebir aynı adlar → tablodaki ad.",
    "",
    f"export const TZ_IANA_META = {json.dumps(meta, ensure_ascii=False)} as const;",
    "",
    "export type TzIanaRule = readonly number[];",
    "export type TzIanaZone = readonly [readonly number[], string, string, TzIanaRule];",
    "",
    "export const TZ_IANA_ZONES: Readonly<Record<string, TzIanaZone>> = {",
]
for z, v in sorted(data.items()):
    lines.append(f'  "{z}": {json.dumps(v, separators=(",", ":"))},')
lines += ["};", "", "export const TZ_IANA_LINKS: Readonly<Record<string, string>> = {"]
for z, t in sorted(links.items()):
    lines.append(f'  "{z}": "{t}",')
lines += ["};", ""]
open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print(json.dumps(meta, ensure_ascii=False), os.path.getsize(OUT))

# ─── Harness referans fikstürü (isteğe bağlı): Python zoneinfo (ayrı TZif okuyucu + kendi footer çözümü) ile ───────────
if len(sys.argv) > 1:
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo

    EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

    def zi_off(z, u):
        return int((EPOCH + timedelta(seconds=u)).astimezone(ZoneInfo(z)).utcoffset().total_seconds())

    LO, HI2 = 1735689600, 1893456000  # 2025-01-01 … 2030-01-01: tüm bölgelerde her geçiş ±1 sn
    cases = []
    for z in data:
        ts = [t for t, _ in trs_of[z][1:]]
        probes = set()
        for t in ts:
            if LO <= t < HI2:
                probes |= {t - 1, t, t + 1}
        # footer bölgesi örnekleri (2038–2600) + LMT/erken tarih (1550, 1850, 1900)
        for y in (1550, 1900, 1950, 2038, 2100, 2600):
            for mo in (1, 7):
                probes.add(int((datetime(y, mo, 15, 12, tzinfo=timezone.utc) - EPOCH).total_seconds()))
        for p in sorted(probes):
            cases.append([z, p, zi_off(z, p)])
    json.dump({"meta": meta, "format": "[zone, utcSec, offsetSec] (Python zoneinfo)", "cases": cases},
              open(sys.argv[1], "w", encoding="utf-8"), separators=(",", ":"))
    print("ref cases", len(cases), os.path.getsize(sys.argv[1]))
