// FAZ 5 / ADIM 3a — Human Design API. İstemci fetch yardımcısı.
//
// POST /api/hd/compute'a auth header'larıyla (x-user-id + x-session-token) istek
// atar. Engine ASLA client'ta çalışmaz — yalnız API çağrılır; HdChartResult
// TYPE-ONLY import edilir (astronomy-engine bundle'a girmez).

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HdChartResult } from "../engine/contract";

export type ComputeInput = { date: string; time: string; timezone: string };

export type ComputeClientResult =
  | { ok: true; data: HdChartResult }
  | { ok: false; status: number; code?: string; error: string };

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

/** Doğrulanmış HD chart'ı sunucudan hesaplar. */
export async function computeHdChart(
  input: ComputeInput,
): Promise<ComputeClientResult> {
  let res: Response;
  try {
    res = await fetch("/api/hd/compute", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, status: 0, error: "Ağ hatası. Bağlantını kontrol et." };
  }

  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.ok && j.ok === true) {
    return { ok: true, data: j.data as HdChartResult };
  }
  return {
    ok: false,
    status: res.status,
    code: typeof j.code === "string" ? j.code : undefined,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  };
}
