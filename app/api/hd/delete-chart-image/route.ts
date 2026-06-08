import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BUCKET = "hd-chart-images";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientId?: unknown;
      tenantId?: unknown;
      storagePath?: unknown;
    };

    const clientId = String(body.clientId ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();
    const storagePath = String(body.storagePath ?? "").trim();

    if (!clientId || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "clientId ve tenantId gerekli." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase yapılandırması eksik." },
        { status: 500 },
      );
    }

    const db = createClient(supabaseUrl, supabaseKey);

    const { data: client, error: clientErr } = await db
      .from("human_design_clients")
      .select("id")
      .eq("id", clientId)
      .eq("tenant_id", tenantId)
      .single();

    if (clientErr || !client) {
      return NextResponse.json(
        { ok: false, error: "Danışan doğrulanamadı." },
        { status: 403 },
      );
    }

    // Clear DB field
    await db
      .from("human_design_clients")
      .update({ chart_image_url: null, updated_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("tenant_id", tenantId);

    // Best-effort storage deletion (only for paths belonging to this tenant)
    if (storagePath && storagePath.startsWith(`${tenantId}/`)) {
      await db.storage.from(BUCKET).remove([storagePath]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
