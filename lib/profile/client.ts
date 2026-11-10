/**
 * UZMAN PROFİLİ (F1) — tarayıcı istemcisi (/api/settings/profile).
 * Kimlik: x-user-id + koşullu oturum başlığı (sessionTokenHeader; web'de HttpOnly cookie). Sunucu kodu içe aktarılmaz.
 */
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import type { FieldErrors, ProfileFields } from "./schema";
import type { LogoSourceValue, LogoStatus } from "./logoSchema";

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

// ── F2: rapor logosu seçimi (/api/settings/profile/logo) ─────────────────────

export type LogoView = {
  logo: { source: LogoSourceValue; assetId: string | null; status: LogoStatus };
  workspace: { access: boolean; logoAssetId: string | null };
  checkFailed: boolean;
  brandingEnabled: boolean;
  version: number;
  readOnly: boolean;
};
export type LogoResult =
  | { kind: "ok"; value: LogoView }
  | { kind: "conflict"; current: LogoView; error: string }
  | { kind: "demo"; error: string }
  | { kind: "error"; status: number; code?: string; error: string };

function pickLogo(b: Record<string, unknown>): LogoView {
  const w = (b.workspace as LogoView["workspace"] | undefined) ?? { access: false, logoAssetId: null };
  return {
    logo: b.logo as LogoView["logo"],
    workspace: { access: w.access === true, logoAssetId: typeof w.logoAssetId === "string" ? w.logoAssetId : null },
    checkFailed: b.checkFailed === true,
    brandingEnabled: b.brandingEnabled === true,
    version: Number(b.version ?? 0),
    readOnly: b.readOnly === true,
  };
}

async function callLogo(init: RequestInit, signal?: AbortSignal): Promise<LogoResult> {
  let res: Response;
  try {
    res = await fetch(`${URL_}/logo`, {
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
  if (res.ok && body.logo) return { kind: "ok", value: pickLogo(body) };
  if (res.status === 409 && body.code === "VERSION_CONFLICT" && body.logo) return { kind: "conflict", current: pickLogo(body), error };
  if (res.status === 403 && body.demo === true) return { kind: "demo", error };
  return { kind: "error", status: res.status, code: typeof body.code === "string" ? body.code : undefined, error };
}

export const fetchLogo = (signal?: AbortSignal) => callLogo({ method: "GET" }, signal);

export function saveLogo(expectedVersion: number, source: LogoSourceValue, assetId: string | null): Promise<LogoResult> {
  const body = source === "custom" ? { source, assetId, expectedVersion } : { source, expectedVersion };
  return callLogo({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
