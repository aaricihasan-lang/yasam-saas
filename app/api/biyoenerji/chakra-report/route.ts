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

const C_CAKRA = "9333ea"; // çakra mor

type ExportMode = "all" | "selected" | "single";

type ChakraRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  name: string | null;
  organs: string | null;
  glands: string | null;
  color: string | null;
  stones: string | null;
  causes: string | null;
  physical: string | null;
  mental: string | null;
  notes: string | null;
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

  const { tenantId, userId, exportMode = "all", chakraIds, chakraId } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    chakraIds?: string[];
    chakraId?: string;
  };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

  // All bioenergy_chakras columns
  const SELECT = "id,tenant_id,source_uid,name,organs,glands,color,stones,causes,physical,mental,notes,created_at";
  let query = db.from("bioenergy_chakras").select(SELECT).eq("tenant_id", tenantId);

  if (exportMode === "single" && chakraId) {
    query = query.eq("id", chakraId);
  } else if (exportMode === "selected" && Array.isArray(chakraIds) && chakraIds.length > 0) {
    query = query.in("id", chakraIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error)
    return Response.json({ ok: false, error: `Çakra kayıtları okunamadı: ${error.message}` }, { status: 500 });

  const chakras = (data || []) as ChakraRow[];
  if (!chakras.length)
    return Response.json({ ok: false, error: "Bu seçim için çakra kaydı bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && chakras.length === 1);

  const exportLabel =
    isSingle ? `Tek Çakra — ${chakras[0]!.name || ""}` :
    exportMode === "selected" ? `Seçili Çakralar (${chakras.length})` :
    `Tüm Çakra Kütüphanesi (${chakras.length})`;

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "ÇAKRA KÜTÜPHANESİ",
    subtitle: isSingle && chakras[0]
      ? `${chakras[0].name || "Çakra"} · Çakra Raporu`
      : "Biyoenerji Çakra Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Çakra Kayıt Sayısı", value: String(chakras.length) },
      { label: "Kapsam",             value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Çakra Kayıt Sayısı", String(chakras.length)],
    ["Kapsam",             exportLabel],
  ]));

  all.push(...buildTOCPage());

  all.push(h1Colored("1. Çakra Kütüphanesi", C_CAKRA, true));
  all.push(muted(`${chakras.length} kayıt`));
  all.push(spacer());

  chakras.forEach((chakra, i) => {
    const name = chakra.name?.trim() || "İsimsiz Çakra";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`ÇAKRA #${String(i + 1).padStart(3, "0")}`, C_CAKRA));
    all.push(h2(name));

    all.push(twoColTable([
      ["Renk",         chakra.color?.trim() || "Belirtilmemiş"],
      ["Kayıt Tarihi", formatDateTR(chakra.created_at)],
      ...(chakra.source_uid?.trim() ? [["Kaynak UID", chakra.source_uid.trim()] as [string, string]] : []),
    ]));

    if (chakra.organs?.trim())  { all.push(h3("Organlar"));  all.push(bodyText(chakra.organs.trim())); }
    if (chakra.glands?.trim())  { all.push(h3("Bezler"));    all.push(bodyText(chakra.glands.trim())); }
    if (chakra.stones?.trim())  { all.push(h3("Taşlar"));    all.push(bodyText(chakra.stones.trim())); }
    if (chakra.causes?.trim())  { all.push(h3("Nedenler"));  all.push(bodyText(chakra.causes.trim())); }
    if (chakra.physical?.trim()){ all.push(h3("Fiziksel"));  all.push(bodyText(chakra.physical.trim())); }
    if (chakra.mental?.trim())  { all.push(h3("Zihinsel"));  all.push(bodyText(chakra.mental.trim())); }
    if (chakra.notes?.trim())   { all.push(h3("Notlar"));    all.push(bodyText(chakra.notes.trim())); }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Çakra Kütüphanesi Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && chakras[0]?.name ? slugify(chakras[0].name) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-cakra-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
