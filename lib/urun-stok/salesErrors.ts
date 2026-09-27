/**
 * salesErrors.ts — Atomik satış RPC'lerinin (inventory_sale_create_atomic /
 * inventory_sale_cancel_atomic) custom SQLSTATE kodlarını kullanıcı dostu
 * HTTP yanıtına çevirir. Ham Postgres/Supabase hata metni UI'ya SIZMAZ.
 */

export type SaleRpcErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null | undefined;

export type MappedSaleError = { status: number; error: string };

/** Custom SQLSTATE → { HTTP status, kullanıcı mesajı } */
export function mapSaleRpcError(err: SaleRpcErrorLike): MappedSaleError {
  const code = (err?.code ?? "").toString();
  switch (code) {
    case "45001":
      return { status: 404, error: "Ürün bulunamadı veya bu çalışma alanına ait değil." };
    case "45002":
      return { status: 409, error: "Yetersiz stok. Stok bilgisi yenilendi." };
    case "45003":
      return { status: 404, error: "Satış kaydı bulunamadı." };
    case "45010":
      return { status: 400, error: "Aynı ürün sepette birden fazla satır olamaz." };
    case "45011":
      return { status: 400, error: "Geçersiz ürün kategorisi." };
    case "45012":
      return { status: 400, error: "Satılacak miktar geçersiz." };
    case "45013":
      return { status: 400, error: "Satış fiyatı geçersiz." };
    case "45014":
      return { status: 400, error: "Geçersiz satış isteği." };
    default:
      return { status: 500, error: "Satış işlenemedi. Lütfen tekrar deneyin." };
  }
}
