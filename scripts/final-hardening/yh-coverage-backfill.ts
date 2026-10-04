/**
 * FAZ1 FINAL HARDENING — Yaşam Hafızası™ KONTROLLÜ COVERAGE BACKFILL ARACI (runbook üretici).
 * ==========================================================================================
 *
 * BU ARAÇ PROD'A / SUPABASE'E / AĞA BAĞLANMAZ. Yalnız kod registry'sinden (YH_INDEX_SOURCES +
 * YH_ACTIVATION_MATRIX; saf modüller) şunları ÜRETİR:
 *   1. coverage.sql  — tenant bazlı "kaynak satır sayısı vs index sayısı" SALT-OKUMA SQL'i
 *                      (owner Supabase SQL Editor'da çalıştırır; DML YOK).
 *   2. runbook.md    — kaynak başına dry-run → write sırası: backfill penceresini açma
 *                      (yh_source_activation_set(key, true, true, …)), /api/admin/yasam-hafizasi/
 *                      index-page çağrı sırası (scopedTenantId + afterId döngüsü), pencereyi kapatma,
 *                      doğrulama; Refleksoloji / Aromaterapi / Doğaltaş / Biyoenerji coverage gap
 *                      raporu şablonu.
 *
 * KAPSAM (fail-closed seçim):
 *   - Yalnız professional (PII-DIŞI) registry: YH_INDEX_SOURCES. Danışan (client) index kaynakları
 *     (YH_CLIENT_INDEX_SOURCES) HİÇ okunmaz.
 *   - isIndexableSource (safe-non-pii + enabled) VE supportsTenantScopedPage (column-tenant,
 *     shared değil, row-gate yok) olan kaynaklar.
 *   - Aktivasyon matrisinde backfill'i PII/row-gate ya da worker desteği nedeniyle yasak olanlar
 *     (blocked-pii / blocked-worker-unsupported) ve istemci tablo adları (client*, appointments…)
 *     HARİÇ.
 *   - Demo tenant SQL'de dışlanır (bilinçli olarak indeks dışı). Owner tenant gerçek uzman tenant'ıdır (dahil).
 *
 * Kullanım:
 *   npx tsx scripts/final-hardening/yh-coverage-backfill.ts                 # özet → stdout
 *   npx tsx scripts/final-hardening/yh-coverage-backfill.ts --out <dizin>   # coverage.sql + runbook.md
 *   npx tsx scripts/final-hardening/yh-coverage-backfill.ts --families all  # 4 aile yerine tüm uygunlar
 */

import fs from "node:fs";
import path from "node:path";
import { YH_INDEX_SOURCES, type SourceConfig } from "../../lib/yasam-hafizasi/indexer/sources";
import { isIndexableSource } from "../../lib/yasam-hafizasi/indexer/sourceGuard";
import { supportsTenantScopedPage } from "../../lib/yasam-hafizasi/indexer/tenantScopeGate";
import { activationEntryOf } from "../../lib/yasam-hafizasi/activation/activationMatrix";
import { ACTIVATION_CLASS_POLICY, isActivationClass } from "../../lib/yasam-hafizasi/activation/activationState";
import { SYNTHETIC_TENANT_IDS } from "../../lib/tenancy/syntheticTenants";
import { YH_DEMO_TENANT_ID, YH_TABLES } from "../../lib/yasam-hafizasi/config";

export const DEFAULT_FAMILIES = ["refleksoloji", "aromaterapi", "dogaltas", "biyoenerji"] as const;

/** Danışan/PII tablo adları — registry sınıflandırması ne derse desin ASLA seçilmez. */
const CLIENT_TABLE_RE = /^(clients?|client_|appointments?|danisan|reflexology_notes$|numerology_records$|yasam_hafizasi_client)/i;

export type BackfillCandidate = {
  sourceKey: string;
  family: string;
  table: string;
  activationClass: string | null;
  /** true → CONTROLLED kaynak: is_active=true CDC işlemesini de AÇAR (ayrı aktivasyon onayı gerekir). */
  controlled: boolean;
  filters: string[];
};

export type ExcludedSource = { sourceKey: string; reason: string };

function sqlIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`güvensiz SQL tanımlayıcı: ${name}`);
  return name;
}

function sqlLit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/** Kaynak satırının indekslenebilir olma filtreleri (registry'den; row-eligibility ile hizalı). */
function eligibilityFilters(s: SourceConfig): string[] {
  const out: string[] = [];
  if (s.activeColumn) out.push(`s.${sqlIdent(s.activeColumn)} IS TRUE`);
  if (s.statusColumn && s.eligibleStatuses && s.eligibleStatuses.length > 0) {
    out.push(`s.${sqlIdent(s.statusColumn)} IN (${s.eligibleStatuses.map(sqlLit).join(", ")})`);
  }
  if (s.ineligibleStatusColumn && s.ineligibleStatuses && s.ineligibleStatuses.length > 0) {
    const c = `s.${sqlIdent(s.ineligibleStatusColumn)}`;
    out.push(`(${c} IS NULL OR ${c} NOT IN (${s.ineligibleStatuses.map(sqlLit).join(", ")}))`);
  }
  if (s.rowClassificationColumn) out.push(`s.${sqlIdent(s.rowClassificationColumn)} = 'safe-non-pii'`);
  return out;
}

/** SAF: registry → backfill adayları + dışlananlar (gerekçeli). */
export function selectBackfillSources(families: readonly string[] | "all"): {
  candidates: BackfillCandidate[];
  excluded: ExcludedSource[];
} {
  const candidates: BackfillCandidate[] = [];
  const excluded: ExcludedSource[] = [];
  for (const raw of YH_INDEX_SOURCES as readonly SourceConfig[]) {
    const s = raw;
    if (families !== "all" && !families.includes(s.sourceFamily)) continue;
    if (!isIndexableSource(s)) {
      excluded.push({ sourceKey: s.sourceKey, reason: `indekslenemez (${s.classification}${s.enabled ? "" : ", disabled"})` });
      continue;
    }
    if (CLIENT_TABLE_RE.test(s.tableName)) {
      excluded.push({ sourceKey: s.sourceKey, reason: "danışan/PII tablosu (kalıcı hariç)" });
      continue;
    }
    if (!supportsTenantScopedPage(s)) {
      excluded.push({ sourceKey: s.sourceKey, reason: "tenant-scoped sayfa desteklenmiyor (join/shared/row-gate)" });
      continue;
    }
    const entry = activationEntryOf(s.sourceKey);
    if (entry && (entry.backfillEligibility === "blocked-pii" || entry.backfillEligibility === "blocked-worker-unsupported")) {
      excluded.push({ sourceKey: s.sourceKey, reason: `aktivasyon matrisi: ${entry.backfillEligibility}` });
      continue;
    }
    const cls = entry?.activationClass ?? null;
    const controlled = cls !== null && isActivationClass(cls) ? ACTIVATION_CLASS_POLICY[cls].requiresRuntimeActivation : true;
    candidates.push({
      sourceKey: s.sourceKey,
      family: s.sourceFamily,
      table: sqlIdent(s.tableName),
      activationClass: cls,
      controlled,
      filters: eligibilityFilters(s),
    });
  }
  return { candidates, excluded };
}

/** SAF: salt-okuma coverage SQL'i (UNION ALL; yalnız açığı olan tenant satırları). */
export function buildCoverageSql(candidates: readonly BackfillCandidate[]): string {
  const idx = sqlIdent(YH_TABLES.index);
  const excludedTenants = [...SYNTHETIC_TENANT_IDS, YH_DEMO_TENANT_ID].map(sqlLit).join(", ");
  const parts = candidates.map((c) => {
    const where = [`s.tenant_id IS NOT NULL`, `s.tenant_id NOT IN (${excludedTenants})`, ...c.filters].join("\n      AND ");
    return `  -- ${c.sourceKey} (${c.activationClass ?? "matris dışı"})
  SELECT ${sqlLit(c.sourceKey)} AS source_key, src.tenant_id, src.source_rows,
         coalesce(ix.indexed_rows, 0) AS indexed_rows,
         src.source_rows - coalesce(ix.indexed_rows, 0) AS gap
  FROM (
    SELECT s.tenant_id, count(*) AS source_rows
    FROM public.${c.table} s
    WHERE ${where}
    GROUP BY s.tenant_id
  ) src
  LEFT JOIN (
    SELECT i.tenant_id, count(DISTINCT i.source_id) AS indexed_rows
    FROM public.${idx} i
    WHERE i.source_table = ${sqlLit(c.table)} AND i.source_module = ${sqlLit(c.family)}
    GROUP BY i.tenant_id
  ) ix USING (tenant_id)`;
  });
  return `-- ============================================================
-- Yaşam Hafızası™ coverage (kaynak vs index) — SALT-OKUMA. DML YOK.
-- Üretildi: scripts/final-hardening/yh-coverage-backfill.ts (prod'a bağlanmadan).
-- Sentetik (varsa) + demo tenant bilinçli olarak dışlanır; owner tenant dahildir.
-- Uygun satır filtresi registry'deki active/status/ineligible kolonlarıyla hizalıdır.
-- ============================================================
SELECT * FROM (
${parts.join("\n  UNION ALL\n")}
) coverage
WHERE gap > 0
ORDER BY source_key, gap DESC;
`;
}

/** SAF: kaynak başına dry-run → write runbook'u (Markdown). */
export function buildRunbook(candidates: readonly BackfillCandidate[], excluded: readonly ExcludedSource[]): string {
  const lines: string[] = [];
  lines.push("# Yaşam Hafızası™ — Kontrollü Coverage Backfill Runbook");
  lines.push("");
  lines.push("> Bu belge kod registry'sinden ÜRETİLİR; araç prod'a bağlanmaz. Her adım owner onayıyla, sırayla uygulanır.");
  lines.push("> Danışan (client) PII kaynakları kapsam dışıdır. Owner tenant'ı gerçek uzman tenant'ıdır (açık sayılır).");
  lines.push("");
  lines.push("## 0. Ön koşullar");
  lines.push("- Kod (index-page write kapısı: `yh_source_activation.is_active && backfill_allowed`) prod'da.");
  lines.push("- `coverage.sql` çalıştırıldı; açığı (`gap > 0`) olan (source_key, tenant_id) çiftleri listelendi.");
  lines.push("- Admin kimliği: istek başlıkları `x-admin-id` + `x-session-token` (aktif admin oturumu).");
  lines.push("- Aktivasyon matrisinde `FUTURE_ONLY_READY` sınıfı CDC tarafında backfill ADAYI değildir; bu runbook'taki admin tenant-scoped backfill (BF-4 yolu) her kaynak için AYRI owner onayı ister.");
  lines.push("");
  lines.push("## 1. Kaynak başına akış");
  lines.push("");
  for (const c of candidates) {
    lines.push(`### ${c.sourceKey} — \`${c.table}\` (${c.activationClass ?? "matris dışı"})`);
    if (c.controlled) {
      lines.push(
        "> ⚠️ CONTROLLED kaynak: `is_active=true` CDC olay işlemesini de AÇAR. Mevcut durum `is_active=false` ise AYRI aktivasyon onayı olmadan pencere AÇILMAZ.",
      );
    }
    lines.push("1. Mevcut durumu kaydet (salt-okuma):");
    lines.push("   ```sql");
    lines.push(`   SELECT source_key, is_active, backfill_allowed FROM public.yh_source_activation WHERE source_key = ${sqlLit(c.sourceKey)};`);
    lines.push("   ```");
    lines.push("2. Backfill penceresini aç (yalnız bu kaynak):");
    lines.push("   ```sql");
    lines.push(`   SELECT public.yh_source_activation_set(${sqlLit(c.sourceKey)}, true, true, NULL, 'professional', 'FAZ1 coverage backfill penceresi');`);
    lines.push("   ```");
    lines.push("3. Açığı olan HER tenant için DRY-RUN (sayfa sayfa, `hasMore=false` olana dek):");
    lines.push("   ```http");
    lines.push("   POST /api/admin/yasam-hafizasi/index-page");
    lines.push(`   { "sourceKey": "${c.sourceKey}", "mode": "dry-run", "scopedTenantId": "<tenant_id>", "limit": 100, "afterId": <önceki nextCursor | null> }`);
    lines.push("   ```");
    lines.push("   Beklenen: 200, `page.eligibleUnits` ≈ coverage `gap`; `excludedSynthetic=0`. 403 `tenant-*` → tenant hazır değil (atla, raporla).");
    lines.push("4. Aynı döngü `\"mode\": \"write\"` ile. 503 `partial-write` → AYNI `afterId` ile tekrar (idempotent). 403 `backfill-not-allowed` → adım 2 uygulanmamış.");
    lines.push("5. Pencereyi KAPAT (önceki `is_active` değerini koru):");
    lines.push("   ```sql");
    lines.push(`   SELECT public.yh_source_activation_set(${sqlLit(c.sourceKey)}, <önceki is_active>, false, NULL, 'professional', 'FAZ1 coverage backfill kapandı');`);
    lines.push("   ```");
    lines.push("6. `coverage.sql`'i yeniden çalıştır → bu kaynak için `gap = 0` (ya da açıklanmış fark).");
    lines.push("");
  }
  lines.push("## 2. Dışlanan kaynaklar (gerekçeli)");
  for (const e of excluded) lines.push(`- \`${e.sourceKey}\` — ${e.reason}`);
  lines.push("");
  lines.push("## 3. Coverage gap raporu şablonu (Refleksoloji / Aromaterapi / Doğaltaş / Biyoenerji)");
  lines.push("");
  lines.push("| Aile | source_key | tenant sayısı (gap>0) | toplam gap (önce) | yazılan | toplam gap (sonra) | not |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const fam of DEFAULT_FAMILIES) {
    const rows = candidates.filter((c) => c.family === fam);
    if (rows.length === 0) {
      lines.push(`| ${fam} | — | — | — | — | — | uygun kaynak yok |`);
      continue;
    }
    for (const c of rows) lines.push(`| ${fam} | ${c.sourceKey} | | | | | |`);
  }
  lines.push("");
  lines.push("## 4. Geri alma");
  lines.push("- Pencere kapatma (adım 5) write'ı derhal durdurur (403 `backfill-not-allowed`).");
  lines.push("- Yazılan index satırları idempotent upsert'tür; kaynak veriye DOKUNULMAZ.");
  return lines.join("\n") + "\n";
}

function main(): void {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
  const famIdx = args.indexOf("--families");
  const families: readonly string[] | "all" =
    famIdx >= 0 && args[famIdx + 1] === "all"
      ? "all"
      : famIdx >= 0 && args[famIdx + 1]
        ? args[famIdx + 1].split(",").map((x) => x.trim()).filter(Boolean)
        : DEFAULT_FAMILIES;

  const { candidates, excluded } = selectBackfillSources(families);
  const sql = buildCoverageSql(candidates);
  const runbook = buildRunbook(candidates, excluded);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "coverage.sql"), sql, "utf8");
    fs.writeFileSync(path.join(outDir, "runbook.md"), runbook, "utf8");
    console.log(`coverage.sql + runbook.md yazıldı → ${outDir}`);
  }
  console.log(`Aday kaynak: ${candidates.length} | Dışlanan: ${excluded.length}`);
  for (const c of candidates) {
    console.log(`  + ${c.sourceKey} (${c.table}; ${c.activationClass ?? "matris dışı"}${c.controlled ? "; CONTROLLED" : ""})`);
  }
  for (const e of excluded) console.log(`  - ${e.sourceKey}: ${e.reason}`);
}

// Harness import'unda çalışmaz; yalnız doğrudan çağrıldığında.
if (process.argv[1] && /yh-coverage-backfill\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
