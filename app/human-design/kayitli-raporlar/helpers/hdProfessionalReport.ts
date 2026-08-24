"use client";

/**
 * FAZ 2 — Profesyonel (canonical) Word raporu · client hattı.
 * Auth deseni diğer HD client helper'larıyla AYNI (x-user-id + x-session-token).
 *   • createProfessionalReport(chartId) → snapshot oluştur + kaydet → report_id
 *   • downloadProfessionalReport(reportId) → DONMUŞ snapshot'tan DOCX indir
 * service_role tarayıcıya gelmez; tüm iş server route'ta.
 */

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export async function createProfessionalReport(chartId: string): Promise<CreateResult> {
  let res: Response;
  try {
    res = await fetch("/api/hd/reports/professional", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ chartId }),
    });
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.id === "string") return { ok: true, id: j.id };
  return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

function filenameFromDisposition(header: string | null): string {
  if (!header) return "Human-Design-Raporu.docx";
  const m = /filename="?([^"]+)"?/i.exec(header);
  return m?.[1] ?? "Human-Design-Raporu.docx";
}

export type DownloadResult = { ok: true } | { ok: false; error: string };

export async function downloadProfessionalReport(reportId: string): Promise<DownloadResult> {
  let res: Response;
  try {
    res = await fetch("/api/hd/reports/professional/download", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reportId }),
    });
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}
