import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("hacamat_rules")
    .select("*")
    .order("category")
    .order("sort_order");

  if (error)
    return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, data });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek." }, { status: 400 }); }

  const { category, rule_text, sort_order = 0 } = body as {
    category:   string;
    rule_text:  string;
    sort_order?: number;
  };

  if (!category || !rule_text?.trim())
    return Response.json({ ok: false, error: "category ve rule_text zorunludur." }, { status: 400 });

  const { data, error } = await supabase
    .from("hacamat_rules")
    .insert({ category, rule_text: rule_text.trim(), sort_order })
    .select()
    .single();

  if (error)
    return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, data }, { status: 201 });
}
