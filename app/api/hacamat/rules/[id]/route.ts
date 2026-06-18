import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { error } = await supabase
    .from("hacamat_rules")
    .delete()
    .eq("id", id);

  if (error)
    return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
