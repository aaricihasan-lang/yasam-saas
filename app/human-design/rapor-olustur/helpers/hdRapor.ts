import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HumanDesignChart, HumanDesignKnowledgeRecord } from "@/lib/human-design/types";

// Sprint-3/4: human_design_charts + knowledge_records + reports okuma/yazma tamamen
// server route'ları (/api/hd/charts, /api/hd/knowledge, /api/hd/reports — service_role)
// üzerinden. Tarayıcıdaki anon Supabase erişimi KALDIRILDI. Rapor içerik üretimi
// (buildCodesFromChart / buildReportText) saf fonksiyon; dokunulmadı.
function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

// -------------------------------------------------------
// Chart yükle (client_id'ye göre) — manuel harita server route'undan okunur
// -------------------------------------------------------

export async function loadChartForReport(clientId: string): Promise<{
  row: HumanDesignChart | null;
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch(
      `/api/hd/charts?scope=manual&client_id=${encodeURIComponent(clientId)}`,
      { method: "GET", headers: authHeaders() },
    );
  } catch {
    return { row: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) {
    return { row: (j.row as HumanDesignChart | null) ?? null, error: null };
  }
  return { row: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
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

  for (const center of (chart.active_centers ?? [])) {
    codes.push(`merkez_tanimli_${center}`);
  }
  for (const center of (chart.open_centers ?? [])) {
    codes.push(`merkez_acik_${center}`);
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

  // Sprint-4 Aşama-1: knowledge_records okuması /api/hd/knowledge server route'undan.
  let res: Response;
  try {
    res = await fetch(
      `/api/hd/knowledge?codes=${encodeURIComponent(codes.join(","))}`,
      { method: "GET", headers: authHeaders() },
    );
  } catch {
    return { groups: [], matchedCodes: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || j.ok !== true || !Array.isArray(j.rows)) {
    return {
      groups: [],
      matchedCodes: [],
      error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
    };
  }

  const records = j.rows as HumanDesignKnowledgeRecord[];
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
  let res: Response;
  try {
    res = await fetch("/api/hd/reports", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
  } catch {
    return { id: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.id === "string") {
    return { id: j.id, error: null };
  }
  return { id: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function getClientReportCount(
  clientId: string,
): Promise<{ count: number; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(
      `/api/hd/reports?countForClient=${encodeURIComponent(clientId)}`,
      { method: "GET", headers: authHeaders() },
    );
  } catch {
    return { count: 0, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.count === "number") {
    return { count: j.count, error: null };
  }
  return { count: 0, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

type UpdateReportInput = {
  id: string;
  title: string;
  editedContent: string;
};

export async function updateReport(
  input: UpdateReportInput,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/reports", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
  } catch {
    return { error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) return { error: null };
  return { error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}
