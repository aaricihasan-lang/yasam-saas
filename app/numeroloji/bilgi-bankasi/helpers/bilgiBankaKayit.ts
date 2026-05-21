import { supabase } from "@/lib/supabase";
import { resolveNumerolojiTenantId } from "../../helpers/numerolojiKayit";
import { analizTuruLabel } from "./bilgiBankaLabels";

const KNOWLEDGE_TABLE = "numerology_knowledge_records";
const STONE_TABLE = "numerology_stone_assignments";

export type KnowledgeRecordRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  source: string | null;
  description: string | null;
  updated_at: string;
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

export async function getKnowledgeRecord(
  analysisType: string,
  value: string,
): Promise<{ data: KnowledgeRecordRow | null; error: string | null }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) {
    return { data: null, error: "Aktif kullanıcı tenant_id bulunamadı." };
  }
  const { data, error } = await supabase
    .from(KNOWLEDGE_TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("analysis_type", analysisType)
    .eq("value", value)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as KnowledgeRecordRow | null, error: null };
}

export async function saveKnowledgeRecord(input: {
  analysisType: string;
  value: string;
  source: string;
  description: string;
}): Promise<{ error: string | null }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };
  const value = input.value.trim();
  const payload = {
    tenant_id: tenantId,
    analysis_type: input.analysisType,
    value,
    source: input.source.trim(),
    description: input.description.trim(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: findError } = await supabase
    .from(KNOWLEDGE_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("analysis_type", input.analysisType)
    .eq("value", value)
    .maybeSingle();

  if (findError) return { error: findError.message };

  if (existing?.id) {
    const { error } = await supabase.from(KNOWLEDGE_TABLE).update(payload).eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from(KNOWLEDGE_TABLE).insert(payload);
  return { error: error?.message ?? null };
}

export async function getStoneAssignment(
  analysisType: string,
  value: string,
): Promise<{ data: { reason: string; stones: string[]; updated_at: string } | null; error: string | null }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) {
    return { data: null, error: "Aktif kullanıcı tenant_id bulunamadı." };
  }
  const { data, error } = await supabase
    .from(STONE_TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("analysis_type", analysisType)
    .eq("value", value)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const row = data as StoneAssignmentRow;
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
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };
  const value = input.value.trim();
  const payload = {
    tenant_id: tenantId,
    analysis_type: input.analysisType,
    value,
    reason: input.reason.trim(),
    stones: input.stones,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: findError } = await supabase
    .from(STONE_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("analysis_type", input.analysisType)
    .eq("value", value)
    .maybeSingle();

  if (findError) return { error: findError.message };

  if (existing?.id) {
    const { error } = await supabase.from(STONE_TABLE).update(payload).eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from(STONE_TABLE).insert(payload);
  return { error: error?.message ?? null };
}

export async function listBilgiBankaKayitlari(): Promise<{
  rows: BilgiBankaListeSatir[];
  error: string | null;
}> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) {
    return { rows: [], error: "Aktif kullanıcı tenant_id bulunamadı." };
  }

  const [knowledgeRes, stoneRes] = await Promise.all([
    supabase
      .from(KNOWLEDGE_TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false }),
    supabase
      .from(STONE_TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false }),
  ]);

  if (knowledgeRes.error) return { rows: [], error: knowledgeRes.error.message };
  if (stoneRes.error) return { rows: [], error: stoneRes.error.message };

  const aciklama = (knowledgeRes.data ?? []).map((raw): BilgiBankaListeSatir => {
    const row = raw as KnowledgeRecordRow;
    const analiz = analizTuruLabel(row.analysis_type);
    const bilgi = [row.source, row.description].filter(Boolean).join(" — ");
    return {
      id: `aciklama:${row.id}`,
      recordId: row.id,
      kayitTuru: "aciklama",
      analizTuruKey: row.analysis_type,
      analizTuru: analiz,
      deger: row.value,
      bilgiVeyaAciklama: bilgi || "—",
      guncellemeTarihi: row.updated_at,
      source: row.source ?? "",
      description: row.description ?? "",
      aramaMetni: [analiz, row.value, row.source, row.description]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR"),
    };
  });

  const dogaltas = (stoneRes.data ?? []).map((raw): BilgiBankaListeSatir => {
    const row = raw as StoneAssignmentRow;
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
    description: string;
  },
): Promise<{ error: string | null }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };
  const { error } = await supabase
    .from(KNOWLEDGE_TABLE)
    .update({
      analysis_type: input.analysisType,
      value: input.value.trim(),
      source: input.source.trim(),
      description: input.description.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
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
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };
  const { error } = await supabase
    .from(STONE_TABLE)
    .update({
      analysis_type: input.analysisType,
      value: input.value.trim(),
      reason: input.reason.trim(),
      stones: input.stones,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

export async function deleteBilgiBankaKayit(
  kayitTuru: "aciklama" | "dogaltas",
  recordId: string,
): Promise<{ error: string | null }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };
  const table = kayitTuru === "aciklama" ? KNOWLEDGE_TABLE : STONE_TABLE;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", recordId)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

export async function deleteBilgiBankaKayitlari(
  knowledgeIds: string[],
  stoneIds: string[],
): Promise<{ error: string | null }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };

  if (knowledgeIds.length > 0) {
    const { error } = await supabase
      .from(KNOWLEDGE_TABLE)
      .delete()
      .in("id", knowledgeIds)
      .eq("tenant_id", tenantId);
    if (error) return { error: error.message };
  }

  if (stoneIds.length > 0) {
    const { error } = await supabase
      .from(STONE_TABLE)
      .delete()
      .in("id", stoneIds)
      .eq("tenant_id", tenantId);
    if (error) return { error: error.message };
  }

  return { error: null };
}
