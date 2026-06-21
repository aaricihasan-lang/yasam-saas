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

const C_ENERJI = "0891b2"; // cyan-600

type ExportMode = "all" | "selected" | "single";

type EnergyBodyRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  genel_tanim: string | null;
  gorevi: string | null;
  bozulma: string | null;
  onerilen_taslar: string | null;
  not_text: string | null;
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

  let query = db.from("bioenergy_energy_bodies")
    .select("id,tenant_id,source_uid,genel_tanim,gorevi,bozulma,onerilen_taslar,not_text,created_at")
    .eq("tenant_id", tenantId);

  if (exportMode === "single" && id) {
    query = query.eq("id", id);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("source_uid", { ascending: true });
  if (error)
    return Response.json({ ok: false, error: `Enerji bedenleri okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as EnergyBodyRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için enerji bedeni kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && rows.length === 1);

  const exportLabel =
    isSingle ? `Tek Kayıt — ${rows[0]!.source_uid || ""}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${rows.length})` :
    `Tüm Enerji Bedenleri (${rows.length})`;

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "ENERJİ BEDENLERİ",
    subtitle: isSingle && rows[0]
      ? `${rows[0].source_uid || "Enerji Bedeni"} · Enerji Bedeni Raporu`
      : "Biyoenerji Enerji Bedenleri Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Kayıt Sayısı", value: String(rows.length) },
      { label: "Kapsam",       value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Kayıt Sayısı", String(rows.length)],
    ["Kapsam",       exportLabel],
  ]));

  all.push(...buildTOCPage());

  all.push(h1Colored("1. Enerji Bedenleri", C_ENERJI, true));
  all.push(muted(`${rows.length} kayıt`));
  all.push(spacer());

  rows.forEach((row, i) => {
    const title = row.source_uid?.trim() || "İsimsiz Kayıt";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`KAYIT #${String(i + 1).padStart(3, "0")}`, C_ENERJI));
    all.push(h2(title));

    all.push(twoColTable([
      ["Kayıt Tarihi", formatDateTR(row.created_at)],
    ]));

    if (row.genel_tanim?.trim())    { all.push(h3("Genel Tanım"));          all.push(bodyText(row.genel_tanim.trim())); }
    if (row.gorevi?.trim())         { all.push(h3("Görevi"));               all.push(bodyText(row.gorevi.trim())); }
    if (row.bozulma?.trim())        { all.push(h3("Bozulma Belirtileri"));  all.push(bodyText(row.bozulma.trim())); }
    if (row.onerilen_taslar?.trim()){ all.push(h3("Önerilen Taşlar"));      all.push(bodyText(row.onerilen_taslar.trim())); }
    if (row.not_text?.trim())       { all.push(h3("Not"));                  all.push(bodyText(row.not_text.trim())); }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Enerji Bedenleri Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && rows[0]?.source_uid ? slugify(rows[0].source_uid) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-enerji-bedenleri-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
