import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Yalnızca admin global kuralı güncelleyebilir (anon → 401, expert/demo → 403)
  const guard = await verifyAdminRequest(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek." }, { status: 400 }); }

  const { rule_text, category, sort_order } = body as {
    rule_text?:  string;
    category?:   string;
    sort_order?: number;
  };

  const patch: Record<string, unknown> = {};
  if (rule_text !== undefined)  patch.rule_text  = rule_text.trim();
  if (category  !== undefined)  patch.category   = category;
  if (sort_order !== undefined) patch.sort_order  = sort_order;

  if (Object.keys(patch).length === 0)
    return Response.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });

  const { data, error } = await supabase
    .from("hacamat_rules")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Yalnızca admin global kuralı silebilir (anon → 401, expert/demo → 403)
  const guard = await verifyAdminRequest(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const { error } = await supabase
    .from("hacamat_rules")
    .delete()
    .eq("id", id);

  if (error)
    return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
