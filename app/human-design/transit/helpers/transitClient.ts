import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { GeneralTransit } from "@/lib/human-design/transit/generalTransit";
import type { TransitMoment } from "@/lib/human-design/transit/transitMoment";
import type { PersonalTransitView } from "@/lib/human-design/transit/personalTransit";

// Human Design transit — tarayıcı yardımcıları. Hesap sunucuda (/api/hd/transit*); Roxy anahtarı tarayıcıya gelmez.

export function transitAuthHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "Content-Type": "application/json", "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

/** offsets: yalnız LOCAL_TIME_AMBIGUOUS — iki kez yaşanan yerel saatin seçilebilir UTC ofsetleri (saniye). */
export type Fail = { ok: false; error: string; code?: string; status?: number; offsets?: number[] };

/** Seçilen saat dilimi (IANA) + yalnız iki kez yaşanan saatte kullanıcının seçtiği UTC ofseti. */
export type TransitZoneQuery = { tz: string; offset?: number | null };

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
export const errOf = (j: Record<string, unknown>, res: Response): Fail => ({
  ok: false,
  error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  code: typeof j.code === "string" ? j.code : undefined,
  status: res.status,
  ...(Array.isArray(j.offsets) && j.offsets.every((o) => Number.isInteger(o)) ? { offsets: j.offsets as number[] } : {}),
});

export type TransitResolutionTag = "local-certain" | "roxy-resolved" | "roxy-partial" | "unresolved";
export type GeneralTransitResult = { moment: TransitMoment; transit: GeneralTransit; resolution: TransitResolutionTag; complete: boolean };

/** İptal edilen (yerini yeni sorguya bırakan) istek — ekranda hata olarak GÖSTERİLMEZ. */
const aborted = (): Fail => ({ ok: false, error: "İstek iptal edildi.", code: "ABORTED" });
const isAbort = (e: unknown, signal?: AbortSignal) => signal?.aborted === true || (e instanceof Error && e.name === "AbortError");

export async function fetchGeneralTransit(date?: string, time?: string, signal?: AbortSignal, zone?: TransitZoneQuery): Promise<({ ok: true } & GeneralTransitResult) | Fail> {
  const p = new URLSearchParams();
  if (date && time) {
    p.set("date", date);
    p.set("time", time);
  }
  if (zone?.tz) p.set("tz", zone.tz);
  if (zone?.offset !== undefined && zone.offset !== null) p.set("offset", String(zone.offset));
  const qs = p.toString(); // URLSearchParams.size eski Android WebView'larda yok
  const q = qs ? `?${qs}` : "";
  try {
    const res = await fetch(`/api/hd/transit${q}`, { headers: transitAuthHeaders(), cache: "no-store", signal });
    const j = await readJson(res);
    return res.ok && j.ok === true
      ? { ok: true, moment: j.moment as TransitMoment, transit: j.transit as GeneralTransit, resolution: j.resolution as TransitResolutionTag, complete: j.complete === true }
      : errOf(j, res);
  } catch (e) {
    return isAbort(e, signal) ? aborted() : { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}

export type PersonalTransitResult = {
  reused: boolean;
  moment: TransitMoment;
  client: { id: string; name: string };
  chart: { id: string; createdAt: string | null };
  view: PersonalTransitView;
};

export async function fetchPersonalTransit(
  input: { clientId: string; chartId: string; date: string; time: string; tz?: string; offset?: number | null },
  signal?: AbortSignal,
): Promise<({ ok: true } & PersonalTransitResult) | Fail> {
  try {
    const res = await fetch("/api/hd/transit/personal", {
      method: "POST",
      signal,
      headers: transitAuthHeaders(),
      body: JSON.stringify({
        client_id: input.clientId,
        chart_id: input.chartId,
        date: input.date,
        time: input.time,
        ...(input.tz ? { tz: input.tz } : {}),
        ...(input.offset !== undefined && input.offset !== null ? { offset: input.offset } : {}),
      }),
    });
    const j = await readJson(res);
    return res.ok && j.ok === true
      ? { ok: true, reused: j.reused === true, moment: j.moment as TransitMoment, client: j.client as PersonalTransitResult["client"], chart: j.chart as PersonalTransitResult["chart"], view: j.view as PersonalTransitView }
      : errOf(j, res);
  } catch (e) {
    return isAbort(e, signal) ? aborted() : { ok: false, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
}
