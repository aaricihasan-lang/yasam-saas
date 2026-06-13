import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
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

const C_NR = "4c1d95"; // derin mor — numeroloji rengi

type ExportMode = "all" | "selected" | "single";

type RecordRow = {
  id: string;
  tenant_id: string;
  name: string;
  surname: string;
  birth_date: string;
  analysis_data: unknown;
  created_at: string;
};

// analysis_data.motor içinden güvenli okuma
function safeMotor(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if (!o.motor || typeof o.motor !== "object" || Array.isArray(o.motor)) return null;
  return o.motor as Record<string, unknown>;
}

function safeDisplay(val: unknown): string {
  if (!val || typeof val !== "object") return "—";
  const v = (val as Record<string, unknown>).display;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function safeSummary(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const s = (data as Record<string, unknown>).summary;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function safePin(motor: Record<string, unknown> | null): string {
  if (!motor) return "—";
  const pin = motor.pinKodu as Record<string, unknown> | undefined;
  if (!pin) return "—";
  const row1 = [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5].map((k) => String(k ?? "—")).join("  ");
  const row2 = [pin.k6, pin.k7, pin.k8, pin.k9].map((k) => String(k ?? "—")).join("  ");
  return `${row1}   |   ${row2}`;
}

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

function buildSingleRecord(row: RecordRow, n: number): ReportChild[] {
  const motor = safeMotor(row.analysis_data);
  const summary = safeSummary(row.analysis_data);
  const adSoyad = `${row.name} ${row.surname}`.trim();

  const out: ReportChild[] = [];

  out.push(profileLabel(`KAYIT #${String(n).padStart(3, "0")}`, C_NR));
  out.push(h1Colored(`${n}. ${adSoyad}`, C_NR, n > 1));

  // Kimlik tablosu
  out.push(h2("Kimlik Bilgileri"));
  out.push(twoColTable([
    ["Ad",            row.name || "—"],
    ["Soyad",         row.surname || "—"],
    ["Doğum Tarihi",  row.birth_date || "—"],
    ["Analiz Tarihi", new Date(row.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })],
  ]));

  // Ana sayılar
  if (motor) {
    out.push(h2("Temel Numeroloji Değerleri"));
    out.push(twoColTable([
      ["Ana Kulvar",   safeDisplay(motor.anaKulvar)],
      ["Yan Kulvar",   safeDisplay(motor.yanKulvar)],
      ["İfade Sayısı", safeDisplay(motor.ifadeSayisi)],
      ["Hayat Yolu",   safeDisplay(motor.hayatYolu)],
    ]));

    // PIN Kodu
    const pinStr = safePin(motor);
    out.push(h3("PIN Kodu"));
    out.push(fieldInline("PIN", pinStr));
  }

  // Özet metin
  if (summary) {
    out.push(h2("Analiz Özeti"));
    out.push(bodyText(summary.slice(0, 600)));
  }

  return out;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", ids, recordId } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    ids?: string[];
    recordId?: string;
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("numerology_records").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && recordId) {
    query = query.eq("id", recordId);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("name");
  if (error)
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as RecordRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için kayıt bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (rows.length === 1 && exportMode !== "all");

  const exportLabel =
    exportMode === "single" ? `Tek Kayıt — ${rows[0]!.name} ${rows[0]!.surname}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${rows.length})` :
    `Tüm Kayıtlar (${rows.length})`;

  const all: ReportChild[] = [];

  // Premium kapak
  const subTitle = isSingle && rows[0]
    ? `${rows[0].name} ${rows[0].surname} · Doğum: ${rows[0].birth_date}`
    : "Toplu Numeroloji Kayıt Raporu";

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "NUMEROLOJİ RAPORU",
    subtitle: subTitle,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Kayıt Sayısı", value: String(rows.length) },
      { label: "Kapsam",       value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Kayıt Sayısı", String(rows.length)],
    ["Rapor Kapsamı", exportLabel],
  ]));

  all.push(...buildTOCPage());

  // İçerik
  all.push(h1Colored("1. Numeroloji Kayıtları", C_NR, true));
  all.push(muted(`${rows.length} kayıt`));
  all.push(spacer());

  rows.forEach((row, i) => {
    if (i > 0) all.push(divider());
    all.push(...buildSingleRecord(row, i + 1));
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Numeroloji Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && rows[0] ? slugify(`${rows[0].name} ${rows[0].surname}`) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `numeroloji-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
