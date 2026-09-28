# -*- coding: utf-8 -*-
"""
scripts/cosmic-2100/generate_hijri_table.py

Kozmik Ajanda — KANONİK Hicri ay-başı tablosunu ÜRETİR (lib/calendar/hijriUmmAlQuraTable.ts).
Çalışma zamanında tarayıcı/ICU (Intl islamic-umalqura) KULLANILMAZ; bu tablo tek kaynaktır.

İki segment (yöntem adı her gün için ayrıca etiketlenir):
  1) RESMÎ Umm al-Qura tablosu — 1343 AH … 1500 AH (1924-08-01 … 2077-11-16).
     Kaynak: hijridate 2.6 (MIT) ummalqura.MONTH_STARTS — KACST / Umm al-Qura gazetesi resmî
     yayınlarından derlenmiş, doğrulanmış tablo (R.H. van Gent derlemesi).
  2) Umm al-Qura KRİTERİYLE HESAPLANMIŞ — 1501 AH … 1524 AH (2077-11-17 … ~2102).
     Resmî tablo YAYIMLANMAMIŞ dönem. Resmî Umm al-Qura kuralı (1423 AH+) Mekke için uygulanır:
       ayın 29. günü (Mekke, UTC+3) gün batımında (a) jeosentrik kavuşum gün batımından ÖNCE
       gerçekleşmişse VE (b) Ay, Güneş'ten SONRA batıyorsa → ertesi gün yeni ayın 1'i; aksi 30 gün.
     Efemeris: Swiss Ephemeris (DE431 .se1 dosyaları; SE_EPHE_PATH).
     |Ay batışı − gün batımı| < 2 dk veya |kavuşum − gün batımı| < 10 dk olan aylar "sınırda"
     (marginal) işaretlenir — kaynaklar arasında 1 gün fark doğabilecek aylar.

Kriterin doğruluğu resmî segmentte ölçülür (aynı kural 1447–1500 AH'ye uygulanıp resmî tabloyla
karşılaştırılır) ve sonuç üretilen dosyanın başlığına yazılır.

Kullanım:
  pip install hijridate==2.6.0 pyswisseph
  SE_EPHE_PATH=/path/to/ephe python scripts/cosmic-2100/generate_hijri_table.py
"""
import os, sys, datetime
import swisseph as swe
from hijridate import ummalqura

EPHE = os.environ.get("SE_EPHE_PATH")
if not EPHE or not os.path.isdir(EPHE):
    sys.exit("SE_EPHE_PATH (Swiss Ephemeris .se1 klasörü) gerekli")
swe.set_ephe_path(EPHE)
FL = swe.FLG_SWIEPH
MECCA = (39.8262, 21.4225, 277.0)          # lon, lat, elev (m)
FIRST_YEAR, OFFICIAL_LAST_YEAR, LAST_YEAR = 1343, 1500, 1524
RULE_FROM_YEAR = 1423   # mevcut Umm al-Qura kuralının yürürlükte olduğu ilk yıl (ölçüm yalnız bundan sonra)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lib", "calendar", "hijriUmmAlQuraTable.ts")

def jdn_to_date(jdn):
    return datetime.date(1970, 1, 1) + datetime.timedelta(days=jdn - 2440588)

def mecca_midnight_jd(jdn):
    d = jdn_to_date(jdn)
    return swe.julday(d.year, d.month, d.day, 0.0) - 3.0 / 24.0

def event(jd, body, flag):
    res, t = swe.rise_trans(jd, body, flag, MECCA, 0.0, 0.0, FL)
    return t[0] if res == 0 else None

def elong(jd):
    return (swe.calc_ut(jd, swe.MOON, FL)[0][0] - swe.calc_ut(jd, swe.SUN, FL)[0][0] + 180.0) % 360.0 - 180.0

def nearest_conjunction(jd):
    """jd'ye en yakın jeosentrik kavuşum (elongasyon 0) — ±4 gün içinde ikili arama."""
    t = jd - 4.0
    while t < jd + 4.0:
        if elong(t) < 0 <= elong(t + 0.25):
            lo, hi = t, t + 0.25
            for _ in range(60):
                m = (lo + hi) / 2
                if elong(m) < 0: lo = m
                else: hi = m
            return (lo + hi) / 2
        t += 0.25
    raise RuntimeError("kavuşum bulunamadı")

def criterion(day1_jdn):
    """Ay başı JDN'si verilen ay için kuralla sonraki ay başı + sınır bilgisi."""
    j0 = mecca_midnight_jd(day1_jdn + 28)
    ss = event(j0, swe.SUN, swe.CALC_SET)
    ms = event(j0, swe.MOON, swe.CALC_SET)
    cj = nearest_conjunction(ss)
    ok = cj < ss and ms is not None and ss < ms < j0 + 1.0
    moon_margin = (ms - ss) * 1440.0 if ms is not None else 999.0
    conj_margin = (ss - cj) * 1440.0
    marginal = abs(moon_margin) < 2.0 or abs(conj_margin) < 10.0
    return day1_jdn + (29 if ok else 30), marginal, round(moon_margin, 2), round(conj_margin, 1)

# ── 1) resmî segment ──
off = ummalqura.HIJRI_OFFSET
starts = []
for y in range(FIRST_YEAR, OFFICIAL_LAST_YEAR + 1):
    for m in range(1, 13):
        idx = (y - 1) * 12 + (m - 1) - off
        starts.append(ummalqura.MONTH_STARTS[idx] + 2400000)
# 1501-01-01 (resmî tablonun kapanış sınırı)
starts.append(ummalqura.MONTH_STARTS[(OFFICIAL_LAST_YEAR) * 12 - off] + 2400000)
official_months = len(starts) - 1

# kriterin resmî segmentte doğruluğu (1447..1500)
agree = total = 0
first_official_mismatch = None
for i in range((RULE_FROM_YEAR - FIRST_YEAR) * 12, official_months):
    nxt, _, _, _ = criterion(starts[i])
    total += 1
    if nxt == starts[i + 1]: agree += 1
    elif first_official_mismatch is None:
        first_official_mismatch = (FIRST_YEAR + i // 12, i % 12 + 1)

# ── 2) kriter segmenti ──
marginal_idx = []
margins = []
for y in range(OFFICIAL_LAST_YEAR + 1, LAST_YEAR + 1):
    for m in range(1, 13):
        i = len(starts) - 1
        nxt, marg, mm, cm = criterion(starts[i])
        if marg: marginal_idx.append(i); margins.append((y, m, mm, cm))
        starts.append(nxt)

first = jdn_to_date(starts[0]); last = jdn_to_date(starts[-1] - 1)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("/**\n * lib/cosmic/hijriUmmAlQuraTable.ts — OTOMATİK ÜRETİLDİ, ELLE DÜZENLEMEYİN.\n")
    f.write(" * Üretici: scripts/cosmic-2100/generate_hijri_table.py\n *\n")
    f.write(f" * Kapsam: 1 Muharrem {FIRST_YEAR} ({first.isoformat()}) … 30/29 Zilhicce {LAST_YEAR} ({last.isoformat()}).\n")
    f.write(f" * Resmî Umm al-Qura tablosu (hijridate 2.6 / KACST): {FIRST_YEAR}–{OFFICIAL_LAST_YEAR} AH = ilk {official_months} ay.\n")
    f.write(f" * Umm al-Qura kriteriyle hesaplanmış (Mekke, Swiss Ephemeris): {OFFICIAL_LAST_YEAR + 1}–{LAST_YEAR} AH.\n")
    f.write(f" * Kriterin resmî segmentte uyumu ({RULE_FROM_YEAR}–{OFFICIAL_LAST_YEAR} AH; kural 1423 AH'den beri yürürlükte): {agree}/{total} ay"
            f"{'' if first_official_mismatch is None else f' (ilk fark {first_official_mismatch[0]}-{first_official_mismatch[1]:02d})'}.\n")
    f.write(f" * Kriter segmentinde sınırda (marginal) ay sayısı: {len(marginal_idx)}"
            + (" — " + ", ".join(f"{y}-{m:02d} (ay−güneş batışı {mm} dk, kavuşum {cm} dk önce)" for y, m, mm, cm in margins) if margins else "") + ".\n")
    f.write(" */\n\n")
    f.write(f"export const UQ_FIRST_HIJRI_YEAR = {FIRST_YEAR};\n")
    f.write(f"export const UQ_OFFICIAL_LAST_HIJRI_YEAR = {OFFICIAL_LAST_YEAR};\n")
    f.write(f"export const UQ_LAST_HIJRI_YEAR = {LAST_YEAR};\n")
    f.write(f"/** Resmî tablodan gelen ay sayısı (bu index'ten itibaren ay başları kriterle hesaplanmıştır). */\n")
    f.write(f"export const UQ_OFFICIAL_MONTH_COUNT = {official_months};\n")
    f.write(f"/** Kriter segmentindeki sınırda (marginal) ayların index'leri. */\n")
    f.write(f"export const UQ_MARGINAL_MONTH_INDEXES: ReadonlyArray<number> = [{', '.join(map(str, marginal_idx))}];\n")
    f.write(f"/** Ay başı Julian Day Number'ları (uzunluk = ay sayısı + 1; son eleman kapanış sınırı). */\n")
    f.write("export const UQ_MONTH_START_JDN: ReadonlyArray<number> = [\n")
    for k in range(0, len(starts), 12):
        f.write("  " + ", ".join(str(x) for x in starts[k:k + 12]) + ",\n")
    f.write("];\n")
print(f"yazıldı: {OUT}")
print(f"aylar: {len(starts) - 1} (resmî {official_months}), kriter-resmî uyum {agree}/{total}, marginal {len(marginal_idx)}", margins)
