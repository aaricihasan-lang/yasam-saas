/**
 * Astroloji profil silme — ONAY KATMANI PLANI (saf, test edilebilir).
 *
 * Sistem geneli kural (lib/ui/bulkDeleteGuard):
 *   • 1–2 kayıt: mevcut onay korunur (tekli 2 "Evet"; toplu 1–2 seçimde mevcut 3 "Evet" — zayıflatılmaz).
 *   • 3+ kayıt (toplu): 3 AYRI katman — 1) uyarı + etkilenecek kayıtlar → 2) "N KAYDI SİL" ifadesini
 *     elle yazma (yanlış ifade ilerletmez) → 3) son "geri alınamaz" onayı → ancak o zaman DELETE.
 * Yeni bir onay sistemi DEĞİLDİR: eşik, ifade ve eşleşme kuralı ortak çekirdekten gelir.
 * Sunucunun istediği onay sayısı (requiredConfirmations) hiçbir zaman AŞAĞI çekilmez.
 */
import { bulkDeletePhrase, bulkPhraseMatches, requiresBulkDeleteGuard } from "@/lib/ui/bulkDeleteGuard";

export type ProfileDeleteMode = "single" | "bulk";

export type ProfileDeletePlan = {
  /** Toplam onay katmanı sayısı. */
  required: number;
  /** 3+ toplu silme → yazarak doğrulama katmanı zorunlu. */
  guarded: boolean;
  /** Elle yazılacak ifade (yalnız guarded). */
  phrase: string | null;
  /** İfadenin istendiği katman (yalnız guarded; ortak standartla aynı: 2. katman). */
  phraseStep: number | null;
};

export function profileDeletePlan(mode: ProfileDeleteMode, count: number, serverRequired?: number | null): ProfileDeletePlan {
  const guarded = mode === "bulk" && requiresBulkDeleteGuard(count);
  const base = typeof serverRequired === "number" && Number.isFinite(serverRequired) ? serverRequired : mode === "single" ? 2 : 3;
  const required = guarded ? Math.max(base, 3) : base;
  return { required, guarded, phrase: guarded ? bulkDeletePhrase(count) : null, phraseStep: guarded ? 2 : null };
}

/** Bulunulan katmanda "Evet/Devam" düğmesi açık mı? (İfade katmanında yalnız birebir eşleşmede.) */
export function canProceedProfileDelete(plan: ProfileDeletePlan, step: number, typed: string): boolean {
  if (plan.phraseStep !== null && step === plan.phraseStep) return !!plan.phrase && bulkPhraseMatches(typed, plan.phrase);
  return true;
}

/**
 * "Evet" tıklamasının sonucu: ifade eşleşmiyorsa "blocked" (hiçbir şey olmaz), son katmanda "delete",
 * aksi halde "advance". Bileşen DELETE isteğini YALNIZ "delete" sonucunda gönderir.
 */
export function profileDeleteAction(plan: ProfileDeletePlan, step: number, typed: string): "advance" | "blocked" | "delete" {
  if (!canProceedProfileDelete(plan, step, typed)) return "blocked";
  return step >= plan.required ? "delete" : "advance";
}
