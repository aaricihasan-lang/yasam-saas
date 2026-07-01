# HD Engine — Golden Validation Framework (İSKELET)

> **Durum:** FAZ 1.5 iskeleti. Henüz hesap motoru yok; çalıştırılabilir
> `oracle/`, `engine-runner/`, `compare/` dosyaları **FAZ 2'de** eklenecek.
> Bu klasör şu an yalnız **sözleşme + format** belgeler.
>
> Tam tasarım: `docs/human-design/faz-1.5-validation-framework.md`

## Bu harness PRODUCTION'A DOKUNMAZ
- `app/`, `lib/human-design/engine/` ve hiçbir UI dosyası değiştirilmez / import edilmez.
- `scripts/` Next.js tarafından asla import edilmez → **bundle'a girmez**.
- `tsconfig` yalnız `**/*.ts|tsx|mts` derler; buradaki `.mjs/.py/.json` **type-check bile edilmez**.
- Oracle (pyswisseph) yalnız **çevrimdışı referans**tır; üretim bundle'ına asla girmez.

## İki katmanlı doğrulama

| Katman | Soru | Referans | Tolerans |
|---|---|---|---|
| **A — Astronomik** | Boylamlar doğru mu? | pyswisseph (True Node) | konum ≤ 30″ |
| **B — Uçtan uca** | Gate/line/type… doğru mu? | MyBodyGraph golden set (elle) | gate/line + kategorik **birebir** |

- **Katman A** üretim engine'inin ham boylamlarını bağımsız Swiss Ephemeris
  (pyswisseph) çıktısına karşı dener. HD semantiğinden bağımsızdır.
- **Katman B** tam chart çıktısını (gate, line, type, authority, profile,
  definition, centers, channels, incarnation cross) elle küratörlü
  MyBodyGraph referansına karşı dener.

## Verdict düzeyleri: PASS · FAIL · BOUNDARY

- **PASS:** tüm alanlar birebir (Katman B) / tüm boylamlar ≤30″ (Katman A).
- **FAIL:** en az bir sert uyuşmazlık. Çıkış kodu sözleşmesi: `overallVerdict !== "PASS"` → `exit 1`.
- **BOUNDARY (soft):** yalnız sınır-bayraklı (`boundaryFlag:true`) aktivasyonda
  fark. Girdi-hassasiyeti tavanına (doğum dakikası belirsizliği) düşer → **sert
  FAIL sayılmaz**, ama raporda görünür ve sayılır.

## Blame localization
FAIL nedeni sınıflanır:
- `mapping` — Katman A PASS ama gate farklı (mandala ofseti) veya sınır.
- `deterministic-logic` — tüm gate'ler eşleşir ama center/type/authority farklı.
- `design-solver` — design tarafında sistematik gate kayması.
- `boundary` — yalnız sınır-bayraklı aktivasyon (soft).

## Çalıştırma zinciri

### Katman B — gate/line (FAZ 2D, AKTİF)
```
npx tsx scripts/hd-validation/engine-runner/hd_prod_runner.ts  # üretim engine → hd-chart.json
node   scripts/hd-validation/compare/compare_chart.mjs          # gate/line verdict → report.{json,md}
```
- Gerçek golden vaka yoksa `compare_chart.mjs` **NO_GOLDEN_CASES** (exit 0) verir — bu beklenen
  durumdur ve "kalibrasyon yapıldı" anlamına GELMEZ. Mandala ofseti ADAY kalır.
- Yalnız `status='real'` + `compareEligible!==false` vakalar koşulur; `*.example.json` /
  `*.template.json` ve `status='example'` atlanır.

### Katman A — boylam (FAZ 2 sonraki adım, HENÜZ AKTİF DEĞİL)
```
python scripts/hd-validation/oracle/swe_reference.py           # pyswisseph referansı
node   scripts/hd-validation/compare/compare_longitudes.mjs     # AE vs SWE arcsec verdict
```

## Golden dataset sözleşmesi
- Şema: `golden-dataset/schema.json` (tek doğruluk kaynağı).
- Köken günlüğü: `golden-dataset/INDEX.md`.
- Kapsama matrisi: `golden-dataset/COVERAGE.md`.
- Şablon: `golden-dataset/cases/HD-GOLD-0000.template.json` (kopyala → gerçek vaka).
- **Etik:** MyBodyGraph'tan yalnız **olgusal çıktı** (gate/line/type…) elle girilir;
  **yorum metinleri kopyalanmaz/yayınlanmaz**; **ölçekli scraping yapılmaz**.

## Üretilen artefaktlar
`*.json` çıktıları, `*.log`, `report.*` → artefakttır (`.gitignore`'da); yeniden
üretilir, commit edilmez. Yalnız `cases/*.json`, `schema.json` ve `*.md` versiyonlanır.

---

## Continuous Golden Validation Policy (ZORUNLU)

Bu bölüm, Human Design engine'in kapsam (coverage) genişletmesini yöneten kalıcı
süreç sözleşmesidir. Bundan sonraki **tüm** coverage genişletmeleri bu süreci izler.

### 1. Golden dataset tek doğruluk kaynağıdır
`golden-dataset/cases/*.json` (status `real`) engine'in doğruluğunun **tek referans
kaynağıdır**. Engine bu vakalara karşı doğrulanır; vakalar engine'e göre ayarlanmaz.

### 2. Production kullanıcı verisi ASLA doğrudan golden'a eklenmez
Gerçek kullanıcı chart'ı **hiçbir zaman** doğrudan dataset'e girmez. Önce doğrulanır,
**yalnızca PASS olursa** dataset'e alınır. Ham production verisi golden değildir.

### 3. Her yeni gerçek chart şu akışı izler
1. **Kaynak doğrulama** — güvenilir dış HD kaynağı (Genetic Matrix / MyBodyGraph görseli).
2. **OCR doğrulama** — emin olunmayan her değer `OCR_UNCERTAIN` işaretlenir; **tahmin yok**.
3. **UTC doğrulama** — `localDateTimeToUtc` çıktısı kaynağın UTC'siyle karşılaştırılır (LMT/DST/half-hour Δ raporu).
4. **Gate/Line doğrulama** — pyswisseph iç-tutarlılık + tahmini eşleşme ön-kontrolü.
5. **Golden validation** — okunan veriler tablo halinde **onaya sunulur**; onaysız dataset oluşturulmaz.
6. **PASS ise `HD-GOLD-000X` oluşturma** — status `real`, `compareEligible: true`.
7. **Runner + compare + smoke + regression** — tüm mevcut vakalarla birlikte (N→N+1) koşulur; hepsi PASS olmalı.
8. **Ayrı coverage commit** — her genişletme kendi commit'inde izlenir.

### 4. NOT_YET_VALIDATED dürüstçe korunur
Doğrulanamayan kapsamlar (`COVERAGE.md` → NOT_YET_VALIDATED) **uydurma veriyle
kapatılmaz**. Gerçek referans gelene kadar açıkça NOT_YET_VALIDATED kalır.

### 5. Cross Name gates-only kalır
Incarnation cross **tema adı** (Contagion/Laws/…), güvenilir bir 192-cross referans
tablosu sağlanana kadar `status: "gates-only"` olarak kalır; ad **uydurulmaz**.

### 6. Bu süreç zorunludur
Continuous Golden Validation, bundan sonraki tüm coverage genişletmelerinde
**zorunlu süreçtir**. Kestirme yok, doğrulanmamış veri yok, uydurma yok.
