/**
 * TRIAL7 — geri sayım kutusu "oturum başına bir kez" kuralı (istemci).
 *
 * Her BAŞARILI girişte işaret "pending" olur; kutu Tamam ile kapatılınca "seen" olur → aynı oturumda
 * (sekmeler arası dahil) tekrar görünmez. Çıkış + yeniden giriş işareti yeniden "pending" yapar.
 * Tüm erişimler try/catch: depolama kapalıysa kutu en kötü her sayfa yüklemesinde görünür (bilgi kaybı yok).
 * Kalan süre bilgisi buradan DEĞİL, sunucudan (/api/trial/status) gelir.
 */
const NOTICE_KEY = "yasam_trial_notice";
const NONE_KEY = "yasam_trial_none";

export function markTrialNoticePending(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "pending");
    sessionStorage.removeItem(NONE_KEY);
  } catch {
    /* depolama kapalı */
  }
}

export function isTrialNoticePending(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "pending";
  } catch {
    return true;
  }
}

export function ackTrialNotice(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "seen");
  } catch {
    /* depolama kapalı */
  }
}

/** Deneme rejimi dışı kullanıcı için bu sekmede durum sorgusunu tekrarlama (Premium'a ek yük yok). */
export function rememberNoTrial(userId: string): void {
  try {
    sessionStorage.setItem(NONE_KEY, userId);
  } catch {
    /* depolama kapalı */
  }
}

export function isKnownNoTrial(userId: string): boolean {
  try {
    return sessionStorage.getItem(NONE_KEY) === userId;
  } catch {
    return false;
  }
}
