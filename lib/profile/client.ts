/**
 * UZMAN PROFİLİ (F1) — tarayıcı istemcisi (/api/settings/profile).
 * Kimlik: x-user-id + koşullu oturum başlığı (sessionTokenHeader; web'de HttpOnly cookie). Sunucu kodu içe aktarılmaz.
 */
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import type { FieldErrors, ProfileFields } from "./schema";

const URL_ = "/api/settings/profile";

export type ProfileView = ProfileFields & { logoSource: "none" | "workspace" | "custom"; logoAssetId: string | null };
export type ProfileResponse = {
  profile: ProfileView;
  version: number;
  updatedAt: string | null;
  account: { fullName: string | null; email: string | null };
  readOnly: boolean;
};

export type ProfileResult =
  | { kind: "ok"; value: ProfileResponse }
  | { kind: "conflict"; current: ProfileResponse; error: string }
  | { kind: "invalid"; error: string; path?: string; fields: FieldErrors }
  | { kind: "demo"; error: string }
  | { kind: "error"; status: number; code?: string; error: string };

function pickView(b: Record<string, unknown>): ProfileResponse {
  return {
    profile: b.profile as ProfileView,
    version: Number(b.version ?? 0),
    updatedAt: typeof b.updatedAt === "string" ? b.updatedAt : null,
    account: (b.account as ProfileResponse["account"]) ?? { fullName: null, email: null },
    readOnly: b.readOnly === true,
  };
}

async function call(init: RequestInit, signal?: AbortSignal): Promise<ProfileResult> {
  let res: Response;
  try {
    res = await fetch(URL_, {
      ...init, signal, cache: "no-store",
      headers: { "x-user-id": readYasamUser()?.id ?? "", ...sessionTokenHeader(), ...((init.headers as Record<string, string>) ?? {}) },
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return { kind: "error", status: 0, error: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin." };
  }
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* boş / JSON olmayan gövde */ }
  const error = typeof body.error === "string" ? body.error : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";
  if (res.ok && body.profile) return { kind: "ok", value: pickView(body) };
  if (res.status === 409 && body.code === "VERSION_CONFLICT" && body.profile) return { kind: "conflict", current: pickView(body), error };
  if (res.status === 400) return { kind: "invalid", error, path: typeof body.path === "string" ? body.path : undefined, fields: (body.fields as FieldErrors) ?? {} };
  if (res.status === 403 && body.demo === true) return { kind: "demo", error };
  return { kind: "error", status: res.status, code: typeof body.code === "string" ? body.code : undefined, error };
}

export const fetchProfile = (signal?: AbortSignal) => call({ method: "GET" }, signal);

export function saveProfile(expectedVersion: number, profile: Partial<ProfileFields>): Promise<ProfileResult> {
  return call({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion, profile }) });
}
