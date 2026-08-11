# Yaşam Hafızası™ — BF-11E Belge/Video Source Retirement (NON_SOURCE)

**Ürün kararı:** Dijital İçerik Merkezi'nin **belge / video / ders-notu işleme alanı** bir
**TRANSIENT PROCESSING / EXPORT WORKSPACE**'tir (belge dönüştür, transkript üret, çevir,
Word/PDF/ders notu üret). **Yaşam Hafızası SOURCE DOMAIN'İ DEĞİLDİR.** Uzman nihai çıktıyı indirir
veya gerçek ait olduğu profesyonel modüle aktarır; Yaşam Hafızası bilgiyi bu geçici işleme
merkezinden **değil**, nihai kalıcı profesyonel modülden öğrenir (aynı bilginin çift kez hafızaya
girmesi engellenir).

> **Kapsam:** Yalnız belge/video/ders-notu işleme. `kisisel_arsiv:archives` bu kararın DIŞINDADIR
> (ROW_GATED_READY statüsü korunur; bu turda değiştirilmedi).

## 1. Ne emekliye ayrıldı (RETIRE_BELGE_VIDEO_SPECIFIC)

`belge_video:passages` Yaşam Hafızası **source** modelinden çıkarıldı:
- `lib/yasam-hafizasi/indexer/sources.ts` — registry entry KALDIRILDI (professional 26→25, dormant 9→8).
- `lib/yasam-hafizasi/config.ts` — `YH_SOURCE_MODULES`'ten `belge_video` ailesi çıkarıldı (9→8).
- `lib/yasam-hafizasi/backup/constants.ts` — modül-sync listesinden çıkarıldı.
- `lib/yasam-hafizasi/moduleSourceMatrix.ts` — `belge_video` modülü → **NOT_MEMORY_SOURCE** (kaynak taşımaz).
- `lib/yasam-hafizasi/deferredSourceClosure.ts` — `belge_video_ingestion` → **NOT_APPLICABLE** (registry key 0; `PRODUCT_DECISION_NON_SOURCE`).
- `lib/yasam-hafizasi/activation/activationMatrix.ts` — activation entry KALDIRILDI (matris 32→31).
- `lib/yasam-hafizasi/ui/moduleLabels.ts` — memory modül etiketi/route'u kaldırıldı.

**Sonuç:** query / search / filter / reconcile / CDC / backfill / auto-index / activation /
preflight — belge_video source path'i **YOK**. `enabled:true = 0`, activation seed = 0.

## 2. Ne korundu (KEEP_REUSABLE — no broad revert)

PR #128'in **generic** indexer/worker iyileştirmeleri (join-tenant + row-unit exact-write, parent
tenant resolve, defensive deindex/tombstone, eventProcessor/deindexer gate genişletmesi) KORUNDU —
bunlar belge_video'ya özel değil, mevcut/başka join+row kaynaklar için mimari-tutarlı yeteneklerdir
(harness E: generic synthetic join+row kaynakla kanıtlandı). Ayrıca promotion API (`documents/promote`)
+ `chunkText` gibi Dijital İçerik feature fonksiyonları KORUNDU (bunlar memory-source değil).

## 3. Migration retirement (repo-only; production apply YOK)

`20260929000000_yh_belge_video_cdc_trigger.sql` (PR #129, merged) production'a **hiç uygulanmadı**.
History rewrite EDİLMEDİ; onun yerine telafi migration eklendi:

`supabase/migrations/20260930000000_yh_belge_video_cdc_retirement.sql` — `DROP TRIGGER IF EXISTS
yh_cdc_yh_document_passages_trg`. Böylece migration zinciri gelecekte topluca uygulansa bile nihai
**Belge/Video CDC trigger desired-state = 0**. Migration activation seed / is_active / backfill /
source-index DML / historical scan / DROP TABLE YAPMAZ; generic `yh_cdc_enqueue` + `yh_source_activation`
foundation KORUNUR.

## 4. Foundation tabloları

`public.yh_document_sources` / `public.yh_document_passages` production'da mevcut kalır — Yaşam
Hafızası için artık kullanılmadığından **DEPRECATED / CLEANUP-CANDIDATE** olarak işaretlenir (closure
`foundationTables`'ta kayıtlı). Gerçek DROP, sistem-genel final cleanup risk kapısına bırakılır
(bu turda DROP YOK). Dijital İçerik Merkezi'nin kendi storage modeli ayrıdır; bu görev yalnız Yaşam
Hafızası entegrasyon sınırıyla ilgilidir.

## 5. Değişmeyenler

KEEP_LIVE 17 professional · Personal Archive (ROW_GATED_READY) · YEBS 6 (COHORT_2/global-canonical) ·
Numeroloji professional 2 (WAIT_FOR_CLEAN_RESET) · Numeroloji client (DEFERRED_HARD_BLOCKER) · 6 client
(COHORT_2) — hepsi değişmedi (harness G). Dijital İçerik Merkezi'nin kullanıcı özellikleri (belge
çevirme/video işleme/Word-PDF) değiştirilmedi.

## 6. Sonraki risk kapıları (ayrı onay)

Merge → (opsiyonel) retirement migration production apply (trigger DROP; sources zaten OFF) →
sistem-genel cleanup fazında foundation tablo DROP değerlendirmesi.
