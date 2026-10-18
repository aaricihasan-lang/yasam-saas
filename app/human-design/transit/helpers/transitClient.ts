import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { GeneralTransit } from "@/lib/human-design/transit/generalTransit";
import type { TransitMoment } from "@/lib/human-design/transit/transitMoment";

// Human Design transit — tarayıcı yardımcıları. Hesap sunucuda (/api/hd/transit*); Roxy anahtarı tarayıcıya gelmez.

export function transitAuthHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "Content-Type": "application/json", "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

export type Fail = { ok: false; error: string; code?: string; status?: number };

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
export const errOf = (j: Record<string, unknown>, res: Response): Fail => ({
  ok: false,
  error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  code: typeof j.code === "string" ? j.code : undefined,
  status: res.status,
});

export async function fetchGeneralTransit(date?: string, time?: string): Promise<{ ok: true; moment: TransitMoment; transit: GeneralTransit } | Fail> {
  const q = date && time ? `?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}` : "";
  try {
    const res = await fetch(`/api/hd/transit${q}`, { headers: transitAuthHeaders(), cache: "no-store" });
    const j = await readJson(res);
    return res.ok && j.ok === true ? { ok: true, moment: j.moment as TransitMoment, transit: j.transit as GeneralTransit } : errOf(j, res);
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}
