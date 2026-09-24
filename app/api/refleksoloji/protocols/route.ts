import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { recordUsageEvent, buildUsageIdempotencyKey } from "@/lib/usage/usageEvents";
import { pickProtocolContentFields } from "@/lib/refleksoloji/protocolDto";
import { jsonServerError } from "@/lib/refleksoloji/apiError";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols — uzmanın refleksoloji protokolleri (C2-B3a).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/insert tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Not: reflexology_protocols tenant-scoped (client_id yok). `id` ve `created_at`
 *      kayıt katmanında istemci tarafından üretilir; yalnızca `tenant_id` zorlanır.
 */

// ─── GET /api/refleksoloji/protocols ───────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("reflexology_protocols")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("title");

  if (error) {
    return jsonServerError("protocols.GET", error);
  }

  return NextResponse.json({ ok: true, protocols: data ?? [] });
}

// ─── POST /api/refleksoloji/protocols ──────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, protocol: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Mass-assignment koruması: yalnız kullanıcı-düzenlenebilir içerik alanları.
  // tenant_id oturumdan; id/created_at DB default'undan; köken/provenance alanları
  // (origin_*, transferred_at) ve id/created_at/updated_at İSTEMCİDEN kabul EDİLMEZ.
  const fields = pickProtocolContentFields(body);
  const sourceUid =
    typeof body.source_uid === "string" && body.source_uid.trim()
      ? body.source_uid.trim()
      : null;

  // REF-006: YENİ kayıtta source_uid ZORUNLU. İstemci her zaman üretir (crypto id);
  // eksikse reddet → prod'da yeni NULL source_uid satırı OLUŞMASIN (partial-unique
  // index `WHERE source_uid IS NOT NULL` dışına kaçamaz). Legacy NULL satır AŞAMA 3'e
  // bırakılır (bu route onu değiştirmez/silmez).
  if (!sourceUid) {
    return NextResponse.json(
      { ok: false, error: "source_uid zorunludur." },
      { status: 400 },
    );
  }

  // İDEMPOTENSİ — GERÇEKÇİ GARANTİ MODELİ (REF-005):
  //   ⚠️ Bu SELECT-sonra-INSERT ön-kontrolü DB UNIQUE constraint YOKKEN (mevcut prod)
  //   yalnız BEST-EFFORT'tur: iki paralel istek TOCTOU yarışıyla duplicate üretebilir.
  //   "check-then-write güvenli" DEĞİLDİR. UI pending-guard (REF-023) çift-tıklamayı
  //   azaltır ama paralel isteği garanti etmez.
  //
  //   Migration (20270125…) partial UNIQUE(tenant_id, source_uid) uygulandıktan SONRA
  //   gerçek atomiklik DB'den gelir: aşağıdaki INSERT yarışı kaybeden istekte 23505
  //   (unique_violation) döndürür; bunu yakalayıp UPDATE'e düşürerek tek canonical satır
  //   garanti edilir. Böylece bu kod HEM pre-migration (best-effort) HEM post-migration
  //   (DB-atomik) rejimlerinde doğru davranır; migration sonrası kod değişikliği GEREKMEZ.
  const existingUpdate = async () => {
    const { data: updated, error: updErr } = await db
      .from("reflexology_protocols")
      .update(fields)
      .eq("tenant_id", tenantId)
      .eq("source_uid", sourceUid)
      .select()
      .single();
    if (updErr) return { error: updErr, protocol: null };
    return { error: null, protocol: updated };
  };

  const { data: existing, error: existErr } = await db
    .from("reflexology_protocols")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("source_uid", sourceUid)
    .maybeSingle();

  if (existErr) {
    return jsonServerError("protocols.POST.exist", existErr);
  }
  if (existing) {
    // Aynı mantıksal protokol → mevcut satırı içerikle güncelle (idempotent), yeni açma.
    const r = await existingUpdate();
    if (r.error) return jsonServerError("protocols.POST.update", r.error);
    return NextResponse.json({ ok: true, protocol: r.protocol, deduped: true });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .insert({ ...fields, tenant_id: tenantId, source_uid: sourceUid })
    .select()
    .single();

  if (error) {
    // Post-migration: paralel istek yarışı kaybetti (unique_violation) → mevcut
    // satırı güncelleyerek idempotent kapan (DB-atomik). Pre-migration'da bu kod
    // tetiklenmez (constraint yok) → mevcut best-effort davranış korunur.
    if ((error as { code?: string }).code === "23505") {
      const r = await existingUpdate();
      if (r.error) return jsonServerError("protocols.POST.update.race", r.error);
      return NextResponse.json({ ok: true, protocol: r.protocol, deduped: true });
    }
    return jsonServerError("protocols.POST.insert", error);
  }

  // İP-2C: YENİ protokol oluşturma → usage event (dedup/update yolu olay üretmez; server-resolved; throw etmez).
  const newId = (data as { id?: string } | null)?.id ?? null;
  if (newId) {
    await recordUsageEvent(db, {
      tenantId,
      userId: guard.userId,
      moduleKey: "reflexology",
      eventType: "protocol_created",
      idempotencyKey: buildUsageIdempotencyKey("reflexology", "protocol_created", newId),
    });
  }
  return NextResponse.json({ ok: true, protocol: data });
}
