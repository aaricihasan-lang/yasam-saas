# RKS-3 — Merkezî Regresyon Koruma Sistemi

Bütün PR'lara hizmet eden tek kapı. Zorunlu GitHub kontrolü **`checks`** (ruleset #26057611) içinde,
RKS-2 satış/stok adımlarından sonra çalışır. Uygulama koduna dokunmaz.

## Akış (her PR / main push)

1. **`selftest.mjs`** — kapının kendi mantığı sentetik senaryolarla doğrulanır (93 kontrol).
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
| Sıfır test (normal modül) | Yeni PR'da testi OLMAYAN (KORUMASIZ) ya da haritada olmayan (HARITASIZ) kod dosyası. Eski PR ve main push: yalnız uyarı. Doküman/görsel ve envanterde B kayıtlı test dosyası hariç | `rks-korumasiz-onayli` |
| ENVANTERSIZ-TEST | Yeni PR'da `scripts/` altında envanterde hiç kaydı olmayan test dosyası (inventory-scan ile aynı test adı kuralı; başka betiğin import ettiği yardımcı modül hariç). Eski PR ve main push: yalnız uyarı | — (envantere gerçek sınıf + gerekçe ile kayıt) |
| YASAK-RED | Planda korunan/ertelenen alan veya A olmayan test (süreç başlatılmadan reddedilir) | — |
| Kapsam ihlali | PR gövdesindeki ` ```rks-kapsam ` bloğu dışında değişen dosya / blok yok | — (eski PR'lar: uyarı) |
| Assertion azalması | Test dosyasında assertion sayısı azaldı ya da envanterdeki test silindi | `rks-assertion-azalma-onayli` |
| Zayıflatma | A testi çıkarma/indirme, `minPass` düşürme, bilinen-FAIL ekleme, CI adımı silme, RKS-2 alt sınırı düşürme, `continue-on-error`/`\|\| true` | `rks-envanter-onayli` |

Raporda ayrıca ve ayrı başlıkla: **"Modül testleri koştu ama bu dosya DOĞRUDAN test edilmiyor"**
(korunuyor sayılmaz) ve **"RKS dışı"** (korunan/ertelenen alan) dosyalar listelenir.

**Değişen test dosyası ürün kodu sayılmaz.** Envanterde **B** kayıtlı bir test dosyası değişirse durumu
`TEST-DOSYASI-B` olur: uyarı olarak görünür, CI'da çalıştırılmaz, hiçbir dosyayı korumaz ve sıfır test
FAIL'i üretmez. Assertion azalması / test silinmesi denetimi bu dosyalara da AYNEN uygulanır. Yalnız B
sınıfı bu yola girer; A (KORUNUYOR), B-OWNER / C / ARAC ve test adı taşımayan `scripts/` dosyaları eski
kurallarla değerlendirilir (otomatik güvenli sayılmaz).

## Güvence düzeyi — ne sağlanır, ne sağlanmaz

| Mekanizma | Sağladığı | Sağlamadığı |
|---|---|---|
| ` ```rks-kapsam ` bloğu | Beyan dışı dosya değişikliğini makine ile yakalar (kaza / kapsam kayması görünür olur) | **Owner onayı değildir**: PR'a yazabilen herkes (Claude dahil) bloğu değiştirebilir |
| İstisna etiketleri | Bilinçli kabulü kayda geçirir, raporda uyarı olarak görünür | **Kimin koyduğu doğrulanmaz**: Claude oturumları Owner hesabının token'ını kullandığı sürece Owner ile ayırt edilemez |
| Owner'ın PR'ı incelemesi ve merge etmesi | Tek gerçek Owner kararı | Teknik olarak zorlanmaz (ayrı kimlik + zorunlu onay kuralı yok) |

Güvenilir Owner doğrulaması için gereken (bu PR uygulamaz, Owner kararı): Claude oturumları için Owner'dan
AYRI bir GitHub kimliği (makine kullanıcısı veya GitHub App; `write`, admin DEĞİL); ruleset'te
`required_approving_review_count: 1` + `require_last_push_approval` + `dismiss_stale_reviews_on_push`;
`scripts/rks/**` ve `.github/**` için CODEOWNERS + code owner onayı. Bundan sonra kapsam/istisna kararı,
PR yazarından farklı Owner hesabının onay (review) kaydından okunabilir.

## Çalıştırma yasağı (B-OWNER / C / ertelenen)

`lib/common.mjs → forbiddenReason()` tek kaynaktır; `runTest()` süreç BAŞLATMADAN önce uygular:
korunan yol deseni (HD / Atlas / Numeroloji / Kozmik), ertelenen desen (Backup / Usage360 / HDAY) ve
envanterde B-OWNER / C / ARAC sınıfı → `YASAK-RED`. CI kapısı (`run.mjs`) ek olarak yalnız A kabul eder.
Öz-test (bölüm 5) bunu envanterdeki her kayıt ve işaretçi dosyalı sentetik betiklerle kanıtlar.
Geçmiş ihlal: `olaylar.json` (28.10.2026, 4 betik).

**Numeroloji Merkezi istisnası (Owner kararı 29.10.2026):** YENİ "Numeroloji Merkezi / Klasik Numeroloji"
modülü normal modüldür (`modules.json → numeroloji-merkezi`) ve RKS-3 korumasındadır. Korunan yol desenden
YALNIZ depo köküne bağlı şu önekler çıkar: `app/numeroloji-merkezi/`, `app/numeroloji-klasik/`,
`app/numeroloji-karsilastirma/`, `app/api/numeroloji-klasik/`, `lib/numeroloji-klasik/`, `scripts/numeroloji-klasik/`.
Mevcut Numeroloji modülü (`app/numeroloji/`, `app/api/numeroloji/`, `lib/numeroloji/`, `app/_premium/numeroloji/`,
`scripts/numeroloji-*` diğer bütün dizinler) korunan / B-OWNER kalır. İstisna yalnız yol desenini açar; envanter
sınıfı (B-OWNER / C / ARAC / B) yine uygulanır. Kanıt: öz-test bölüm 6.

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
