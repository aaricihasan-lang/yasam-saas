import { supabase } from "@/lib/supabase";

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

export async function fetchReferenceSheets(tenantId: string): Promise<{
  sheets: ReferenceSheet[];
  error: string | null;
}> {
  const { data: sheetsRaw, error: sheetsErr } = await supabase
    .from("aromatherapy_reference_sheets")
    .select("id, sheet_name, display_title, headers, sort_order")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true)
    .order("sort_order");

  if (sheetsErr) return { sheets: [], error: sheetsErr.message };
  if (!sheetsRaw || sheetsRaw.length === 0) return { sheets: [], error: null };

  const sheetIds = sheetsRaw.map((s) => s.id as string);

  const { data: rowsRaw, error: rowsErr } = await supabase
    .from("aromatherapy_reference_rows")
    .select("id, sheet_id, row_index, cells, is_header")
    .in("sheet_id", sheetIds)
    .order("row_index");

  if (rowsErr) return { sheets: [], error: rowsErr.message };

  const rowsBySheet = new Map<string, ReferenceRow[]>();
  for (const row of rowsRaw ?? []) {
    const sid = row.sheet_id as string;
    if (!rowsBySheet.has(sid)) rowsBySheet.set(sid, []);
    rowsBySheet.get(sid)!.push(row as unknown as ReferenceRow);
  }

  const sheets: ReferenceSheet[] = sheetsRaw.map((s) => ({
    id:            s.id as string,
    sheet_name:    s.sheet_name as string,
    display_title: s.display_title as string,
    headers:       s.headers as string[],
    sort_order:    s.sort_order as number,
    rows:          rowsBySheet.get(s.id as string) ?? [],
  }));

  return { sheets, error: null };
}

