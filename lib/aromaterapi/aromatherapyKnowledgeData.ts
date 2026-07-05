import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

// -------------------------------------------------------
// Referans sheet tipleri (raw Excel import)
// -------------------------------------------------------

export type ReferenceRow = {
  id: string;
  sheet_id: string;
  row_index: number;
  cells: Record<string, string>;
  is_header: boolean;
};

export type ReferenceSheet = {
  id: string;
  sheet_name: string;
  display_title: string;
  headers: string[];
  sort_order: number;
  rows: ReferenceRow[];
};

// İmza korunur: tenantId geriye dönük uyumluluk için durur; gerçek tenant
// server tarafında oturumdan belirlenir (istemci değeri güvenilmez).
// Tarayıcı referans tablolarına DOĞRUDAN erişmez (RLS-kilitli, service_role API).
export async function fetchReferenceSheets(_tenantId: string): Promise<{
  sheets: ReferenceSheet[];
  error: string | null;
}> {
  const res = await fetch(`/api/aromaterapi/reference`, { headers: authHeaders() });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sheets?: Array<{
      id: string;
      sheet_name: string;
      display_title: string;
      headers: string[];
      sort_order: number;
    }>;
    rows?: Array<{
      id: string;
      sheet_id: string;
      row_index: number;
      cells: Record<string, string>;
      is_header: boolean;
    }>;
  };

  if (!res.ok || j.ok !== true) return { sheets: [], error: String(j.error ?? `HTTP ${res.status}`) };

  const sheetsRaw = j.sheets ?? [];
  if (sheetsRaw.length === 0) return { sheets: [], error: null };

  const rowsBySheet = new Map<string, ReferenceRow[]>();
  for (const row of j.rows ?? []) {
    const sid = row.sheet_id;
    if (!rowsBySheet.has(sid)) rowsBySheet.set(sid, []);
    rowsBySheet.get(sid)!.push(row as ReferenceRow);
  }

  const sheets: ReferenceSheet[] = sheetsRaw.map((s) => ({
    id:            s.id,
    sheet_name:    s.sheet_name,
    display_title: s.display_title,
    headers:       s.headers,
    sort_order:    s.sort_order,
    rows:          rowsBySheet.get(s.id) ?? [],
  }));

  return { sheets, error: null };
}

