import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, beslenmeJson, type BeslenmeOwnerOk } from "@/lib/beslenme/ownerGuard";
import { requireClientInTenant, type ClientTenantRow } from "@/lib/danisan/clientGuard";
import { isUuid } from "@/lib/beslenme/planContracts";

/**
 * FAZ 7 Beslenme danışan-route ortak kapısı: owner(super-admin) + client tenant-ownership.
 * Tüm /api/beslenme/clients/[clientId]/* route'ları REUSE eder (copy-paste yok).
 * tenant_id server session'dan; clientId path'ten (body'den DEĞİL).
 */
export type BeslenmeClientOk = {
  ok: true;
  guard: BeslenmeOwnerOk;
  clientId: string;
  client: ClientTenantRow;
};
export type BeslenmeClientResult = BeslenmeClientOk | { ok: false; response: NextResponse };

export async function requireBeslenmeClient(req: NextRequest, clientId: string): Promise<BeslenmeClientResult> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return { ok: false, response: guard.response };
  // Dinamik clientId format doğrulaması (malformed id DB'ye gitmeden reddedilir).
  if (!isUuid(clientId)) return { ok: false, response: beslenmeJson({ ok: false, code: "CLIENT_NOT_FOUND" }, 404) };
  const client = await requireClientInTenant(guard.db, guard.tenantId, clientId);
  if (!client) return { ok: false, response: beslenmeJson({ ok: false, code: "CLIENT_NOT_FOUND" }, 404) };
  return { ok: true, guard, clientId, client };
}
