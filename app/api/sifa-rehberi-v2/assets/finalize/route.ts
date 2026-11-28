/** Şifa Rehberi V2 — GERÇEK API: görsel yükleme 2/2 (nesne + bayt doğrulaması → kayıt). */
import type { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { handleUploadFinalize } from "@/lib/sifa-rehberi-v2/server/http";
import { sifaV2Context, sifaV2Enabled, sifaV2NotFound, sifaV2Ready } from "@/lib/sifa-rehberi-v2/server/realRoute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!sifaV2Enabled()) return sifaV2NotFound();
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  if (!(await sifaV2Ready(guard.db))) return sifaV2NotFound();
  if (guard.is_demo_account) return demoReadOnlyResponse();
  const c = sifaV2Context(guard);
  return handleUploadFinalize(c.db, c.storage, c.scope, req);
}
