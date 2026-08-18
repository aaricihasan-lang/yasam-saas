/**
 * Aromaterapi Word export — istek doğrulama + DOCX yanıt yardımcıları (server-only mantık,
 * ama supabase/secret İÇERMEZ; yalnız saf doğrulama + Response kurma).
 */

import { NextResponse } from "next/server";
import { MAX_SELECTED_IDS } from "./theme";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExportMode = "selected" | "all";

export type ParsedExport =
  | { ok: true; mode: ExportMode; ids: string[]; oilType: string | null; sections: string[] | null }
  | { ok: false; status: number; error: string };

/**
 * Ortak export gövdesi doğrulama:
 *   { mode: "selected"|"all", ids?: string[], oilType?: string, sections?: string[] }
 * - mode zorunlu ve allowlist.
 * - selected → ids zorunlu, boş değil, ≤ MAX_SELECTED_IDS, HER biri UUID.
 * - all → ids yok sayılır (cap "all"a UYGULANMAZ).
 * - oilType (opsiyonel) yalnız allowlist (typed oils export).
 * - sections (opsiyonel, genel rapor) yalnız izinli anahtarlar.
 * tenant_id / user_id GÖVDEDEN OKUNMAZ (guard'dan gelir) — burada varsa yok sayılır.
 */
export function parseExportBody(
  body: unknown,
  opts?: { oilTypeAllow?: readonly string[]; sectionAllow?: readonly string[] },
): ParsedExport {
  const b = (body ?? {}) as Record<string, unknown>;
  const mode = b.mode;
  if (mode !== "selected" && mode !== "all") {
    return { ok: false, status: 400, error: "Geçersiz mode (selected|all)." };
  }

  let ids: string[] = [];
  if (mode === "selected") {
    const raw = b.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, status: 400, error: "Seçili export için en az bir kayıt seçilmelidir." };
    }
    if (raw.length > MAX_SELECTED_IDS) {
      return { ok: false, status: 400, error: `En fazla ${MAX_SELECTED_IDS} kayıt seçilebilir.` };
    }
    const seen = new Set<string>();
    for (const v of raw) {
      if (typeof v !== "string" || !UUID_RE.test(v)) {
        return { ok: false, status: 400, error: "Geçersiz kayıt kimliği." };
      }
      seen.add(v);
    }
    ids = [...seen];
  }

  let oilType: string | null = null;
  if (b.oilType != null && b.oilType !== "") {
    const t = String(b.oilType).trim();
    if (opts?.oilTypeAllow && !opts.oilTypeAllow.includes(t)) {
      return { ok: false, status: 400, error: "Geçersiz oilType." };
    }
    oilType = t;
  }

  let sections: string[] | null = null;
  if (b.sections != null) {
    if (!Array.isArray(b.sections)) return { ok: false, status: 400, error: "Geçersiz sections." };
    const allow = opts?.sectionAllow ?? [];
    const picked = b.sections.map((s) => String(s)).filter((s) => allow.includes(s));
    sections = picked.length ? [...new Set(picked)] : [...allow]; // boş/geçersiz → tümü
  }

  return { ok: true, mode, ids, oilType, sections };
}

/** Tekil kayıt id doğrulama (route param). */
export function isUuid(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** DOCX Buffer → indirilebilir attachment Response. */
export function docxResponse(buffer: Buffer, filename: string): Response {
  // filename yalnız güvenli karakterler (theme.reportFilename zaten sanitize eder; ek koruma).
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
