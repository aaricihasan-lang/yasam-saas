# FAZ 1.5 — Golden Validation Framework (Tasarım Planı)

> Henüz hesap yok. Bu, FAZ 2'de doldurulacak **boş ama tam tanımlı** doğrulama
> iskeletinin tasarımıdır. `scripts/cosmic-validation/` deseninin (üretimden
> bağımsız, bundle'a girmeyen, pyswisseph oracle'lı) HD'ye uyarlanmış halidir.
>
> **Production hesap iddiası yoktur.** FAZ 0 engine iskeleti ve FAZ 1 karar
> dokümanı bu fazda değiştirilmez.

---

## 0. Konumlandırma kararı

Kök: **`scripts/hd-validation/`** (üst düzey `validation/` yerine).
Sebep: `scripts/` Next.js tarafından **asla import edilmez → bundle'a girmez**;
`tsconfig` yalnız `**/*.ts` derler, `.mjs/.py/.json` type-check bile edilmez. Bu,
kozmikte kanıtlanmış izolasyondur. `golden-dataset/` ve `compare/` alt klasörleri
bunun içinde yaşar.

---

## 1. İki katmanlı doğrulama felsefesi (çekirdek)

Sapmayı **izole edebilmek** için doğrulama iki bağımsız katmana ayrılır:

| Katman | Soru | Referans | Tolerans | HD semantiği? |
|---|---|---|---|---|
| **A — Astronomik** | Boylamlar doğru mu? | **pyswisseph (True Node)** — programatik, çevrimdışı | konum **≤ 30″** | Hayır |
| **B — Uçtan uca** | Gate/line/type… doğru mu? | **MyBodyGraph golden set** — elle küratörlü | gate/line **birebir**; kategorik **birebir** | Evet |

**Neden ikisi ayrı:** Katman A, "mandala/grafik mantığından bağımsız olarak
astronomi sağlam mı?"yu objektif bir oracle'a karşı kanıtlar (golden curation
gerektirmez, sınırsız vaka üretilebilir). Katman B, mandala ofseti + 88° solver +
deterministik grafik mantığını gerçek referansa karşı kanıtlar. Bir vaka FAIL
olduğunda **hangi katmandan geldiği** anında belli olur (blame localization §5).

---

## 2. Klasör yapısı

```
scripts/hd-validation/
├── README.md                      # çalıştırma zinciri + tolerans politikası
├── .gitignore                     # tüm *.json çıktıları, *.log → artefakt, commit edilmez
│
├── golden-dataset/
│   ├── schema.json                # FAZ 1D vaka şeması (JSON Schema) — tek doğruluk kaynağı
│   ├── INDEX.md                   # köken/provenance günlüğü (her vaka: kim, ne zaman, kaynak)
│   ├── COVERAGE.md                # kapsama matrisi (§4)
│   └── cases/
│       ├── HD-GOLD-0000.template.json   # şablon (kopyalanır → gerçek vaka)
│       ├── HD-GOLD-0001.json
│       └── …
│
├── oracle/                        # [FAZ 2] KATMAN A referansı (çevrimdışı; üretime girmez)
│   ├── swe_reference.py           # pyswisseph: 13 cisim × (personality+design), True Node
│   └── swe-longitudes.json        # artefakt
│
├── engine-runner/                 # [FAZ 2] üretim motorunu aynı girdilerle koşturur
│   ├── hd_prod_runner.ts          # lib/human-design/engine → ham boylam + tam chart
│   ├── hd-longitudes.json         # artefakt (Katman A girişi)
│   └── hd-chart.json              # artefakt (Katman B girişi)
│
└── compare/                       # [FAZ 2]
    ├── compare_longitudes.mjs     # KATMAN A: AE vs SWE, arcsec verdict
    ├── compare_chart.mjs          # KATMAN B: engine vs golden, alan-alan verdict
    ├── report.json                # makine-okur PASS/FAIL (§6)
    └── report.md                  # insan-okur PASS/FAIL özeti (§6)
```

**FAZ 1.5'te fiziksel oluşanlar:** yalnız `README.md`, `golden-dataset/schema.json`,
`golden-dataset/INDEX.md`, `golden-dataset/COVERAGE.md`, `.gitignore` + 1 şablon vaka.
`oracle/`, `engine-runner/`, `compare/` içindeki çalıştırılabilir dosyalar **FAZ 2'ye
bırakılır** (henüz hesap yok). Bu faz "iskelet + sözleşme"dir, kod değil.

---

## 3. Golden vaka şeması

FAZ 1D formatı `golden-dataset/schema.json` olarak JSON Schema'ya çevrildi (zorunlu
alanlar: `caseId`, `provenance`, `input`, `reference.{personality, design, type,
authority, profile, definition, centers, channels, incarnationCross}`, `tolerance`).
`boundaryFlag` ve opsiyonel `longitude` alanları korunur. Şema hem el-girişini valide
eder hem `compare_chart.mjs`'in beklediği yapıyı sabitler.

---

## 4. Kapsama matrisi (`COVERAGE.md`)

Golden set "rastgele birkaç doğum" değil, **kasıtlı kenar-durum matrisi**:

- **5 type'ın hepsi** (Generator, MG, Manifestor, Projector, Reflector — Reflector özellikle aranır).
- **Tüm authority'ler** (Emotional, Sacral, Splenic, Ego, Self/G, Mental, Lunar).
- **DST geçiş günleri** + savaş-saati + yarım-saatlik timezone (örn. `Asia/Kolkata`).
- **Sınır vakaları** (`boundaryFlag:true`): bilinçle gate/line sınırının ~30″ içine düşen aktivasyonlar.
- **Tarih aralığı** 1920–2030; güney yarımküre; yüksek enlem.
- **88° solver uçları**: Ocak (perihel) ve Temmuz (afel) doğumları — gün sayısı farkını yakalar.
- **True vs Mean node ayrışması** olası vakalar (çapraz-kontrol için).

---

## 5. Karşılaştırma mantığı (granülerlik + blame localization)

**Katman A — `compare_longitudes.mjs`:** her 26 aktivasyon için `|AE.lon − SWE.lon|`
→ yay-saniye. PASS eşiği **≤ 30″** (kozmikte gözlenen max ~19″). Çıktı: max sapma +
hangi cisim.

**Katman B — `compare_chart.mjs`:** her vaka için alan-alan birebir:
- 26 aktivasyon: `gateMatch` + `lineMatch`.
- `type`, `authority`, `profile`, `definition`.
- `centers`: 9 bool eşitliği.
- `channels`: küme eşitliği (sıralamadan bağımsız).
- `incarnationCross.name` + `gates[4]`.

**Blame localization (kilit özellik):** FAIL nedeni sınıflanır:
- Katman A PASS **ama** gate farklı → **mapping** (mandala ofseti) veya sınır.
- Tüm gate'ler eşleşiyor **ama** center/type/authority farklı → **deterministic-logic**.
- Design tarafında sistematik gate kayması → **design-solver**.
- Yalnız sınır-bayraklı aktivasyonda fark → **boundary (soft)**, sert FAIL değil.

---

## 6. PASS / FAIL rapor formatı

Üç verdict düzeyi: **PASS · FAIL · BOUNDARY (soft)**.

### 6.1 Makine-okur — `report.json`
```jsonc
{
  "generatedAt": "<ISO>",
  "engine":   { "name": "astronomy-engine", "version": "2.1.19", "nodeType": "true" },
  "oracle":   { "name": "pyswisseph", "flag": "MOSEPH/SWIEPH", "nodeType": "true" },
  "layerA": {
    "verdict": "PASS",
    "toleranceArcsec": 30,
    "casesChecked": 120,
    "maxDeviationArcsec": 18.4,
    "worst": { "caseId": "HD-GOLD-0042", "body": "Moon", "side": "design", "deviationArcsec": 18.4 }
  },
  "layerB": {
    "verdict": "FAIL",
    "total": 120, "pass": 117, "fail": 2, "boundary": 1,
    "failures": [
      {
        "caseId": "HD-GOLD-0033",
        "blame": "deterministic-logic",
        "diffs": [
          { "field": "authority", "expected": "Emotional", "actual": "Sacral" },
          { "field": "centers.SolarPlexus", "expected": true, "actual": false }
        ]
      },
      {
        "caseId": "HD-GOLD-0058",
        "blame": "mapping",
        "diffs": [
          { "field": "personality.Mars", "expected": "gate 21 line 3", "actual": "gate 21 line 4" }
        ]
      }
    ],
    "boundaryCases": [
      { "caseId": "HD-GOLD-0091", "body": "design.Venus", "marginArcsec": 12, "note": "girdi-hassasiyeti tavanı" }
    ]
  },
  "overallVerdict": "FAIL"
}
```

### 6.2 İnsan-okur — `report.md`
```
# HD Engine — Golden Validation Report
Engine: astronomy-engine 2.1.19 (True Node) | Oracle: pyswisseph (True Node)
Tarih: <ISO>

## KATMAN A — Astronomik (AE vs SWE)
VERDICT: PASS   (120 vaka, tolerans <=30", max sapma 18.4" @ HD-GOLD-0042 / Moon-design)

## KATMAN B — Uctan uca (engine vs MyBodyGraph)
VERDICT: FAIL   (117 PASS - 2 FAIL - 1 BOUNDARY / 120)

FAIL:
- HD-GOLD-0033  [deterministic-logic]
    authority:           Emotional -> Sacral
    centers.SolarPlexus: true -> false
- HD-GOLD-0058  [mapping]
    personality.Mars:    gate 21 line 3 -> line 4

BOUNDARY (soft, garanti disi bolge):
- HD-GOLD-0091  design.Venus  margin 12"  (girdi-hassasiyeti tavani)

## GENEL: FAIL - 2 sert uyusmazlik (once HD-GOLD-0033 deterministic-logic)
```

**Çıkış kodu sözleşmesi (CI):** `overallVerdict !== "PASS"` → `exit 1`. BOUNDARY tek
başına FAIL saymaz ama raporda görünür ve sayılır.

---

## 7. Çalıştırma zinciri (FAZ 2'de aktifleşir)
```
python scripts/hd-validation/oracle/swe_reference.py        # Katman A referansı
npx tsx scripts/hd-validation/engine-runner/hd_prod_runner.ts
node   scripts/hd-validation/compare/compare_longitudes.mjs  # Katman A verdict
node   scripts/hd-validation/compare/compare_chart.mjs       # Katman B verdict → report.{json,md}
```

---

## 8. Etik / telif sözleşmesi (golden-dataset)

MyBodyGraph'tan **yalnız olgusal çıktı** (gate/line/type…) elle alınır; **yorum
metinleri çoğaltılmaz/yayınlanmaz**; **ölçekli scraping yapılmaz**. `INDEX.md` her
vakanın kökenini (kaynak + tarih) tutar. Bu, FAZ 1C kararının uygulamasıdır.

---

**Bu faz motor yazma fazı değil, doğrulama altyapısı tasarım fazıdır.**
