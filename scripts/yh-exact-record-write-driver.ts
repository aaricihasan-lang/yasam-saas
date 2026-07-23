// Yaşam Hafızası™ — BF-2B: EXACT-RECORD write driver (fail-closed, tek kayıt, iki kapı).
//
// Mevcut admin route'unu (POST /api/admin/yasam-hafizasi/index-page) header-bazlı auth ile
// yalnız EXACT modda çağırır:
//   Kapı 1 (dry-run) → doğrulanmış tek kayıt/tenant için eligible=1 kanıtlanır.
//   Kapı 2 (write)   → yalnız Kapı 1 tam PASS ise tek unit yazılır.
// Production route/adapter/migration DEĞİŞMEZ. Bu dosya hem CLI entry hem test edilebilir
// saf/enjekte katmanlar içerir (harness gerçek ağ YAPMAZ).
//
// GENEL SİSTEM: Esra'ya/kullanıcıya özel HİÇBİR sabit yoktur. Hedef (sourceKey/sourceId/
// tenantId) yalnız RUNTIME env parametresidir. İlk pilot allowlist tek kaynağı daraltır.
//
// GÜVENLİK SÖZLEŞMESİ (kilitli):
//   - `--execute` YOKSA hiçbir HTTP çağrısı yapılmaz.
//   - `--execute` TEK BAŞINA yeterli değildir; YH_WRITE_CONFIRMATION exact ifadeyle eşleşmeli.
//   - Auth yalnız env (YH_BASE_URL/YH_ADMIN_ID/YH_SESSION_TOKEN); loglanmaz, body/hata/rapora
//     yazılmaz. Service-role driver'a VERİLMEZ; driver DB'ye doğrudan bağlanmaz.
//   - Allowlist dışı sourceKey / bozuk UUID / sentetik / demo tenant → ağ çağrısından ÖNCE red.
//   - DELETE/cleanup/backfill/pagination YOKTUR. Yalnız mevcut admin API route'u kullanılır.
//
// Çalıştırma (BF-2D'de; BF-2B'de DEĞİL):
//   npx tsx scripts/yh-exact-record-write-driver.ts --execute

// ─── Compile-time sabitler (değiştirilemez) ───────────────────────────────────
export const ENDPOINT_PATH = "/api/admin/yasam-hafizasi/index-page" as const;
export const WRITE_CONFIRMATION_PHRASE = "WRITE_ONE_EXACT_YH_RECORD" as const;
export const REQUEST_TIMEOUT_MS = 120000 as const;

/** İlk pilot kaynak allowlist'i (Esra'ya özel DEĞİL; yalnız ilk kaynağı daraltır). */
export const SOURCE_ALLOWLIST: ReadonlySet<string> = new Set(["biyoenerji:symbols"]);

/** Sentetik (ADMIN_LIBRARY) ve demo tenant — exact pilot hedefi OLAMAZ (pre-network red). */
export const SYNTHETIC_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147" as const;
export const DEMO_TENANT_ID = "40f842a0-e3e8-448c-8971-9a938e1faccb" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Tipler ───────────────────────────────────────────────────────────────────
export interface DriverConfig {
  readonly baseUrl: string; // yalnız origin (https)
  readonly adminId: string;
  readonly sessionToken: string;
}
export interface DriverTarget {
  readonly sourceKey: string;
  readonly exactSourceId: string;
  readonly expectedTenantId: string;
}

export type EnvErrorCode =
  | "missing-base-url" | "invalid-base-url" | "base-url-not-https"
  | "base-url-has-credentials" | "base-url-has-path-query-hash"
  | "missing-admin-id" | "invalid-admin-id" | "missing-session-token";
export type EnvValidation =
  | { readonly ok: true; readonly config: DriverConfig }
  | { readonly ok: false; readonly code: EnvErrorCode };

export type TargetErrorCode =
  | "missing-confirmation" | "invalid-confirmation"
  | "missing-source-key" | "source-not-allowed"
  | "missing-source-id" | "invalid-source-id"
  | "missing-tenant-id" | "invalid-tenant-id"
  | "tenant-synthetic-forbidden" | "tenant-demo-forbidden";
export type TargetValidation =
  | { readonly ok: true; readonly target: DriverTarget }
  | { readonly ok: false; readonly code: TargetErrorCode };

export type CliErrorCode = "unknown-arg" | "duplicate-arg";
export type CliParse =
  | { readonly ok: true; readonly execute: boolean }
  | { readonly ok: false; readonly code: CliErrorCode };

/** Route SafePageSummary'nin exact-ilgili alt kümesi (driver doğrulaması için). */
export interface SafeExactPage {
  readonly fetched: number;
  readonly produced: number;
  readonly skipped: number;
  readonly eligibleUnits: number;
  readonly excludedDemo: number;
  readonly excludedSynthetic: number;
  readonly exactMode: boolean;
  readonly exactStatus: string | null;
}
export interface SafeWrite {
  readonly written: number;
  readonly plannedInsert: number;
  readonly plannedUpdate: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly completed: boolean;
  readonly errorCount: number;
}

export type ResponseErrorCode =
  | "http-401" | "http-403" | "http-409" | "http-429" | "http-500" | "http-503" | "http-error"
  | "bad-json" | "not-object" | "not-ok" | "wrong-mode" | "wrong-source"
  | "exact-mode-off" | "exact-status-not-ok" | "page-field-invalid"
  | "dryrun-write-not-null" | "dryrun-shape-invalid"
  | "write-missing" | "write-not-completed" | "write-failed" | "write-planned-not-one";

export type DryRunValidation =
  | { readonly ok: true; readonly page: SafeExactPage }
  | { readonly ok: false; readonly code: ResponseErrorCode };
export type WriteValidation =
  | { readonly ok: true; readonly page: SafeExactPage; readonly write: SafeWrite }
  | { readonly ok: false; readonly code: ResponseErrorCode };

export type RequestResult =
  | { readonly ok: true; readonly status: number; readonly text: string }
  | { readonly ok: false; readonly code: string };

// ─── Saf yardımcılar ───────────────────────────────────────────────────────────
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

// ─── 1) Env validation (saf; ağ çağrısından ÖNCE) ────────────────────────────
export function validateEnv(env: Readonly<Record<string, string | undefined>>): EnvValidation {
  const rawBase = (env.YH_BASE_URL ?? "").trim();
  if (rawBase.length === 0) return { ok: false, code: "missing-base-url" };
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    return { ok: false, code: "invalid-base-url" };
  }
  if (url.protocol !== "https:") return { ok: false, code: "base-url-not-https" };
  if (url.username !== "" || url.password !== "") return { ok: false, code: "base-url-has-credentials" };
  if (url.search !== "" || url.hash !== "" || (url.pathname !== "" && url.pathname !== "/")) {
    return { ok: false, code: "base-url-has-path-query-hash" };
  }

  const adminId = (env.YH_ADMIN_ID ?? "").trim();
  if (adminId.length === 0) return { ok: false, code: "missing-admin-id" };
  if (!isUuid(adminId)) return { ok: false, code: "invalid-admin-id" };

  const sessionToken = (env.YH_SESSION_TOKEN ?? "").trim();
  if (sessionToken.length === 0) return { ok: false, code: "missing-session-token" };

  return { ok: true, config: { baseUrl: url.origin, adminId, sessionToken } };
}

// ─── 2) Target validation (saf; ağ çağrısından ÖNCE; secret DEĞİL) ────────────
export function validateTargets(env: Readonly<Record<string, string | undefined>>): TargetValidation {
  const confirmation = (env.YH_WRITE_CONFIRMATION ?? "").trim();
  if (confirmation.length === 0) return { ok: false, code: "missing-confirmation" };
  if (confirmation !== WRITE_CONFIRMATION_PHRASE) return { ok: false, code: "invalid-confirmation" };

  const sourceKey = (env.YH_TARGET_SOURCE_KEY ?? "").trim();
  if (sourceKey.length === 0) return { ok: false, code: "missing-source-key" };
  if (!SOURCE_ALLOWLIST.has(sourceKey)) return { ok: false, code: "source-not-allowed" };

  const exactSourceId = (env.YH_TARGET_SOURCE_ID ?? "").trim();
  if (exactSourceId.length === 0) return { ok: false, code: "missing-source-id" };
  if (!isUuid(exactSourceId)) return { ok: false, code: "invalid-source-id" };

  const expectedTenantId = (env.YH_TARGET_TENANT_ID ?? "").trim();
  if (expectedTenantId.length === 0) return { ok: false, code: "missing-tenant-id" };
  if (!isUuid(expectedTenantId)) return { ok: false, code: "invalid-tenant-id" };
  if (expectedTenantId.toLowerCase() === SYNTHETIC_TENANT_ID) return { ok: false, code: "tenant-synthetic-forbidden" };
  if (expectedTenantId.toLowerCase() === DEMO_TENANT_ID) return { ok: false, code: "tenant-demo-forbidden" };

  return { ok: true, target: { sourceKey, exactSourceId, expectedTenantId } };
}

// ─── 3) CLI kapısı (saf) ─────────────────────────────────────────────────────
export function parseCliArgs(argv: readonly string[]): CliParse {
  let execute = false;
  const seen = new Set<string>();
  for (const a of argv) {
    if (a !== "--execute") return { ok: false, code: "unknown-arg" };
    if (seen.has(a)) return { ok: false, code: "duplicate-arg" };
    seen.add(a);
    execute = true;
  }
  return { ok: true, execute };
}

// ─── 4) Request body builder (saf; yalnız izinli exact alanlar) ────────────────
export function buildExactBody(target: DriverTarget, mode: "dry-run" | "write"): Record<string, unknown> {
  return {
    sourceKey: target.sourceKey,
    mode,
    exactSourceId: target.exactSourceId,
    expectedTenantId: target.expectedTenantId,
  };
}

// ─── 5) Response validation (saf) ─────────────────────────────────────────────
function httpStatusCode(status: number): ResponseErrorCode {
  if (status === 401) return "http-401";
  if (status === 403) return "http-403";
  if (status === 409) return "http-409";
  if (status === 429) return "http-429";
  if (status === 500) return "http-500";
  if (status === 503) return "http-503";
  return "http-error";
}

function parseExactPage(page: unknown): SafeExactPage | null {
  if (!isRecord(page)) return null;
  const { fetched, produced, skipped, eligibleUnits, excludedDemo, excludedSynthetic, exactMode, exactStatus } = page;
  if (
    !isNonNegInt(fetched) || !isNonNegInt(produced) || !isNonNegInt(skipped) ||
    !isNonNegInt(eligibleUnits) || !isNonNegInt(excludedDemo) || !isNonNegInt(excludedSynthetic)
  ) {
    return null;
  }
  if (typeof exactMode !== "boolean") return null;
  if (exactStatus !== null && typeof exactStatus !== "string") return null;
  return {
    fetched: fetched as number, produced: produced as number, skipped: skipped as number,
    eligibleUnits: eligibleUnits as number, excludedDemo: excludedDemo as number,
    excludedSynthetic: excludedSynthetic as number, exactMode, exactStatus: exactStatus as string | null,
  };
}

export function validateDryRunResponse(status: number, bodyText: string, target: DriverTarget): DryRunValidation {
  if (status !== 200) return { ok: false, code: httpStatusCode(status) };
  let parsed: unknown;
  try { parsed = JSON.parse(bodyText); } catch { return { ok: false, code: "bad-json" }; }
  if (!isRecord(parsed)) return { ok: false, code: "not-object" };
  if (parsed.ok !== true) return { ok: false, code: "not-ok" };
  if (parsed.mode !== "dry-run") return { ok: false, code: "wrong-mode" };
  if (parsed.sourceKey !== target.sourceKey) return { ok: false, code: "wrong-source" };
  if (parsed.write !== null) return { ok: false, code: "dryrun-write-not-null" };

  const page = parseExactPage(parsed.page);
  if (page === null) return { ok: false, code: "page-field-invalid" };
  if (!page.exactMode) return { ok: false, code: "exact-mode-off" };
  if (page.exactStatus !== "ok") return { ok: false, code: "exact-status-not-ok" };

  // Kapı 1 kesin invariant: tam 1 eligible, dışlama yok.
  if (
    page.fetched !== 1 || page.produced !== 1 || page.skipped !== 0 ||
    page.eligibleUnits !== 1 || page.excludedDemo !== 0 || page.excludedSynthetic !== 0
  ) {
    return { ok: false, code: "dryrun-shape-invalid" };
  }
  return { ok: true, page };
}

export function validateWriteResponse(status: number, bodyText: string, target: DriverTarget): WriteValidation {
  if (status !== 200) return { ok: false, code: httpStatusCode(status) };
  let parsed: unknown;
  try { parsed = JSON.parse(bodyText); } catch { return { ok: false, code: "bad-json" }; }
  if (!isRecord(parsed)) return { ok: false, code: "not-object" };
  if (parsed.ok !== true) return { ok: false, code: "not-ok" };
  if (parsed.mode !== "write") return { ok: false, code: "wrong-mode" };
  if (parsed.sourceKey !== target.sourceKey) return { ok: false, code: "wrong-source" };

  const page = parseExactPage(parsed.page);
  if (page === null) return { ok: false, code: "page-field-invalid" };
  if (!page.exactMode) return { ok: false, code: "exact-mode-off" };
  if (page.exactStatus !== "ok") return { ok: false, code: "exact-status-not-ok" };
  if (page.eligibleUnits !== 1) return { ok: false, code: "dryrun-shape-invalid" };

  const w = parsed.write;
  if (!isRecord(w)) return { ok: false, code: "write-missing" };
  const { written, plannedInsert, plannedUpdate, unchanged, failed, completed, errors } = w;
  if (
    !isNonNegInt(written) || !isNonNegInt(plannedInsert) || !isNonNegInt(plannedUpdate) ||
    !isNonNegInt(unchanged) || !isNonNegInt(failed)
  ) {
    return { ok: false, code: "page-field-invalid" };
  }
  const errorCount = Array.isArray(errors) ? errors.length : -1;
  if (completed !== true || errorCount !== 0) return { ok: false, code: "write-not-completed" };
  if ((failed as number) !== 0) return { ok: false, code: "write-failed" };
  // Exact: planned toplamı tam 1 (insert|update|unchanged toplamı bir kaydı temsil eder).
  if ((plannedInsert as number) + (plannedUpdate as number) + (unchanged as number) !== 1) {
    return { ok: false, code: "write-planned-not-one" };
  }
  return {
    ok: true, page,
    write: {
      written: written as number, plannedInsert: plannedInsert as number,
      plannedUpdate: plannedUpdate as number, unchanged: unchanged as number,
      failed: failed as number, completed: true, errorCount: 0,
    },
  };
}

// ─── 6) İki kapılı orkestrasyon (saf; enjekte deps) ───────────────────────────
export interface TwoGateDeps {
  postExact: (mode: "dry-run" | "write") => Promise<RequestResult>;
  logger: {
    info(stage: string): void;
    gate(name: string, status: number): void;
    stop(code: string): void;
    done(summary: Readonly<Record<string, number | boolean | string>>): void;
  };
}
export interface TwoGateResult {
  readonly ok: boolean;
  readonly stopCode: string | null;
  readonly gate1Pass: boolean;
  readonly gate2Pass: boolean;
}

export async function runExactTwoGate(target: DriverTarget, deps: TwoGateDeps): Promise<TwoGateResult> {
  const stop = (code: string): TwoGateResult => {
    deps.logger.stop(code);
    return { ok: false, stopCode: code, gate1Pass: false, gate2Pass: false };
  };

  // ── Kapı 1: exact dry-run ──────────────────────────────────────────────────
  deps.logger.info("gate1-dryrun-start");
  const r1 = await deps.postExact("dry-run");
  if (!r1.ok) return stop(`gate1:${r1.code}`);
  deps.logger.gate("gate1-dryrun", r1.status);
  const v1 = validateDryRunResponse(r1.status, r1.text, target);
  if (!v1.ok) return stop(`gate1:${v1.code}`);
  deps.logger.info("gate1-dryrun-pass");

  // ── Kapı 2: yalnız Kapı 1 PASS ise exact write ─────────────────────────────
  deps.logger.info("gate2-write-start");
  const r2 = await deps.postExact("write");
  if (!r2.ok) {
    deps.logger.stop(`gate2:${r2.code}`);
    return { ok: false, stopCode: `gate2:${r2.code}`, gate1Pass: true, gate2Pass: false };
  }
  deps.logger.gate("gate2-write", r2.status);
  const v2 = validateWriteResponse(r2.status, r2.text, target);
  if (!v2.ok) {
    deps.logger.stop(`gate2:${v2.code}`);
    return { ok: false, stopCode: `gate2:${v2.code}`, gate1Pass: true, gate2Pass: false };
  }
  deps.logger.done({
    written: v2.write.written, plannedInsert: v2.write.plannedInsert,
    plannedUpdate: v2.write.plannedUpdate, unchanged: v2.write.unchanged, completed: v2.write.completed,
  });
  return { ok: true, stopCode: null, gate1Pass: true, gate2Pass: true };
}

// ─── 7) Güvenli logger (gerçek) ──────────────────────────────────────────────
export function createConsoleLogger(): TwoGateDeps["logger"] {
  return {
    info: (stage) => console.log(`[exact-write] ${stage}`),
    gate: (name, status) => console.log(`[exact-write] ${name} status=${status}`),
    stop: (code) => console.error(`[exact-write] STOP code=${code}`),
    done: (summary) => console.log(`[exact-write] done ${JSON.stringify(summary)}`),
  };
}

// ─── 8) Gerçek IO: fetch tabanlı postExact (harness KULLANMAZ) ────────────────
export function createHttpPostExact(
  config: DriverConfig,
  target: DriverTarget,
): (mode: "dry-run" | "write") => Promise<RequestResult> {
  const url = config.baseUrl + ENDPOINT_PATH;
  return async (mode) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-admin-id": config.adminId,
          "x-session-token": config.sessionToken,
        },
        body: JSON.stringify(buildExactBody(target, mode)),
      });
    } catch (err) {
      const aborted = isRecord(err) && err.name === "AbortError";
      return { ok: false, code: aborted ? "timeout" : "network-error" };
    } finally {
      clearTimeout(timer);
    }
    let text = "";
    try {
      text = await res.text();
    } catch {
      return { ok: false, code: "network-error" };
    }
    return { ok: true, status: res.status, text }; // body loglanmaz
  };
}

// ─── 9) CLI main entry ───────────────────────────────────────────────────────
function usage(): void {
  console.log(
    [
      "Yaşam Hafızası™ exact-record write driver (tek kayıt; iki kapı; dry-run → write).",
      "Kullanım:",
      "  npx tsx scripts/yh-exact-record-write-driver.ts --execute",
      "Zorunlu env (değer GÖSTERİLMEZ): YH_BASE_URL, YH_ADMIN_ID, YH_SESSION_TOKEN",
      "Zorunlu hedef env: YH_TARGET_SOURCE_KEY, YH_TARGET_SOURCE_ID, YH_TARGET_TENANT_ID,",
      `                    YH_WRITE_CONFIRMATION=${WRITE_CONFIRMATION_PHRASE}`,
      "Argümansız çalıştırma ağ çağrısı YAPMAZ.",
    ].join("\n"),
  );
}

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  const cli = parseCliArgs(argv);
  if (!cli.ok) {
    console.error(`[exact-write] arg hatası: ${cli.code}`);
    usage();
    return 2;
  }
  if (!cli.execute) {
    usage(); // argümansız → no-op; ağ çağrısı YOK
    return 0;
  }

  // Hedef + auth doğrulaması (ağ çağrısından ÖNCE; secret değeri yazılmaz).
  const targetRes = validateTargets(env);
  if (!targetRes.ok) {
    console.error(`[exact-write] hedef hatası: ${targetRes.code}`);
    return 2;
  }
  const envRes = validateEnv(env);
  if (!envRes.ok) {
    console.error(`[exact-write] env hatası: ${envRes.code}`);
    return 2;
  }

  const logger = createConsoleLogger();
  logger.info("start");
  const result = await runExactTwoGate(targetRes.target, {
    postExact: createHttpPostExact(envRes.config, targetRes.target),
    logger,
  });
  return result.ok ? 0 : 1;
}

// Yalnız doğrudan çalıştırıldığında main koşar (import edildiğinde DEĞİL → harness tetiklemez).
const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (/yh-exact-record-write-driver(\.(ts|mjs|js))?$/.test(entry)) {
  void main(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}
