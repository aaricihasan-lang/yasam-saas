import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  validateContentSectionsForType,
  decideCreateConflict,
  safeDbError,
} from "@/app/numeroloji/bilgi-bankasi/helpers/sourcesValidation";

export const runtime = "nodejs";

/**
 * /api/numeroloji/knowledge — numerology_knowledge_records güvenli sunucu kapısı.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA session'dan alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma .eq("tenant_id", tenantId) ile bağlanır (çapraz-tenant engellenir).
 *   - Demo hesap: yazma yapılmaz.
 *
 * NKB-V2-C:
 *   - content_sections yalnız ana-kulvar/yan-kulvar için doğrulanır (validateContentSectionsForType).
 *     Diğer türlerde non-null content_sections REDDEDİLİR; description/source davranışı değişmez.
 *   - POST artık CREATE-ONLY: mevcut (tenant, type, value) kaydı SESSİZCE EZMEZ.
 *     Varsa 409 Conflict; overwrite yalnız açık `overwrite:true` ile mümkün.
 *     Bilinçli düzenleme yolu PATCH (id ile, aynı tenant) olarak korunur.
 *
 * GET               → { ok, rows }              (tenant'ın tüm bilgi kayıtları)
 * POST { analysis_type, value, source?, description?, content_sections?, overwrite? }
 *                   → create-only; varsa 409 → { ok, id } | { ok:false, conflict:true }
 * PATCH { id, ...fields, content_sections? }    → { ok, id }
 * DELETE { id } | { ids: [] }                   → { ok, deleted }
 */

const TABLE = "numerology_knowledge_records";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const analysis_type = str(body.analysis_type);
  const value = str(body.value);
  if (!analysis_type || !value) {
    return NextResponse.json({ ok: false, error: "analysis_type ve value zorunludur." }, { status: 400 });
  }

  // content_sections: yalnız ana-kulvar/yan-kulvar için doğrulanır; diğerlerinde non-null reddedilir.
  const csRes = validateContentSectionsForType(analysis_type, body.content_sections);
  if (!csRes.ok) return NextResponse.json({ ok: false, error: csRes.error }, { status: csRes.status });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const overwrite = body.overwrite === true;

  // Mevcut (tenant, analysis_type, value) kaydı var mı?
  const { data: existing, error: findErr } = await db
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("analysis_type", analysis_type)
    .eq("value", value)
    .maybeSingle();
  if (findErr) {
    const e = safeDbError(findErr);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }

  const decision = decideCreateConflict(Boolean(existing?.id), overwrite);
  if (decision === "conflict") {
    // Sessiz ezme YOK: açık 409. Güncelleme için PATCH veya açık overwrite:true.
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        existingId: (existing as { id: string }).id,
        error:
          "Bu (analysis_type, value) için kayıt zaten mevcut. Güncellemek için düzenleyin (PATCH) ya da overwrite:true gönderin.",
      },
      { status: 409 },
    );
  }

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    analysis_type,
    value,
    source: str(body.source),
    description: str(body.description),
    updated_at: new Date().toISOString(),
  };
  // content_sections yalnız gönderildiyse yazılır (undefined → dokunma; null → NULL; array → değer).
  if (csRes.value !== undefined) payload.content_sections = csRes.value;

  if (decision === "overwrite") {
    const { error } = await db.from(TABLE).update(payload).eq("id", (existing as { id: string }).id).eq("tenant_id", tenantId);
    if (error) {
      const e = safeDbError(error);
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: true, id: (existing as { id: string }).id, overwritten: true });
  }

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.analysis_type !== undefined) update.analysis_type = str(body.analysis_type);
  if (body.value !== undefined) update.value = str(body.value);
  if (body.source !== undefined) update.source = str(body.source);
  if (body.description !== undefined) update.description = str(body.description);

  // content_sections: etkin analysis_type'a göre doğrula (body'de yoksa mevcut kaydın türü).
  if (body.content_sections !== undefined) {
    let effectiveType = body.analysis_type !== undefined ? str(body.analysis_type) : "";
    if (!effectiveType) {
      const { data: rec, error: recErr } = await db
        .from(TABLE)
        .select("analysis_type")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (recErr) {
        const e = safeDbError(recErr);
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      if (!rec) {
        return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
      }
      effectiveType = String((rec as { analysis_type: string }).analysis_type);
    }
    const csRes = validateContentSectionsForType(effectiveType, body.content_sections);
    if (!csRes.ok) return NextResponse.json({ ok: false, error: csRes.error }, { status: csRes.status });
    update.content_sections = csRes.value ?? null;
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { id?: unknown; ids?: unknown } = {};
  try { body = (await req.json()) as { id?: unknown; ids?: unknown }; } catch { /* boş gövde olabilir */ }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000)
    : str(body.id) ? [str(body.id)] : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids gerekli." }, { status: 400 });

  const { data, error } = await db
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
