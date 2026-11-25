/**
 * I18N rapor golden (grup A+B) — süreç kurulumu. Harness'ın İLK import'u olmalı.
 *
 * 1) Saat dondurma: parametresiz `new Date()` / `Date.now()` sabit ana döner (rapor tarihi, dosya adı tarihi,
 *    "Oluşturulma Tarihi" → golden günden güne değişmez). Argümanlı `new Date(x)` dokunulmaz.
 * 2) Modül stub'ları: kimlik kapısı + Usage360 (gerçek DB/oturum YOK), `server-only`.
 * DB / ağ / sır YOK.
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
  const STUBS = path.join(ROOT, "scripts", "i18n", "reports-golden", "ab", "stubs");
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stubs: Record<string, string> = {
    "@/lib/auth/userGuard": path.join(STUBS, "userGuard.cjs"),
    "@/lib/usage/trackUsage": path.join(STUBS, "trackUsage.cjs"),
    "server-only": path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs"),
  };
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (stubs[req]) return stubs[req]!;
    return orig.call(this, req, ...rest);
  };
}
