# Golden Dataset — Köken (Provenance) Günlüğü

Her golden vakanın **kökeni** burada kayıtlıdır. Amaç: hangi referans çıktısının
ne zaman, hangi kaynaktan, hangi astronomik temelle elle alındığını izlenebilir
kılmak.

## Etik / telif sözleşmesi (bağlayıcı)
- Referanstan **yalnız olgusal çıktı** alınır: gate, line, type, authority,
  profile, definition, centers, channels, incarnation cross **gate'leri/adı**.
- **Yorum/anlam metinleri kopyalanmaz ve yayınlanmaz.**
- **Ölçekli scraping yapılmaz**; vakalar **elle** küratörlenir.
- Bu, FAZ 1C kararının uygulamasıdır (bkz. `docs/human-design/faz-1-efemeris-karar.md`).

## Vaka kayıt tablosu

| caseId | input (date / time / tz) | referenceSource | capturedAt | ephemerisBasis | boundaryFlag | curator | not |
|---|---|---|---|---|---|---|---|
| _(şablon)_ HD-GOLD-0000 | — | — | — | — | — | — | template, sayılmaz |

> Yeni vaka eklerken: `cases/HD-GOLD-0000.template.json` dosyasını kopyala →
> `cases/HD-GOLD-NNNN.json` olarak yeniden adlandır → `schema.json`'a uygun doldur →
> bu tabloya bir satır ekle.
