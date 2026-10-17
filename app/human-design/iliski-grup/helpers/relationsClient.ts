import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { RelationAnalysisView, RelationCandidate, RelationListRow, RelationType } from "@/lib/human-design/relations/relationService";

// İlişki ve Grup Analizleri — tarayıcı yardımcıları. Tüm okuma/yazma sunucu route'larından
// (/api/hd/relations*); Roxy anahtarı ya da ham sağlayıcı yanıtı tarayıcıya hiç gelmez.

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "Content-Type": "application/json", "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

type Fail = { ok: false; error: string; code?: string; status?: number; participant?: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
const errOf = (j: Record<string, unknown>, res: Response): Fail => ({
  ok: false,
  error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  code: typeof j.code === "string" ? j.code : undefined,
  status: res.status,
  participant: typeof j.participant === "string" ? j.participant : undefined,
});

export async function fetchRelationCandidates(): Promise<{ ok: true; rows: RelationCandidate[] } | Fail> {
  try {
    const res = await fetch("/api/hd/relations/candidates", { headers: authHeaders(), cache: "no-store" });
    const j = await readJson(res);
    return res.ok && j.ok === true ? { ok: true, rows: j.rows as RelationCandidate[] } : errOf(j, res);
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}

export async function fetchRelationList(): Promise<{ ok: true; rows: RelationListRow[] } | Fail> {
  try {
    const res = await fetch("/api/hd/relations", { headers: authHeaders(), cache: "no-store" });
    const j = await readJson(res);
    return res.ok && j.ok === true ? { ok: true, rows: j.rows as RelationListRow[] } : errOf(j, res);
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}

export async function fetchRelationAnalysis(id: string): Promise<{ ok: true; analysis: RelationAnalysisView } | Fail> {
  try {
    const res = await fetch(`/api/hd/relations/${encodeURIComponent(id)}`, { headers: authHeaders(), cache: "no-store" });
    const j = await readJson(res);
    return res.ok && j.ok === true ? { ok: true, analysis: j.analysis as RelationAnalysisView } : errOf(j, res);
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}

export async function createRelation(
  participants: Array<{ client_id: string; chart_id: string }>,
  relationType: RelationType | null,
): Promise<{ ok: true; id: string; reused: boolean } | Fail> {
  try {
    const res = await fetch("/api/hd/relations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ participants, relation_type: relationType }),
    });
    const j = await readJson(res);
    return res.ok && j.ok === true ? { ok: true, id: String(j.id), reused: j.reused === true } : errOf(j, res);
  } catch {
    // Ağ zaman aşımı: sunucu tarafı idempotent — aynı seçimle yeniden denemek ikinci ücretli çağrı üretmez.
    return { ok: false, error: "Ağ hatası. Aynı seçimle tekrar denemek güvenlidir; kayıtlı sonuç yeniden hesaplanmaz." };
  }
}

export async function deleteRelation(id: string): Promise<{ ok: true } | Fail> {
  try {
    const res = await fetch(`/api/hd/relations/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    const j = await readJson(res);
    return res.ok && j.ok === true ? { ok: true } : errOf(j, res);
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}

export async function downloadRelationReport(id: string): Promise<{ ok: true } | Fail> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/relations/${encodeURIComponent(id)}/report`, { method: "POST", headers: authHeaders() });
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
  if (!res.ok) return errOf(await readJson(res), res);
  const blob = await res.blob();
  const m = /filename="?([^"]+)"?/i.exec(res.headers.get("Content-Disposition") ?? "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = m?.[1] ?? "Human-Design-Iliski-Grup.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}
