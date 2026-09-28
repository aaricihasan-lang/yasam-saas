# Kozmik Ajanda 2026–2100 — düzeltme araçları ve kalıcı regresyon

- `regression.ts` — G1…G8 + 2100 + sınır (01.01.2026 / 31.12.2100 / 01.01.2101) kalıcı regresyon testleri
  (`npm run test:cosmic:2100`; `test:cosmic:presale` içinde de koşar).
- `generate_hijri_table.py` — `lib/calendar/hijriUmmAlQuraTable.ts` üreticisi:
  resmî Umm al-Qura tablosu (hijridate 2.6 / KACST, 1343–1500 AH) + Umm al-Qura kuralı (Mekke, Swiss Ephemeris,
  1501–1524 AH). Kuralın resmî segmentteki uyumu dosya başlığına yazılır.
- `generate_ingress_catalog.py` — `lib/cosmic/ingressCatalog.ts` (G5) üreticisi: uzun dönem karşılaştırmasında
  production'ın Türkiye gününü yanlış verdiği burç girişleri JPL Horizons DE441 ile çözülür ve Swiss Ephemeris
  ile aynı TR günü doğrulanır.
