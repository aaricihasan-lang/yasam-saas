import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import type { HumanDesignChart, HumanDesignKnowledgeRecord } from "@/lib/human-design/types";

// -------------------------------------------------------
// Chart yükle (client_id'ye göre — aynı upsert mantığı)
// -------------------------------------------------------

export async function loadChartForReport(clientId: string): Promise<{
  row: HumanDesignChart | null;
  error: string | null;
}> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { row: null, error: "Aktif kullanıcı bulunamadı." };

  const { data, error } = await supabase
    .from("human_design_charts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: data as HumanDesignChart | null, error: null };
}

// -------------------------------------------------------
// Chart değerlerinden Bilgi Bankası kodu listesi üret
// -------------------------------------------------------

export function buildCodesFromChart(chart: HumanDesignChart): string[] {
  const codes: string[] = [];

  if (chart.type_code) codes.push(`tip_${chart.type_code}`);
  if (chart.authority_code) codes.push(`otorite_${chart.authority_code}`);
  if (chart.profile_code) codes.push(`profil_${chart.profile_code}`);
  if (chart.definition_code) codes.push(`tanim_${chart.definition_code}`);

  for (const center of [...(chart.active_centers ?? []), ...(chart.open_centers ?? [])]) {
    codes.push(`merkez_${center}`);
  }

  // "34-57" → "kanal_34_57"
  for (const channel of (chart.channels ?? [])) {
    codes.push(`kanal_${channel.replace(/-/g, "_")}`);
  }

  // 34 → "kapi_34"
  for (const gate of (chart.gates ?? [])) {
    codes.push(`kapi_${gate}`);
  }

  return [...new Set(codes)];
}

// -------------------------------------------------------
// Kod listesiyle Bilgi Bankası kayıtlarını çek
// -------------------------------------------------------

const CATEGORY_ORDER = [
  "Tipler",
  "Otoriteler",
  "Profiller",
  "Tanımlar",
  "Merkezler",
  "Kanallar",
  "Kapılar",
  "Stratejiler",
  "Genel Notlar",
];

export type KnowledgeGroup = {
  category: string;
  records: HumanDesignKnowledgeRecord[];
};

export async function loadKnowledgeForCodes(codes: string[]): Promise<{
  groups: KnowledgeGroup[];
  matchedCodes: string[];
  error: string | null;
}> {
  if (codes.length === 0) return { groups: [], matchedCodes: [], error: null };

  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { groups: [], matchedCodes: [], error: "Aktif kullanıcı bulunamadı." };

  const { data, error } = await supabase
    .from("human_design_knowledge_records")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("code", codes)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { groups: [], matchedCodes: [], error: error.message };

  const records = (data ?? []) as HumanDesignKnowledgeRecord[];
  const matchedCodes = records.map((r) => r.code);

  // Kategoriye göre grupla, belirlenen sıraya göre
  const map = new Map<string, HumanDesignKnowledgeRecord[]>();
  for (const rec of records) {
    const list = map.get(rec.category) ?? [];
    list.push(rec);
    map.set(rec.category, list);
  }

  const groups: KnowledgeGroup[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) groups.push({ category: cat, records: map.get(cat)! });
  }
  // Sıra dışı kategoriler sona ekle
  for (const [cat, recs] of map) {
    if (!CATEGORY_ORDER.includes(cat)) groups.push({ category: cat, records: recs });
  }

  return { groups, matchedCodes, error: null };
}

// -------------------------------------------------------
// Gruplardan rapor metni oluştur
// -------------------------------------------------------

export function buildReportText(groups: KnowledgeGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .flatMap(({ category, records }) =>
      records.map((r) => `### ${category} — ${r.title}\n\n${r.content}`),
    )
    .join("\n\n---\n\n");
}

// -------------------------------------------------------
// Rapor kaydet (human_design_reports)
// -------------------------------------------------------

type SaveReportInput = {
  clientId: string;
  chartId: string | null;
  title: string;
  selectedCodes: string[];
  generatedContent: string;
  editedContent: string;
};

export async function saveReport(
  input: SaveReportInput,
): Promise<{ id: string | null; error: string | null }> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { id: null, error: "Aktif kullanıcı bulunamadı." };

  const { data, error } = await supabase
    .from("human_design_reports")
    .insert({
      tenant_id: tenantId,
      client_id: input.clientId,
      chart_id: input.chartId,
      title: input.title,
      selected_codes: input.selectedCodes,
      generated_content: input.generatedContent,
      edited_content: input.editedContent,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: string }).id, error: null };
}
