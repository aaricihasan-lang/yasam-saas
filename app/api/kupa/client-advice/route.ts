import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, CLIENT_ADVICE_WRITABLE } from "@/lib/cupping/fields";
import {
  assertOwnedRef,
  cuppingError,
  getEntity,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/client-advice — FAZ 5 DANIŞANA-ÖZEL bilgilendirme (SNAPSHOT) (root).
 *
 * P0 GİZLİLİK: body/query client_id ASLA güvenilmez → her zaman AYNI tenant'a ait
 *   olduğu doğrulanır (assertOwnedRef). Cross-tenant → owned-resource 404 semantiği
 *   ("başka hesapta var" ASLA sızmaz). Admin/owner bypass YOK.
 *
 * SNAPSHOT: şablondan KOPYA metin; sonradan şablon değişse de KOPYA DEĞİŞMEZ
 *   (canlı miras YOK). source_template_id yalnız provenance.
 */

const NOT_FOUND = "Kayıt bu hesaba ait değil veya bulunamadı.";

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return cuppingError(400, "clientId gerekli.");

  // Danışan AYNI tenant'a ait olmalı (fail-closed; cross-tenant enumeration engeli).
  const ownsClient = await assertOwnedRef(db, "clients", tenantId, clientId);
  if (!ownsClient) return cuppingError(404, NOT_FOUND);

  const res = await listEntity(db, CUPPING_TABLES.clientAdvice, tenantId, {
    orderBy: "created_at",
    ascending: false,
    eqFilters: { client_id: clientId },
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, advice: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, advice: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const clientId = typeof parsed.data.client_id === "string" ? parsed.data.client_id.trim() : "";
  if (!clientId) return cuppingError(400, "client_id gerekli.");

  // P0: danışan sahiplik (fail-closed).
  const ownsClient = await assertOwnedRef(db, "clients", tenantId, clientId);
  if (!ownsClient) return cuppingError(404, NOT_FOUND);

  const sourceTemplateId =
    typeof parsed.data.source_template_id === "string" && parsed.data.source_template_id.trim() !== ""
      ? parsed.data.source_template_id.trim()
      : null;

  // Server-built INSERT nesnesi (client_id/source_template_id server-side; mass-assignment yok).
  let insertObj: Record<string, unknown>;

  if (sourceTemplateId) {
    // ── PATH A — GENEL ŞABLONDAN KOPYA (snapshot) ──
    const owned = await assertOwnedRef(db, CUPPING_TABLES.adviceTemplates, tenantId, sourceTemplateId);
    if (!owned) return cuppingError(400, "Seçilen şablon bu hesaba ait değil.");
    const tpl = await getEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, sourceTemplateId);
    if (!tpl.ok) return tpl.response;
    const t = tpl.data as {
      title: string;
      before_text: string;
      after_text: string;
      general_note: string | null;
    };
    const titleOverride =
      typeof parsed.data.title === "string" && parsed.data.title.trim() !== "" ? parsed.data.title : null;
    insertObj = {
      client_id: clientId,
      source_template_id: sourceTemplateId,
      title: titleOverride ?? t.title,
      // KOPYA metin (snapshot) — şablon sonradan değişse de bu satır DEĞİŞMEZ.
      before_text: t.before_text ?? "",
      after_text: t.after_text ?? "",
      general_note: t.general_note ?? null,
    };
  } else {
    // ── PATH B — MANUEL KİŞİSELLEŞTİRİLMİŞ (bağımsız snapshot) ──
    const fields = pickWritable(parsed.data, CLIENT_ADVICE_WRITABLE);
    if (!String(fields.title ?? "").trim()) return cuppingError(400, "Bilgilendirme başlığı gerekli.");
    insertObj = {
      client_id: clientId,
      source_template_id: null,
      ...fields,
    };
  }

  const ins = await insertEntity(db, CUPPING_TABLES.clientAdvice, tenantId, insertObj);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, advice: ins.data });
}
