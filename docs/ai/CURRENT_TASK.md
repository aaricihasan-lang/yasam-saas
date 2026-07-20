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

**Son güncelleme:** 2026-07-19 (S2.15 açılış)

---

## Durum

**Aktif görev: S2.15 — Kavram Kümesi (Concept Set) — AÇILDI** (kod henüz YOK). İzole
worktree `work/yh-s2-15` (taban güncel `origin/main` = `f72b01b`). Bu turda yalnız
worktree + açılış karar kilidi hazırlandı; **kod yazılmadı, commit/push yapılmadı**.
Önceki görev **S2.14 tamamlandı ve main'e merge edildi** (PR #6; kod `dd29167`); aşağıda
özetlenmiştir. Kod, kilitli sözleşme (aşağıda) + kullanıcı onayı sonrası yazılacaktır.

---

## Tamamlanan (main'de) — özet

- **S2.14 — Retrieval Türkçe Metin Normalizasyonu** ✅ (**PR #6**). Saf/deterministik/
  fail-safe/locale-bağımsız/mutasyonsuz normalize birimi (`lib/yasam-hafizasi/search/normalize.ts`
  + `scripts/yh-normalize-harness.ts`); kod commit `dd29167`. Query–index simetrisi
  production Supabase SELECT ile doğrulandı (`ışık→isik`). Harness **83/83**.
- **S2.13 — Retrieval Görünürlük Kararı** ✅ (**PR #4**): `search/visibilityScope.ts` +
  harness (`e3b4e73`; 49/49). Enjekte stone-exclusion port + fail-closed.
- **S2.08–S2.12 — İndeksleyici write-side** ✅ (**PR #3**, `555030a`).
- **S2.04–S2.07** ✅: `tenantResolve` · `extractFields` (PR #1) · `buildCandidate` (PR #2).
- **S2.01–S2.03** ✅: retrieval tipleri (`search/types.ts`) · topic-dictionary DDL · `sources.ts`.

Retrieval read-side boru hattı (`04-phase-2-fast-search.md`): **[1] normalize ✅ →
[2] sözlük/concept → [3] search_tsv → [4] Kanıt Kapısı → [5] derece → [6] Neden**.
Kilitli backlog: **Concept Set → Dictionary Expansion → search_tsv → Stone Exclusion
Adapter → Evidence Gate → Ranking → Retrieval Pipeline → Search UI**. S2.15 = **Concept
Set** ([2]'nin taban/query kısmı; Dictionary Expansion ayrı S2.16).

---

## Aktif Görev — S2.15 (Kavram Kümesi / Concept Set) — AÇILDI (kod yok)

**Başlık:** S2.15 — Kavram Kümesi (Concept Set), yalnız query-origin.

**Tek amaç:** Ham kullanıcı sorgusunu `normalizeSearchText` (S2.14) üzerinden geçirip
**yalnız query-origin `Concept[]`** üretmek (kaynak: `04-phase-2-fast-search.md` §2:
`C = { normalize(sorgu) token'ları }`). Saf/deterministik/DB'siz.

**Kilitli sözleşme (kullanıcı onaylı):**
- **Fonksiyon:** `buildConceptSet(input: unknown): readonly Concept[]` (yeni `lib/yasam-hafizasi/search/conceptSet.ts`).
- **Model:** `normalizeSearchText(input).tokens` → her token bir `Concept{ term: token, origin: "query" }`.
- **Phrase Concept YOK** (tokens-only; çok-kelime/phrase kavramları Dictionary Expansion / S2.16).
- **Dictionary seam YOK** (Seçenek A — Dictionary Expansion ayrı S2.16; synonym üretimi yok).
- **Dedup:** anahtar `term`; **ilk-görülme sırası korunur**; **sort YOK**.
- **Alan sözleşmesi:** `term` = normalize edilmiş token (ham/yeniden-normalize YOK); `origin` = `"query"`; `canonical` **omit** (undefined).
- **Fail-safe:** non-string / boş / yalnız-işaret girdi → **boş dizi**; **asla throw**. Çıktı dizisi **ve her Concept** `Object.freeze` (mutasyonsuz). Girdi mutasyonu imkânsız.
- **Filtre YOK:** stop-word / kısa token / rakam filtresi S2.15 kapsamı dışında; normalize'ın ürettiği token'lar korunur (ör. "ve" bir Concept olur). Eleme, ileriki gate/tsquery işi.
- **Kapsam dışı:** Dictionary Expansion · search_tsv · Evidence Gate · Ranking · retrieval wiring · DB/SQL/API/AI.

**Yeniden kullanılan/dokunulmayan:** `search/types.ts` (`Concept` type-only import) ·
`config.ts` · `normalize.ts` · `visibilityScope.ts` · indexer/* · migration'lar ·
`package.json` · lockfile — **değişmez**.

**Planlanan yeni dosyalar (bu turda OLUŞTURULMADI):**
- `lib/yasam-hafizasi/search/conceptSet.ts`
- `scripts/yh-concept-set-harness.ts`

**Örnek çıktı sözleşmesi (edge-case, kod turunda harness'te doğrulanacak):**
`""`/`"   "`/yalnız-işaret → `[]` · `"IŞIK"` → `[{term:"isik",origin:"query"}]` ·
`"ışık ışık"` → `[{term:"isik",…}]` (dedup) · `"anne sütü"`/`"anne-sütü"` →
`[{term:"anne",…},{term:"sutu",…}]` · `"çakra, ışık ve göğüs"` →
`[{cakra},{isik},{ve},{gogus}]` ("ve" korunur; stop-list yok).

**Durum:** Yalnız worktree + açılış karar kilidi hazırlandı; **kod bu turda yazılmadı**;
**commit/push yapılmadı**. Kod, kullanıcı onayı sonrası aynı çekirdek disipliniyle
(saf + deterministik + fail-safe + harness) yazılacaktır.

## Bekleyen Onaylar

- **S2.15:** açılış docs commit'i (bu tur commit edilmedi) + kod turu onayı.

## Sonuç

- S2.01–S2.14 main'de. **S2.15 açıldı** (worktree + karar kilidi; kod yok). Kapsam:
  retrieval Kavram Kümesi ([2] taban/query). Kod, onay sonrası yazılacaktır. `origin/main`
  değişmedi; commit/push yapılmadı.
