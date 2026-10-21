/**
 * guardedStockPatch.ts — Ürün & Stok PATCH'inde stok miktarı için karşılaştır-ve-yaz (STK-01).
 *
 * Sorun: istemci stoğu kendi önbelleğinden hesaplayıp MUTLAK değer olarak yazıyordu. Arada
 * atomik satış RPC'si (inventory_sale_create_atomic) stoğu düşürdüyse eski değer satışı eziyordu.
 *
 * Kural (sunucu tarafında, korumasız yol yok):
 *  - Gövdede stok kolonu VARSA `expected_stock` ZORUNLUDUR. Güncelleme yalnız DB'deki stok hâlâ
 *    `expected_stock` ise uygulanır (`.eq(stokKolonu, expected)` → tek UPDATE, satır düzeyinde atomik).
 *    Eşleşmezse 409 `stock_conflict` + güncel stok döner; hiçbir alan yazılmaz.
 *  - Gövdede stok kolonu YOKSA stok hiç yazılmaz (ad/fiyat düzenlemesi stoğu ezemez).
 *
 * Sürüm göstergesi olarak `updated_at` değil stok DEĞERİNİN kendisi kullanılır: stoğa dokunan her
 * yazıcı (satış/iptal RPC'leri, bu PATCH) değeri değiştirir; updated_at'i yazmayan yol olsa bile
 * çakışma kaçmaz. Değer DB'den okunup aynen geri gönderildiği için double eşitliği kayıpsızdır.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STOCK_CONFLICT_CODE, STOCK_EXPECTED_REQUIRED_CODE } from "@/lib/urun-stok/stockConflict";

const CONTROL_KEYS = ["expected_stock"] as const;

function finiteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type GuardedPatchResult =
  | { ok: true; response?: undefined }
  | { ok: false; response: NextResponse; failed: "server" | "client" };

/**
 * `fields` (sanitize edilmiş gövde + updated_at) ile tenant-scoped güncelleme yapar.
 * `body` ham gövdedir (expected_stock buradan okunur). Başarıda { ok: true }.
 */
export async function applyGuardedInventoryPatch(opts: {
  db: SupabaseClient;
  table: string;
  stockColumn: string;
  tenantId: string;
  id: string;
  fields: Record<string, unknown>;
  body: Record<string, unknown>;
}): Promise<GuardedPatchResult> {
  const { db, table, stockColumn, tenantId, id, body } = opts;
  const fields: Record<string, unknown> = { ...opts.fields };
  for (const k of CONTROL_KEYS) delete fields[k];

  const writesStock = Object.prototype.hasOwnProperty.call(fields, stockColumn);
  let expected: number | null = null;

  if (writesStock) {
    const next = finiteNumber(fields[stockColumn]);
    if (next === null || next < 0) {
      return {
        ok: false,
        failed: "client",
        response: NextResponse.json({ ok: false, error: "Stok miktarı geçersiz." }, { status: 400 }),
      };
    }
    fields[stockColumn] = next;
    expected = finiteNumber(body.expected_stock);
    if (expected === null) {
      return {
        ok: false,
        failed: "client",
        response: NextResponse.json(
          {
            ok: false,
            code: STOCK_EXPECTED_REQUIRED_CODE,
            error: "Stok güncellemesi için mevcut stok bilgisi gerekli. Sayfayı yenileyip tekrar deneyin.",
          },
          { status: 428 },
        ),
      };
    }
  }

  let q = db.from(table).update(fields).eq("id", id).eq("tenant_id", tenantId);
  if (expected !== null) q = q.eq(stockColumn, expected);
  const { data, error } = await q.select("id");

  if (error) {
    console.error(`[urun-stok/${table}] PATCH hata`, { code: (error as { code?: string }).code });
    return {
      ok: false,
      failed: "server",
      response: NextResponse.json({ ok: false, error: "Stok kaydı güncellenemedi." }, { status: 500 }),
    };
  }
  if (data && data.length > 0) return { ok: true };

  // 0 satır: kayıt yok/başka tenant mı, yoksa stok değişmiş mi?
  if (expected !== null) {
    const { data: cur, error: curErr } = await db
      .from(table).select(stockColumn)
      .eq("id", id).eq("tenant_id", tenantId)
      .maybeSingle();
    if (!curErr && cur) {
      const currentStock = finiteNumber((cur as unknown as Record<string, unknown>)[stockColumn]);
      return {
        ok: false,
        failed: "client",
        response: NextResponse.json(
          {
            ok: false,
            code: STOCK_CONFLICT_CODE,
            current_stock: currentStock,
            error: "Stok bu arada başka bir işlemle değişti. Güncel stok yüklendi; lütfen tekrar deneyin.",
          },
          { status: 409 },
        ),
      };
    }
  }
  return {
    ok: false,
    failed: "client",
    response: NextResponse.json(
      { ok: false, error: "Stok kaydı bulunamadı veya bu tenant'a ait değil." },
      { status: 404 },
    ),
  };
}
