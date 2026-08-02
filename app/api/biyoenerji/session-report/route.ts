import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
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

const C_SEANS = "ea580c"; // biyoenerji turuncu

type ExportMode = "all" | "selected" | "single";

type SessionRow = {
  id: string;
  tenant_id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

function formatDateTR(d: string): string {
  try {
    return new Date(d).toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
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

export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnızca sunucu tarafında x-user-id + x-session-token
  // (requireModuleAccess) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  const guard = await requireModuleAccess(request, "energy_body");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", sessionIds, sessionId } = body as {
    exportMode?: ExportMode;
    sessionIds?: string[];
    sessionId?: string;
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("bioenergy_sessions").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && sessionId) {
    query = query.eq("id", sessionId);
  } else if (exportMode === "selected" && Array.isArray(sessionIds) && sessionIds.length > 0) {
    query = query.in("id", sessionIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error)
    return Response.json({ ok: false, error: `Seanslar okunamadı: ${error.message}` }, { status: 500 });

  const sessions = (data || []) as SessionRow[];
  if (!sessions.length)
    return Response.json({ ok: false, error: "Bu seçim için seans bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && sessions.length === 1);

  const exportLabel =
    isSingle ? `Tek Seans — ${sessions[0]!.title || ""}` :
    exportMode === "selected" ? `Seçili Seanslar (${sessions.length})` :
    `Tüm Seanslar (${sessions.length})`;

  const categories = new Set(sessions.map((s) => s.category?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "BİYOENERJİ SEANSLARI",
    subtitle: isSingle && sessions[0]
      ? `${sessions[0].title || "Seans"} · Seans Raporu`
      : "Biyoenerji Seans Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Seans Sayısı",  value: String(sessions.length) },
      { label: "Kategori",      value: String(categories.size) },
      { label: "Kapsam",        value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Seans Sayısı",  String(sessions.length)],
    ["Kategori",      String(categories.size)],
    ["Kapsam",        exportLabel],
  ]));

  all.push(...buildTOCPage());

  all.push(h1Colored("1. Seans Listesi", C_SEANS, true));
  all.push(muted(`${sessions.length} seans kaydı`));
  all.push(spacer());

  sessions.forEach((session, i) => {
    const title = session.title?.trim() || "Başlıksız Seans";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`SEANS #${String(i + 1).padStart(3, "0")}`, C_SEANS));
    all.push(h2(title));

    all.push(twoColTable([
      ["Tarih",     formatDateTR(session.created_at)],
      ["Kategori",  session.category?.trim() || "Belirtilmemiş"],
      ...(session.source?.trim() ? [["Kaynak", session.source.trim()] as [string, string]] : []),
    ]));

    if (session.content?.trim()) {
      all.push(h3("İçerik / Uygulama Notları"));
      all.push(bodyText(session.content.trim()));
    }

    if (session.note?.trim()) {
      all.push(h3("Not"));
      all.push(bodyText(session.note.trim()));
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Biyoenerji Seans Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && sessions[0]?.title ? slugify(sessions[0].title) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-seans-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
