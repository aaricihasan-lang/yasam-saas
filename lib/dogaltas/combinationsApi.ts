import { MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

/** Güvenli read API'sinden dönen kombinasyon satırı (12 kolon). */
export type CombinationApiRow = {
  id: string;
  tenant_id: string;
  source_id: string;
  issue: string;
  description: string | null;
  variant_index: number;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
  created_at: string;
  /** P4 provenance — 'admin_transfer' ise "Admin Kütüphanesi" rozeti. */
  origin_type?: string | null;
};

export type FetchCombinationsResult = {
  ok: boolean;
  rows: CombinationApiRow[];
  error?: string;
};

/**
 * Kombinasyonları güvenli server API'sinden okur (publishable key ile doğrudan
 * supabase.from("combinations").select(...) yerine).
 *
 * tenant_id sunucuda oturumdan alınır; burada gönderilmez → çapraz-tenant okuma
 * imkânsızdır.
 *
 * @param issue Verilirse yalnızca o başlığın varyantları döner; yoksa tümü.
 */
export async function fetchCombinationsViaApi(
  issue?: string,
): Promise<FetchCombinationsResult> {
  const userId = readYasamUser()?.id;
  const sessionToken = readSessionToken();

  if (!userId || !sessionToken) {
    return { ok: false, rows: [], error: MISSING_SESSION_TENANT_MESSAGE };
  }

  const query =
    issue && issue.trim() ? `?issue=${encodeURIComponent(issue)}` : "";

  try {
    const res = await fetch(`/api/dogaltas/combinations${query}`, {
      headers: {
        "x-user-id": userId,
        "x-session-token": sessionToken,
      },
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      rows?: CombinationApiRow[];
      error?: string;
    };

    if (!res.ok || !json.ok) {
      return { ok: false, rows: [], error: json.error ?? `HTTP ${res.status}` };
    }

    return { ok: true, rows: json.rows ?? [] };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      error: err instanceof Error ? err.message : "Ağ hatası",
    };
  }
}
