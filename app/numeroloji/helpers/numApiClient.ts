/**
 * Numeroloji güvenli API — istemci yardımcıları.
 * Doğrudan Supabase (anon) tablo erişimi YERİNE session-guard'lı server API'ye gider.
 * Tenant SUNUCUDA session'dan alınır; istemciden gönderilmez (çapraz-tenant engellenir).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Session kimlik başlıkları (x-user-id + x-session-token). İkili (docx) indiren
 * rapor uçları JSON dönmediği için numApi() yerine ham fetch kullanır ve bu
 * başlıkları doğrudan gönderir. Kimlik/tenant SUNUCUDA çözülür; body'ye kimlik konmaz.
 */
export function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type NumApiResult = { ok: boolean; status: number; json: Record<string, unknown> };

export async function numApi(path: string, opts: RequestInit = {}): Promise<NumApiResult> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...opts,
      headers: { ...authHeaders(), ...((opts.headers as Record<string, string>) ?? {}) },
    });
  } catch {
    return { ok: false, status: 0, json: { error: "Bağlantı hatası. Lütfen tekrar deneyin.", code: "NETWORK" } };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && json.ok !== false, status: res.status, json };
}

/** API yanıtından hata metni türetir (yoksa null). */
export function numApiError(r: NumApiResult): string | null {
  if (r.ok) return null;
  const e = r.json.error;
  const msg = typeof e === "string" && e.trim() ? e : `İşlem başarısız (HTTP ${r.status}).`;
  rememberErrorCode(msg, r.json.code);
  return msg;
}

/**
 * I18N — dil-bağımsız hata kodu. numApiError() imzası (string | null) ve TR metni AYNEN kalır; aynı yanıtın
 * `code` alanı, döndürülen metinle eşlenip saklanır. Ekran dili TR değilse çağıran numApiErrorCode(metin) ile
 * kodu alır ve katalogdan gösterir. YALNIZ GÖSTERİM içindir; kontrol akışı bu koda/metne bağlanmaz.
 * Kodu olmayan yanıt eşlemeyi siler (metin → en son yanıtın kodu).
 */
const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const codeByMessage = new Map<string, string | null>();

function rememberErrorCode(msg: string, code: unknown): void {
  if (typeof code === "string" && CODE_RE.test(code)) {
    if (codeByMessage.size >= 100) codeByMessage.clear();
    codeByMessage.set(msg, code);
  } else {
    codeByMessage.set(msg, null);
  }
}

/** numApiError()'ın döndürdüğü metnin dil-bağımsız kodu (yoksa null). */
export function numApiErrorCode(message: string | null | undefined): string | null {
  return message ? codeByMessage.get(message) ?? null : null;
}
