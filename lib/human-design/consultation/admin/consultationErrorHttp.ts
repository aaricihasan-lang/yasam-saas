/**
 * HD Danışmanlık F2 · stabil hata kodu → güvenli HTTP status + Türkçe mesaj.
 * Ham Postgres metni burada KULLANILMAZ; yalnız stabil kod → sabit mesaj.
 */
import type { ConsultationErrorCode } from "@/lib/human-design/consultation/admin/consultationAdminTypes";

export function httpStatusForConsultationError(code: ConsultationErrorCode): number {
  switch (code) {
    case "VALIDATION": return 400;
    case "NOT_FOUND": return 404;
    case "STALE_VERSION":
    case "CANONICAL_STALE":
    case "RIGHTS_DENIED":
    case "EVIDENCE_MISSING":
    case "CANONICAL_NOT_APPROVED":
    case "NO_ACTIVE_SECTION":
    case "ARCHIVED": return 409;
    case "PIN_PATCH_BLOCKED": return 400;
    default: return 500;
  }
}

/** Kullanıcı-facing Türkçe mesaj (koda göre; ham DB metni değil). */
export function messageForConsultationError(code: ConsultationErrorCode, fallback: string): string {
  switch (code) {
    case "VALIDATION": return fallback || "Girdi doğrulaması başarısız.";
    case "NOT_FOUND": return "Danışmanlık içeriği bulunamadı.";
    case "STALE_VERSION": return "Kayıt başka bir işlem tarafından güncellendi. Güncel sürümü yeniden yükleyin.";
    case "CANONICAL_STALE": return "Merkezî canonical içerik değişmiş; yayın öncesi yeniden pinlemeniz (repin) gerekir.";
    case "PIN_PATCH_BLOCKED": return "Canonical pin doğrudan düzenlenemez; yalnız açık repin ile güncellenir.";
    case "RIGHTS_DENIED": return "Kaynak hakları (default-deny) bu bölümün yayınına izin vermiyor.";
    case "EVIDENCE_MISSING": return "Yayın için her aktif bölümün en az bir kanıtı (evidence) olmalıdır.";
    case "CANONICAL_NOT_APPROVED": return "Bağlı merkezî canonical içerik yayınlı ve insan-onaylı değil.";
    case "NO_ACTIVE_SECTION": return "Yayın için en az bir aktif bölüm gerekir.";
    case "ARCHIVED": return "Arşivlenmiş içerik üzerinde bu işlem yapılamaz.";
    default: return "Beklenmeyen bir sunucu hatası oluştu.";
  }
}
