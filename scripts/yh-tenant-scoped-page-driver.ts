// Yaşam Hafızası™ — BF-4B: TENANT-SCOPED page driver (Model C; fail-closed; cursor+state).
//
// Mevcut admin route'u (POST /api/admin/yasam-hafizasi/index-page) header-bazlı auth ile
// YALNIZ tenant-scoped modda, sayfa sayfa çağırır. Production route/adapter/migration
// DEĞİŞMEZ. Bu dosya hem CLI entry hem test edilebilir SAF/enjekte katmanlar içerir
// (harness gerçek ağ YAPMAZ; pure state-machine + atomik FS ile doğrulanır).
//
// GÜVENLİK SÖZLEŞMESİ (kilitli):
//   - default mode dry-run; write İÇİN hem `--mode write` HEM `--confirm-write` zorunlu.
//   - Auth yalnız env (YH_BASE_URL/YH_ADMIN_ID/YH_SESSION_TOKEN); loglanmaz, state/body/
//     hata mesajına yazılmaz. sourceKey/scopedTenantId RUNTIME arg'dır (gömülü UUID YOK).
//   - State (driver/version/mode/sourceKey/scopedTenantId) çalışma parametreleriyle BİREBİR
//     eşleşmezse fail-closed (dry-run state write'a, write state dry-run'a KULLANILAMAZ).
//   - completed===true → hiçbir ağ çağrısı yapılmaz.
//   - State YALNIZ tam doğrulama sonrası atomik (temp+rename) yazılır; timeout/503/parse/
//     echo-mismatch/geçersiz-geçiş → state DEĞİŞMEZ.
//
// Çalıştırma (yalnız kasıtlı):
//   npx tsx scripts/yh-tenant-scoped-page-driver.ts --source <key> --tenant <uuid> --state <path>
//   npx tsx scripts/yh-tenant-scoped-page-driver.ts --source <key> --tenant <uuid> --state <path> --mode write --confirm-write

import { promises as fs } from "node:fs";
import * as path from "node:path";

// ─── Compile-time sabitler ────────────────────────────────────────────────────
export const DRIVER_NAME = "yh-tenant-scoped-page" as const;
export const STATE_VERSION = 2 as const;
// BF-4C-PRE: `--limit` ve `--max-pages` RUNTIME arg'dır; bunlar YALNIZ ÜST SINIR
// sabitleridir (sabit request değeri DEĞİL). Request limit'i doğrulanmış CLI'dan gelir.
export const MAX_LIMIT = 500 as const;
export const MAX_PAGES = 500 as const;
export const REQUEST_TIMEOUT_MS = 120000 as const;
export const ENDPOINT_PATH = "/api/admin/yasam-hafizasi/index-page" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Tipler ───────────────────────────────────────────────────────────────────
export type DriverMode = "dry-run" | "write";

export interface RunParams {
  readonly mode: DriverMode;
  readonly sourceKey: string;
  readonly scopedTenantId: string;
  readonly limit: number; // BF-4C-PRE: doğrulanmış CLI --limit (1..MAX_LIMIT)
  readonly maxPages: number; // BF-4C-PRE: doğrulanmış CLI --max-pages (1..MAX_PAGES); hard istek tavanı
  readonly statePath: string;
  readonly confirmWrite: boolean;
}

export interface DriverState {
  readonly driver: string;
  readonly version: number;
  readonly mode: string;
  readonly sourceKey: string;
  readonly scopedTenantId: string;
  readonly nextCursor: string | null;
  readonly completed: boolean;
}

export type CliErrorCode =
  | "unknown-arg" | "duplicate-arg" | "missing-value" | "invalid-mode"
  | "missing-source" | "missing-tenant" | "invalid-tenant" | "missing-state"
  | "missing-limit" | "invalid-limit" | "missing-max-pages" | "invalid-max-pages"
  | "write-needs-confirm";
export type CliParse =
  | { readonly ok: true; readonly params: RunParams }
  | { readonly ok: false; readonly code: CliErrorCode };

export type StateReason =
  | "invalid-state-shape" | "driver-mismatch" | "version-mismatch"
  | "mode-mismatch" | "source-mismatch" | "tenant-mismatch";
export type StateValidation =
  | { readonly ok: true; readonly state: DriverState }
  | { readonly ok: false; readonly reason: StateReason };

export type NextStateReason =
  | "not-object" | "not-ok" | "mode-mismatch" | "source-mismatch" | "tenant-mismatch"
  | "page-missing" | "page-field-invalid" | "dryrun-write-not-null" | "write-missing"
  | "write-not-clean" | "hasmore-empty-cursor" | "cursor-repeat";
export type NextStateResult =
  | { readonly ok: true; readonly nextState: DriverState }
  | { readonly ok: false; readonly reason: NextStateReason };

export type RequestResult =
  | { readonly ok: true; readonly status: number; readonly text: string }
  | { readonly ok: false; readonly code: string };

export interface StateStore {
  read(): Promise<unknown | null>;
  write(state: DriverState): Promise<void>;
}

export interface SafeLogger {
  info(stage: string): void;
  page(pageNo: number, hasMore: boolean, completed: boolean): void;
  stop(code: string): void;
  done(summary: Readonly<Record<string, number | boolean | string>>): void;
}

export interface PagingDeps {
  readonly params: RunParams;
  postPage: (afterId: string | null) => Promise<RequestResult>;
  store: StateStore;
  logger: SafeLogger;
}
export interface PagingResult {
  readonly completed: boolean;
  readonly stopped: boolean;
  readonly stopCode: string | null;
  readonly pagesProcessed: number;
}

// ─── Saf yardımcılar ───────────────────────────────────────────────────────────
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

// ─── 1) CLI kapısı (saf) ──────────────────────────────────────────────────────

/**
 * Yalnız tam sayı, 1..max kabul eder (coercion YOK): boş / ondalık / negatif / işaretli /
 * whitespace / NaN / > max reddedilir → null. `/^[0-9]+$/` yalnız salt rakam kabul ettiği
 * için "10.5", "-1", "0x10", " 3", "" ve "1e2" reddedilir; "0" → 0 < 1 → null.
 */
function parseBoundedInt(val: string, max: number): number | null {
  if (!/^[0-9]+$/.test(val)) return null;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

export function parseArgs(argv: readonly string[]): CliParse {
  let mode: DriverMode = "dry-run";
  let confirmWrite = false;
  let statePath: string | null = null;
  let sourceKey: string | null = null;
  let scopedTenantId: string | null = null;
  let limit: number | null = null;
  let maxPages: number | null = null;
  const seen = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--confirm-write") {
      if (seen.has(a)) return { ok: false, code: "duplicate-arg" };
      seen.add(a);
      confirmWrite = true;
      continue;
    }
    if (
      a === "--mode" || a === "--state" || a === "--source" ||
      a === "--tenant" || a === "--limit" || a === "--max-pages"
    ) {
      if (seen.has(a)) return { ok: false, code: "duplicate-arg" };
      seen.add(a);
      const val = argv[i + 1];
      i += 1;
      if (val === undefined || val.startsWith("--")) return { ok: false, code: "missing-value" };
      if (a === "--mode") {
        if (val !== "dry-run" && val !== "write") return { ok: false, code: "invalid-mode" };
        mode = val;
      } else if (a === "--state") {
        statePath = val;
      } else if (a === "--source") {
        sourceKey = val;
      } else if (a === "--tenant") {
        scopedTenantId = val;
      } else if (a === "--limit") {
        const n = parseBoundedInt(val, MAX_LIMIT);
        if (n === null) return { ok: false, code: "invalid-limit" };
        limit = n;
      } else {
        const n = parseBoundedInt(val, MAX_PAGES);
        if (n === null) return { ok: false, code: "invalid-max-pages" };
        maxPages = n;
      }
      continue;
    }
    return { ok: false, code: "unknown-arg" };
  }

  if (sourceKey === null || sourceKey.length === 0) return { ok: false, code: "missing-source" };
  if (scopedTenantId === null) return { ok: false, code: "missing-tenant" };
  if (!isUuid(scopedTenantId)) return { ok: false, code: "invalid-tenant" };
  if (statePath === null || statePath.length === 0) return { ok: false, code: "missing-state" };
  // BF-4C-PRE: --limit ve --max-pages AÇIKÇA verilmek zorundadır (fail-closed).
  if (limit === null) return { ok: false, code: "missing-limit" };
  if (maxPages === null) return { ok: false, code: "missing-max-pages" };
  // write İÇİN çift onay zorunlu (mode write + confirm-write).
  if (mode === "write" && !confirmWrite) return { ok: false, code: "write-needs-confirm" };

  return { ok: true, params: { mode, sourceKey, scopedTenantId, limit, maxPages, statePath, confirmWrite } };
}

// ─── 2) Başlangıç state + run-param eşleşme doğrulaması (saf) ─────────────────
export function initState(params: RunParams): DriverState {
  return {
    driver: DRIVER_NAME,
    version: STATE_VERSION,
    mode: params.mode,
    sourceKey: params.sourceKey,
    scopedTenantId: params.scopedTenantId,
    nextCursor: null,
    completed: false,
  };
}

export function validateStateForRun(raw: unknown, params: RunParams): StateValidation {
  if (!isRecord(raw)) return { ok: false, reason: "invalid-state-shape" };
  if (raw.driver !== DRIVER_NAME) return { ok: false, reason: "driver-mismatch" };
  if (raw.version !== STATE_VERSION) return { ok: false, reason: "version-mismatch" };
  if (
    typeof raw.mode !== "string" ||
    typeof raw.sourceKey !== "string" ||
    typeof raw.scopedTenantId !== "string"
  ) {
    return { ok: false, reason: "invalid-state-shape" };
  }
  const cursorOk = raw.nextCursor === null || typeof raw.nextCursor === "string";
  if (!cursorOk || typeof raw.completed !== "boolean") {
    return { ok: false, reason: "invalid-state-shape" };
  }
  // Run-param eşleşmesi (fail-closed): dry-run state write'a, write state dry-run'a KULLANILMAZ.
  if (raw.mode !== params.mode) return { ok: false, reason: "mode-mismatch" };
  if (raw.sourceKey !== params.sourceKey) return { ok: false, reason: "source-mismatch" };
  if (raw.scopedTenantId !== params.scopedTenantId) return { ok: false, reason: "tenant-mismatch" };

  return {
    ok: true,
    state: {
      driver: DRIVER_NAME,
      version: STATE_VERSION,
      mode: raw.mode,
      sourceKey: raw.sourceKey,
      scopedTenantId: raw.scopedTenantId,
      nextCursor: raw.nextCursor as string | null,
      completed: raw.completed as boolean,
    },
  };
}

// ─── 3) Yanıt → sonraki state (saf; yalnız tam doğrulama sonrası ilerler) ──────
export function computeNextState(
  prev: DriverState,
  responseRaw: unknown,
  params: RunParams,
): NextStateResult {
  if (!isRecord(responseRaw)) return { ok: false, reason: "not-object" };
  if (responseRaw.ok !== true) return { ok: false, reason: "not-ok" };
  // Echo eşleşmesi (mode/source/tenant birebir).
  if (responseRaw.mode !== params.mode) return { ok: false, reason: "mode-mismatch" };
  if (responseRaw.sourceKey !== params.sourceKey) return { ok: false, reason: "source-mismatch" };
  if (responseRaw.scopedTenantId !== params.scopedTenantId) return { ok: false, reason: "tenant-mismatch" };

  const page = responseRaw.page;
  if (!isRecord(page)) return { ok: false, reason: "page-missing" };
  const nextCursor = page.nextCursor;
  const hasMore = page.hasMore;
  if (nextCursor !== null && typeof nextCursor !== "string") return { ok: false, reason: "page-field-invalid" };
  if (typeof hasMore !== "boolean") return { ok: false, reason: "page-field-invalid" };

  if (params.mode === "dry-run") {
    if (responseRaw.write !== null) return { ok: false, reason: "dryrun-write-not-null" };
  } else {
    // write: yalnız kısmi-write YOK ve failed===0 ise ilerler.
    const w = responseRaw.write;
    if (!isRecord(w)) return { ok: false, reason: "write-missing" };
    const errorCount = Array.isArray(w.errors) ? w.errors.length : -1;
    if (w.completed !== true || errorCount !== 0) return { ok: false, reason: "write-not-clean" };
    if (!(typeof w.failed === "number" && w.failed === 0)) return { ok: false, reason: "write-not-clean" };
  }

  // Geçişler.
  if (hasMore === true) {
    if (typeof nextCursor !== "string" || nextCursor.length === 0) {
      return { ok: false, reason: "hasmore-empty-cursor" };
    }
    if (nextCursor === prev.nextCursor) return { ok: false, reason: "cursor-repeat" }; // sonsuz döngü guard
    return { ok: true, nextState: { ...prev, nextCursor, completed: false } };
  }
  // hasMore === false → tamamlandı.
  return { ok: true, nextState: { ...prev, nextCursor: null, completed: true } };
}

// ─── 4) Request body builder (saf; yalnız izinli scoped alanlar) ──────────────
export function buildRequestBody(params: RunParams, afterId: string | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    sourceKey: params.sourceKey,
    mode: params.mode,
    scopedTenantId: params.scopedTenantId,
    limit: params.limit, // BF-4C-PRE: doğrulanmış runtime --limit (sabit LIMIT sızmaz)
  };
  if (afterId !== null) base.afterId = afterId;
  return base;
}

// ─── 5) Orkestrasyon (saf mantık; enjekte deps) ───────────────────────────────
export async function runScopedPaging(deps: PagingDeps): Promise<PagingResult> {
  const { params, store, logger } = deps;
  const finish = (stopCode: string | null, completed: boolean, pages: number): PagingResult => ({
    completed,
    stopped: stopCode !== null,
    stopCode,
    pagesProcessed: pages,
  });

  // State yükle (yoksa init).
  const raw = await store.read();
  let state: DriverState;
  if (raw === null) {
    state = initState(params);
  } else {
    const vs = validateStateForRun(raw, params);
    if (!vs.ok) {
      logger.stop(vs.reason);
      return finish(vs.reason, false, 0);
    }
    state = vs.state;
  }

  // completed → hiçbir ağ çağrısı yapılmaz.
  if (state.completed) {
    logger.info("already-completed");
    return finish(null, true, 0);
  }

  let pages = 0;
  for (;;) {
    const res = await deps.postPage(state.nextCursor);
    if (!res.ok) {
      logger.stop(res.code);
      return finish(res.code, false, pages); // state DEĞİŞMEZ
    }
    if (res.status !== 200) {
      logger.stop(`http-${res.status}`);
      return finish(`http-${res.status}`, false, pages); // 503 vb → state DEĞİŞMEZ
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      logger.stop("bad-json");
      return finish("bad-json", false, pages); // parse hatası → state DEĞİŞMEZ
    }

    const next = computeNextState(state, parsed, params);
    if (!next.ok) {
      logger.stop(next.reason);
      return finish(next.reason, false, pages); // geçersiz geçiş → state DEĞİŞMEZ
    }

    // YALNIZ tam doğrulama sonrası atomik yaz.
    await store.write(next.nextState);
    state = next.nextState;
    pages += 1;
    logger.page(pages, !state.completed, state.completed);

    if (state.completed) {
      logger.info("completed");
      return finish(null, true, pages);
    }
    // BF-4C-PRE HARD CAP: bir sonraki HTTP çağrısından ÖNCE kontrol. maxPages'e ulaşıldıysa
    // ilk response hasMore=true olsa bile ikinci istek GÖNDERİLMEZ (off-by-one yok; state
    // yukarıda zaten atomik ilerledi, completed=false → kontrollü parti sonu, HATA DEĞİL).
    if (pages >= params.maxPages) {
      logger.stop("max-pages");
      return finish("max-pages", false, pages);
    }
  }
}

// ─── 6) Gerçek FS state store (atomik: temp+rename) ───────────────────────────
export function createFsStateStore(filePath: string): StateStore {
  return {
    path: filePath,
    read: async () => {
      let text: string;
      try {
        text = await fs.readFile(filePath, "utf8");
      } catch {
        return null;
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    },
    write: async (state) => {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
      await fs.rename(tmp, filePath); // atomik replace
    },
  } as StateStore & { path: string };
}

// ─── 7) Env auth (saf; ağ çağrısından ÖNCE; secret DEĞER yazılmaz) ────────────
export interface DriverConfig {
  readonly baseUrl: string;
  readonly adminId: string;
  readonly sessionToken: string;
}
export type EnvErrorCode =
  | "missing-base-url" | "invalid-base-url" | "base-url-not-https"
  | "base-url-has-credentials" | "base-url-has-path-query-hash"
  | "missing-admin-id" | "invalid-admin-id" | "missing-session-token";
export type EnvValidation =
  | { readonly ok: true; readonly config: DriverConfig }
  | { readonly ok: false; readonly code: EnvErrorCode };

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

// ─── 8) Gerçek IO: fetch tabanlı postPage (harness KULLANMAZ) ─────────────────
export function createHttpPostPage(
  config: DriverConfig,
  params: RunParams,
): (afterId: string | null) => Promise<RequestResult> {
  const url = config.baseUrl + ENDPOINT_PATH;
  return async (afterId) => {
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
        body: JSON.stringify(buildRequestBody(params, afterId)),
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

// ─── 9) Güvenli logger (gerçek) ──────────────────────────────────────────────
export function createConsoleLogger(): SafeLogger {
  return {
    info: (stage) => console.log(`[tenant-scoped-page] ${stage}`),
    page: (pageNo, hasMore, completed) =>
      console.log(`[tenant-scoped-page] page=${pageNo} hasMore=${hasMore} completed=${completed}`),
    stop: (code) => console.error(`[tenant-scoped-page] STOP code=${code}`),
    done: (summary) => console.log(`[tenant-scoped-page] done ${JSON.stringify(summary)}`),
  };
}

// ─── 10) CLI main entry ───────────────────────────────────────────────────────
function usage(): void {
  console.log(
    [
      "Yaşam Hafızası™ tenant-scoped page driver (Model C; dry-run varsayılan; write çift-onaylı).",
      "Kullanım:",
      "  npx tsx scripts/yh-tenant-scoped-page-driver.ts --source <key> --tenant <uuid> --state <path>",
      "  ... --mode write --confirm-write",
      "Zorunlu env (değer GÖSTERİLMEZ): YH_BASE_URL, YH_ADMIN_ID, YH_SESSION_TOKEN",
    ].join("\n"),
  );
}

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  const cli = parseArgs(argv);
  if (!cli.ok) {
    console.error(`[tenant-scoped-page] arg hatası: ${cli.code}`);
    usage();
    return 2;
  }
  const envRes = validateEnv(env);
  if (!envRes.ok) {
    console.error(`[tenant-scoped-page] env hatası: ${envRes.code}`);
    return 2;
  }

  const logger = createConsoleLogger();
  const store = createFsStateStore(cli.params.statePath);
  logger.info(`start mode=${cli.params.mode}`);

  const result = await runScopedPaging({
    params: cli.params,
    postPage: createHttpPostPage(envRes.config, cli.params),
    store,
    logger,
  });

  logger.done({
    completed: result.completed,
    stopped: result.stopped,
    pagesProcessed: result.pagesProcessed,
    stopCode: result.stopCode ?? "",
  });
  return result.stopped ? 1 : 0;
}

// Yalnız doğrudan çalıştırıldığında main koşar (import edildiğinde DEĞİL → harness tetiklemez).
const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (/yh-tenant-scoped-page-driver(\.(ts|mjs|js))?$/.test(entry)) {
  void main(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}
