import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { exportTableAll } from "@/lib/backup/engine";
import {
  EXPORT_MODULE_ORDER,
  LEGACY_EXPORT_MODULE_ALIASES,
  MODULE_LABELS,
  tablesForModule,
} from "@/lib/backup/registry";
import { buildArchiveDocx, WordBudgetError, WORD_RECORD_BUDGET, type WordModuleData } from "@/lib/backup/wordExport";
import { reportFileDate } from "@/lib/time/reportTime";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/export — Okunabilir Word arşivi (FA-32).
 * Body: `{ module: "<registry modül anahtarı>" | "all" }` (eski anahtarlar: dogaltas, bioenerji … kabul edilir)
 *
 * - Kapsam registry'den (JSON yedeğiyle aynı tablolar); keyset sayfalama ile TAM okuma.
 * - Tam metin (kısaltma yok), kayıt başına alan/değer blokları, UUID'ler etiketli.
 * - Okuma hatası / eksik tablo belgede kırmızı bölümde ve `X-Export-Incomplete` başlığında.
 * - Boyut bütçesi aşılırsa 413 + "modül bazlı indirin" (belge sessizce kırpılmaz).
 * Üyelik kapısı YOK (kendi verisini dışa aktarma hakkı).
 */
export async function POST(req: NextRequest) {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  const { tenantId, db } = guard;

  let body: { module?: unknown };
  try {
    body = (await req.json()) as { module?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const rawKey = String(body?.module ?? "").trim();
  const moduleKey = LEGACY_EXPORT_MODULE_ALIASES[rawKey] ?? rawKey;
  const isAll = moduleKey === "all";
  if (!isAll && !EXPORT_MODULE_ORDER.includes(moduleKey)) {
    return NextResponse.json({ error: "Geçersiz modül." }, { status: 400 });
  }
  const keys = isAll ? [...EXPORT_MODULE_ORDER] : [moduleKey];

  const modules: WordModuleData[] = [];
  let totalRows = 0;
  let overBudget = false;
  try {
    for (const key of keys) {
      const mod: WordModuleData = { key, label: MODULE_LABELS[key] ?? key, tables: [] };
      // Modül içindeki tablolar paralel okunur (süre); bütçe modül sonunda toplamla denetlenir.
      const entries = tablesForModule(key);
      const results = await Promise.all(
        entries.map((entry) => exportTableAll(db, entry, tenantId, { maxRows: WORD_RECORD_BUDGET })),
      );
      entries.forEach((entry, i) => {
        const res = results[i];
        totalRows += res.rows.length;
        if (res.truncated) overBudget = true;
        mod.tables.push({ entry, rows: res.rows, expected_count: res.expected_count, complete: res.complete, error: res.error });
      });
      modules.push(mod);
      if (overBudget || totalRows > WORD_RECORD_BUDGET) {
        overBudget = true;
        break;
      }
    }
  } catch (err) {
    console.error("[settings/export] read", err);
    return NextResponse.json({ error: "Veriler okunamadı; lütfen tekrar deneyin." }, { status: 500 });
  }

  const tooBig = (records: number) =>
    NextResponse.json(
      {
        error:
          `Seçilen kapsam tek Word belgesi için çok büyük (${records}+ kayıt). ` +
          (isAll ? "Lütfen modül bazlı indirin. " : "") +
          "Geri yüklenebilir tam kopya için JSON Sistem Yedeği'ni kullanın.",
        code: "WORD_TOO_LARGE",
      },
      { status: 413 },
    );
  if (overBudget) return tooBig(totalRows);

  const title = isAll ? "Tüm Veriler — Okunabilir Arşiv" : `${MODULE_LABELS[moduleKey] ?? moduleKey} — Okunabilir Arşiv`;
  try {
    const built = await buildArchiveDocx({ title, modules });
    const slug = isAll ? "tum-veriler" : moduleKey.replace(/_/g, "-");
    const fileName = `${slug}-arsiv-${reportFileDate()}.docx`;
    return new NextResponse(new Uint8Array(built.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Incomplete": built.incompleteTables.length > 0 ? "1" : "0",
        "X-Export-Records": String(built.records),
        "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Incomplete, X-Export-Records",
      },
    });
  } catch (err) {
    if (err instanceof WordBudgetError) return tooBig(err.records);
    console.error("[settings/export] build", err);
    return NextResponse.json({ error: "Word belgesi oluşturulamadı." }, { status: 500 });
  }
}
