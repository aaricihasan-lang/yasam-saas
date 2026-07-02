// FAZ 9C — Hesaplanmış HD haritasını kaydetme (istemci fetch yardımcısı).
//
// POST /api/hd/charts'a auth header'larıyla (x-user-id + x-session-token) istek atar.
// Yalnız INPUT gönderilir — sunucu recompute-on-save yapar; computed_result GÖNDERİLMEZ
// (gönderilse de 9B tarafında yok sayılır). computeClient.ts'in auth desenini yansıtır
// (o dosya DEĞİŞMEZ). Engine/compute/BodyGraph'a dokunmaz.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export type SaveChartInput = { date: string; time: string; timezone: string };

export type SaveChartResult =
  | { ok: true; id: string }
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

/** Hesaplanmış haritayı sunucuya kaydeder (kişisel; client_id/location_id gönderilmez). */
export async function saveComputedChart(
  input: SaveChartInput,
  opts: { birthPlace?: string } = {},
): Promise<SaveChartResult> {
  const body: Record<string, unknown> = { input };
  const place = opts.birthPlace?.trim();
  if (place) body.birth_place = place;

  let res: Response;
  try {
    res = await fetch("/api/hd/charts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: "Ağ hatası. Bağlantını kontrol et." };
  }

  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.ok && j.ok === true && typeof j.id === "string") {
    return { ok: true, id: j.id };
  }
  return {
    ok: false,
    status: res.status,
    code: typeof j.code === "string" ? j.code : undefined,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  };
}
