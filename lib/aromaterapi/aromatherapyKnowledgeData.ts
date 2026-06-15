import { supabase } from "@/lib/supabase";

// -------------------------------------------------------
// Referans sheet tipleri (raw Excel import)
// -------------------------------------------------------

export type ReferenceRow = {
  id: string;
  sheet_id: string;
  row_index: number;
  cells: Record<string, string>;
  is_header: boolean;
};

export type ReferenceSheet = {
  id: string;
  sheet_name: string;
  display_title: string;
  headers: string[];
  sort_order: number;
  rows: ReferenceRow[];
};

export async function fetchReferenceSheets(tenantId: string): Promise<{
  sheets: ReferenceSheet[];
  error: string | null;
}> {
  const { data: sheetsRaw, error: sheetsErr } = await supabase
    .from("aromatherapy_reference_sheets")
    .select("id, sheet_name, display_title, headers, sort_order")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true)
    .order("sort_order");

  if (sheetsErr) return { sheets: [], error: sheetsErr.message };
  if (!sheetsRaw || sheetsRaw.length === 0) return { sheets: [], error: null };

  const sheetIds = sheetsRaw.map((s) => s.id as string);

  const { data: rowsRaw, error: rowsErr } = await supabase
    .from("aromatherapy_reference_rows")
    .select("id, sheet_id, row_index, cells, is_header")
    .in("sheet_id", sheetIds)
    .order("row_index");

  if (rowsErr) return { sheets: [], error: rowsErr.message };

  const rowsBySheet = new Map<string, ReferenceRow[]>();
  for (const row of rowsRaw ?? []) {
    const sid = row.sheet_id as string;
    if (!rowsBySheet.has(sid)) rowsBySheet.set(sid, []);
    rowsBySheet.get(sid)!.push(row as unknown as ReferenceRow);
  }

  const sheets: ReferenceSheet[] = sheetsRaw.map((s) => ({
    id:            s.id as string,
    sheet_name:    s.sheet_name as string,
    display_title: s.display_title as string,
    headers:       s.headers as string[],
    sort_order:    s.sort_order as number,
    rows:          rowsBySheet.get(s.id as string) ?? [],
  }));

  return { sheets, error: null };
}

// -------------------------------------------------------
// Tipler
// -------------------------------------------------------

export type KnowledgeArticle = {
  id: string;
  tenant_id: string | null;
  category: string;
  sort_order: number;
  title: string;
  summary: string;
  content: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

// -------------------------------------------------------
// Kategori tanımları (hardcode — 9 makale için tablo overkill)
// -------------------------------------------------------

export const KNOWLEDGE_CATEGORIES: {
  slug: string;
  label: string;
  icon: string;
  cardCls: string;
  badgeCls: string;
}[] = [
  {
    slug: "all",
    label: "Tümü",
    icon: "📚",
    cardCls: "border-slate-200/70 from-slate-50 to-white",
    badgeCls: "border-slate-200 bg-slate-50 text-slate-700",
  },
  {
    slug: "kimyasal-bilesimler",
    label: "Kimyasal Bileşenler",
    icon: "🧬",
    cardCls: "border-violet-200/70 from-violet-50/80 to-white",
    badgeCls: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    slug: "elde-etme",
    label: "Elde Etme",
    icon: "⚗️",
    cardCls: "border-amber-200/70 from-amber-50/80 to-white",
    badgeCls: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    slug: "klinik-uygulama",
    label: "Klinik Uygulama",
    icon: "💚",
    cardCls: "border-rose-200/70 from-rose-50/80 to-white",
    badgeCls: "border-rose-200 bg-rose-50 text-rose-800",
  },
  {
    slug: "etki-mekanizmasi",
    label: "Etki Mekanizması",
    icon: "🧠",
    cardCls: "border-cyan-200/70 from-cyan-50/80 to-white",
    badgeCls: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  {
    slug: "genel",
    label: "Genel",
    icon: "📖",
    cardCls: "border-emerald-200/70 from-emerald-50/80 to-white",
    badgeCls: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
];

export function getCategoryMeta(slug: string) {
  return (
    KNOWLEDGE_CATEGORIES.find((c) => c.slug === slug) ??
    KNOWLEDGE_CATEGORIES[0]!
  );
}

// -------------------------------------------------------
// Sorgular
// -------------------------------------------------------

export async function fetchKnowledgeArticles(tenantId: string): Promise<{
  articles: KnowledgeArticle[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("aromatherapy_knowledge_articles")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) return { articles: [], error: error.message };
  return { articles: (data ?? []) as KnowledgeArticle[], error: null };
}

// -------------------------------------------------------
// İçerik render yardımcısı
// -------------------------------------------------------

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string };

/**
 * Makale içeriğini render bloklarına çevirir.
 * Satır uzunluğu ≤ 60 ve arkasında içerik geliyorsa heading sayılır.
 */
export function parseArticleContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const paragraphs = content.split(/\n\n+/);

  for (const para of paragraphs) {
    const lines = para.split("\n");
    if (lines.length > 1 && lines[0]!.trim().length <= 60) {
      blocks.push({ type: "heading", text: lines[0]!.trim() });
      const rest = lines.slice(1).join(" ").trim();
      if (rest) blocks.push({ type: "paragraph", text: rest });
    } else {
      const joined = lines.join(" ").trim();
      if (joined) blocks.push({ type: "paragraph", text: joined });
    }
  }

  return blocks;
}
