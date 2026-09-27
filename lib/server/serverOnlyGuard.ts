/**
 * Sunucu-yalnız modül koruması (FAZ1 FINAL HARDENING — INFRA).
 *
 * NEDEN `import "server-only"` DEĞİL?
 *   `server-only` paketi node_modules'ta YOK; Next.js bunu derleyici alias'ı ile
 *   (next/dist/compiled/server-only) çözer. Ancak repo'daki ~21 tsx harness'i
 *   (ör. scripts/cupping-security-harness.ts, yh-* harness'leri) lib/supabase-server.ts'i
 *   dolaylı import ediyor; tsx/Node bu alias'ı bilmediği için bare `import "server-only"`
 *   hepsini "Cannot find module 'server-only'" ile kırar (denendi).
 *
 * BU YÜZDEN iki katmanlı koruma:
 *   1) Çalışma anı: tarayıcıda (window tanımlı) import edilirse anında hata.
 *   2) Statik kapı: scripts/final-hardening/infra.harness.ts — "use client" dosyalarından
 *      service-role/secret kullanan modüllere (dolaylı dahil) import yolu 0 olmalı.
 *
 * Bağımlılıksız; Node/tsx/Next server/edge'de no-op.
 */
export function assertServerOnly(moduleName: string): void {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    throw new Error(`${moduleName} yalnız sunucu tarafında kullanılabilir (tarayıcıya dahil edilemez).`);
  }
}
