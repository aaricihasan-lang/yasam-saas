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

**Son güncelleme:** 2026-07-13

---

## Görev

Yaşam Hafızası™ **Sprint 2 / S2.05 — JSONB Alan Çıkarımı**. Bir kaynak satırından
(`row`) indekslenebilir kanıt alanlarını **saf (pure)** ve **deterministik** biçimde
çıkaran bir builder yazmak.

**Temel:** S2.04 (Tenant Resolver) `origin/main`'de tamam (commit `6578ec5`). S2.05
bunun üstüne inşa edilir; S2.04'e dönülmez.

**Çalışma ortamı (izole):** Bu görev, `origin/main` tabanlı **`work/yh-s2-05`** branch'i
ve ayrı Git worktree'sinde (`yasam-saas-worktrees/yh-s2-05`) yürütülür. Ana çalışma
ağacına dokunulmaz (bkz. `CLAUDE_PROTOCOL.md → İzole Worktree Zorunluluğu`).

## Amaç

`sources.ts` (S2.03) JSONB kolonları AD-004 gereği yalnız gerçek kolon adıyla
listeler; ayrıştırmayı bilinçli olarak builder'a erteler. S2.05 bu boşluğu
doldurur: Kanıt Kapısı'nın (INV-1) tarayacağı `evidence_fields` / `topic_tags` /
`expert_relations` yapıları için tek-satır → alan dizileri üretir.

## Kapsam (row → alan dizileri)

Tek bir saf fonksiyon, `SourceConfig` + ham satır alıp şunları üretir:

- `EvidenceField[]` (title/paragraph/tag/relation/note; her alan `origin` provenance taşır)
- `TopicTags[]` (etiket kanıtı)
- `ExpertRelations[]` (uzman-tanımlı ilişki kanıtı)
- JSONB'den türetilmesi gereken `title`/`snippet` (özellikle `aromatherapy_reference_rows`: her ikisi de `cells` JSONB'sinden)

## Kararlar (K1–K6, onaylı)

- **K1 → A:** JSONB çıkarım kuralları **yalnız builder içinde**; `sources.ts` değişmez; **AD-004 korunur** (yeni AD gerekmez).
- **K2:** Yeni dosya `lib/yasam-hafizasi/indexer/extractFields.ts`. `search/types.ts` **mümkün olduğunca değişmez** (mevcut `EvidenceField`/`ExpertRelation` yeniden kullanılır); karşılıksız alan çıkarsa **DUR ve sor**.
- **K3:** S2.05 yalnız `row → EvidenceField[]/TopicTags[]/ExpertRelations[]`. `Candidate`, `content_hash`, `group_key` **S2.07 kapsamında**.
- **K4:** **Fail-safe** — bilinmeyen/bozuk JSONB şekli indekslemeyi durdurmaz; ilgili alan atlanır; crash yok.
- **K5:** Önce dokümanlar S2.04-tamam durumuna güncellenir (bu commit), sonra S2.05 kodu.
- **K6:** `extractFields` için tenantResolve benzeri izole harness (`scripts/yh-extract-fields-harness.ts`, `tsx` ile koşar).

## Kapsama Dahil Değil

- `Candidate` inşası, `content_hash`, `group_key` (S2.07).
- Tenant çözümü (S2.04), DB/IO, normalize, skorlama, derece, "Neden?", Kanıt Kapısı eşleşmesi.
- Migration / SQL / DDL / API route / UI.

## Dokunulmayacak Dosyalar

- `lib/yasam-hafizasi/indexer/sources.ts` (K1→A), `tenantResolve.ts` (S2.04), `config.ts`, `flags.ts`, `tenantScope.ts`.
- `lib/yasam-hafizasi/search/types.ts` — K2 gereği mümkün olduğunca değişmez (yalnız import).
- `docs/ai/ROADMAP.md`, `docs/ai/ARCHITECTURE_DECISIONS.md` (bu görevde) ve `docs/yasam-hafizasi/` (salt-okunur kaynak).
- Tüm uygulama kodu (`app/`, `components/`, diğer `lib/`) ve diğer oturumların working-tree değişiklikleri — **dokunulmaz**.

## Yapılmayacaklar

- Saflık ihlali: Supabase/fetch/env/DB/normalize/`String()`/`trim` (coercion) yasak.
- `evidence_fields.text`'i normalize etmek (birebir saklanır; normalize retrieval'a ait).
- Git işlemi (stage/commit/push), SQL, migration, API değişikliği — **onaysız**.

## Riskler

- **AD-004 sınırı:** çıkarım kuralı `sources.ts`'e sızarsa saflık bozulur → yalnız builder içinde tut.
- **Doğrulanmamış JSONB şekilleri** (DDL'siz tablolar, şekil kodda) → kod öncesi Adım 0 şema doğrulaması (salt-okuma, API/tip dosyalarından); fail-safe atlama.
- **Saflık kaybı** → tenantResolve saflık sınırı birebir uygulanır.
- **Çoklu oturum / paylaşımlı index** (`83adab2` dersi) → path-scoped, yalnız yeni dosyalar.

## Beklenen Çıktılar

- `lib/yasam-hafizasi/indexer/extractFields.ts` — saf, fail-safe, deterministik.
- `scripts/yh-extract-fields-harness.ts` — izole harness (temsili satır + bozuk-şekil fail-safe assert'leri).

## Doğrulama

- Adım 0: JSONB kolon şekilleri (assignments/items/cells/related_stones/iceren_taslar/stones_text/headers/tags/stones/therapeutic_properties…) API-helper/tip dosyalarından teyit.
- Saflık denetimi: IO/DB/normalize/coercion yok.
- Harness: `npx tsx scripts/yh-extract-fields-harness.ts` yeşil (normal + fail-safe senaryolar).
- Kapsam-izole `tsc --noEmit` (yeni dosya + import zinciri); başka modülün hatası engel değil (iki-durumlu rapor).
- Değişmez teyidi: `evidence_fields.text` birebir; her alanda `origin`; `sources.ts` diff yok (AD-004).

## Commit

- **Bu görev iki ayrı, izole commit'tir:**
  1. **Doküman senkronizasyonu (bu adım):** `docs/ai/PROJECT_STATUS.md`, `docs/ai/CURRENT_TASK.md`, `docs/ai/CHANGELOG_AI.md`.
  2. **S2.05 kod (sonraki adım):** `lib/yasam-hafizasi/indexer/extractFields.ts`, `scripts/yh-extract-fields-harness.ts`.
- Her commit path-scoped; öncesi/sonrası doğrulama zorunlu; **kullanıcı onayı olmadan commit/push yok**.

### Beklenen Commit Mesajları

```
docs(ai): mark S2.04 done, open S2.05 (JSONB field extraction)

feat(yasam-hafizasi): S2.05 JSONB field extraction (pure, fail-safe)
```

## Push

- **Yalnızca ayrı kullanıcı onayıyla.** Push öncesi `git fetch` + ahead/behind kontrolü.

## Sonuç

- *(Görev devam ediyor — İş Birimi 1 doküman güncellemesi yapıldı; İş Birimi 2 S2.05 kodu onay bekliyor.)*
