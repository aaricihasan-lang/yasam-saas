# Yaşam Hafızası™ — BF-11E Kontrollü Kaynak Aktivasyon Runbook

**Durum:** MERGE-SAFE hazırlık paketi. Bu belge production aktivasyonunun *nasıl* yapılacağını
tanımlar; **bu paket hiçbir aktivasyonu ÇALIŞTIRMAZ.** Production apply / trigger kurulumu /
`is_active=true` flip / backfill AYRI, açık kullanıcı onayı gerektiren production kapılarıdır.

## 1. Bağlayıcı invaryant

```
CODE MERGED  ≠  MIGRATION APPLIED  ≠  SOURCE ACTIVATED
```

Bir kaynağın olay işlemesi (event/reconcile) YALNIZ şu ikisi **birlikte** olduğunda başlar:

1. **Kod kapısı** — registry `enabled: true` (`YH_INDEX_SOURCES` / `YH_CLIENT_INDEX_SOURCES`).
2. **DB kapısı** — `yh_source_activation.is_active = true` (bu paketin migration'ı).

`lib/yasam-hafizasi/activation/activationState.ts::evaluateProcessingGate` bu çift kapıyı
fail-closed uygular. `runtime === null` (aktivasyon satırı yok) veya `is_active !== true` →
**inactive**. Grandfathered CANLI sınıflar (`KEEP_LIVE`, `ROW_GATED_READY`) yeni kapıya tabi
değildir; mevcut davranışları korunur.

## 2. Kontrol düzlemi

| Bileşen | Yer | Rol |
| --- | --- | --- |
| Aktivasyon matrisi | `lib/yasam-hafizasi/activation/activationMatrix.ts` | Tek machine-readable source of truth (32 kaynak). |
| Aktivasyon kapısı | `lib/yasam-hafizasi/activation/activationState.ts` | SAF processing/backfill gate + drift tespiti. |
| SQL üretici | `lib/yasam-hafizasi/activation/activationPlan.ts` | SALT-OKUNUR preflight + aktivasyon/rollback şablonu. |
| DB foundation | `supabase/migrations/20260927000000_yh_source_activation_control.sql` | `yh_source_activation` + `yh_cdc_enqueue()` + activation/kill-switch RPC. |
| Harness | `scripts/yh-bf11e/activationHarness.ts` (`npm run yh:bf11e:harness`) | 121 kontrol; matris/merge-safe/CDC/client/YEBS/belge/arşiv/backfill/kill-switch/regresyon. |
| Preflight | `scripts/yh-bf11e/preflight.ts` (`npm run yh:bf11e:preflight`) | SALT-OKUNUR preflight SQL üretir (DB'ye bağlanmaz). |

## 3. Aktivasyon sınıfları

| Sınıf | Kaynaklar | Davranış |
| --- | --- | --- |
| `KEEP_LIVE` (16) | Mevcut canlı professional bilgi/katalog | Değişmez; regresyonla korunur. |
| `ROW_GATED_READY` (1) | `kisisel_arsiv:archives` | Canlı; yalnız safe-non-pii + current-hash satır indexlenir. |
| `CANONICAL_BACKFILL_CANDIDATE` (6) | `yebs:*` | Global-canonical, published-only; backfill YALNIZ ayrı onay + preflight ile. |
| `WAIT_FOR_CLEAN_RESET` (2) | `numeroloji:sources`, `numeroloji:knowledge-entries` | Tenant test-data riski; temiz reset öncesi aktive edilmez. |
| `FUTURE_ONLY_READY` (7) | `belge_video:passages` + 6 client | Yalnız gelecekteki güvenli olaylar; mevcut veri backfill EDİLMEZ. |
| `DEFERRED_HARD_BLOCKER` | Numeroloji **client** | Güvenli client-owned entity YOK → registry kaydı da YOK; aktive edilmez. |

## 4. Backfill ≠ Activation

- `yh_source_activation.backfill_allowed` **DEFAULT false**; CHECK `(NOT backfill_allowed OR is_active)`.
- "activate source" komutu **backfill BAŞLATMAZ** (tam tablo taraması / historical index / reconcile-all yok).
- Backfill YALNIZ `CANONICAL_BACKFILL_CANDIDATE` (YEBS) sınıfında, `is_active=true` +
  `backfill_allowed=true` explicit allowlist ile izinlidir (`evaluateBackfillGate`).
- Client / test-data kaynaklarında otomatik backfill **kesin yasak**.

## 5. Production aktivasyon prosedürü (AYRI ONAY — bu pakette YOK)

> Ön koşul: PR merge + migration production apply (default OFF) + kod `enabled:true` + temiz-reset
> (test-data riski taşıyan sınıflar için).

1. **Preflight (salt-okunur):**
   ```
   npm run yh:bf11e:preflight <sourceKey>
   ```
   Çıktı SQL'i Supabase SQL Editor'da çalıştır; `table_exists`, trigger sayısı, aktivasyon durumu,
   satır sayısı, outbox olay dağılımı, status/classification dağılımlarını incele.
2. **Trigger bağla** (yalnız column-tenant feasible; join/global-canonical/client worker
   genişletmesi gerektirir):
   ```sql
   CREATE TRIGGER yh_cdc_<table>_trg
     AFTER INSERT OR UPDATE OR DELETE ON public.<table>
     FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('<sourceKey>', '<table>');
   ```
   Trigger kurulsa dahi `is_active=false` iken **sessiz no-op** (kaynak CRUD'unu engellemez).
3. **Aktive et** (backfill DEFAULT false):
   ```sql
   SELECT public.yh_source_activation_set('<sourceKey>', true, false, '<class>', '<scope>', 'note');
   ```
4. **Doğrula:** preflight bloğunu yeniden çalıştır; `is_active=true` + beklenen olay akışı.

## 6. Kill-switch / rollback (index KORUNUR)

```sql
SELECT public.yh_source_deactivate('<sourceKey>');          -- processing durur; is_active=false
DROP TRIGGER IF EXISTS yh_cdc_<table>_trg ON public.<table>; -- olay üretimini kes
```

- Rollback **index satırlarını SİLMEZ**, kaynak verisini SİLMEZ. Index temizliği AYRI, açık karardır.
- `yh_source_deactivate` idempotenttir (satır yoksa no-op).

## 7. Bilinen downstream önkoşullar (bu paketin DIŞINDA)

- **Worker v1 kapsamı** (`outbox/eventProcessor.ts`) yalnız `column + non-shared + record +
  safe-non-pii + enabled` destekler. `global-canonical` (YEBS), `join`/`row` (belge_video) ve
  client index (`yasam_hafizasi_client_index`) için worker/CDC kapsam genişletmesi gerekir →
  matriste `triggerFeasibleNow=false` olarak işaretlidir.
- Outbox `tenant_id NOT NULL`; global-canonical (tenant NULL) kaynaklar için outbox/worker
  genişletmesi ayrı iştir.
- Numeroloji **client** aktivasyonu için doğrulanmış client-owned entity + tracked şema + additive
  nullable `client_id` gerekir (heuristik/backfill YASAK) — kalıcı `DEFERRED_HARD_BLOCKER`.
