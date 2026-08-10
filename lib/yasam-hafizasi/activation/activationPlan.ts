/**
 * YAŞAM HAFIZASI™ — BF-11E AKTİVASYON PLANI / PREFLIGHT SQL ÜRETİCİSİ (SAF).
 * =========================================================================
 *
 * Aktivasyon matrisinden, production'da (AYRI ONAY sonrası) çalıştırılacak SQL metinlerini
 * SAF (pure) + DETERMİNİSTİK biçimde üretir. Bu modül DB'ye BAĞLANMAZ, SQL ÇALIŞTIRMAZ;
 * yalnız metin döndürür. İki tür SQL üretir:
 *
 *   1. PREFLIGHT  — SALT-OKUNUR (yalnız SELECT) durum keşfi. Production activation kararı
 *      öncesi okunacak; hiçbir mutation İÇERMEZ (harness zorlar).
 *   2. ACTIVATION / ROLLBACK — trigger bağlama + is_active flip + kill-switch/rollback ŞABLONU.
 *      Bu metinler TEMPLATE'tir; bu paket bunları ÇALIŞTIRMAZ (production kapısı ayrı onay).
 *
 * SAFLIK SINIRI: Supabase / DB / fetch / IO / process.env / Date.now / rastgele YOK.
 */

import type { ActivationMatrixEntry } from "./activationMatrix";

// SQL string literal kaçışı (tek tırnak → çift tek tırnak). Kaynak anahtarları/tablo adları
// sabit registry değerleridir; yine de defensive kaçış uygulanır.
function q(value: string): string {
  return value.replace(/'/g, "''");
}

/** Kaynak tablosunda row-seviyesi classification kolonu var mı (preflight dağılımı için). */
function rowClassificationColumn(entry: ActivationMatrixEntry): string | null {
  if (entry.rowGate === "row-classification") return "classification";
  return null;
}

/**
 * Bir kaynak için SALT-OKUNUR preflight SQL bloğu üretir. YALNIZ SELECT içerir; hiçbir
 * INSERT/UPDATE/DELETE/DDL yoktur (harness assert eder). Okunabilecekler:
 *   - kaynak tablo varlığı
 *   - kaynak tablo CDC trigger sayısı
 *   - yh_source_activation aktivasyon durumu
 *   - kaynak satır sayısı (mevcut-veri riski gözlemi)
 *   - bu kaynağa ait outbox olay dağılımı (pending/processing/succeeded/dead)
 *   - (varsa) status-eligibility dağılımı (YEBS published/ineligible)
 *   - (varsa) row-classification dağılımı (belge_video safe-non-pii/unclassified/pii/restricted)
 *   - (Kişisel Arşiv) yh_archive_classifications dağılımı
 */
export function buildPreflightSql(entry: ActivationMatrixEntry): string {
  const key = q(entry.sourceKey);
  const table = q(entry.sourceTable);
  const lines: string[] = [];

  lines.push(`-- ── PREFLIGHT (SALT-OKUNUR): ${entry.sourceKey} [${entry.activationClass}] ──`);
  lines.push(`-- scope=${entry.scope} tenantMode=${entry.tenantMode} rowGate=${entry.rowGate} registryEnabled=${entry.registryEnabled}`);
  lines.push(`-- currentDataRisk=${entry.currentDataRisk} backfillEligibility=${entry.backfillEligibility} triggerFeasibleNow=${entry.triggerFeasibleNow}`);

  // 1) Kaynak tablo varlığı.
  lines.push(`SELECT '${key}' AS source_key, to_regclass('public.${table}') IS NOT NULL AS table_exists;`);

  // 2) Kaynak tablodaki (internal olmayan) trigger sayısı — CDC bağlı mı gözlemi.
  lines.push(
    `SELECT '${key}' AS source_key, count(*) AS non_internal_trigger_count ` +
      `FROM pg_trigger WHERE tgrelid = to_regclass('public.${table}') AND NOT tgisinternal;`,
  );

  // 3) Aktivasyon durumu (satır yoksa default INACTIVE).
  lines.push(
    `SELECT '${key}' AS source_key, is_active, backfill_allowed, activation_class, scope ` +
      `FROM public.yh_source_activation WHERE source_key = '${key}';`,
  );

  // 4) Kaynak satır sayısı (mevcut-veri riski gözlemi; test-data / empty-foundation).
  lines.push(`SELECT '${key}' AS source_key, count(*) AS source_row_count FROM public.${table};`);

  // 5) Bu kaynağa ait outbox olay dağılımı (pending events / reconcile drift gözlemi).
  lines.push(
    `SELECT '${key}' AS source_key, status, count(*) AS event_count ` +
      `FROM public.yasam_hafizasi_outbox WHERE source_key = '${key}' GROUP BY status;`,
  );

  // 6) Status-eligibility dağılımı (YEBS published-only; ineligible sayımı).
  if (entry.rowGate === "status-eligibility") {
    lines.push(
      `SELECT '${key}' AS source_key, status, count(*) AS row_count ` +
        `FROM public.${table} GROUP BY status;`,
    );
  }

  // 7) Row-classification dağılımı (belge_video safe-non-pii/unclassified/pii/restricted).
  const clsCol = rowClassificationColumn(entry);
  if (clsCol) {
    lines.push(
      `SELECT '${key}' AS source_key, ${q(clsCol)} AS classification, count(*) AS row_count ` +
        `FROM public.${table} GROUP BY ${q(clsCol)};`,
    );
  }

  // 8) Kişisel Arşiv: classification tablosu dağılımı (mevcut kayıtlar otomatik safe DEĞİL).
  if (entry.rowGate === "row-classification-hash") {
    lines.push(
      `SELECT '${key}' AS source_key, classification, count(*) AS classification_row_count ` +
        `FROM public.yh_archive_classifications GROUP BY classification;`,
    );
  }

  return lines.join("\n");
}

/**
 * Aktivasyon + doğrulama + rollback ŞABLONU (TEMPLATE; ÇALIŞTIRILMAZ). Yalnız column-tenant
 * kaynaklar için CDC trigger bağlama gösterir; diğer tenant modları (join/global-canonical/
 * client) worker kapsam genişletmesi gerektirir → yorum olarak işaretlenir. `activate`,
 * `verify`, `disable/rollback` yolları açıktır (kill-switch index'i KORUR).
 */
export function buildActivationTemplate(entry: ActivationMatrixEntry): string {
  const key = q(entry.sourceKey);
  const table = q(entry.sourceTable);
  const trg = `yh_cdc_${entry.sourceTable}_trg`;
  const lines: string[] = [];

  lines.push(`-- ══ AKTİVASYON ŞABLONU (ÇALIŞTIRMA — AYRI PRODUCTION ONAYI): ${entry.sourceKey} ══`);
  lines.push(`-- class=${entry.activationClass}  cohort=${entry.activationCohort}`);
  lines.push(`-- ÖNKOŞUL: kod enabled:true + preflight PASS + (backfill için) explicit onay.`);

  if (entry.activationClass === "KEEP_LIVE" || entry.activationClass === "ROW_GATED_READY") {
    lines.push(`-- NOT: ${entry.sourceKey} zaten CANLI/grandfathered; yeni aktivasyon kapısına tabi DEĞİL.`);
    lines.push(`-- Aktivasyon şablonu UYGULANMAZ (mevcut davranış korunur).`);
    return lines.join("\n");
  }

  // 1) Trigger bağlama (yalnız column-tenant feasible; aksi worker genişletmesi gerektirir).
  if (entry.triggerFeasibleNow && entry.tenantMode === "column") {
    lines.push(`-- 1) CDC trigger bağla (column-tenant; aktivasyon-kapılı → is_active=false iken no-op):`);
    lines.push(`-- CREATE TRIGGER ${trg}`);
    lines.push(`--   AFTER INSERT OR UPDATE OR DELETE ON public.${table}`);
    lines.push(`--   FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('${key}', '${table}');`);
  } else {
    lines.push(
      `-- 1) TRIGGER BAĞLAMA HENÜZ FIZIBL DEĞİL (tenantMode=${entry.tenantMode}): ` +
        `outbox tenant_id NOT NULL + worker v1 (column-only) kapsamı bu modu desteklemez. ` +
        `Önce worker/CDC kapsam genişletmesi gerekir (ayrı iş).`,
    );
  }

  // 2) Aktivasyon flip (backfill DEFAULT false).
  lines.push(`-- 2) Kaynağı aktive et (backfill DEFAULT false; activation ≠ backfill):`);
  lines.push(
    `-- SELECT public.yh_source_activation_set('${key}', true, false, ` +
      `'${q(entry.activationClass)}', '${q(entry.scope)}', 'controlled activation');`,
  );

  // 3) Doğrulama (salt-okunur).
  lines.push(`-- 3) DOĞRULA (salt-okunur): preflight bloğunu yeniden çalıştır; is_active=true, olay akışı beklenen.`);

  // 4) Rollback / kill-switch (index KORUNUR).
  lines.push(`-- 4) ROLLBACK / KILL-SWITCH (index satırları KORUNUR; kaynak verisi SİLİNMEZ):`);
  lines.push(`-- SELECT public.yh_source_deactivate('${key}');`);
  if (entry.triggerFeasibleNow && entry.tenantMode === "column") {
    lines.push(`-- DROP TRIGGER IF EXISTS ${trg} ON public.${table};`);
  }

  return lines.join("\n");
}
