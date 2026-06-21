import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

const C_BILINCALTI = "7c3aed"; // violet-700

type ExportMode = "all" | "selected" | "single";

type SubconsciousRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  title: string | null;
  category: string | null;
  content: string | null;
  note_text: string | null;
  created_at: string;
};

function formatDateTR(d: string): string {
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return d; }
}

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "all", ids, id } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    ids?: string[];
    id?: string;
  };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // GÜVENLİK: userId'nin gerçekten bu tenantId'e ait olduğunu doğrula.
  const { data: userRow } = await db
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!userRow)
    return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  let query = db.from("bioenergy_subconscious_causes")
    .select("id,tenant_id,source_uid,title,category,content,note_text,created_at")
    .eq("tenant_id", tenantId);

  if (exportMode === "single" && id) {
    query = query.eq("id", id);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error)
    return Response.json({ ok: false, error: `Bilinçaltı sebepleri okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as SubconsciousRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için bilinçaltı sebebi bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && rows.length === 1);

  const exportLabel =
    isSingle ? `Tek Kayıt — ${rows[0]!.title || ""}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${rows.length})` :
    `Tüm Bilinçaltı Sebepleri (${rows.length})`;

  const categories = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "BİLİNÇALTI SEBEPLER",
    subtitle: isSingle && rows[0]
      ? `${rows[0].title || "Bilinçaltı Sebebi"} · Rapor`
      : "Biyoenerji Bilinçaltı Sebepler Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Kayıt Sayısı", value: String(rows.length) },
      { label: "Kategori",     value: String(categories.size) },
      { label: "Kapsam",       value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Kayıt Sayısı", String(rows.length)],
    ["Kategori",     String(categories.size)],
    ["Kapsam",       exportLabel],
  ]));

  all.push(...buildTOCPage());

  all.push(h1Colored("1. Bilinçaltı Sebepler", C_BILINCALTI, true));
  all.push(muted(`${rows.length} kayıt`));
  all.push(spacer());

  rows.forEach((row, i) => {
    const title = row.title?.trim() || "Başlıksız Kayıt";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`KAYIT #${String(i + 1).padStart(3, "0")}`, C_BILINCALTI));
    all.push(h2(title));

    all.push(twoColTable([
      ["Tarih",    formatDateTR(row.created_at)],
      ["Kategori", row.category?.trim() || "Belirtilmemiş"],
      ...(row.source_uid?.trim() ? [["Kaynak UID", row.source_uid.trim()] as [string, string]] : []),
    ]));

    if (row.content?.trim())   { all.push(h3("İçerik"));  all.push(bodyText(row.content.trim())); }
    if (row.note_text?.trim()) { all.push(h3("Not"));     all.push(bodyText(row.note_text.trim())); }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Bilinçaltı Sebepler Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && rows[0]?.title ? slugify(rows[0].title) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-bilincalti-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
