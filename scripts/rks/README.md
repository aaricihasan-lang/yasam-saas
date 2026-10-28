# RKS-3 — Merkezî Regresyon Koruma Sistemi

Bütün PR'lara hizmet eden tek kapı. Zorunlu GitHub kontrolü **`checks`** (ruleset #26057611) içinde,
RKS-2 satış/stok adımlarından sonra çalışır. Uygulama koduna dokunmaz.

## Akış (her PR / main push)

1. **`selftest.mjs`** — kapının kendi mantığı sentetik senaryolarla doğrulanır (34 kontrol).
2. **`select.mjs`** — `origin/main...HEAD` farkı → her değişen dosya için:
   - modül (`modules.json`), kritik grup, korunan/ertelenen alan,
   - **import grafiği** (`lib/graph.mjs`): dosyayı gerçekten import eden / okuyan A testleri,
   - seçim = kapsayan testler ∪ modülün A testleri ∪ değişen test dosyaları; *geniş* kritik
     değişiklikte (package.json, lock, next/ts config, CI, RKS) bütün A testleri.
3. **`run.mjs`** — seçilen testler sır içermeyen ortamda, `net-guard.mjs` (yalnız 127.0.0.1) altında,
   zaman aşımıyla çalışır; sonuçlar ve politika hataları kapı kararına dönüşür.

## Kapıyı durduran durumlar

| Durum | Açıklama | Owner istisnası (PR etiketi) |
|---|---|---|
| YENI-FAIL | FAIL > 0, çıkış ≠ 0, veya PASS < `minPass` (assertion kaybı / sıfır test) | `known-failures.json` (süreli kayıt) |
| ATLANDI | Çıktıda `ATLANDI` / `N skipped` / `[SKIP]` | — |
| SAYILAMADI / ALTYAPI | Özet satırı yok, çökme, zaman aşımı (ALTYAPI bir kez yeniden denenir) | — |
| AG-IHLALI | Test yerel olmayan bir adrese bağlanmaya çalıştı | — |
| Kritik-korumasız | `kritik` gruptaki dosya hiçbir A testiyle kapsanmıyor | `rks-kritik-onayli` |
| Kapsam ihlali | PR gövdesindeki ` ```rks-kapsam ` bloğu dışında değişen dosya / blok yok | — (eski PR'lar: uyarı) |
| Assertion azalması | Test dosyasında assertion sayısı azaldı ya da envanterdeki test silindi | `rks-assertion-azalma-onayli` |
| Zayıflatma | A testi çıkarma/indirme, `minPass` düşürme, bilinen-FAIL ekleme, CI adımı silme, RKS-2 alt sınırı düşürme, `continue-on-error`/`\|\| true` | `rks-envanter-onayli` |

Etiketleri **yalnız Owner** koyar (süreç kuralı; GitHub teknik olarak token sahibini ayırt edemez).

## PR kapsam bildirimi (yeni PR'larda zorunlu)

PR açıklamasına Owner onaylı dosya kapsamı yazılır:

````
```rks-kapsam
lib/urun-stok/salesHistoryDb.ts
app/urun-stok/satis-gecmisi/**
```
````

`legacy-prs.json` içindeki (RKS-3 öncesi açılmış) PR'larda blok yoksa yalnız uyarı verilir; blok
eklenirse uygulanır. Liste yalnız küçülür, yeni PR eklenmez.

## Sınıflar (`inventory.json`)

- **A** — izole çalıştırmayla doğrulanmış: çıkış 0, okunur özet, FAIL=0, PASS>0, atlama yok, ağ
  ihlali yok, yan etki yok. `calistiran`: `rks3` (bu kapı seçer), `rks2` / `asama1` (mevcut CI adımı
  zaten koşar; kapsam hesabında sayılır, yeniden koşulmaz).
- **B** — inceleme gerekli (main'de FAIL, özet yok, tarayıcı/sunucu gerektirir, sır okur…). Çalıştırılmaz.
- **B-OWNER** — Human Design / Gökyüzü Atlası / Numeroloji / Kozmik: yalnız salt envanter.
- **C** — yasak/ertelenmiş: production/gerçek hesap, Backup / Usage360 / HDAY.
- **ARAC** — test değil (koşucu, üretici).

## Envanteri yenileme (yerel, Owner onayıyla)

```
node scripts/rks/inventory-scan.mjs --out <tmp>/scan.json
POSTGREST_BIN=<postgrest> node scripts/rks/verify-candidates.mjs --scan <tmp>/scan.json --out <tmp>/verify.json
node scripts/rks/build-inventory.mjs --scan <tmp>/scan.json --verify <tmp>/verify.json
```

`verify-candidates.mjs` yalnız ADAY testleri, sır içermeyen ortamda ve `net-guard` altında çalıştırır;
B-OWNER / B / C asla çalıştırılmaz. Envanterde A testini indiren / `minPass` düşüren PR, kapı
tarafından `rks-envanter-onayli` etiketi olmadan reddedilir.

## Yerel kullanım

```
npm run test:rks:selftest
npm run rks:secim -- --base origin/main --out <tmp>/plan.json
node scripts/rks/run.mjs --plan <tmp>/plan.json
```
