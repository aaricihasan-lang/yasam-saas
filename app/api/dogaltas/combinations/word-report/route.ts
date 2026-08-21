import type { NextRequest } from "next/server";
import { requireDogaltasReportAccess } from "@/lib/dogaltas/reportAuth";
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

const C_COMBO = "3b0764"; // derin mor

type ExportMode = "all" | "selected" | "filtered" | "single";

type CombinationRow = {
  id: string;
  tenant_id: string;
  source_id: string;
  issue: string;
  description: string | null;
  variant_index: number;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
  created_at: string;
};

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export async function POST(req: NextRequest): Promise<Response> {
  // F-018: doğrulanmış oturum kapısı — tenantId/userId SUNUCUDAN (body'den DEĞİL).
  const auth = await requireDogaltasReportAccess(req);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth;

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", issues, combinationTitle } = body as {
    exportMode?: ExportMode;
    issues?: string[];        // issue names for selected/filtered
    combinationTitle?: string; // single issue name
  };

  const SELECT = "id,tenant_id,source_id,issue,description,variant_index,source,stones_text,notes_text,notes_text_2,notes_text_3,created_at";

  let query = db.from("combinations").select(SELECT).eq("tenant_id", tenantId);

  if (exportMode === "single" && combinationTitle) {
    query = query.eq("issue", combinationTitle);
  } else if ((exportMode === "selected" || exportMode === "filtered") && Array.isArray(issues) && issues.length > 0) {
    query = query.in("issue", issues);
  }

  const { data, error } = await query.order("issue").order("variant_index");
  if (error)
    return Response.json({ ok: false, error: `Kombinasyonlar okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as CombinationRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için kombinasyon bulunamadı." }, { status: 404 });

  // Issue'ya göre grupla
  const groupMap = new Map<string, CombinationRow[]>();
  for (const row of rows) {
    const key = row.issue?.trim() || "İsimsiz";
    const list = groupMap.get(key);
    if (list) list.push(row); else groupMap.set(key, [row]);
  }
  const groups = Array.from(groupMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr-TR"))
    .map(([issue, groupRows]) => ({
      issue,
      rows: [...groupRows].sort((a, b) => a.variant_index - b.variant_index),
    }));

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const totalVariants = rows.length;
  const totalIssues = groups.length;

  const exportLabel =
    exportMode === "single" ? `Tek Kombinasyon — ${combinationTitle || ""}` :
    exportMode === "selected" ? `Seçili Kombinasyonlar (${totalIssues})` :
    exportMode === "filtered" ? `Filtrelenmiş Kombinasyonlar (${totalIssues})` :
    `Tüm Kombinasyonlar (${totalIssues})`;

  // Kategori istatistikleri
  const categories = new Set(rows.map((r) => r.description?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "TAŞ KOMBİNASYONLARI",
    subtitle: exportLabel,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Toplam Başlık",  value: String(totalIssues) },
      { label: "Toplam Variant", value: String(totalVariants) },
      { label: "Kategori",       value: String(categories.size) },
    ],
  }));

  // Sistem özeti
  all.push(...buildStatsPage([
    ["Toplam Başlık",   String(totalIssues)],
    ["Toplam Variant",  String(totalVariants)],
    ["Kategori Sayısı", String(categories.size)],
    ["Kapsam",          exportLabel],
  ]));

  all.push(...buildTOCPage());

  // Genel özet
  all.push(h1Colored("1. Genel Özet", C_COMBO, true));
  all.push(twoColTable([
    ["Toplam Başlık",   String(totalIssues)],
    ["Toplam Variant",  String(totalVariants)],
    ["Kapsam",          exportLabel],
  ]));

  // Kombinasyonlar
  all.push(h1Colored("2. Kombinasyon Listesi", C_COMBO));
  all.push(muted(`${totalIssues} başlık · ${totalVariants} variant`));

  groups.forEach((group, gi) => {
    all.push(spacer());
    all.push(profileLabel(`KOMBİNASYON #${String(gi + 1).padStart(3, "0")}`, C_COMBO));
    all.push(h2(group.issue));

    const desc = group.rows.find((r) => r.description?.trim())?.description;
    if (desc) all.push(fieldInline("Kategori", desc.trim()));

    // Variants
    group.rows.forEach((row, vi) => {
      if (vi > 0) all.push(divider());

      const variantLabel = group.rows.length > 1
        ? `Variant ${vi + 1}/${group.rows.length}`
        : "Kombinasyon";

      all.push(h3(variantLabel));

      if (row.source?.trim())      all.push(fieldInline("Kaynak",  row.source.trim()));
      if (row.stones_text?.trim()) { all.push(bodyText(row.stones_text.trim())); }
      if (row.notes_text?.trim())  { all.push(fieldInline("Not 1", row.notes_text.trim())); }
      if (row.notes_text_2?.trim()) { all.push(fieldInline("Not 2", row.notes_text_2.trim())); }
      if (row.notes_text_3?.trim()) { all.push(fieldInline("Not 3", row.notes_text_3.trim())); }
    });
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Taş Kombinasyonları Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    exportMode === "single" && combinationTitle ? slugify(combinationTitle) :
    exportMode === "selected" ? "secili" :
    exportMode === "filtered" ? "filtreli" : "tumu";
  const filename = `kombinasyon-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
