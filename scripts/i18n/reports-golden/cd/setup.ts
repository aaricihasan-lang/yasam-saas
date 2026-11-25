/**
 * I18N rapor golden (grup C+D) — süreç kurulumu. Harness'ın İLK import'u olmalı.
 *
 * 1) Saat dondurma: parametresiz `new Date()` / `Date.now()` sabit ana döner (rapor tarihi, dosya adı tarihi).
 * 2) Modül stub'ları: kimlik kapıları + Usage360 (gerçek DB/oturum YOK), `server-only`, Aromaterapi kaynak
 *    okumaları (service katmanı yerine sentetik fikstür — `globalThis.__RCD_ARO__`).
 * DB / ağ / sır YOK. (Grup A+B kurulumu `../ab/setup.ts`'e DOKUNULMAZ; aynı stub dosyaları salt okunur kullanılır.)
 */
import Module from "node:module";
import path from "node:path";

export const FIXED_NOW_ISO = "2026-11-25T09:30:00.000Z";
const FIXED_MS = Date.parse(FIXED_NOW_ISO);

{
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(FIXED_MS);
      else super(...(args as [string | number | Date]));
    }
    static now(): number {
      return FIXED_MS;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FrozenDate as unknown as DateConstructor;
}

{
  const ROOT = process.cwd();
  const AB = path.join(ROOT, "scripts", "i18n", "reports-golden", "ab", "stubs");
  const CD = path.join(ROOT, "scripts", "i18n", "reports-golden", "cd", "stubs");
  const M = Module as unknown as { _resolveFilename: (req: string, parent: { filename?: string } | null, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stubs: Record<string, string> = {
    "@/lib/auth/userGuard": path.join(AB, "userGuard.cjs"),
    "@/lib/usage/trackUsage": path.join(AB, "trackUsage.cjs"),
    "@/lib/dogaltas/reportAuth": path.join(CD, "dogaltasReportAuth.cjs"),
    "@/lib/auth/requireUser": path.join(CD, "requireUser.cjs"),
    "server-only": path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs"),
  };
  M._resolveFilename = function (req: string, parent: { filename?: string } | null, ...rest: unknown[]) {
    if (stubs[req]) return stubs[req]!;
    // Aromaterapi builders → ./resourceReads (service katmanı) yerine sentetik okuma.
    if (req === "./resourceReads" && /aromaterapi[\\/]report[\\/]builders/.test(String(parent?.filename ?? ""))) {
      return path.join(CD, "aromaResourceReads.cjs");
    }
    return orig.call(this, req, parent, ...rest);
  };
}
