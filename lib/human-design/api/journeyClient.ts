// AŞAMA 3C — HD ↔ merkezî Danışan Yolculuğu istemci yardımcıları (tarayıcı fetch).
// Auth deseni chartsClient.ts ile aynı (x-user-id + x-session-token). Tenant gönderilmez — sunucu
// oturumdan türetir. Roxy ile ilgisi yoktur.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export type JourneyClientOption = { id: string; ad: string; soyad: string; dogum: string | null; hd_client_id: string | null };
export type JourneyClientInfo = { id: string; ad: string; soyad: string; dogum: string | null };
export type JourneyHdAnalysisRow = {
  id: string;
  created_at: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  type_code: string | null;
  profile_code: string | null;
  authority_code: string | null;
  kind: "roxy" | "engine" | "manual";
};

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "Content-Type": "application/json", "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

type ActionResult = { ok: true; hdClientId: string | null; journeyClientId: string | null; birthDate?: string | null } | { ok: false; status: number; code?: string; error: string; hdClientId?: string | null };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function searchJourneyClients(search: string): Promise<{ rows: JourneyClientOption[]; error: string | null }> {
  try {
    const res = await fetch(`/api/hd/journey-clients?search=${encodeURIComponent(search)}`, { headers: authHeaders(), cache: "no-store" });
    const j = await readJson(res);
    if (res.ok && j.ok === true && Array.isArray(j.rows)) return { rows: j.rows as JourneyClientOption[], error: null };
    return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
}

export async function journeyAction(action: string, body: Record<string, unknown>): Promise<ActionResult> {
  try {
    const res = await fetch("/api/hd/clients/journey", { method: "POST", headers: authHeaders(), body: JSON.stringify({ ...body, action }) });
    const j = await readJson(res);
    if (res.ok && j.ok === true) {
      return {
        ok: true,
        hdClientId: typeof j.hd_client_id === "string" ? j.hd_client_id : null,
        journeyClientId: typeof j.journey_client_id === "string" ? j.journey_client_id : null,
        birthDate: typeof j.birth_date === "string" ? j.birth_date : null,
      };
    }
    return {
      ok: false,
      status: res.status,
      code: typeof j.code === "string" ? j.code : undefined,
      error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
      hdClientId: typeof j.hd_client_id === "string" ? j.hd_client_id : null,
    };
  } catch {
    return { ok: false, status: 0, error: "Ağ hatası. Bağlantını kontrol et." };
  }
}

export async function getJourneyHdSummary(
  journeyClientId: string,
): Promise<{ profile: { id: string; name: string } | null; analyses: JourneyHdAnalysisRow[]; error: string | null }> {
  try {
    const res = await fetch(`/api/hd/clients/journey?journey_client_id=${encodeURIComponent(journeyClientId)}`, { headers: authHeaders(), cache: "no-store" });
    const j = await readJson(res);
    if (res.ok && j.ok === true) {
      return {
        profile: (j.profile as { id: string; name: string } | null) ?? null,
        analyses: Array.isArray(j.analyses) ? (j.analyses as JourneyHdAnalysisRow[]) : [],
        error: null,
      };
    }
    return { profile: null, analyses: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
  } catch {
    return { profile: null, analyses: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
}

/** "YYYY-MM-DD" → "GG.AA.YYYY" (saat dilimi dönüşümü YOK; metin olarak). */
export function formatIsoDateTr(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}
