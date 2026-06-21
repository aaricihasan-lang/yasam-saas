import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
  fieldInline,
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

const C_PROTOKOL = "be185d"; // refleksoloji pembe-mor

type ExportMode = "all" | "selected" | "single";

type ProtocolRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  title: string | null;
  target_problem: string | null;
  organs: string | null;        // pipe-delimited: "Karaciğer | Böbrek | Bağırsak"
  application_notes: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: string;
};

function parseOrgans(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[|,]+/).map((s) => s.trim()).filter(Boolean);
}

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

  const { tenantId, userId, exportMode = "all", protocolIds, protocolId } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    protocolIds?: string[];
    protocolId?: string;
  };

  // NOT: Bu proje sunucu taraflı oturum (cookie/JWT) kullanmaz; auth localStorage tabanlıdır.
  // API katmanında sahiplik doğrulaması users tablosundan userId+tenantId eşleşmesiyle yapılır.
  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  if (exportMode === "single" && !protocolId)
    return Response.json({ ok: false, error: "Tek protokol için protocolId zorunludur." }, { status: 400 });

  if (exportMode === "selected" && (!Array.isArray(protocolIds) || protocolIds.length === 0))
    return Response.json({ ok: false, error: "Seçili export için en az bir protocolId gerekli." }, { status: 400 });

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

  let query = db.from("reflexology_protocols").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && protocolId) {
    query = query.eq("id", protocolId);
  } else if (exportMode === "selected" && Array.isArray(protocolIds) && protocolIds.length > 0) {
    query = query.in("id", protocolIds);
  }

  const { data, error } = await query.order("title");
  if (error)
    return Response.json({ ok: false, error: `Protokoller okunamadı: ${error.message}` }, { status: 500 });

  const protocols = (data || []) as ProtocolRow[];
  if (!protocols.length)
    return Response.json({ ok: false, error: "Bu seçim için protokol bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && protocols.length === 1);

  const exportLabel =
    isSingle ? `Tek Protokol — ${protocols[0]!.title || ""}` :
    exportMode === "selected" ? `Seçili Protokoller (${protocols.length})` :
    `Tüm Protokoller (${protocols.length})`;

  const totalOrgans = new Set(protocols.flatMap((p) => parseOrgans(p.organs))).size;

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "REFLEKSOLOJİ PROTOKOLLER",
    subtitle: isSingle && protocols[0]
      ? `${protocols[0].title || "Protokol"} · Klinik Protokol Raporu`
      : "Klinik Protokol Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Protokol Sayısı",  value: String(protocols.length) },
      { label: "Kapsam",           value: exportLabel },
      { label: "Toplam Organ",     value: String(totalOrgans) },
    ],
  }));

  // Sistem özeti
  all.push(...buildStatsPage([
    ["Protokol Sayısı", String(protocols.length)],
    ["Kapsam",          exportLabel],
    ["Toplam Organ",    String(totalOrgans)],
  ]));

  // TOC
  all.push(...buildTOCPage());

  // Protokol listesi başlığı
  all.push(h1Colored("1. Protokol Listesi", C_PROTOKOL, true));
  all.push(muted(`${protocols.length} protokol`));
  all.push(spacer());

  // Her protokol
  protocols.forEach((proto, i) => {
    const title = proto.title?.trim() || "Başlıksız Protokol";
    const organs = parseOrgans(proto.organs);

    if (i > 0) all.push(divider());

    all.push(profileLabel(`PROTOKOL #${String(i + 1).padStart(3, "0")}`, C_PROTOKOL));
    all.push(h2(title));

    // Meta tablo
    all.push(twoColTable([
      ["Kayıt Tarihi",  formatDateTR(proto.created_at)],
      ["Organ Sayısı",  String(organs.length)],
      ...(proto.source_uid?.trim() ? [["Kaynak UID", proto.source_uid.trim()] as [string, string]] : []),
    ]));

    // Hedef / sorun
    if (proto.target_problem?.trim()) {
      all.push(h3("Hedef / Sorun"));
      all.push(bodyText(proto.target_problem.trim()));
    }

    // Organlar
    if (organs.length > 0) {
      all.push(...arraySection("Organlar", organs));
    }

    // Uygulama notları
    if (proto.application_notes?.trim()) {
      all.push(h3("Uygulama Notları"));
      const paras = proto.application_notes.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      for (const para of paras) {
        all.push(bodyText(para));
      }
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Refleksoloji Protokol Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && protocols[0] ? slugify(protocols[0].title || "protokol") :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `refleksoloji-protokol-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
