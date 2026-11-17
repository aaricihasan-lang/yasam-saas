/**
 * GİRİŞ GÜVENLİĞİ F2-D — SENTETİK e-posta sağlayıcısı (yalnız yerel/test; production'da ASLA).
 * Gerçek e-posta GÖNDERMEZ. İletiler süreç belleğine ve (EMAIL_SYNTHETIC_SINK verilmişse) yerel bir
 * dosyaya yazılır — testler kodu buradan okur. Hata enjeksiyonu: EMAIL_SYNTHETIC_FAIL = quota |
 * provider_down | oauth_invalid_grant | network (yalnız test).
 */
import fs from "node:fs";
import type { EmailErrorCode, EmailMessage, EmailProvider } from "@/lib/email/provider";

type Env = Record<string, string | undefined>;
export type SyntheticMail = EmailMessage & { at: string; id: string };

const outbox: SyntheticMail[] = [];
export function syntheticOutbox(): readonly SyntheticMail[] {
  return outbox;
}

/**
 * F2-J (L3): sentetik sağlayıcı FAIL-CLOSED — yalnız AÇIKÇA izin verilmiş YEREL test ortamında seçilebilir:
 *   EMAIL_SYNTHETIC_ALLOW=1  VE  VERCEL_ENV üretim/önizleme DEĞİL  VE  veritabanı adresi (NEXT_PUBLIC_SUPABASE_URL)
 *   yerel döngü adresi (127.0.0.1 / localhost / ::1). Yanlış yapılandırılmış üretim, Vercel önizlemesi, kendi
 *   sunucusunda üretim veya üretim veritabanına bağlı bir önizleme → sağlayıcı YOK (e-posta yöntemi sunulmaz).
 */
export function syntheticEmailAllowed(env: Env = process.env): boolean {
  if (String(env.EMAIL_SYNTHETIC_ALLOW ?? "") !== "1") return false;
  const vercel = String(env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercel === "production" || vercel === "preview") return false;
  let host = "";
  try {
    host = new URL(String(env.NEXT_PUBLIC_SUPABASE_URL ?? "")).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
}

export function createSyntheticProvider(env: Env = process.env): EmailProvider | null {
  if (!syntheticEmailAllowed(env)) return null;
  return {
    name: "synthetic",
    async send(msg) {
      const fail = String((env === process.env ? process.env : env).EMAIL_SYNTHETIC_FAIL ?? "").trim() as EmailErrorCode | "";
      if (fail) return { ok: false, code: fail, retryable: fail === "provider_down" || fail === "network" };
      const mail: SyntheticMail = { ...msg, at: new Date().toISOString(), id: `syn-${outbox.length + 1}` };
      outbox.push(mail);
      const sink = String(env.EMAIL_SYNTHETIC_SINK ?? "").trim();
      if (sink) fs.appendFileSync(sink, `${JSON.stringify(mail)}\n`, "utf8");
      return { ok: true, providerMessageId: mail.id };
    },
  };
}
