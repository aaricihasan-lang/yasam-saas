import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * /api/admin/sifa-rehberi/guides/import — admin şifa rehberi JSON import köprüsü.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + DB doğrulaması (role=admin, active).
 *   - Yazma yalnızca service_role'lü guard.db ile (tarayıcı doğrudan insert ETMEZ).
 *   - Admin hedef tenant'ı seçtiği için tenant_id istekten gelir; ANCAK yalnızca
 *     admin doğrulamasından sonra kabul edilir.
 *
 * Eylemler (action):
 *   - "existing-keys": verilen tenant için mevcut hastalık adı anahtarlarını döner.
 *   - "insert-guides": guide satırlarını ekler, eklenen id'leri döner.
 *   - "insert-sections": healing_guide_sections satırlarını ekler.
 */

const MAX_GUIDES = 50;
const MAX_SECTIONS = 500;

type GuideInsertRow = {
  tenant_id: string;
  name: string;
  category: string | null;
  symptoms: string | null;
  related_stones: unknown | null;
  related_reflexology: unknown | null;
  updated_at: string;
};

type SectionInsertRow = {
  guide_id: string;
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  images: unknown[];
};

function normTenant(v: unknown): string {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();

  // ── Mevcut hastalık adı anahtarları ──────────────────────────────────────────
  if (action === "existing-keys") {
    const tenantId = normTenant(body.tenantId);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId zorunludur." }, { status: 400 });
    }

    const names: string[] = [];
    const pageSize = 500;
    let from = 0;
    while (true) {
      const { data, error } = await db
        .from("healing_guides")
        .select("name")
        .eq("tenant_id", tenantId)
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      for (const row of rows) {
        const name = String((row as { name?: unknown }).name ?? "").trim();
        if (name) names.push(name);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return NextResponse.json({ ok: true, names });
  }

  // ── Guide satırlarını ekle ────────────────────────────────────────────────────
  if (action === "insert-guides") {
    const tenantId = normTenant(body.tenantId);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId zorunludur." }, { status: 400 });
    }

    const rawGuides = Array.isArray(body.guides) ? body.guides : [];
    if (rawGuides.length === 0) {
      return NextResponse.json({ ok: false, error: "guides boş." }, { status: 400 });
    }
    if (rawGuides.length > MAX_GUIDES) {
      return NextResponse.json(
        { ok: false, error: `Tek istekte en fazla ${MAX_GUIDES} kayıt gönderin.` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const rows: GuideInsertRow[] = [];
    for (const g of rawGuides as Record<string, unknown>[]) {
      const name = String(g?.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ ok: false, error: "Her kayıtta name zorunludur." }, { status: 400 });
      }
      rows.push({
        tenant_id: tenantId, // server doğrulanmış tenant'ı zorlar
        name,
        category: g?.category != null ? String(g.category) : null,
        symptoms: g?.symptoms != null ? String(g.symptoms) : null,
        related_stones: g?.related_stones ?? null,
        related_reflexology: g?.related_reflexology ?? null,
        updated_at: now,
      });
    }

    const { data, error } = await db
      .from("healing_guides")
      .insert(rows)
      .select("id, name");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, guides: data ?? [] });
  }

  // ── Section satırlarını ekle ──────────────────────────────────────────────────
  if (action === "insert-sections") {
    const rawSections = Array.isArray(body.sections) ? body.sections : [];
    if (rawSections.length === 0) {
      return NextResponse.json({ ok: false, error: "sections boş." }, { status: 400 });
    }
    if (rawSections.length > MAX_SECTIONS) {
      return NextResponse.json(
        { ok: false, error: `Tek istekte en fazla ${MAX_SECTIONS} alt içerik gönderin.` },
        { status: 400 },
      );
    }

    const rows: SectionInsertRow[] = [];
    for (const s of rawSections as Record<string, unknown>[]) {
      const guideId = String(s?.guide_id ?? "").trim();
      const sectionType = String(s?.section_type ?? "").trim();
      if (!guideId || !sectionType) {
        return NextResponse.json(
          { ok: false, error: "Her alt içerikte guide_id ve section_type zorunludur." },
          { status: 400 },
        );
      }
      rows.push({
        guide_id: guideId,
        section_type: sectionType,
        mode: s?.mode != null ? String(s.mode) : null,
        title: s?.title != null ? String(s.title) : null,
        note: s?.note != null ? String(s.note) : null,
        source: s?.source != null ? String(s.source) : null,
        images: Array.isArray(s?.images) ? (s.images as unknown[]) : [],
      });
    }

    const { error } = await db.from("healing_guide_sections").insert(rows);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: rows.length });
  }

  return NextResponse.json({ ok: false, error: "Bilinmeyen işlem." }, { status: 400 });
}
