/**
 * lib/backup/readableExport.ts — Ayarlar › Dışa Aktarım "Okunabilir Arşiv" (Word) iş mantığı (next/server'sız;
 * harness doğrudan çağırır). Route (`app/api/settings/export`) yalnız kimlik doğrulama + yanıt sarmalayıcısıdır.
 *
 * - Kapsam registry'den (JSON yedeğiyle aynı tablolar); keyset sayfalama ile TAM okuma.
 * - OKUNABİLİR çıktı ekran / rapor yetki kuralına uyar (A3 / QA-N-01): `ReadableView` (sunucuda doğrulanmış
 *   profilden) Numeroloji gelecek dönemlerini ve HD Sistem Yorumu'nu yetkisizse görüntüleme kopyasından çıkarır.
 *   Teknik JSON yedeği bu yoldan GEÇMEZ (ham kalır).
 * - Yetkili görünümde çıktı bugünküyle bayt-bayt aynıdır (satırlar aynı nesne, ek not yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportFileDate } from "@/lib/time/reportTime";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { exportTableAll } from "./engine";
import { backupFileText } from "./fileText";
import { addReadableCounts, applyReadableView, readableViewNotes, type ReadableView, type ReadableViewCounts } from "./readableView";
import { EXPORT_MODULE_ORDER, LEGACY_EXPORT_MODULE_ALIASES, tablesForModule } from "./registry";
import { buildArchiveDocx, WordBudgetError, WORD_RECORD_BUDGET, type WordModuleData } from "./wordExport";

export type ReadableExportResult =
  | { kind: "json"; status: number; body: Record<string, unknown> }
  | { kind: "file"; buffer: Buffer; fileName: string; incomplete: boolean; records: number };

export async function buildReadableExport(input: {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  module: unknown;
  view: ReadableView;
  now?: Date;
  /** Çıktı dili (route girişinde çözülür). Verilmezse / tr → bugünkü Türkçe belge bayt-bayt aynı. */
  locale?: ActiveLocale;
}): Promise<ReadableExportResult> {
  const { db, tenantId, userId, view } = input;
  const ft = backupFileText(input.locale);
  const rawKey = String(input.module ?? "").trim();
  const moduleKey = LEGACY_EXPORT_MODULE_ALIASES[rawKey] ?? rawKey;
  const isAll = moduleKey === "all";
  if (!isAll && !EXPORT_MODULE_ORDER.includes(moduleKey)) {
    return { kind: "json", status: 400, body: { error: "Geçersiz modül." } }; // i18n-ignore: API hata gövdesi (app/api/settings/export/route.ts tabanından taşındı); ekran code / HTTP durumu kullanır
  }
  const keys = isAll ? [...EXPORT_MODULE_ORDER] : [moduleKey];

  const modules: WordModuleData[] = [];
  let totalRows = 0;
  let overBudget = false;
  let counts: ReadableViewCounts = { numerologyRedacted: 0, hdSystemReadingRedacted: 0 };
  try {
    for (const key of keys) {
      const mod: WordModuleData = { key, label: ft.moduleLabel(key), tables: [] };
      // Modül içindeki tablolar paralel okunur (süre); bütçe modül sonunda toplamla denetlenir.
      const entries = tablesForModule(key);
      const results = await Promise.all(
        entries.map((entry) => exportTableAll(db, entry, tenantId, { maxRows: WORD_RECORD_BUDGET, ownerUserId: userId })),
      );
      entries.forEach((entry, i) => {
        const res = results[i];
        totalRows += res.rows.length;
        if (res.truncated) overBudget = true;
        const shown = applyReadableView(entry.table, res.rows, view, ft.hidden);
        counts = addReadableCounts(counts, shown.counts);
        mod.tables.push({
          entry,
          rows: shown.rows,
          expected_count: res.expected_count,
          complete: res.complete,
          error: res.error,
          ...(ft.isSource ? {} : { label: ft.tableLabel(entry) }),
        });
      });
      modules.push(mod);
      if (overBudget || totalRows > WORD_RECORD_BUDGET) {
        overBudget = true;
        break;
      }
    }
  } catch (err) {
    console.error("[settings/export] read", err);
    return { kind: "json", status: 500, body: { error: "Veriler okunamadı; lütfen tekrar deneyin." } }; // i18n-ignore: API hata gövdesi (app/api/settings/export/route.ts tabanından taşındı); ekran code / HTTP durumu kullanır
  }

  const tooBig = (records: number): ReadableExportResult => ({
    kind: "json",
    status: 413,
    body: {
      error:
        `Seçilen kapsam tek Word belgesi için çok büyük (${records}+ kayıt). ` + // i18n-ignore: API hata gövdesi (app/api/settings/export/route.ts tabanından taşındı); ekran code / HTTP durumu kullanır
        (isAll ? "Lütfen modül bazlı indirin. " : "") + // i18n-ignore: API hata gövdesi (app/api/settings/export/route.ts tabanından taşındı); ekran code / HTTP durumu kullanır
        "Geri yüklenebilir tam kopya için JSON Sistem Yedeği'ni kullanın.", // i18n-ignore: API hata gövdesi (app/api/settings/export/route.ts tabanından taşındı); ekran code / HTTP durumu kullanır
      code: "WORD_TOO_LARGE",
    },
  });
  if (overBudget) return tooBig(totalRows);

  const title = ft.exportTitle(isAll ? "all" : moduleKey);
  const notes = readableViewNotes(counts, ft);
  try {
    const built = await buildArchiveDocx({
      title,
      modules,
      now: input.now,
      ...(notes.length ? { notes } : {}),
      ...(ft.isSource ? {} : { text: ft.word }),
    });
    const slug = isAll ? "tum-veriler" : moduleKey.replace(/_/g, "-");
    const fileName = `${slug}-arsiv-${reportFileDate(undefined, input.now ?? new Date())}.docx`;
    return { kind: "file", buffer: built.buffer, fileName, incomplete: built.incompleteTables.length > 0, records: built.records };
  } catch (err) {
    if (err instanceof WordBudgetError) return tooBig(err.records);
    console.error("[settings/export] build", err);
    return { kind: "json", status: 500, body: { error: "Word belgesi oluşturulamadı." } }; // i18n-ignore: API hata gövdesi (app/api/settings/export/route.ts tabanından taşındı); ekran code / HTTP durumu kullanır
  }
}
