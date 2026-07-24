import { numApi, numApiError } from "../../helpers/numApiClient";
import { analizTuruLabel } from "./bilgiBankaLabels";
import type { KnowledgeSection } from "./knowledgeSections";
import { buildListSummary } from "./noteLogic";
import { listAllRecordSources, listSources } from "./sourcesApi";

const KNOWLEDGE_API = "/api/numeroloji/knowledge";
const STONE_API = "/api/numeroloji/stones";

export type KnowledgeRecordRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  source: string | null;
  description: string | null;
  updated_at: string;
  // NKB-V2-B: yalnız ana-kulvar/yan-kulvar için yapılandırılmış bölümler.
  // Opsiyonel + nullable → eski kayıtlar (alan yok/NULL) geriye uyumlu kalır.
  // Ham API JSON'ı doğrulanmamış olabilir; doğrulama knowledgeSections.ts katmanında.
  content_sections?: KnowledgeSection[] | null;
};

export type StoneAssignmentRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  reason: string | null;
  stones: unknown;
  updated_at: string;
};

export type BilgiBankaListeSatir = {
  id: string;
  recordId: string;
  kayitTuru: "aciklama" | "dogaltas";
  analizTuruKey: string;
  analizTuru: string;
  deger: string;
  bilgiVeyaAciklama: string;
  guncellemeTarihi: string;
  aramaMetni: string;
  source?: string;
  description?: string;
  // NKB-V2-D1: yalnız ana-kulvar/yan-kulvar aciklama kayıtlarında dolu olabilir.
  content_sections?: KnowledgeSection[] | null;
  reason?: string;
  stones?: string[];
};

/** Virgül, nokta, noktalı virgül ve satır sonuna göre parçalar; Türkçe baş harf büyütür. */
export function normalizeStoneList(input: string): string[] {
  if (!input.trim()) return [];
  return input
    .split(/[,;.\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((stone) => {
      const first = stone.charAt(0).toLocaleUpperCase("tr-TR");
      return `${first}${stone.slice(1)}`;
    });
}

export function stonesToTextarea(stones: string[]): string {
  return stones.join("\n");
}

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

async function fetchKnowledgeRows(): Promise<{ rows: KnowledgeRecordRow[]; error: string | null }> {
  const res = await numApi(KNOWLEDGE_API);
  const err = numApiError(res);
  if (err) return { rows: [], error: err };
  return { rows: (Array.isArray(res.json.rows) ? res.json.rows : []) as KnowledgeRecordRow[], error: null };
}

async function fetchStoneRows(): Promise<{ rows: StoneAssignmentRow[]; error: string | null }> {
  const res = await numApi(STONE_API);
  const err = numApiError(res);
  if (err) return { rows: [], error: err };
  return { rows: (Array.isArray(res.json.rows) ? res.json.rows : []) as StoneAssignmentRow[], error: null };
}

export async function getKnowledgeRecord(
  analysisType: string,
  value: string,
): Promise<{ data: KnowledgeRecordRow | null; error: string | null }> {
  const { rows, error } = await fetchKnowledgeRows();
  if (error) return { data: null, error };
  const match = rows.find((r) => r.analysis_type === analysisType && r.value === value) ?? null;
  return { data: match, error: null };
}

export async function saveKnowledgeRecord(input: {
  analysisType: string;
  value: string;
  source: string;
  description?: string;
  content_sections?: KnowledgeSection[] | null;
}): Promise<{ error: string | null; conflict: boolean }> {
  const body: Record<string, unknown> = {
    analysis_type: input.analysisType,
    value: input.value.trim(),
    source: input.source.trim(),
  };
  // description yalnız verildiyse gönderilir (Kulvar create'te düzleştirilmiş kopya ÜRETİLMEZ).
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.content_sections !== undefined) body.content_sections = input.content_sections;
  // overwrite ASLA gönderilmez → create-only (mevcut kayıt sessizce ezilmez).
  const res = await numApi(KNOWLEDGE_API, { method: "POST", body: JSON.stringify(body) });
  const conflict = res.status === 409 || res.json.conflict === true;
  return { error: numApiError(res), conflict };
}

export async function getStoneAssignment(
  analysisType: string,
  value: string,
): Promise<{ data: { reason: string; stones: string[]; updated_at: string } | null; error: string | null }> {
  const { rows, error } = await fetchStoneRows();
  if (error) return { data: null, error };
  const row = rows.find((r) => r.analysis_type === analysisType && r.value === value);
  if (!row) return { data: null, error: null };
  return {
    data: {
      reason: row.reason ?? "",
      stones: parseStones(row.stones),
      updated_at: row.updated_at,
    },
    error: null,
  };
}

export async function saveStoneAssignment(input: {
  analysisType: string;
  value: string;
  reason: string;
  stones: string[];
}): Promise<{ error: string | null }> {
  const res = await numApi(STONE_API, {
    method: "POST",
    body: JSON.stringify({
      analysis_type: input.analysisType,
      value: input.value.trim(),
      reason: input.reason.trim(),
      stones: input.stones,
    }),
  });
  return { error: numApiError(res) };
}

export async function listBilgiBankaKayitlari(): Promise<{
  rows: BilgiBankaListeSatir[];
  error: string | null;
}> {
  // NKB-V2-H: knowledge + stones + (yapılandırılmış kaynak) tek seferde; N+1 YOK.
  // Kaynak sorguları başarısızsa liste yine yüklenir (yalnız display_label yok — başka tenant fallback YOK).
  const [knowledgeRes, stoneRes, linkRes, sourceRes] = await Promise.all([
    fetchKnowledgeRows(),
    fetchStoneRows(),
    listAllRecordSources(),
    listSources(),
  ]);
  if (knowledgeRes.error) return { rows: [], error: knowledgeRes.error };
  if (stoneRes.error) return { rows: [], error: stoneRes.error };

  // source_id → display_label ; ardından knowledge_record_id → display_label[]
  const labelBySourceId = new Map<string, string>();
  for (const s of sourceRes.rows) labelBySourceId.set(s.id, s.display_label);
  const labelsByRecordId = new Map<string, string[]>();
  for (const l of linkRes.rows) {
    const label = labelBySourceId.get(l.source_id);
    if (!label) continue;
    const arr = labelsByRecordId.get(l.knowledge_record_id) ?? [];
    if (!arr.includes(label)) arr.push(label);
    labelsByRecordId.set(l.knowledge_record_id, arr);
  }

  const aciklama = knowledgeRes.rows.map((row): BilgiBankaListeSatir => {
    const analiz = analizTuruLabel(row.analysis_type);
    const displayLabels = labelsByRecordId.get(row.id) ?? null;
    const bilgi = buildListSummary({
      displayLabels,
      content_sections: row.content_sections,
      source: row.source,
      description: row.description,
    });
    return {
      id: `aciklama:${row.id}`,
      recordId: row.id,
      kayitTuru: "aciklama",
      analizTuruKey: row.analysis_type,
      analizTuru: analiz,
      deger: row.value,
      bilgiVeyaAciklama: bilgi,
      guncellemeTarihi: row.updated_at,
      source: row.source ?? "",
      description: row.description ?? "",
      content_sections: Array.isArray(row.content_sections) ? row.content_sections : null,
      aramaMetni: [analiz, row.value, (displayLabels ?? []).join(" "), bilgi]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR"),
    };
  });

  const dogaltas = stoneRes.rows.map((row): BilgiBankaListeSatir => {
    const analiz = analizTuruLabel(row.analysis_type);
    const taslar = parseStones(row.stones);
    const tasMetin = taslar.join(", ");
    const bilgi = [row.reason, tasMetin ? `Taşlar: ${tasMetin}` : ""].filter(Boolean).join(" — ");
    return {
      id: `dogaltas:${row.id}`,
      recordId: row.id,
      kayitTuru: "dogaltas",
      analizTuruKey: row.analysis_type,
      analizTuru: analiz,
      deger: row.value,
      bilgiVeyaAciklama: bilgi || "—",
      guncellemeTarihi: row.updated_at,
      reason: row.reason ?? "",
      stones: taslar,
      aramaMetni: [analiz, row.value, row.reason, tasMetin]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR"),
    };
  });

  const rows = [...aciklama, ...dogaltas].sort((a, b) =>
    b.guncellemeTarihi.localeCompare(a.guncellemeTarihi),
  );

  return { rows, error: null };
}

export async function updateKnowledgeRecordById(
  recordId: string,
  input: {
    analysisType: string;
    value: string;
    source: string;
    description?: string;
    content_sections?: KnowledgeSection[] | null;
  },
): Promise<{ error: string | null }> {
  const body: Record<string, unknown> = {
    id: recordId,
    analysis_type: input.analysisType,
    value: input.value.trim(),
    source: input.source.trim(),
  };
  // Kulvar düzenlemede description GÖNDERİLMEZ → eski description olduğu gibi korunur.
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.content_sections !== undefined) body.content_sections = input.content_sections;
  const res = await numApi(KNOWLEDGE_API, { method: "PATCH", body: JSON.stringify(body) });
  return { error: numApiError(res) };
}

export async function updateStoneAssignmentById(
  recordId: string,
  input: {
    analysisType: string;
    value: string;
    reason: string;
    stones: string[];
  },
): Promise<{ error: string | null }> {
  const res = await numApi(STONE_API, {
    method: "PATCH",
    body: JSON.stringify({
      id: recordId,
      analysis_type: input.analysisType,
      value: input.value.trim(),
      reason: input.reason.trim(),
      stones: input.stones,
    }),
  });
  return { error: numApiError(res) };
}

export async function deleteBilgiBankaKayit(
  kayitTuru: "aciklama" | "dogaltas",
  recordId: string,
): Promise<{ error: string | null }> {
  const api = kayitTuru === "aciklama" ? KNOWLEDGE_API : STONE_API;
  const res = await numApi(api, { method: "DELETE", body: JSON.stringify({ id: recordId }) });
  return { error: numApiError(res) };
}

export async function deleteBilgiBankaKayitlari(
  knowledgeIds: string[],
  stoneIds: string[],
): Promise<{ error: string | null }> {
  if (knowledgeIds.length > 0) {
    const res = await numApi(KNOWLEDGE_API, { method: "DELETE", body: JSON.stringify({ ids: knowledgeIds }) });
    const err = numApiError(res);
    if (err) return { error: err };
  }
  if (stoneIds.length > 0) {
    const res = await numApi(STONE_API, { method: "DELETE", body: JSON.stringify({ ids: stoneIds }) });
    const err = numApiError(res);
    if (err) return { error: err };
  }
  return { error: null };
}
