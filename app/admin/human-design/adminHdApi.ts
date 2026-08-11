"use client";

/**
 * HD FAZ-2 — Admin merkezî içerik client API helper.
 * verifyAdminRequest hattına x-admin-id + x-session-token ile istek atar.
 * TENANT bilgisi göndermez; /api/hd/knowledge veya tenant persistence kullanmaz.
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

function adminHeaders(json = false): Record<string, string> {
  const adminId = readYasamUser()?.id ?? "";
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export type HdApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function toResult<T>(res: Response): Promise<HdApiResult<T>> {
  let body: unknown = null;
  try { body = await res.json(); } catch { /* ignore */ }
  const b = (body ?? {}) as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (res.ok && b.ok) return { ok: true, data: b as unknown as T };
  return { ok: false, error: b.error ?? `HTTP ${res.status}` };
}

export async function hdGet<T>(path: string): Promise<HdApiResult<T>> {
  const res = await fetch(`/api/admin/hd/${path}`, { method: "GET", headers: adminHeaders(), cache: "no-store" });
  return toResult<T>(res);
}

export async function hdSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<HdApiResult<T>> {
  const res = await fetch(`/api/admin/hd/${path}`, {
    method,
    headers: adminHeaders(body !== undefined),
    cache: "no-store",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return toResult<T>(res);
}
