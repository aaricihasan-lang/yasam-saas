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
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

const C_CLIENT = "1e3a5f";

type ExportMode = "all" | "selected" | "filtered";

type ClientRow = {
  id: string;
  ad: string | null;
  soyad: string | null;
  telefon: string | null;
  dogum: string | null;
  gorusme: string | null;
  burc: string | null;
  kan: string | null;
  mizac: string | null;
  created_at: string;
};

type NoteRow = {
  client_id: string;
  saglik_notu: string | null;
};

function v(val: string | null | undefined): string {
  return val?.trim() || "Bilgi girilmemiş";
}

function formatDateTR(date: string | null | undefined): string {
  if (!date) return "Bilgi girilmemiş";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function titleCaseTR(text: string): string {
  if (!text.trim()) return text;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
      const f = lower[0]!;
      const upper = f === "i" ? "İ" : f === "ı" ? "I" : f.toUpperCase();
      return upper + lower.slice(1);
    })
    .join(" ");
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", clientIds } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    clientIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // ── Danışan çekimi
  let clientQuery = db.from("clients").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });

  if ((exportMode === "selected" || exportMode === "filtered") && Array.isArray(clientIds) && clientIds.length > 0) {
    clientQuery = clientQuery.in("id", clientIds);
  }

  const { data: clientData, error: clientError } = await clientQuery;
  if (clientError)
    return Response.json({ ok: false, error: `Danışanlar okunamadı: ${clientError.message}` }, { status: 500 });

  const clients = (clientData || []) as ClientRow[];
  if (!clients.length)
    return Response.json({ ok: false, error: "Bu seçim için danışan bulunamadı." }, { status: 404 });

  // ── Sağlık notu batch fetch
  const { data: noteData } = await db
    .from("client_notes")
    .select("client_id, saglik_notu")
    .in("client_id", clients.map((c) => c.id));

  const notesMap = new Map<string, string | null>();
  for (const note of (noteData || []) as NoteRow[]) {
    notesMap.set(note.client_id, note.saglik_notu);
  }

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);

  const exportLabel =
    exportMode === "selected" ? `Seçili Danışanlar (${clients.length})` :
    exportMode === "filtered" ? `Filtrelenmiş Danışanlar (${clients.length})` :
    `Tüm Danışanlar (${clients.length})`;

  const all: ReportChild[] = [];

  // ── Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "DANIŞAN LİSTESİ",
    subtitle: "Toplu Danışan Özet Raporu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Toplam Danışan", value: String(clients.length) },
      { label: "Kapsam",         value: exportLabel },
    ],
  }));

  // ── Sistem özeti
  all.push(...buildStatsPage([
    ["Toplam Danışan", String(clients.length)],
    ["Rapor Kapsamı",  exportLabel],
  ]));

  // ── İçindekiler
  all.push(...buildTOCPage());

  // ── Danışan listesi bölümü
  all.push(h1Colored("1. Danışan Listesi", C_CLIENT, true));
  all.push(muted(`${clients.length} danışan · özet profil`));
  all.push(spacer());

  clients.forEach((client, i) => {
    const fullName = titleCaseTR(`${client.ad ?? ""} ${client.soyad ?? ""}`.trim()) || "İsimsiz Danışan";
    const saglikNotu = notesMap.get(client.id);

    if (i > 0) all.push(divider());

    all.push(profileLabel(`DANIŞAN #${String(i + 1).padStart(3, "0")}`, C_CLIENT));
    all.push(h2(fullName));
    all.push(twoColTable([
      ["Telefon",        v(client.telefon)],
      ["Doğum Tarihi",   formatDateTR(client.dogum)],
      ["Görüşme Tarihi", formatDateTR(client.gorusme)],
      ["Burç",           v(client.burc)],
      ["Kan Grubu",      v(client.kan)],
      ["Mizaç",          v(client.mizac)],
    ]));

    if (saglikNotu?.trim()) {
      const preview = saglikNotu.trim().length > 280
        ? saglikNotu.trim().slice(0, 280) + "..."
        : saglikNotu.trim();
      all.push(fieldInline("Sağlık Notu", preview));
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Danışan Listesi Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "selected" ? "secili" : exportMode === "filtered" ? "filtreli" : "tumü";
  const filename = `danisan-listesi-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
