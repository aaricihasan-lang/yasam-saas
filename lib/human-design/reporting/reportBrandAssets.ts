/**
 * HD profesyonel Word — marka görseli (server-only). Yaşam Sistemi logosu (şeffaf PNG) yerel
 * paketlenmiş asset'ten okunur; ağ fetch'i YOK. Vercel: outputFileTracingIncludes ile indirme
 * route'unun paketine dahil edilir (bkz. next.config.ts). Okunamazsa kapak logosuz devam eder.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export const HD_REPORT_LOGO_ASSET = "public/assets/yasam-sistemi-chart-logo.png";

let logoCache: Buffer | null | undefined;

export async function loadHdReportLogo(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await readFile(path.join(process.cwd(), HD_REPORT_LOGO_ASSET));
  } catch {
    console.error("[hd-word] logo okunamadı; kapak logosuz üretilecek");
    logoCache = null;
  }
  return logoCache;
}
