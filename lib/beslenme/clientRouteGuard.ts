import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess, type UserGuardOk } from "@/lib/auth/userGuard";
import { beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireClientInTenant, type ClientTenantRow } from "@/lib/danisan/clientGuard";
import { isUuid } from "@/lib/beslenme/planContracts";

/**
 * Beslenme danışan-route ortak kapısı — /api/beslenme/clients/[clientId]/* REUSE eder.
 *
 * ÖNCE (FAZ 7): owner-only (requireBeslenmeOwner = "beslenme" modülü + super-admin).
 * ARTIK (uzman erişimi AŞAMA 1): "clients" (Danışan Yolculuğu) modül yetkisi + client
 * tenant-ownership. Danışan Yolculuğu erişimi olan uzman KENDİ tenant'ındaki KENDİ
 * danışanının beslenme verilerini (profil/ölçüm/alerji/tercih + plan listesi) okuyup
 * düzenleyebilir. Owner/admin, "clients" kapısını rolüyle zaten geçer → mevcut owner
 * davranışı korunur.
 *
 * KİMLİK (server-authoritative): tenant_id YALNIZ doğrulanmış session/profile'dan
 * (guard.tenantId); clientId YALNIZ path param'dan. Body/query'den tenant/client/user
 * ASLA kimlik kaynağı olarak kabul edilmez. requireClientInTenant cross-tenant'ı
 * fail-closed (404) kapatır (başka tenant'ın danışanı görünmez).
 *
 * KAPSAM: Bu kapı YALNIZ danışan-scoped beslenme verisidir (clients modülü). Plan editör
 * requireBeslenmePlanAccess; global Beslenme yönetimi (katalog/şablon/kaynak/konu) artık
 * requireBeslenmeModule (module_permissions.beslenme) — admin↔uzman özellik paritesi.
 */
export type BeslenmeClientOk = {
  ok: true;
  guard: UserGuardOk;
  clientId: string;
  client: ClientTenantRow;
};
export type BeslenmeClientResult = BeslenmeClientOk | { ok: false; response: NextResponse };

export async function requireBeslenmeClient(req: NextRequest, clientId: string): Promise<BeslenmeClientResult> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return { ok: false, response: guard.response };
  // Dinamik clientId format doğrulaması (malformed id DB'ye gitmeden reddedilir).
  if (!isUuid(clientId)) return { ok: false, response: beslenmeJson({ ok: false, code: "CLIENT_NOT_FOUND" }, 404) };
  const client = await requireClientInTenant(guard.db, guard.tenantId, clientId);
  if (!client) return { ok: false, response: beslenmeJson({ ok: false, code: "CLIENT_NOT_FOUND" }, 404) };
  return { ok: true, guard, clientId, client };
}
