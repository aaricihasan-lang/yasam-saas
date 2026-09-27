# -*- coding: utf-8 -*-
"""
scripts/cosmic-2100/generate_ingress_catalog.py

G5 — Gece yarısı sınırındaki burç girişleri için DOĞRULANMIŞ düzeltme kataloğunu üretir
(lib/cosmic/ingressCatalog.ts → INGRESS_CATALOG).

Girdi: scripts/cosmic-longrange compare.py çıktısı (results.json) — production'ın Türkiye gününü
Swiss Ephemeris'ten FARKLI verdiği giriş olayları (signchange_events.diffs + sign_period.diffs).
Her olay için:
  1) NASA/JPL Horizons (DE441; görünür, yer merkezli, tarihin ekliptiği; UT) ile SWE anı ±12 saat
     penceresinde 2 dakikalık adımla (doğrusal ara değer) sınır geçişi çözülür.
  2) JPL anının Türkiye (UTC+3) günü SWE günüyle AYNI olmalı (iki bağımsız kaynak uyumu) — değilse
     katalog üretimi durur (belirsiz olay; elle inceleme gerekir).
Çıktı yalnız bu olayları içerir; diğer tüm girişler motorun kendi hesabıdır.

Kullanım: python scripts/cosmic-2100/generate_ingress_catalog.py <results.json>
"""
import json, os, sys, time, datetime, urllib.request, urllib.parse
RES = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lib", "cosmic", "ingressCatalog.ts")
JPL_ID = {"Güneş": "10", "Merkür": "199", "Venüs": "299", "Mars": "499", "Jüpiter": "599", "Satürn": "699",
          "Uranüs": "799", "Neptün": "899", "Plüton": "999"}
SIGNS = ["Koç","Boğa","İkizler","Yengeç","Aslan","Başak","Terazi","Akrep","Yay","Oğlak","Kova","Balık"]

def tr_day(dt): return (dt + datetime.timedelta(hours=3)).strftime("%Y-%m-%d")

def jpl_crossing(planet, ref_utc):
    t = datetime.datetime.fromisoformat(ref_utc)
    a, b = t - datetime.timedelta(hours=12), t + datetime.timedelta(hours=12)
    q = {"format": "text", "COMMAND": f"'{JPL_ID[planet]}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'500@399'", "START_TIME": f"'{a.strftime('%Y-%m-%d %H:%M')}'", "STOP_TIME": f"'{b.strftime('%Y-%m-%d %H:%M')}'",
         "STEP_SIZE": "'2m'", "QUANTITIES": "'31'", "TIME_TYPE": "'UT'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'"}
    txt = urllib.request.urlopen("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q, safe="'"), timeout=300).read().decode()
    s, e = txt.find("$$SOE"), txt.find("$$EOE")
    rows = []
    for r in txt[s + 5:e].strip().splitlines():
        p = [x.strip() for x in r.split(",")]
        rows.append((datetime.datetime.strptime(p[0], "%Y-%b-%d %H:%M").replace(tzinfo=datetime.UTC), float(p[3])))
    time.sleep(1)
    for (t0, l0), (t1, l1) in zip(rows, rows[1:]):
        if int(l0 // 30) != int(l1 // 30):
            # 360°→0° sarması: l1'i l0'a göre aç (Koç/Balık sınırı)
            u1 = l1 + 360.0 if l1 - l0 < -180 else l1 - 360.0 if l1 - l0 > 180 else l1
            target = round(max(l0, u1) / 30.0 - 0.5) * 30.0 if False else (int(max(l0, u1) // 30)) * 30.0
            f = (target - l0) / (u1 - l0) if u1 != l0 else 0.0
            return t0 + (t1 - t0) * f, int(l1 // 30) % 12
    return None, None

events = {}
for d in RES.get("signchange_events", {}).get("diffs", []) + RES.get("sign_period", {}).get("diffs", []):
    events[(d["planet"], d["ref_utc"][:16])] = d
entries = []
for (planet, _), d in sorted(events.items(), key=lambda kv: kv[1]["ref_utc"]):
    ref_dt = datetime.datetime.fromisoformat(d["ref_utc"])
    jt, to_sign = jpl_crossing(planet, d["ref_utc"])
    if jt is None: sys.exit(f"JPL geçişi bulunamadı: {planet} {d['ref_utc']}")
    if tr_day(jt) != tr_day(ref_dt):
        sys.exit(f"BELİRSİZ: {planet} {d['ref_utc']} — JPL TR günü {tr_day(jt)} ≠ SWE TR günü {tr_day(ref_dt)} (elle inceleyin)")
    entries.append({"planet": planet, "toSign": to_sign, "exactUtc": jt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "sweUtc": ref_dt.strftime("%Y-%m-%dT%H:%M:%SZ"), "deltaMin": round((jt - ref_dt).total_seconds() / 60, 1)})
    print(planet, SIGNS[to_sign], "JPL", entries[-1]["exactUtc"], "SWE", entries[-1]["sweUtc"], "Δ", entries[-1]["deltaMin"], "dk · TR", tr_day(jt))

src = open(OUT, encoding="utf-8").read()
a = src.index("export const INGRESS_CATALOG: ReadonlyArray<IngressCatalogEntry> = [")
b = src.index("];", a) + 2
body = "export const INGRESS_CATALOG: ReadonlyArray<IngressCatalogEntry> = [\n"
for e in entries:
    body += (f'  {{ planet: "{e["planet"]}", toSign: {e["toSign"]}, exactUtc: "{e["exactUtc"]}", '
             f'source: "JPL Horizons DE441 (SWE {e["sweUtc"]}, Δ {e["deltaMin"]} dk) — {SIGNS[e["toSign"]]}" }},\n')
body += "];"
open(OUT, "w", encoding="utf-8", newline="\n").write(src[:a] + body + src[b:])
print(f"yazıldı: {len(entries)} giriş → {OUT}")
