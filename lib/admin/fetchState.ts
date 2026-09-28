/**
 * MEM-019 — Admin ekranlarında hata ≠ boş sonuç. Ağ/HTTP başarısızlığını ayrık duruma çevirir;
 * ham teknik hata kullanıcıya gösterilmez.
 */
export type FetchFailureKind = "unauthorized" | "forbidden" | "not_found" | "invalid" | "server" | "network";

export function classifyFetchFailure(status: number | null): FetchFailureKind {
  if (status === null) return "network";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 409 || status === 422) return "invalid";
  return "server";
}

export const FETCH_FAILURE_COPY: Record<FetchFailureKind, { title: string; message: string; retry: boolean }> = {
  unauthorized: {
    title: "Oturum doğrulanamadı",
    message: "Oturumunuz sona ermiş olabilir. Lütfen yeniden giriş yapın.",
    retry: false,
  },
  forbidden: {
    title: "Yetkiniz yok",
    message: "Bu bilgiyi görüntüleme veya bu işlemi yapma yetkiniz bulunmuyor.",
    retry: false,
  },
  not_found: { title: "Kayıt bulunamadı", message: "Aradığınız üye bulunamadı veya kaldırılmış olabilir.", retry: false },
  invalid: { title: "Geçersiz istek", message: "Filtre veya bağlantı geçersiz. Filtreleri temizleyip tekrar deneyin.", retry: false },
  server: { title: "Sunucu hatası", message: "Bilgiler şu anda alınamadı. Biraz sonra tekrar deneyin.", retry: true },
  network: { title: "Bağlantı hatası", message: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", retry: true },
};
