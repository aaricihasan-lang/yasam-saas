// Human Design Variables — tarayıcı istek yardımcısı. Hesap sunucuda (/api/hd/charts/variables); anahtar tarayıcıya gelmez.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { VariablesDto } from "./variablesContract";

export type VariablesFetchResult =
  | { ok: true; reused: boolean; chartId: string; data: VariablesDto }
  | { ok: false; error: string; code?: string; status?: number };

export type SavedVariablesFetchResult =
  | { ok: true; found: true; chartId: string; data: VariablesDto }
  | { ok: true; found: false; chartId: string }
  | { ok: false; error: string; code?: string; status?: number };

/** KAYITLI sonucu okur (/api/hd/charts/variables/saved) — sunucu bu uçta HESAPLAMAZ, ücretli çağrı yapamaz. */
export async function fetchSavedChartVariables(chartId: string, signal?: AbortSignal): Promise<SavedVariablesFetchResult> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch("/api/hd/charts/variables/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) },
      body: JSON.stringify({ chart_id: chartId }),
      cache: "no-store",
      signal,
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const id = (j.chart as { id?: unknown } | undefined)?.id;
    if (res.ok && j.ok === true && typeof id === "string") {
      if (j.found === true && j.data) return { ok: true, found: true, chartId: id, data: j.data as VariablesDto };
      if (j.found === false) return { ok: true, found: false, chartId: id };
    }
    return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`, code: typeof j.code === "string" ? j.code : undefined, status: res.status };
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) return { ok: false, error: "İstek iptal edildi.", code: "ABORTED" };
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}

export async function fetchChartVariables(chartId: string, signal?: AbortSignal): Promise<VariablesFetchResult> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch("/api/hd/charts/variables", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) },
      body: JSON.stringify({ chart_id: chartId }),
      cache: "no-store",
      signal,
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok === true && typeof (j.chart as { id?: unknown } | undefined)?.id === "string" && j.data) {
      return { ok: true, reused: j.reused === true, chartId: (j.chart as { id: string }).id, data: j.data as VariablesDto };
    }
    return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`, code: typeof j.code === "string" ? j.code : undefined, status: res.status };
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) return { ok: false, error: "İstek iptal edildi.", code: "ABORTED" };
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}
