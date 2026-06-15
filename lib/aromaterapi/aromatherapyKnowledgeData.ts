import { supabase } from "@/lib/supabase";

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
