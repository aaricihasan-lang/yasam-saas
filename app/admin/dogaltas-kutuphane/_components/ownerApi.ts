// Doğaltaş Kütüphanesi · owner yönetim istemci yardımcıları (x-admin-id + oturum; mevcut yardımcılar).

import { apiRequest, type ApiResult } from "@/app/dogaltas/kutuphane/_shared/api";
import { blockersFromPublishError } from "./publishGate";

export const OWNER_BASE = "/api/admin/dogaltas-kutuphane";

export const ownerGet = <T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> => apiRequest<T>(`${OWNER_BASE}${path}`, "owner", { signal });
export const ownerPost = <T>(path: string, json: unknown): Promise<ApiResult<T>> => apiRequest<T>(`${OWNER_BASE}${path}`, "owner", { method: "POST", json });
export const ownerUpload = <T>(path: string, form: FormData): Promise<ApiResult<T>> => apiRequest<T>(`${OWNER_BASE}${path}`, "owner", { method: "POST", form });

const CODE_TEXT: Record<string, string> = {
  SL100: "Bu adla bir taş zaten var.",
  SL099: "Başka bir oturumda değişiklik yapıldı; sayfayı yenileyin.",
  SL090: "Taş yayına hazır değil; hazırlık engellerini giderin.",
  SL101: "Onay geçersiz veya süresi doldu; işlemi yeniden başlatın.",
  SL089: "Görsel bu taşa ait değil ya da silinmiş.",
  SL039: "Kaynağa bağlı taşın özgün adı değiştirilemez.",
  TOO_LARGE: "Görsel en çok 2 MB olabilir.",
  BAD_IMAGE: "Dosya geçerli bir JPEG, PNG veya WebP görseli değil (en çok 4000 px).",
  NETWORK: "Ağ hatası — bağlantıyı kontrol edip tekrar deneyin.",
};

/** Hata yanıtını owner için Türkçe metne çevirir (iç ayrıntı / yığın izi yok). */
export function ownerErrorText(r: { status: number; code: string | null; error: string | null }): string {
  if (r.code === "SL090") {
    const left = blockersFromPublishError(r.error);
    if (left.length) return `Taş yayınlanmadı. Kalan engel: ${left.map(readinessText).join(" · ")}.`;
  }
  if (r.code && CODE_TEXT[r.code]) return CODE_TEXT[r.code];
  if (r.code === "SL098" || r.code === "INPUT") return `Girilen bilgiler geçersiz${r.error ? `: ${r.error}` : "."}`;
  if (r.status === 404) return "Bu içerik bulunamadı veya erişim izniniz yok.";
  return r.error && r.status < 500 ? r.error : "İşlem tamamlanamadı.";
}

/** Hazırlık kodlarının Türkçe karşılığı. */
export const READINESS_TR: Record<string, string> = {
  records_pending: "Onay bekleyen metin kaydı var",
  facets_pending: "Onay bekleyen yapısal değer var",
  no_visible_content: "Uzmana gösterilecek içerik alanı kalmıyor",
  integrity_failed: "Kaynak bütünlüğü bozuk",
  health_content_not_published: "Sağlıkla ilgili içerik hukuki inceleme tamamlanana kadar gizli kalacak",
  lang_suspect_not_published: "Dil şüphesi işaretli içerik gizli kalacak",
  no_image: "Görsel yok",
  image_not_publishable: "Görsel yayımlanamaz (lisans / onay)",
  images_pending: "Onay bekleyen görsel var",
  duplicate_image: "Bu fotoğraf başka bir taşta da kullanılıyor",
  owner_image_undocumented: "Birincil owner görselinin lisans belgesi yok",
  new_source_version_pending: "Kaynakta yeni sürüm owner kararını bekliyor",
  records_rejected: "Reddedilmiş kayıt var",
};
export const readinessText = (code: string): string => READINESS_TR[code] ?? code;

export const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  review: "İncelemede",
  ready: "Yayına hazır",
  published: "Yayında",
  hidden: "Yayından kaldırıldı",
  deleted: "Silinmiş (geri alınabilir)",
};

export type Readiness = { ready: boolean; blockers: string[]; warnings: string[]; counts?: Record<string, unknown> };

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "–";
