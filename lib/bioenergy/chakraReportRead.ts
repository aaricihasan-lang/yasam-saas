/**
 * BIO-01 — Çakra Word raporu için EKSİKSİZ okuma (yalnız sunucu).
 *
 * Önceden: bloklar `.in(chakra_id, ids)` ile LİMİTSİZ + SIRASIZ tek sorguda okunuyordu;
 * PostgREST max-rows (Supabase varsayılanı 1000) aşılınca bloklar SESSİZCE ve rastgele
 * kesiliyordu; okuma hatası da yutulup rapor sessizce eski alanlara düşüyordu.
 *
 * Şimdi:
 *   - Çakralar ve bloklar deterministik sıralı + sayfalı okunur (readAllPaged).
 *   - Okunan ≠ sunucunun bildirdiği toplam → hata (rapor ÜRETİLMEZ).
 *   - Blok okuma hatası → hata. Yalnız tablo henüz yoksa (dormant migration) bloksuz
 *     legacy rapor üretilir (mevcut, bilinçli davranış).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPaged, chunkIds } from "@/lib/db/readAllPaged";
import type { ChakraContentBlock } from "@/lib/bioenergy/chakraWorkspace";

// "*": hızlı-bilgi kolonları (sanskrit_name/element/location/bija_mantra) dahil tüm
// kolonlar; kolon listesine bağımlı şema-drift riski yok.
export const CHAKRA_REPORT_SELECT = "*";

export const CHAKRA_REPORT_BLOCK_SELECT =
  "id, chakra_id, section_key, block_type, block_title, sort_order, editorial_explanation, source_title, source_author, created_at";

export type ChakraReportRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  name: string | null;
  organs: string | null;
  glands: string | null;
  color: string | null;
  stones: string | null;
  causes: string | null;
  physical: string | null;
  mental: string | null;
  notes: string | null;
  sanskrit_name?: string | null;
  element?: string | null;
  location?: string | null;
  bija_mantra?: string | null;
  created_at: string;
};

export type ChakraReportSelection =
  | { mode: "single"; chakraId: string }
  | { mode: "selected"; chakraIds: string[] }
  | { mode: "all" };

export type ChakraReportReadResult =
  | {
      ok: true;
      chakras: ChakraReportRow[];
      blocksByChakra: Map<string, ChakraContentBlock[]>;
      truncated: boolean;
      blocksAvailable: boolean;
    }
  | { ok: false; stage: "chakras" | "blocks"; error: unknown };

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || /does not exist|could not find the table/.test(msg);
}

export async function readChakraReportData(
  db: SupabaseClient,
  tenantId: string,
  sel: ChakraReportSelection,
  maxRows: number,
  pageSize?: number,
): Promise<ChakraReportReadResult> {
  const ch = await readAllPaged<ChakraReportRow>(
    (from, to) => {
      let q = db
        .from("bioenergy_chakras")
        .select(CHAKRA_REPORT_SELECT, { count: "exact" })
        .eq("tenant_id", tenantId);
      if (sel.mode === "single") q = q.eq("id", sel.chakraId);
      else if (sel.mode === "selected") q = q.in("id", sel.chakraIds);
      return q
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
    },
    { maxRows, pageSize },
  );
  if (ch.error) return { ok: false, stage: "chakras", error: ch.error };

  const blocksByChakra = new Map<string, ChakraContentBlock[]>();
  let blocksAvailable = true;
  const ids = ch.rows.map((c) => c.id);
  for (const part of chunkIds(ids, 100)) {
    const bl = await readAllPaged<ChakraContentBlock & { chakra_id: string }>(
      (from, to) =>
        db
          .from("bioenergy_chakra_blocks")
          .select(CHAKRA_REPORT_BLOCK_SELECT, { count: "exact" })
          .eq("tenant_id", tenantId)
          .in("chakra_id", part)
          .order("chakra_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize },
    );
    if (bl.error) {
      if (isMissingTableError(bl.error)) {
        blocksAvailable = false;
        break;
      }
      return { ok: false, stage: "blocks", error: bl.error };
    }
    for (const raw of bl.rows) {
      const arr = blocksByChakra.get(raw.chakra_id) ?? [];
      arr.push(raw);
      blocksByChakra.set(raw.chakra_id, arr);
    }
  }

  return { ok: true, chakras: ch.rows, blocksByChakra, truncated: ch.truncated, blocksAvailable };
}
