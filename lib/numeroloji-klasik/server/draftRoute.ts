/**
 * Klasik Numeroloji — kaydedilmemiş sonuç (taslak) için route yardımcısı (YALNIZ SUNUCU).
 * Taslak Word / PNG / taşlar: taslak YALNIZ önbellekten yeniden kurulur (0 sağlayıcı çağrısı), uzmanın gördüğü
 * sonuçla özet eşleşmesi doğrulanır ve bellek içi satıra çevrilir — veritabanına HİÇBİR ŞEY YAZILMAZ.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { targetAllowed } from "../futureYears";
import type { ClassicDraftRefInput } from "../input";
import { buildClassicServiceDeps } from "./deps";
import { futureYearsOptsFor } from "./futureYearsView";
import { classicError, classicJson } from "./http";
import type { ClassicAnalysisRow } from "./repository";
import { draftRow, rebuildClassicDraft } from "./service";

assertServerOnly("lib/numeroloji-klasik/server/draftRoute");

export type DraftGuard = {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  is_demo_account: boolean;
  profile?: { role?: unknown; module_permissions?: unknown } & Record<string, unknown> | null;
};

export async function resolveDraftRow(guard: DraftGuard, ref: ClassicDraftRefInput): Promise<{ ok: true; row: ClassicAnalysisRow } | { ok: false; response: NextResponse }> {
  if (guard.is_demo_account) return { ok: false, response: classicError("DEMO_READONLY") };
  const fy = futureYearsOptsFor(guard.profile ?? null);
  const rq = ref.request;
  if (rq.kind === "person" && !targetAllowed(rq.input.targetDate ?? ref.referenceDate, fy)) {
    return { ok: false, response: classicJson(403, { ok: false, code: "FUTURE_YEARS_PERMISSION_REQUIRED", error: "Gelecek yıllara ait hesaplama için \"Gelecek Yılları Göster\" izniniz olmalı.", field: "draft.request.input.targetDate" }) };
  }
  const canLinkClients = resolveModuleAccess(guard.profile?.role as string | undefined, guard.profile?.module_permissions as never, "clients");
  const ctx = { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account, canLinkClients };
  // Taslak raporunda danışan bağı kullanılmaz (rapor danışan adı taşımaz; bağ yalnız Kaydet'te).
  const r = await rebuildClassicDraft(ctx, { ...ref, request: { ...rq, clientId: null } }, buildClassicServiceDeps(guard.db));
  if (!r.body.ok) return { ok: false, response: classicJson(r.status, r.body) };
  return { ok: true, row: draftRow(ctx, { ...rq, clientId: null }, r.body.computed) };
}
