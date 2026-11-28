/**
 * Şifa Rehberi V2 — GERÇEK API: uzmanın görebildiği çalışma alanı (kişisel + kendi tenant'ının kurum
 * kayıtları) GET · Kaydet (yalnız KİŞİSEL kayıtlar) POST. Kapı sırası: lib/sifa-rehberi-v2/server/realRoute.ts
 */
import type { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { handleLoad, handleSave } from "@/lib/sifa-rehberi-v2/server/http";
import { sifaV2Context, sifaV2Enabled, sifaV2NotFound, sifaV2Ready } from "@/lib/sifa-rehberi-v2/server/realRoute";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!sifaV2Enabled()) return sifaV2NotFound();
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  if (!(await sifaV2Ready(guard.db))) return sifaV2NotFound();
  const c = sifaV2Context(guard);
  return handleLoad(c.db, c.scope, c.userId);
}

export async function POST(req: NextRequest) {
  if (!sifaV2Enabled()) return sifaV2NotFound();
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  if (!(await sifaV2Ready(guard.db))) return sifaV2NotFound();
  if (guard.is_demo_account) return demoReadOnlyResponse();
  const c = sifaV2Context(guard);
  return handleSave(c.db, c.scope, req, c.storage);
}
