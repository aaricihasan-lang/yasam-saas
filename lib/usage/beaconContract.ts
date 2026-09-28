/**
 * USAGE360 — İSTEMCİ BEACON SÖZLEŞMESİ (saf, katı doğrulama).
 *
 * Gövde en fazla 512 byte. Yalnız aşağıdaki anahtarlar; bilinmeyen anahtar (user_id,
 * tenant_id, auth_session_id, url, path, message … dahil) → 400. Tüm değerler enum/biçim
 * kontrollüdür; serbest metin taşınamaz. CREATE/UPDATE/DELETE istemciden KABUL EDİLMEZ.
 *
 *   { "kind": "ping", "module"?: ModuleGateKey }
 *   { "kind": "module_opened", "module": ModuleGateKey }
 *   { "kind": "report_exported", "module": ModuleGateKey, "subEntity"?: string, "nonce"?: string }
 *   { "kind": "action_failed", "module": ModuleGateKey, "errorClass": ClientErrorClass,
 *     "failedAction"?: "report_exported" | "file_uploaded", "subEntity"?: string, "nonce"?: string }
 * subEntity yalnız o modülün kanonik allowlist'inden (USAGE_SUB_ENTITIES).
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";
import {
  CLIENT_BEACON_KINDS,
  CLIENT_ERROR_CLASSES,
  isAllowedSubEntity,
  isUsageModuleKey,
  type ClientBeaconKind,
  type ClientErrorClass,
  type FailableUsageAction,
} from "@/lib/usage/usageTaxonomy";

export const BEACON_MAX_BYTES = 512;

/** İstemcinin bildirebileceği başarısız eylemler (istemcide gerçekleşen işler). */
const CLIENT_FAILED_ACTIONS = ["report_exported", "file_uploaded"] as const satisfies readonly FailableUsageAction[];
type ClientFailedAction = (typeof CLIENT_FAILED_ACTIONS)[number];

const ALLOWED_KEYS: Record<ClientBeaconKind, readonly string[]> = {
  ping: ["kind", "module"],
  module_opened: ["kind", "module"],
  report_exported: ["kind", "module", "subEntity", "nonce"],
  action_failed: ["kind", "module", "errorClass", "failedAction", "subEntity", "nonce"],
};

const NONCE_RE = /^[a-z0-9]{8,32}$/;

export type BeaconPayload =
  | { kind: "ping"; module: ModuleGateKey | null }
  | { kind: "module_opened"; module: ModuleGateKey }
  | { kind: "report_exported"; module: ModuleGateKey; subEntity: string | null; nonce: string | null }
  | {
      kind: "action_failed";
      module: ModuleGateKey;
      errorClass: ClientErrorClass;
      failedAction: ClientFailedAction | null;
      subEntity: string | null;
      nonce: string | null;
    };

export type BeaconParseResult =
  | { ok: true; value: BeaconPayload }
  | { ok: false; status: 400 | 413; code: string };

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function parseBeaconBody(raw: string): BeaconParseResult {
  if (byteLength(raw) > BEACON_MAX_BYTES) return { ok: false, status: 413, code: "too_large" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, code: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, code: "invalid_shape" };
  }
  const body = parsed as Record<string, unknown>;
  const kind = body.kind;
  if (typeof kind !== "string" || !(CLIENT_BEACON_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, status: 400, code: "invalid_kind" };
  }
  const k = kind as ClientBeaconKind;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS[k].includes(key)) return { ok: false, status: 400, code: "unknown_property" };
  }

  const mod = body.module;
  if (mod !== undefined && mod !== null && !isUsageModuleKey(mod)) {
    return { ok: false, status: 400, code: "invalid_module" };
  }
  const nonce = body.nonce;
  if (nonce !== undefined && (typeof nonce !== "string" || !NONCE_RE.test(nonce))) {
    return { ok: false, status: 400, code: "invalid_nonce" };
  }

  if (k === "ping") {
    return { ok: true, value: { kind: "ping", module: isUsageModuleKey(mod) ? mod : null } };
  }
  if (!isUsageModuleKey(mod)) return { ok: false, status: 400, code: "module_required" };

  if (k === "module_opened") return { ok: true, value: { kind: "module_opened", module: mod } };

  const sub = body.subEntity;
  if (sub !== undefined && (typeof sub !== "string" || !isAllowedSubEntity(mod, sub))) {
    return { ok: false, status: 400, code: "invalid_sub_entity" };
  }
  const subEntity = (sub as string | undefined) ?? null;
  if (k === "report_exported") {
    return { ok: true, value: { kind: "report_exported", module: mod, subEntity, nonce: (nonce as string | undefined) ?? null } };
  }

  const errorClass = body.errorClass;
  if (typeof errorClass !== "string" || !(CLIENT_ERROR_CLASSES as readonly string[]).includes(errorClass)) {
    return { ok: false, status: 400, code: "invalid_error_class" };
  }
  const failedAction = body.failedAction;
  if (
    failedAction !== undefined &&
    (typeof failedAction !== "string" || !(CLIENT_FAILED_ACTIONS as readonly string[]).includes(failedAction))
  ) {
    return { ok: false, status: 400, code: "invalid_failed_action" };
  }
  return {
    ok: true,
    value: {
      kind: "action_failed",
      module: mod,
      errorClass: errorClass as ClientErrorClass,
      failedAction: (failedAction as ClientFailedAction | undefined) ?? null,
      subEntity,
      nonce: (nonce as string | undefined) ?? null,
    },
  };
}
