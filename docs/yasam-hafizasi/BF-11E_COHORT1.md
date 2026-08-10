# Yaşam Hafızası™ — BF-11E Controlled Activation Cohort-1

**Durum:** Runtime activation gate WIRED. Bu turda **hiçbir kaynak production'da aktive edilmedi**;
hiçbir registry `enabled:true` flip'i, trigger attach'ı, `is_active=true` satırı, backfill YOK.

## 1. Bu turun çekirdek deliverable'ı: RUNTIME ACTIVATION GATE

PR #123 activation control-plane'i (`activationMatrix` + `activationState` + DB `yh_source_activation`)
eklemişti, ancak bu kapı **runtime processing zincirine bağlı değildi** (helper vardı, çağrılmıyordu).
Bu tur onu bağladı:

| Katman | Dosya | Rol |
| --- | --- | --- |
| Server-only gate | `lib/yasam-hafizasi/activation/activationRuntimeGate.ts` | `isSourceProcessingActive(sourceKey)` — DB `yh_source_activation` okur; grandfathered CANLI kaynaklar DB'ye bakmaz. |
| Pure karar | `activationMatrix.ts::resolveProcessingActive` | matris + `evaluateProcessingGate` (DB'siz; harness + gate ortak). |
| Worker chokepoint | `lib/inngest/functions/yhOutboxWorker.ts` | gate'i `runOutboxBatch`'e enjekte eder (DAİMA). |
| Event processor | `outbox/eventProcessor.ts` Kapı 4b | inactive → `complete("inactive-source-noop")` (index YAZILMAZ, deindex YAPILMAZ). |

**Invariant:** `CODE MERGED ≠ TRIGGER INSTALLED ≠ SOURCE ACTIVATED ≠ BACKFILL RUN`.
Bir CONTROLLED kaynak registry'de `enabled:true` olsa DAHİ, DB `is_active=true` olmadan worker index yazmaz.
`reconcile` route salt-okunur dry-run (write yok); `reconcile-apply` yalnız outbox'a enqueue eder → worker
gate'i o olayları da nötrler. **Worker = tek yetkili index-write chokepoint.**

KEEP_LIVE 17 canlı kaynak grandfathered'dır (`requiresRuntimeActivation=false`): gate onları DB'ye
bakmadan aktif sayar → mevcut davranış değişmez, yeni activation-row zorunluluğu YOK.

## 2. Cohort disposition (türetilmiş; `activationMatrix.assessCohort`)

Bu turda hiçbir kaynak "hazır (gap yok)" değildir — worker CDC exact-write yolu (`indexSourcePage::runExactRecord`)
YALNIZ **column-tenant + record** destekler. Her Cohort-1 adayının kalan **exact kod önkoşulu** vardır:

| Kaynak(lar) | Disposition | Kalan kod önkoşulu (readyGap) |
| --- | --- | --- |
| 16 professional | `KEEP_LIVE` | — (grandfathered, değişmez) |
| `kisisel_arsiv:archives` | `COHORT_1_BLOCKED` | row-level classification gate (`isArchiveRowIndexable`) runtime indexer'a bağlı değil + `personal_archives` PII verisi. |
| `belge_video:passages` | `COHORT_1_BLOCKED` | `runExactRecord` join-tenant + row-unit desteği (şu an `tenant-model-unsupported`) + eventProcessor tenant-model/unit gate genişletmesi. **Tek test-data-siz (empty foundation) aday.** |
| `numeroloji:sources`, `numeroloji:knowledge-entries` | `WAIT_FOR_CLEAN_RESET` | sistem-genel test-data temiz reset. |
| `yebs:*` (6) | `COHORT_2` | global-canonical worker/exact-write + published→ineligible tombstone. |
| `danisan:*` (6) | `COHORT_2` | client index (`yasam_hafizasi_client_index`) worker/CDC pipeline (outbox `client_id` taşımıyor). |
| Numeroloji client | `DEFERRED_HARD_BLOCKER` | güvenli client-owned entity yok (registry kaydı da yok). |

**Neden bu turda enable-flip / trigger migration YOK:** Bir kaynağı `enabled:true` + trigger attach + activate
etmek, worker onu işleyemiyorsa (join/row/global-canonical/client) yalnızca dead-letter üretir. Bu nedenle
Cohort-1 adayları **kod önkoşulu çözülene kadar** aktive edilmez (kalite > kaynak sayısı; force-fit yok).

## 3. Merge sonrası gerçek aktivasyon sırası (production kapıları — bu turda ÇALIŞTIRILMAZ)

- **GATE A — merge** (ayrı onay).
- **GATE B — production trigger foundation apply**: bir Cohort-1 adayının `readyGap`'i kapandıktan sonra,
  o kaynağın CDC trigger'ı `yh_cdc_enqueue`'a bağlanır (activation-gated → is_active=false iken no-op).
  Bu aşamada `activation rows = 0`, sources OFF.
- **GATE C — per-source read-only preflight**: `npm run yh:bf11e:preflight <sourceKey>`.
- **GATE D — per-source activation**: `SELECT public.yh_source_activation_set('<key>', true, false, '<class>', '<scope>', 'reason')`. Backfill **FALSE**.
- **GATE E — future-event smoke/reconcile gözlemi** (salt-okunur).
- **Kill-switch:** `SELECT public.yh_source_deactivate('<key>')` → worker gate inactive → processing durur;
  mevcut index satırları OTOMATİK SİLİNMEZ.

## 4. Bir sonraki kod gate'i (Cohort-1'i gerçekten aktive-edilebilir yapmak için)

`belge_video:passages` en yakın adaydır (empty foundation, test-data riski yok). Gereken minimal, doğru fix:
`indexSourcePage::runExactRecord`'a join-tenant (parent `yh_document_sources` üzerinden server-side tenant
resolve) + row-unit exact-write desteği + `eventProcessor` tenant-model/unit gate'inin bu güvenli alt kümeye
genişletilmesi + `belge_video` row-eligibility (safe-non-pii) + safe→unsafe transition tombstone. Bunlar
production-live indexer/worker'a dokunduğundan ayrı, izole, harness-korumalı bir turda yapılmalıdır.
