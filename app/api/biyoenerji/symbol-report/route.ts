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

const C_SEMBOL = "059669"; // emerald-600

type ExportMode = "all" | "selected" | "single";

type SymbolRow = {
  id: string;
  tenant_id: string;
  symbol: string | null;
  title: string | null;
  category: string | null;
  meaning: string | null;
  source: string | null;
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

  const { tenantId, exportMode = "all", ids, id } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    ids?: string[];
    id?: string;
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("bioenergy_symbols")
    .select("id,tenant_id,symbol,title,category,meaning,source,created_at")
    .eq("tenant_id", tenantId);

  if (exportMode === "single" && id) {
    query = query.eq("id", id);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error)
    return Response.json({ ok: false, error: `Semboller okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as SymbolRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için sembol kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && rows.length === 1);

  const exportLabel =
    isSingle ? `Tek Kayıt — ${rows[0]!.symbol || rows[0]!.title || ""}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${rows.length})` :
    `Tüm Semboller (${rows.length})`;

  const categories = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  const firstTitle = rows[0]?.symbol?.trim() || rows[0]?.title?.trim() || "Sembol";

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "SEMBOL DİLİ",
    subtitle: isSingle && rows[0]
      ? `${firstTitle} · Sembol Raporu`
      : "Biyoenerji Sembol Dili Kataloğu",
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

  all.push(h1Colored("1. Sembol Dili", C_SEMBOL, true));
  all.push(muted(`${rows.length} kayıt`));
  all.push(spacer());

  rows.forEach((row, i) => {
    const displayTitle = row.symbol?.trim() || row.title?.trim() || "İsimsiz Sembol";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`KAYIT #${String(i + 1).padStart(3, "0")}`, C_SEMBOL));
    all.push(h2(displayTitle));

    all.push(twoColTable([
      ["Tarih",    formatDateTR(row.created_at)],
      ["Kategori", row.category?.trim() || "Belirtilmemiş"],
      ...(row.source?.trim() ? [["Kaynak", row.source.trim()] as [string, string]] : []),
    ]));

    if (row.meaning?.trim()) { all.push(h3("Anlam")); all.push(bodyText(row.meaning.trim())); }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Sembol Dili Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && (rows[0]?.symbol || rows[0]?.title) ? slugify(rows[0]!.symbol || rows[0]!.title || "") :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-sembol-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
