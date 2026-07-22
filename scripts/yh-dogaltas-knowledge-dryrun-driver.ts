// Yaşam Hafızası™ — S2.19-BF/BF-1A: `dogaltas:knowledge` DRY-RUN pilot driver (fail-closed, cursor-bazlı).
//
// Mevcut admin route'u (POST /api/admin/yasam-hafizasi/index-page) header-bazlı auth ile YALNIZ
// dry-run modunda, sayfa sayfa çağırır. Production route/adapter/migration DEĞİŞMEZ. Bu dosya
// hem CLI entry hem test edilebilir saf/enjekte katmanlar içerir (harness gerçek ağ YAPMAZ).
//
// GÜVENLİK SÖZLEŞMESİ (kilitli):
//   - mode/source/limit/sınırlar COMPILE-TIME sabit; CLI/env/config ile DEĞİŞTİRİLEMEZ.
//   - `'write'` request mode HİÇ üretilmez (write = ayrı BF-2 kapısı).
//   - Auth yalnız env-var (YH_BASE_URL/YH_ADMIN_ID/YH_SESSION_TOKEN); loglanmaz, state/body'ye
//     yazılmaz, hata mesajına eklenmez. CLI arg değil.
//   - CLI yalnız --execute / --resume; argümansız veya sadece --resume → ağ çağrısı YOK.
//   - Checkpoint os.tmpdir() altında (repo-dışı); secret/içerik/response taşımaz; atomik yazılır.
//   - Yalnız güvenli sayısal özet + cursor + status + kod loglanır.
//
// Çalıştırma (BF-1C; BF-1A'da DEĞİL):  npx tsx scripts/yh-dogaltas-knowledge-dryrun-driver.ts --execute

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─── Compile-time sabitler (değiştirilemez) ───────────────────────────────────
export const SOURCE_KEY = "dogaltas:knowledge" as const;
export const MODE = "dry-run" as const;
export const LIMIT = 100 as const;
export const MAX_PAGES = 50 as const;
export const MAX_ROWS = 5000 as const;
export const PAGE_DELAY_MS = 500 as const;
export const REQUEST_TIMEOUT_MS = 120000 as const;
export const ENDPOINT_PATH = "/api/admin/yasam-hafizasi/index-page" as const;
export const STATE_VERSION = 1 as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Tipler ────────────────────────────────────────────────────────────────
export interface DriverConfig {
  readonly baseUrl: string; // yalnız origin (https)
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

export type CliErrorCode = "unknown-arg" | "duplicate-arg" | "resume-without-execute";
export type CliParse =
  | { readonly ok: true; readonly execute: boolean; readonly resume: boolean }
  | { readonly ok: false; readonly code: CliErrorCode };

/** Route SafePageSummary (gerçek sözleşme; plannedInsert/update/unchanged YOK). */
export interface SafePage {
  readonly fetched: number;
  readonly produced: number;
  readonly skipped: number;
  readonly eligibleUnits: number;
  readonly excludedDemo: number;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
export type ResponseErrorCode =
  | "http-401" | "http-403" | "http-429" | "http-500" | "http-503" | "http-error"
  | "bad-json" | "not-object" | "not-ok" | "wrong-mode" | "wrong-source"
  | "write-not-null" | "page-missing" | "page-field-invalid";
export type ResponseValidation =
  | { readonly ok: true; readonly page: SafePage }
  | { readonly ok: false; readonly code: ResponseErrorCode };

export type RequestResult =
  | { readonly ok: true; readonly page: SafePage }
  | { readonly ok: false; readonly code: string };

export interface DriverState {
  readonly version: number;
  readonly sourceKey: string;
  readonly mode: string;
  readonly lastCursor: string | null;
  readonly pagesProcessed: number;
  readonly totalFetched: number;
  readonly totalProduced: number;
  readonly totalSkipped: number;
  readonly totalEligibleUnits: number;
  readonly totalExcludedDemo: number;
  readonly completed: boolean;
  readonly updatedAt: string;
}
export interface StateStore {
  readonly path: string;
  read(): Promise<DriverState | null>;
  write(state: DriverState): Promise<void>;
}

export interface SafeLogger {
  info(stage: string): void;
  page(pageNo: number, status: number, page: SafePage): void;
  stop(code: string): void;
  done(summary: Readonly<Record<string, number | boolean>>): void;
}

export interface PagingDeps {
  requestPage: (afterId: string | null) => Promise<RequestResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => string; // ISO string (state.updatedAt)
  store: StateStore;
  logger: SafeLogger;
  resume: boolean;
}
export interface PagingResult {
  readonly completed: boolean;
  readonly stopped: boolean;
  readonly stopCode: string | null;
  readonly pagesProcessed: number;
  readonly totalFetched: number;
  readonly totalProduced: number;
  readonly totalSkipped: number;
  readonly totalEligibleUnits: number;
  readonly totalExcludedDemo: number;
}

// ─── Saf yardımcılar ─────────────────────────────────────────────────────────
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

  // url.origin trailing slash / path / query / hash içermez (normalize).
  return { ok: true, config: { baseUrl: url.origin, adminId, sessionToken } };
}

// ─── 2) CLI kapısı (saf) ─────────────────────────────────────────────────────
export function parseCliArgs(argv: readonly string[]): CliParse {
  let execute = false;
  let resume = false;
  const seen = new Set<string>();
  for (const a of argv) {
    if (a !== "--execute" && a !== "--resume") return { ok: false, code: "unknown-arg" };
    if (seen.has(a)) return { ok: false, code: "duplicate-arg" };
    seen.add(a);
    if (a === "--execute") execute = true;
    if (a === "--resume") resume = true;
  }
  // --resume tek başına ağ çağrısı başlatmaz.
  if (resume && !execute) return { ok: false, code: "resume-without-execute" };
  return { ok: true, execute, resume };
}

// ─── 3) Request body builder (saf; yalnız izinli alanlar) ─────────────────────
export function buildRequestBody(afterId: string | null): Record<string, unknown> {
  // İlk istekte afterId HİÇ eklenmez; mode/source/limit sabit.
  if (afterId === null) {
    return { sourceKey: SOURCE_KEY, mode: MODE, limit: LIMIT };
  }
  return { sourceKey: SOURCE_KEY, mode: MODE, afterId, limit: LIMIT };
}

// ─── 4) Exact response validation (saf) ──────────────────────────────────────
function httpStatusCode(status: number): ResponseErrorCode {
  if (status === 401) return "http-401";
  if (status === 403) return "http-403";
  if (status === 429) return "http-429";
  if (status === 500) return "http-500";
  if (status === 503) return "http-503";
  return "http-error";
}

export function validateDryRunResponse(status: number, bodyText: string): ResponseValidation {
  if (status !== 200) return { ok: false, code: httpStatusCode(status) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { ok: false, code: "bad-json" };
  }
  if (!isRecord(parsed)) return { ok: false, code: "not-object" };
  if (parsed.ok !== true) return { ok: false, code: "not-ok" };
  if (parsed.mode !== MODE) return { ok: false, code: "wrong-mode" };
  if (parsed.sourceKey !== SOURCE_KEY) return { ok: false, code: "wrong-source" };
  if (parsed.write !== null) return { ok: false, code: "write-not-null" };
  const page = parsed.page;
  if (!isRecord(page)) return { ok: false, code: "page-missing" };
  const { fetched, produced, skipped, eligibleUnits, excludedDemo, nextCursor, hasMore } = page;
  if (
    !isNonNegInt(fetched) ||
    !isNonNegInt(produced) ||
    !isNonNegInt(skipped) ||
    !isNonNegInt(eligibleUnits) ||
    !isNonNegInt(excludedDemo)
  ) {
    return { ok: false, code: "page-field-invalid" };
  }
  if (nextCursor !== null && typeof nextCursor !== "string") {
    return { ok: false, code: "page-field-invalid" };
  }
  if (typeof hasMore !== "boolean") {
    return { ok: false, code: "page-field-invalid" };
  }
  // Guard'lar tipleri kanıtladı; açık SafePage inşası (unknown-CFA'ya güvenilmez).
  const safePage: SafePage = {
    fetched: fetched as number,
    produced: produced as number,
    skipped: skipped as number,
    eligibleUnits: eligibleUnits as number,
    excludedDemo: excludedDemo as number,
    nextCursor: nextCursor as string | null,
    hasMore: hasMore as boolean,
  };
  return { ok: true, page: safePage };
}

// ─── 5) State schema validation (saf) ────────────────────────────────────────
export function validateState(raw: unknown): DriverState | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== STATE_VERSION) return null;
  if (raw.sourceKey !== SOURCE_KEY || raw.mode !== MODE) return null;
  const cursorOk = raw.lastCursor === null || typeof raw.lastCursor === "string";
  if (
    !cursorOk ||
    !isNonNegInt(raw.pagesProcessed) ||
    !isNonNegInt(raw.totalFetched) ||
    !isNonNegInt(raw.totalProduced) ||
    !isNonNegInt(raw.totalSkipped) ||
    !isNonNegInt(raw.totalEligibleUnits) ||
    !isNonNegInt(raw.totalExcludedDemo) ||
    typeof raw.completed !== "boolean" ||
    typeof raw.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    version: STATE_VERSION,
    sourceKey: SOURCE_KEY,
    mode: MODE,
    lastCursor: raw.lastCursor as string | null, // guard'lar tipleri doğruladı
    pagesProcessed: raw.pagesProcessed as number,
    totalFetched: raw.totalFetched as number,
    totalProduced: raw.totalProduced as number,
    totalSkipped: raw.totalSkipped as number,
    totalEligibleUnits: raw.totalEligibleUnits as number,
    totalExcludedDemo: raw.totalExcludedDemo as number,
    completed: raw.completed as boolean,
    updatedAt: raw.updatedAt as string,
  };
}

// ─── 6) Orkestrasyon (saf; enjekte deps) ─────────────────────────────────────
export async function runDryRunPaging(deps: PagingDeps): Promise<PagingResult> {
  let afterId: string | null = null;
  let pagesProcessed = 0;
  let totalFetched = 0;
  let totalProduced = 0;
  let totalSkipped = 0;
  let totalEligibleUnits = 0;
  let totalExcludedDemo = 0;
  const seen = new Set<string>();

  const finish = (stopCode: string | null, completed: boolean): PagingResult => ({
    completed,
    stopped: stopCode !== null,
    stopCode,
    pagesProcessed,
    totalFetched,
    totalProduced,
    totalSkipped,
    totalEligibleUnits,
    totalExcludedDemo,
  });

  // Resume kuralları (fail-closed).
  if (deps.resume) {
    const st = await deps.store.read();
    if (st === null) {
      deps.logger.stop("resume-no-state");
      return finish("resume-no-state", false);
    }
    if (st.completed) {
      deps.logger.info("resume-already-completed");
      return finish(null, true);
    }
    afterId = st.lastCursor; // null → güvenli biçimde ilk sayfadan devam
    pagesProcessed = st.pagesProcessed;
    totalFetched = st.totalFetched;
    totalProduced = st.totalProduced;
    totalSkipped = st.totalSkipped;
    totalEligibleUnits = st.totalEligibleUnits;
    totalExcludedDemo = st.totalExcludedDemo;
    if (afterId !== null) seen.add(afterId.toLowerCase());
  }

  for (;;) {
    const result = await deps.requestPage(afterId);
    if (!result.ok) {
      deps.logger.stop(result.code);
      return finish(result.code, false);
    }
    const page = result.page;
    pagesProcessed += 1;
    totalFetched += page.fetched;
    totalProduced += page.produced;
    totalSkipped += page.skipped;
    totalEligibleUnits += page.eligibleUnits;
    totalExcludedDemo += page.excludedDemo;

    deps.logger.page(pagesProcessed, 200, page);

    // Checkpoint (atomik; secret yok).
    await deps.store.write({
      version: STATE_VERSION,
      sourceKey: SOURCE_KEY,
      mode: MODE,
      lastCursor: page.nextCursor,
      pagesProcessed,
      totalFetched,
      totalProduced,
      totalSkipped,
      totalEligibleUnits,
      totalExcludedDemo,
      completed: !page.hasMore,
      updatedAt: deps.now(),
    });

    if (totalFetched > MAX_ROWS) {
      deps.logger.stop("max-rows");
      return finish("max-rows", false);
    }

    if (!page.hasMore) {
      deps.logger.info("completed");
      return finish(null, true); // temiz bitiş; sleep YOK
    }

    // hasMore === true → cursor doğrula.
    const next = page.nextCursor;
    if (next === null) {
      deps.logger.stop("hasmore-null-cursor");
      return finish("hasmore-null-cursor", false);
    }
    if (!isUuid(next)) {
      deps.logger.stop("invalid-cursor");
      return finish("invalid-cursor", false);
    }
    const nlow = next.toLowerCase();
    if (seen.has(nlow)) {
      deps.logger.stop("cursor-repeat");
      return finish("cursor-repeat", false);
    }
    if (afterId !== null && nlow <= afterId.toLowerCase()) {
      deps.logger.stop("cursor-backward");
      return finish("cursor-backward", false);
    }
    seen.add(nlow);

    if (pagesProcessed >= MAX_PAGES) {
      deps.logger.stop("max-pages");
      return finish("max-pages", false);
    }

    await deps.sleep(PAGE_DELAY_MS);
    afterId = next;
  }
}

// ─── 7) Güvenli logger (gerçek) ──────────────────────────────────────────────
export function createConsoleLogger(): SafeLogger {
  return {
    info: (stage) => console.log(`[dogaltas-knowledge-dryrun] ${stage}`),
    page: (pageNo, status, page) =>
      console.log(
        `[dogaltas-knowledge-dryrun] page=${pageNo} status=${status} fetched=${page.fetched} produced=${page.produced} ` +
          `skipped=${page.skipped} eligibleUnits=${page.eligibleUnits} excludedDemo=${page.excludedDemo} ` +
          `hasMore=${page.hasMore} nextCursorPresent=${page.nextCursor !== null}`,
      ),
    stop: (code) => console.error(`[dogaltas-knowledge-dryrun] STOP code=${code}`),
    done: (summary) => console.log(`[dogaltas-knowledge-dryrun] done ${JSON.stringify(summary)}`),
  };
}

// ─── Gerçek IO: fetch tabanlı requestPage + fs state store (harness KULLANMAZ) ─
export function createHttpRequestPage(config: DriverConfig): (afterId: string | null) => Promise<RequestResult> {
  const url = config.baseUrl + ENDPOINT_PATH;
  return async (afterId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        redirect: "error", // yönlendirme takip edilmez → hata
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-admin-id": config.adminId,
          "x-session-token": config.sessionToken,
        },
        body: JSON.stringify(buildRequestBody(afterId)),
      });
    } catch (err) {
      // Ham hata (URL/secret içerebilecek) DIŞARI SIZMAZ; yalnız sabit kod.
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
    return validateDryRunResponse(res.status, text); // body loglanmaz
  };
}

export function createFsStateStore(): StateStore {
  const dir = path.join(os.tmpdir(), "yasam-hafizasi");
  const file = path.join(dir, "yh-dogaltas-knowledge-dryrun-state.json");
  return {
    path: file,
    read: async () => {
      let text: string;
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        return null;
      }
      try {
        return validateState(JSON.parse(text));
      } catch {
        return null;
      }
    },
    write: async (state) => {
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
      await fs.rename(tmp, file); // atomik replace
    },
  };
}

// ─── 8) CLI main entry ───────────────────────────────────────────────────────
function usage(): void {
  console.log(
    [
      "Yaşam Hafızası™ dogaltas:knowledge dry-run pilot driver (yalnız dry-run).",
      "Kullanım:",
      "  npx tsx scripts/yh-dogaltas-knowledge-dryrun-driver.ts --execute",
      "  npx tsx scripts/yh-dogaltas-knowledge-dryrun-driver.ts --execute --resume",
      "Zorunlu env (değer GÖSTERİLMEZ): YH_BASE_URL, YH_ADMIN_ID, YH_SESSION_TOKEN",
      "Argümansız çalıştırma ağ çağrısı YAPMAZ.",
    ].join("\n"),
  );
}

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> {
  const cli = parseCliArgs(argv);
  if (!cli.ok) {
    console.error(`[dogaltas-knowledge-dryrun] arg hatası: ${cli.code}`);
    usage();
    return 2;
  }
  if (!cli.execute) {
    // Argümansız (veya geçerli ama --execute yok) → no-op; ağ çağrısı YOK.
    usage();
    return 0;
  }

  const envRes = validateEnv(env);
  if (!envRes.ok) {
    // Secret DEĞER yazılmaz; yalnız kod.
    console.error(`[dogaltas-knowledge-dryrun] env hatası: ${envRes.code}`);
    return 2;
  }

  const logger = createConsoleLogger();
  const store = createFsStateStore();
  logger.info(cli.resume ? "start(resume)" : "start(fresh)");
  logger.info(`checkpoint: ${store.path}`);

  const result = await runDryRunPaging({
    requestPage: createHttpRequestPage(envRes.config),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date().toISOString(),
    store,
    logger,
    resume: cli.resume,
  });

  logger.done({
    completed: result.completed,
    stopped: result.stopped,
    pagesProcessed: result.pagesProcessed,
    totalFetched: result.totalFetched,
    totalProduced: result.totalProduced,
    totalSkipped: result.totalSkipped,
    totalEligibleUnits: result.totalEligibleUnits,
    totalExcludedDemo: result.totalExcludedDemo,
  });
  return result.stopped ? 1 : 0;
}

// Yalnız doğrudan çalıştırıldığında main koşar (import edildiğinde DEĞİL → harness tetiklemez).
const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (/yh-dogaltas-knowledge-dryrun-driver(\.(ts|mjs|js))?$/.test(entry)) {
  void main(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}
