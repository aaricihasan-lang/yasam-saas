import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest, membershipInactiveResponse } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { resolveModuleAccess, type ModuleGateKey } from "@/lib/auth/moduleAccessCore";
import { logServerError } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/summary — ana ekran modül sayaçları + son aktivite (Doğaltaş, stok,
 * Şifa Rehberi, Kişisel Arşiv).
 *
 * Neden: bu tablolar anon/publishable rolüne KAPALI (RLS + grant revoke) → tarayıcıdan
 * doğrudan okuma 42501 alıyor ve sayaçlar boş kalıyordu. Sunucu kapısı:
 *   - verifyUserRequest (x-user-id + x-session-token binding); tenantId her zaman DB'den.
 *   - Üyelik kapısı (requireModuleAccess ile aynı) + her sayaç, ilgili modülün KENDİ
 *     route'unun kullandığı gate anahtarıyla ayrı ayrı yetkilendirilir; izin yoksa null.
 *   - Yalnız sayım + son 3 başlık/tarih; ham satır taşınmaz. Kısmi hata → o alan null.
 */
type CountKey = "stones" | "stok" | "sifa_rehberi" | "digital_content";

const COUNT_SOURCES: ReadonlyArray<{ key: CountKey; table: string; gate: ModuleGateKey }> = [
  // app/api/dogaltas/stones → gate "stones"
  { key: "stones", table: "stones", gate: "stones" },
  // app/api/dogaltas/inventory → gate "stones"
  { key: "stok", table: "dogaltas_inventory", gate: "stones" },
  // app/api/sifa-rehberi/guides → gate "sifa_rehberi"
  { key: "sifa_rehberi", table: "healing_guides", gate: "sifa_rehberi" },
  // app/api/kisisel-arsiv → gate "personal_archive"
  { key: "digital_content", table: "personal_archives", gate: "personal_archive" },
];

const RECENT_SOURCES: ReadonlyArray<{ key: "stones" | "personal_archives"; table: string; col: string; gate: ModuleGateKey }> = [
  { key: "stones", table: "stones", col: "stone_name", gate: "stones" },
  { key: "personal_archives", table: "personal_archives", col: "title", gate: "personal_archive" },
];

const RECENT_LIMIT = 3;

export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const profile = guard.profile ?? {};
  if (!hasMembershipAccessForRow(profile)) return membershipInactiveResponse();

  const allowed = (gate: ModuleGateKey) =>
    resolveModuleAccess(profile.role, profile.module_permissions, gate, {
      isDemo: guard.is_demo_account === true,
    });

  const counts: Partial<Record<CountKey, number | null>> = {};
  const recent: Record<string, Array<{ label: string | null; created_at: string | null }>> = {};

  await Promise.all([
    ...COUNT_SOURCES.map(async ({ key, table, gate }) => {
      if (!allowed(gate)) {
        counts[key] = null;
        return;
      }
      const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (error) {
        logServerError({ route: "dashboard/summary", action: `count.${table}`, tenantId, cause: error });
        counts[key] = null;
        return;
      }
      counts[key] = count ?? 0;
    }),
    ...RECENT_SOURCES.map(async ({ key, table, col, gate }) => {
      if (!allowed(gate)) {
        recent[key] = [];
        return;
      }
      const { data, error } = await db
        .from(table)
        .select(`${col}, created_at`)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error) {
        logServerError({ route: "dashboard/summary", action: `recent.${table}`, tenantId, cause: error });
        recent[key] = [];
        return;
      }
      recent[key] = (data ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>;
        return {
          label: typeof r[col] === "string" ? (r[col] as string) : null,
          created_at: typeof r.created_at === "string" ? r.created_at : null,
        };
      });
    }),
  ]);

  return NextResponse.json(
    { ok: true, counts, recent },
    { headers: { "Cache-Control": "no-store" } },
  );
}
