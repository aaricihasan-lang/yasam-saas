import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { STONES_WORKSPACE_UNAVAILABLE } from "@/lib/dogaltas/sessionError";

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
export type FetchCombinationsCountResult = {
  ok: boolean;
  count: number;
  error?: string;
};

/**
 * Kombinasyon TAM sayımını güvenli server API'sinden okur (count=1 → satır inmez).
 * Dashboard "Toplam Kombinasyon" için: tüm satırları indirip length saymak yerine
 * DB exact count kullanılır (tenant sunucuda oturumdan; çapraz-tenant imkânsız).
 */
export async function fetchCombinationsCount(): Promise<FetchCombinationsCountResult> {
  const userId = readYasamUser()?.id;
  const sessionToken = readSessionToken();

  if (!userId || !sessionToken) {
    return { ok: false, count: 0, error: STONES_WORKSPACE_UNAVAILABLE };
  }

  try {
    const res = await fetch(`/api/dogaltas/combinations?count=1`, {
      headers: {
        "x-user-id": userId,
        "x-session-token": sessionToken,
      },
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      count?: number;
      error?: string;
    };

    if (!res.ok || !json.ok) {
      return { ok: false, count: 0, error: json.error ?? `HTTP ${res.status}` };
    }

    return { ok: true, count: json.count ?? 0 };
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}

export async function fetchCombinationsViaApi(
  issue?: string,
): Promise<FetchCombinationsResult> {
  const userId = readYasamUser()?.id;
  const sessionToken = readSessionToken();

  if (!userId || !sessionToken) {
    // Locale-independent kod; görüntüleme sınırında localize edilir (Stones UI).
    return { ok: false, rows: [], error: STONES_WORKSPACE_UNAVAILABLE };
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
