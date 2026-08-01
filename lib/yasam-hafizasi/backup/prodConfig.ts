/**
 * BF-12B — Production bağlantı yapılandırması çözümü (SAF; bağlantı KURMAZ).
 *
 * Güvenlik sözleşmesi:
 *   - Gerçek DB URL / service key CLI ARGÜMANI olarak ALINMAZ; yalnız env değişkeni
 *     ADI alınır (`--db-url-env`, `--service-key-env`), değer `process.env`'den okunur.
 *   - Ham `--db-url <değer>` production'da REDDEDİLİR.
 *   - env adı allowlist: /^[A-Z][A-Z0-9_]*$/.
 *   - Eksik/geçersizde bağlantı KURULMADAN fail-closed.
 *   - Hata/redaction: URL/host/parola sızdırmaz.
 */
export const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

export function isValidEnvName(name: string): boolean {
  return ENV_NAME_RE.test(name);
}

export interface ProdResolveInput {
  dbUrlEnv: string | undefined;
  /** Ham --db-url verildi mi (verildiyse reddedilir)? */
  rawDbUrlProvided: boolean;
  supabaseUrl: string | undefined;
  serviceKeyEnv: string | undefined;
  passphraseFileProvided: boolean;
  execute: boolean;
  ack: boolean;
  projectRef: string | undefined;
  out: string | undefined;
  env: Record<string, string | undefined>;
}

export interface ResolvedProdConfig {
  connectionString: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  projectRef: string;
  out: string;
}

export interface ProdResolveResult {
  ok: boolean;
  errors: string[];
  /** Yalnız ok=true iken dolu; ASLA loglanmaz/serialize edilmez. */
  config?: ResolvedProdConfig;
}

/**
 * Production yapılandırmasını çözer. Bağlantı KURMAZ, secret BASMAZ.
 * `config` yalnız çağıran tarafından reader/storage kurmak için kullanılır.
 */
export function resolveProductionDbConfig(input: ProdResolveInput): ProdResolveResult {
  const errors: string[] = [];

  if (input.rawDbUrlProvided) {
    errors.push("Ham --db-url reddedildi: production'da yalnız --db-url-env <ENV_ADI> kullanın.");
  }

  const dbUrlEnv = input.dbUrlEnv;
  let connectionString = "";
  if (!dbUrlEnv) {
    errors.push("--db-url-env zorunludur (DB URL'sinin ortam değişkeni ADI).");
  } else if (!isValidEnvName(dbUrlEnv)) {
    errors.push(`Geçersiz env adı: --db-url-env (allowlist /^[A-Z][A-Z0-9_]*$/).`);
  } else {
    connectionString = (input.env[dbUrlEnv] ?? "").trim();
    if (!connectionString) errors.push(`Ortam değişkeni tanımsız/boş: ${dbUrlEnv}`);
  }

  const serviceKeyEnv = input.serviceKeyEnv ?? "BF12B_SERVICE_ROLE_KEY";
  let serviceRoleKey = "";
  if (!isValidEnvName(serviceKeyEnv)) {
    errors.push("Geçersiz env adı: --service-key-env (allowlist /^[A-Z][A-Z0-9_]*$/).");
  } else {
    serviceRoleKey = (input.env[serviceKeyEnv] ?? "").trim();
    if (!serviceRoleKey) errors.push(`Ortam değişkeni tanımsız/boş: ${serviceKeyEnv}`);
  }

  const supabaseUrl = (input.supabaseUrl ?? "").trim();
  if (!supabaseUrl) errors.push("--supabase-url zorunludur.");
  const projectRef = (input.projectRef ?? "").trim();
  if (!projectRef) errors.push("--project-ref zorunludur.");
  const out = (input.out ?? "").trim();
  if (!out) errors.push("--out zorunludur.");
  if (!input.passphraseFileProvided) errors.push("--passphrase-file zorunludur.");
  if (!input.ack) errors.push("--i-understand-production-read zorunludur.");
  if (!input.execute) errors.push("--execute zorunludur.");

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    errors: [],
    config: { connectionString, supabaseUrl, serviceRoleKey, projectRef, out },
  };
}

/**
 * Bağlantı/hata mesajlarından secret'ları redakte eder (URL/host/parola/key).
 * Log ve kullanıcıya gösterim öncesi ZORUNLU.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "postgres://<redacted>")
    .replace(/(password|pwd)\s*=\s*[^\s;'"&]+/gi, "$1=<redacted>")
    .replace(/(sslmode|host|user|dbname|port)\s*=\s*[^\s;'"&]+/gi, "$1=<redacted>")
    .replace(/\bey[A-Za-z0-9_-]{20,}\b/g, "<redacted-key>")
    .replace(/([?&](?:apikey|api_key|token|access_token)=)[^\s&'"]+/gi, "$1<redacted>");
}
