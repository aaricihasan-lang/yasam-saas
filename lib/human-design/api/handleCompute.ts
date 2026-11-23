// FAZ 5 / ADIM 2a — Human Design API. Saf compute çekirdeği (route'suz).
//
// validate → computeHumanDesignChart → HTTP-benzeri {status, body} zarfı.
// SAF/test-edilebilir; auth/DB/route/logging İÇERMEZ (bunlar 2b route katmanı).

import { computeHumanDesignChart } from "../engine";
import type { HdChartResult } from "../engine";
import { validateBirthInput, type BirthInputErrorCode } from "./validateBirthInput";
import { birthLocalTimeIssue, resolveBirthLocalTime } from "./birthTimeResolution";

export type ComputeResponse =
  | { status: 200; body: { ok: true; data: HdChartResult } }
  | {
      status: 400 | 500;
      body: { ok: false; code: BirthInputErrorCode | "BIRTH_TIME_NONEXISTENT" | "BIRTH_TIME_AMBIGUOUS" | "ENGINE_ERROR"; error: string };
    };

/**
 * Ham girdiyi doğrular ve HD chart'ı hesaplar; HTTP-benzeri zarf döndürür.
 * Route katmanı yalnız auth + bu fonksiyonu sarar. Saf/deterministik.
 */
export function handleCompute(raw: unknown): ComputeResponse {
  const v = validateBirthInput(raw);
  if (!v.ok) {
    return { status: 400, body: { ok: false, code: v.code, error: v.error } };
  }

  // HD-TZ: doğum anı ortak IANA 2026f çekirdeğiyle çözülür; boşluk/çakışma güvenli ret (otomatik hesapla aynı politika).
  const t = resolveBirthLocalTime(v.input.date, v.input.time, v.input.timezone);
  if (t.kind === "invalid") {
    return t.reason === "timezone"
      ? { status: 400, body: { ok: false, code: "INVALID_TIMEZONE", error: "Geçersiz IANA timezone (ör. Europe/Istanbul)." } }
      : { status: 400, body: { ok: false, code: t.reason === "date" ? "INVALID_DATE" : "INVALID_TIME", error: "Geçersiz tarih/saat." } };
  }
  if (t.kind === "gap" || t.kind === "ambiguous") {
    const issue = birthLocalTimeIssue(v.input.date, v.input.time, v.input.timezone);
    return {
      status: 400,
      body: {
        ok: false,
        code: t.kind === "gap" ? "BIRTH_TIME_NONEXISTENT" : "BIRTH_TIME_AMBIGUOUS",
        error: issue?.message ?? "Doğum saati yaz/kış saati geçişine denk geliyor; hesaplama yapılmadı.",
      },
    };
  }

  try {
    const data = computeHumanDesignChart(v.input);
    return { status: 200, body: { ok: true, data } };
  } catch {
    // Birth-data sızdırmaz; genel mesaj. (Gerçek hata route katmanında scrub'lı loglanır.)
    return {
      status: 500,
      body: { ok: false, code: "ENGINE_ERROR", error: "HD hesaplaması sırasında beklenmeyen hata." },
    };
  }
}
