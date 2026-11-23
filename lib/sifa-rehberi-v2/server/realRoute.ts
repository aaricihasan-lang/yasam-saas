/**
 * Şifa Rehberi V2 — GERÇEK API rotalarının ortak parçaları. Her rota AYNI sırayı AÇIKÇA uygular
 * (proje envanter harness'ı kapıyı rota dosyasında arar — scripts/faz1-p3-access-management-test.ts):
 *   1) if (!sifaV2Enabled()) return sifaV2NotFound();          — sürüm bayrağı (V1 çalışırken V2 API'si yok)
 *   2) const guard = await requireModuleAccess(req, "sifa_rehberi"); if (!guard.ok) return guard.response;
 *      — mevcut oturum + kullanıcı/tenant + üyelik/deneme kapısı + modül izni
 *   3) yazma ucunda: if (guard.is_demo_account) return demoReadOnlyResponse();
 *   4) const c = sifaV2Context(guard);                          — kapsam YALNIZ oturumdan
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";
import { supabaseStorage, type SifaV2Storage } from "@/lib/sifa-rehberi-v2/server/storage";
import type { Scope, SifaV2Db } from "@/lib/sifa-rehberi-v2/server/service";
import { sifaV2EnabledFromEnv } from "@/lib/sifa-rehberi-v2/versionRoute";

export function sifaV2Enabled(): boolean {
  return sifaV2EnabledFromEnv();
}

export function sifaV2NotFound(): NextResponse {
  return NextResponse.json({ error: "Bulunamadı." }, { status: 404 });
}

export type SifaV2Ctx = { db: SifaV2Db; storage: SifaV2Storage; scope: Scope; userId: string };

/** requireModuleAccess'in BAŞARILI sonucundan bağlam (tenant + kullanıcı yalnız oturumdan). */
export function sifaV2Context(guard: { db: SupabaseClient; tenantId: string; userId: string }): SifaV2Ctx {
  return {
    db: supabaseDb(guard.db),
    storage: supabaseStorage(guard.db),
    scope: { tenantId: guard.tenantId, userId: guard.userId },
    userId: guard.userId,
  };
}
