// Doğaltaş Kütüphanesi · owner RPC çağrı yardımcısı (YALNIZ SUNUCU). Her owner RPC'si DB'de owner'ı yeniden doğrular;
// bu dosya yalnız çağrıyı ve hata kodunu (SLxxx) tek biçime getirir.

import type { SupabaseClient } from "@supabase/supabase-js";

export class StoneLibraryRpcError extends Error {
  constructor(public readonly fn: string, public readonly code: string, message: string) {
    super(message);
    this.name = "StoneLibraryRpcError";
  }
}

/** PostgREST skaler sonucu: doğrudan değer veya [{fn: değer}] → değer. */
export function rpcValue<T = unknown>(fn: string, data: unknown): T {
  let v: unknown = data;
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 1 && fn in (v as object)) {
    v = (v as Record<string, unknown>)[fn];
  }
  return v as T;
}

export function slErrorCode(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "";
  if (err.code && /^SL\d{3}$/.test(err.code)) return err.code;
  const m = /\bSL\d{3}\b/.exec(err.message ?? "");
  return m ? m[0] : (err.code ?? "XX000");
}

export async function ownerRpc<T = unknown>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new StoneLibraryRpcError(fn, slErrorCode(error), error.message ?? "rpc error");
  return rpcValue<T>(fn, data);
}
