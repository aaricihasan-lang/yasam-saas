# AKTİF GÖREV (CURRENT TASK)

> Bu dosya **yalnızca şu an üzerinde çalışılan tek görevi** tutar. Yeni bir görev
> başladığında bu dosya **baştan doldurulur** (önceki görevin özeti gerekiyorsa
> `PROJECT_STATUS.md` veya `CHANGELOG_AI.md`'ye taşınır).
>
> **Kullanım:** Görev başında bu şablon doldurulur ve kullanıcı onayı ile
> ilerlenir. Her aşama tamamlandıkça ilgili bölüm güncellenir.
>
> **⚠️ Ön koşul — Tutarlılık:** Bu dosya, `PROJECT_STATUS.md` ile **çelişmemelidir**.
> İkisi çelişiyorsa **geliştirmeye başlanmaz**; önce kullanıcıdan doğrulama istenir.

**Son güncelleme:** 2026-07-20 (S2.16 açılış)

---

## Durum

**Aktif görev: S2.16 — Dictionary Expansion (Sözlük / Eş-Anlam Genişletme) — AÇILDI**
(kod henüz YOK). İzole worktree `work/yh-s2-16` (taban güncel `origin/main` = `77aa824`).
Bu turda yalnız worktree + açılış karar kilidi hazırlandı; **kod yazılmadı**,
`dictionaryExpansion.ts`/harness **oluşturulmadı**, yalnız açılış docs commit'i yapıldı.
Önceki görev **S2.15 tamamlandı ve main'e merge edildi** (**PR #8**; kod `f56ec60`, merge
`404841b`); aşağıda özetlenmiştir. Kod, kilitli sözleşme (aşağıda) + kullanıcı onayı sonrası
yazılacaktır.

---

## Tamamlanan (main'de) — özet

- **S2.15 — Kavram Kümesi (Concept Set)** ✅ (**PR #8**; kod `f56ec60` `feat(yasam-hafizasi):
  add S2.15 concept set`, merge `404841b`). Saf/deterministik/DB'siz, yalnız query-origin
  `Concept[]` üreten `buildConceptSet(input: unknown): readonly Concept[]`
  (`lib/yasam-hafizasi/search/conceptSet.ts` + `scripts/yh-concept-set-harness.ts`).
  `normalizeSearchText(input).tokens` → her benzersiz token `{ term, origin:"query" }`;
  dedup=term/ilk-sıra; canonical omit; `Object.freeze`; fail-safe. Phrase/dictionary/synonym
  YOK (S2.16'ya bırakıldı). *(Kapanış docs'u S2.15 turunda yazılmamıştı; bu S2.16 açılışı
  S2.15'i tamamlanmış-main gerçeğiyle kayda alır.)*
- **S2.14 — Retrieval Türkçe Metin Normalizasyonu** ✅ (**PR #6**; kod `dd29167`).
  `search/normalize.ts` + harness (83/83); query–index simetrisi production SELECT ile
  doğrulandı (`ışık→isik`).
- **S2.13 — Retrieval Görünürlük Kararı** ✅ (**PR #4**, `4c672e9`): `search/visibilityScope.ts`
  + harness (49/49). Enjekte stone-exclusion port + fail-closed.
- **S2.08–S2.12 — İndeksleyici write-side** ✅ (**PR #3**, `555030a`).
- **S2.04–S2.07** ✅: `tenantResolve` · `extractFields` (PR #1) · `buildCandidate` (PR #2).
- **S2.01–S2.03** ✅: retrieval tipleri (`search/types.ts`) · topic-dictionary DDL · `sources.ts`.

Retrieval read-side boru hattı (`04-phase-2-fast-search.md`): **[1] normalize ✅ →
[2a] Concept Set ✅ → [2b] Dictionary Expansion (BU GÖREV) → [3] search_tsv →
[4] Kanıt Kapısı → [5] derece → [6] Neden**. Kilitli backlog: **Dictionary Expansion →
search_tsv → Stone Exclusion Adapter → Evidence Gate → Ranking → Retrieval Pipeline →
Search UI**. S2.16 = **Dictionary Expansion** ([2]'nin sözlük/synonym kısmı; S2.15 Concept
Set çıktısını additif genişletir).

---

## Aktif Görev — S2.16 (Dictionary Expansion) — AÇILDI (kod yok)

**Başlık:** S2.16 — Dictionary Expansion (Sözlük / Eş-Anlam Genişletme).

**Tek amaç:** S2.15'in ürettiği **query-origin `Concept[]`** çıktısını, küratörlü dictionary
snapshot'ı üzerinden **synonym-origin `Concept`'lerle additif** biçimde genişletmek (kaynak:
`04-phase-2-fast-search.md` §2). Saf/deterministik/DB'siz/fail-safe.

**Nihai fonksiyon (kullanıcı onaylı):**
```ts
expandConcepts(
  base: readonly Concept[],
  normalizedText: string,
  entries: readonly DictionaryEntry[],
): readonly Concept[]
```

**Nihai giriş modeli (yeni, `dictionaryExpansion.ts` içinde co-located, minimal):**
```ts
interface DictionaryEntry {
  canonical: string;              // HAM metin (genişletici normalize eder)
  synonyms: readonly string[];    // HAM metin
}
// is_active / tenant_id / lang YOK → adapter (S2.17) sorumluluğu.
```

**Kilitli sözleşme (kod öncesi, kullanıcı onaylı):**
- **Saf, deterministik, DB'siz ve fail-safe** (asla throw). **S2.15 `buildConceptSet` değişmez.**
- **Çıktı sırası:** `[değişmeyen query prefix]` + `[synonym suffix]`. Query çıktısı sonucun
  **değişmeyen prefix**'idir. **Sort YOK.**
- **Entries** kendisine **verilen sırayla** işlenir; entry içinde **canonical önce, sonra
  `synonyms[]` sırası**.
- **Dedup** yalnız **normalize edilmiş `term`** üzerinden; **ilk görülen korunur**; query
  aynı term'de synonym'i **bastırır** (`seen` başlangıçta base term'leriyle dolu).
- **Provenance:** genişletici **yalnız `origin:"synonym"` üretir** (`origin:"query"` tek
  kaynağı `base`). Synonym Concept'in `canonical` alanı = **normalize edilmiş entry
  canonical** değeri. Canonical yeni ekleniyorsa `origin:"synonym"` ve `canonical=self` olabilir.
- **Çok kelimeli terimler:** substring/`includes` **DEĞİL**; `normalizeSearchText` ile
  normalize edilip **sorgu token dizisinde bitişik alt-dizi (contiguous subsequence)**
  eşleşmesiyle bulunur. `"anne"` → `"anneanne"` içinde **eşleşmez**; `"anne sutu"` tek
  phrase Concept olarak üretilebilir.
- **Tek-sıçrama:** yalnız `base`/query eşleşmeleri genişlemeyi tetikler; eklenen synonym'ler
  **yeniden lookup edilmez**; **transitif genişleme yoktur** (A→B→A döngüsü tasarım gereği yok).
- **Immutability:** çıktı dizisi **ve yeni oluşturulan Concept nesneleri** `Object.freeze`;
  `base` ve `entries` **mutasyona uğratılmaz**.
- **Tavan YOK:** S2.16'da kavram/synonym tavanı yoktur. `YH_CANDIDATE_LIMIT=150` yalnız
  **aday kayıt** sayısı limitidir; Concept veya tsquery boyutu limiti **değildir**.

**Kapsam dışı (S2.16 DEĞİL):**
- Gerçek Supabase dictionary adapter · **`DictionaryPort`** (YAGNI — çekirdek `entries`'i
  doğrudan parametre alır, seam invoke etmez).
- `tenant_id` / `lang` / `is_active` filtreleri · tenant/global merge politikası · snapshot
  DB sıralaması → **S2.17** kapsamı.
- `search_tsv` / tsquery · Evidence Gate · Ranking · Retrieval Pipeline orkestrasyonu · Search UI.
- **S2.15 `buildConceptSet` değişikliği** · **`config.ts` değişikliği** (yeni sabit YOK).

**Yeniden kullanılan/dokunulmayan:** `search/types.ts` (`Concept` type-only import — `origin`
union + opsiyonel `canonical` **zaten mevcut**, tip değişmez) · `config.ts` · `normalize.ts` ·
`conceptSet.ts` · `visibilityScope.ts` · indexer/* · migration'lar · `package.json` ·
lockfile — **değişmez**.

**Planlanan yeni dosyalar (bu turda OLUŞTURULMADI):**
- `lib/yasam-hafizasi/search/dictionaryExpansion.ts` (`DictionaryEntry` tipi + `expandConcepts`)
- `scripts/yh-dictionary-expansion-harness.ts`

**Örnek çıktı sözleşmesi (edge-case, kod turunda harness'te doğrulanacak):**
`entries=[]` / `normalizedText=""` → çıktı = `base` (taze frozen) · query "kalp" + entry
{canonical:"kalp",synonyms:["yurek"]} → `[{kalp,query},{yurek,synonym,canonical:"kalp"}]` ·
çift yönlü: query "yurek" aynı entry → `[{yurek,query},{kalp,synonym,canonical:"kalp"}]` ·
`"anne sutu"` bitişik → tek phrase Concept (`origin:"synonym"`); `"anne" ⊄ "anneanne"`.

**Durum:** Yalnız worktree + açılış karar kilidi hazırlandı; **kod bu turda yazılmadı**;
yalnız açılış docs commit'i yapıldı (push/PR yok). Kod, kullanıcı onayı sonrası aynı çekirdek
disipliniyle (saf + deterministik + fail-safe + harness) yazılacaktır.

## Doğrulama planı (kod turu)

- Yeni **`yh-dictionary-expansion-harness`** (determinizm · döngü · çok-kelime · bozuk-kayıt ·
  immutability · Türkçe İ/ı simetri).
- **S2.15** Concept Set regresyon harness'i · **S2.14** normalize regresyon harness'i.
- `tsc --noEmit` · hedefli ESLint · güvenlik/kapsam grep · `git diff --check` + path-kapsam doğrulaması.

## Bekleyen Onaylar

- **S2.16:** açılış docs commit'i (bu tur) + **kod turu onayı**. Sonraki **S2.17** (tsquery /
  dictionary adapter / tenant-global merge / tsquery-boyut korkuluğu) **otomatik açılmaz**.

## Sonuç

- S2.01–S2.15 main'de. **S2.16 açıldı** (worktree + karar kilidi + açılış docs; kod yok).
  Kapsam: retrieval Dictionary Expansion ([2] sözlük/synonym). Kod, onay sonrası yazılacaktır.
  `origin/main` (`77aa824`) değişmedi; push/PR yapılmadı.
