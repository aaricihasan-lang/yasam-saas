/**
 * F3B — Kademe B rapor harness'ları için ortam kurulumu (YALNIZ test aracı; üretim kodu değil).
 *
 *  - Saat SABİTLENİR (2026-11-10 09:30 UTC): rota içi "rapor tarihi" ve jsPDF CreationDate / dosya kimliği her koşuda aynı
 *    → main ↔ dal PDF'leri bayt düzeyinde karşılaştırılabilir.
 *  - `server-only` → boş modül (mevcut desen: scripts/final-hardening/hday-stubs/empty.cjs).
 *  - `--route-stubs` modunda (rota düzeyi senaryolar) `@/lib/auth/userGuard`, `@/lib/usage/trackUsage` ve dalda
 *    `@/lib/profile/reportBranding` çözümleme sonrası stub dosyalarına yönlendirilir (sentetik oturum + sahte db; ağ YOK).
 *
 * Bu dosya diğer tüm içe aktarmalardan ÖNCE yüklenmelidir.
 */
import Module from "node:module";
import path from "node:path";

export const FIXED_NOW = Date.UTC(2026, 10, 10, 9, 30, 0);

{
  const Real = Date;
  class FixedDate extends Real {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(FIXED_NOW);
      else super(...(a as [string]));
    }
    static now(): number {
      return FIXED_NOW;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
}

const ROOT = process.cwd();
const STUBS = path.join(__dirname, "stubs");
const REDIRECT: [string, string][] = [
  [path.join("lib", "auth", "userGuard.ts"), path.join(STUBS, "userGuard.ts")],
  [path.join("lib", "usage", "trackUsage.ts"), path.join(STUBS, "trackUsage.ts")],
  [path.join("lib", "profile", "reportBranding.ts"), path.join(STUBS, "reportBranding.ts")],
];

let routeStubs = false;
/** Rota düzeyi senaryolar için stub yönlendirmesini açar (modüller yüklenmeden önce çağrılmalı). */
export function enableRouteStubs(): void {
  routeStubs = true;
}

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const empty = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return empty;
    const resolved = orig.call(this, req, ...rest);
    if (routeStubs) {
      const norm = path.normalize(resolved);
      for (const [target, stub] of REDIRECT) if (norm.endsWith(target) && norm.startsWith(path.normalize(ROOT))) return stub;
    }
    return resolved;
  };
}
