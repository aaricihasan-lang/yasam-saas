import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { computeBurc } from "@/lib/danisan/burc";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import {
  createClientIdempotent,
  resolveCreateRequestId,
} from "@/lib/danisan/clientCreate";
import { validateClientWrite } from "@/lib/danisan/clientValidation";
import { istanbulToday } from "@/lib/danisan/istanbulTime";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";

export const runtime = "nodejs";

/**
 * /api/clients — uzmanın danışan listesi/oluşturma (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; request body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/insert tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *   - Çift kayıt (DY-A): body.request_id (uuid) → clients.create_request_id; aynı
 *     istek tekrarında (23505) mevcut kayıt `idempotent_replay: true` ile döner.
 *     create_request_id istemci tarafından doğrudan yazılamaz.
 *   - Satış öncesi kapanış: gövde İZİN LİSTESİ + doğrulamadan geçer
 *     (lib/danisan/clientValidation) → bozuk tarih/boş ad/bilinmeyen kolon yazılamaz (400).
 */

// ─── GET /api/clients ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const url = new URL(req.url);

  const rawSearch = url.searchParams.get("search")?.trim() ?? "";
  const search = rawSearch.replace(/[,()*%]/g, "").slice(0, 100);

  const limitRaw = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : null;

  // Sunucu tarafı sayfalama: offset verilirse range() ile pencere alınır.
  const offsetRaw = Number(url.searchParams.get("offset"));
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : null;

  // count=1 → toplam kayıt sayısı da döner (sayfalama "daha var mı" için).
  const withCount = url.searchParams.get("count") === "1";
  const ascending = url.searchParams.get("order") === "asc";

  let query = db
    .from("clients")
    .select("*", withCount ? { count: "exact" } : undefined)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending });

  if (search) {
    query = query.or(`ad.ilike.%${search}%,soyad.ilike.%${search}%`);
  }
  if (offset !== null && limit) {
    query = query.range(offset, offset + limit - 1);
  } else if (limit) {
    query = query.limit(limit);
  }

  const { data, error, count } = await query;
  if (error) {
    return serverErrorResponse({ route: "clients", action: "GET", tenantId, cause: error });
  }

  return NextResponse.json({
    ok: true,
    clients: data ?? [],
    ...(withCount ? { count: count ?? 0 } : {}),
  });
}

// ─── POST /api/clients ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return demoReadOnlyResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // İzin listesi + doğrulama (ad/soyad zorunlu, gerçek takvim tarihi, kanonik kan/mizaç).
  // tenant_id/id/user_id/create_request_id/bilinmeyen kolonlar zaten süzülür.
  const verdict = validateClientWrite(body, "create", istanbulToday());
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, code: verdict.code, field: verdict.field, error: verdict.error },
      { status: 400 },
    );
  }
  const fields: Record<string, unknown> = { ...verdict.fields };
  const requestId = resolveCreateRequestId(body);

  // F7: Burç SUNUCUDA doğum tarihinden türetilir (canonical, giriş yolundan bağımsız).
  // Client'ın gönderdiği `burc` authoritative DEĞİL → overwrite. dogum yoksa burç null.
  fields.burc = computeBurc(fields.dogum == null ? null : String(fields.dogum));

  const result = await createClientIdempotent(db, tenantId, fields, requestId);

  if (result.kind === "error") {
    return serverErrorResponse({
      route: "clients",
      action: "POST",
      tenantId,
      cause: result.cause,
      usage: { guard, req, module: "clients", failedAction: "record_created", subEntity: "client" },
    });
  }

  // Usage360: yalnız gerçek oluşturma sayılır (idempotent replay = no-op, olay yok).
  if (result.kind === "created") {
    await trackUsage(guard, req, {
      module: "clients",
      action: "record_created",
      subEntity: "client",
      resourceId: result.client.id != null ? String(result.client.id) : null,
    });
  }

  return NextResponse.json({
    ok: true,
    client: result.client,
    ...(result.kind === "replay" ? { idempotent_replay: true } : {}),
  });
}
