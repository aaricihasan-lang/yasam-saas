# Yaşam Hafızası™ — BF-11E Belge/Video First Safe Source Readiness

**Durum:** `belge_video:passages` için worker CAPABILITY (join-tenant exact-write + row-unit +
eligibility + safe→unsafe tombstone + delete) ve CDC trigger foundation migration hazır.
**Bu turda hiçbir production mutation, registry enable-flip yapılmadı.**

## 1. Bulunan blocker'lar (exact audit) ve çözüm

| Blocker | Durum öncesi | Bu turdaki çözüm |
| --- | --- | --- |
| `runIndexUnit` row/join/eligibility | **ZATEN VARDI** (aromaterapi:reference-rows canlı; row-eligibility BF-14'te) | değişmedi (reuse) |
| `indexSourcePage::runExactRecord` | column+record-only (`join → tenant-model-unsupported`) | **join (non-shared) desteği**: tek satır için parent (`yh_document_sources`) üzerinden server-side tenant resolve → `runIndexUnit(parentLookup)` |
| `eventProcessor` Kapı 5/6/7 | column + record only | **column\|join (non-shared) + record\|row**; global-canonical + shared fail-closed |
| deindexer | column+record only | **column\|join (non-shared) + record\|row**; silme (`source_table+source_id+tenant_id`) genel |
| safe→unsafe tombstone | — | **zaten mimari:** eligibility-skip → `skipped-build` → `defensiveDeindex` (stale index temizlenir) |

Değişiklikler `belge_video`'ya özel hack DEĞİL; join-non-shared + row genel yeteneğidir (aktivasyonla
gated). global-canonical (YEBS) ve shared (aromaterapi:reference-rows) hâlâ dışarıda → istem-dışı
aktivasyon yok.

## 2. Tenant modeli (fail-closed, server-side)

`yh_document_passages.tenant_id` (NOT NULL) + composite FK `(tenant_id, document_id) →
yh_document_sources(tenant_id, id)` tenant sahipliğini DB'de garanti eder. Worker tenant'ı
**parent üzerinden** resolve eder (body/input'a güvenmez): FK eksik / parent yok / parent tenant
geçersiz → `resolveTenant` fail-closed → `skipped-build` → defensiveDeindex. Cross-tenant
(`expectedTenantId ≠ resolved`) → `tenant-mismatch` → permanent (write yok). Outbox payload'da ham
passage/document text veya PII YOK (yalnız source identity + tenant_id).

## 3. Eligibility

Index öncesi: durable promoted passage (`yh_document_passages` = durable; transient job değil) **VE**
`classification = safe-non-pii` (row-eligibility) **VE** valid provenance/tenant (parent resolve).
`unclassified` / `pii` / `restricted` / missing → **index write 0**.

## 4. Activation triple-gate (PR #126 invariant korunur)

`CODE ENABLED ≠ TRIGGER ATTACHED ≠ SOURCE ACTIVATED`. `belge_video:passages` CONTROLLED
(FUTURE_ONLY_READY): registry enabled:true olsa DAHİ DB `is_active=true` olmadan worker no-op;
`is_active=false` (kill-switch) → delete dahil no-op, index korunur; activation read error → transient.

## 5. Trigger foundation migration (repo-only)

`supabase/migrations/20260929000000_yh_belge_video_cdc_trigger.sql`: generic `public.yh_cdc_enqueue`
(BF-11E foundation) `yh_document_passages`'a bağlanır (id + tenant_id NOT NULL uyumlu). Aktivasyon-kapılı
→ `is_active` yoksa sessiz no-op. Migration activation seed / is_active / backfill / historical scan /
source DML YAPMAZ. **Future-only** (yalnız yeni mutation eventleri; historical scan yok). **Bu turda
apply EDİLMEZ.**

## 6. Registry enable-flip NEDEN bu turda YAPILMADI (deliberate scope)

`sources.ts`'te `belge_video:passages` `enabled:false → true` yapmak, MERGED `deferredSourceClosure`
WIRED_DORMANT sözleşmesini (belge_video enabled:false olarak kaydedilmiş) ve 4 merged harness'teki
"17 live / 9 dormant / wired-keys-all-dormant" invaryantlarını değiştirmeyi gerektirir — STOP
CONDITION §19'un uyardığı "merged contract rewrite". Bu nedenle bu tur **minimal reusable worker
capability + migration + kanıt** ile sınırlıdır; capability enabled:true CONFIG VARYANTIYLA
kanıtlanmıştır (harness B/D). **Sıradaki izole kod gate'i:** `belge_video:passages` enabled:true flip
+ `deferredSourceClosure` graduation (WIRED_DORMANT → implemented) + bağlı count invariant güncellemeleri.

## 7. Merge sonrası gerçek aktivasyon sırası (production kapıları — bu turda ÇALIŞTIRILMAZ)

1. **GATE A — merge** (ayrı onay).
2. **(kod) enable-flip + closure graduation** (izole PR).
3. **GATE B — trigger migration production apply** (`20260929000000`; activation-gated, sources OFF).
4. **GATE C — preflight** (`npm run yh:bf11e:preflight belge_video:passages`).
5. **GATE D — activation:** `SELECT public.yh_source_activation_set('belge_video:passages', true, false, 'FUTURE_ONLY_READY','professional','controlled activation')` (backfill FALSE).
6. **GATE E — future-event smoke** (salt-okunur). Kill-switch: `yh_source_deactivate('belge_video:passages')` (index korunur).
