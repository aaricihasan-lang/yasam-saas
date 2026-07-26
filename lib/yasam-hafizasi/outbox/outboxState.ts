/**
 * Yaşam Hafızası™ — Outbox Durum Makinesi (BF-11A, SAF katman).
 *
 * SAF (pure) + DETERMİNİSTİK. `yasam_hafizasi_outbox` SQL sözleşmesinin (migration
 * 20260814000000) TypeScript karşılığı: backoff hesabı, complete/fail/lease
 * kararları ve izin verilen durum geçişleri. Worker (BF-11B) ve harness bu tek
 * kaynağı kullanır; SQL RPC'leri ile birebir aynı semantiği taşır.
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / DB / fetch / process.env / IO / node:crypto / React / Next / zaman
 *   kaynağı (Date.now) / rastgelelik / global mutable state / log.
 *   Tüm zaman değerleri ÇAĞIRAN tarafından epoch-ms olarak GEÇİLİR (saat okunmaz).
 *
 * KANONİK KURALLAR (SQL ile simetrik):
 *   - operation ∈ {upsert, delete}; status ∈ {pending, processing, succeeded, dead}.
 *     `failed` durumu YOKTUR (retry → pending, sınır aşımı → dead).
 *   - event_version yalnız ARTAR (monotonik). claimed > current → imkânsız (throw).
 *   - Backoff deterministik + üstel + cap'li; taşma/negatif üretmez.
 *   - lease recovery YALNIZ processing + süresi geçmiş kilit için geçerlidir.
 */

// ─── Sözleşme sabitleri (SQL CHECK'leri ile birebir) ─────────────────────────

/** İzinli operasyon türleri (SQL: yho_operation_chk). */
export type OutboxOperation = "upsert" | "delete";
export const OUTBOX_OPERATIONS: readonly OutboxOperation[] = ["upsert", "delete"] as const;

/** İzinli durumlar (SQL: yho_status_chk). `failed` YOK. */
export type OutboxStatus = "pending" | "processing" | "succeeded" | "dead";
export const OUTBOX_STATUSES: readonly OutboxStatus[] = [
  "pending",
  "processing",
  "succeeded",
  "dead",
] as const;

/** Varsayılan retry sabitleri (BF-10B; SQL çağrılarına parametre olarak geçilir). */
export const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_BASE_DELAY_SECONDS = 30;
export const DEFAULT_MAX_DELAY_SECONDS = 3600;

/** Backoff üssü tavanı (taşma koruması; SQL: least(attempts-1, 20)). */
export const MAX_BACKOFF_EXPONENT = 20;

// ─── Dahili doğrulayıcılar (coercion YOK) ────────────────────────────────────

function isSafePositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertStatus(value: unknown, label: string): asserts value is OutboxStatus {
  if (!OUTBOX_STATUSES.includes(value as OutboxStatus)) {
    throw new Error(`outboxState: gecersiz status (${label}): ${String(value)}`);
  }
}

// ─── 1) Backoff hesabı (deterministik, üstel, cap'li) ────────────────────────

/**
 * `attempts`. denemesinden sonraki yeniden-deneme gecikmesi (saniye).
 * SQL ile birebir: base * 2^min(max(attempts-1,0), 20), max_delay ile cap'li.
 *
 * @param attempts          Yapılmış deneme sayısı (claim'de +1 → en az 1 beklenir).
 * @param baseDelaySeconds  Taban gecikme (>= 1).
 * @param maxDelaySeconds   Üst sınır (>= baseDelaySeconds).
 */
export function computeBackoffSeconds(
  attempts: number,
  baseDelaySeconds: number = DEFAULT_BASE_DELAY_SECONDS,
  maxDelaySeconds: number = DEFAULT_MAX_DELAY_SECONDS,
): number {
  if (!isSafePositiveInt(attempts)) {
    throw new Error("computeBackoffSeconds: attempts pozitif tam sayi olmali");
  }
  if (!isSafePositiveInt(baseDelaySeconds)) {
    throw new Error("computeBackoffSeconds: baseDelaySeconds pozitif tam sayi olmali");
  }
  if (!isSafePositiveInt(maxDelaySeconds) || maxDelaySeconds < baseDelaySeconds) {
    throw new Error("computeBackoffSeconds: maxDelaySeconds >= baseDelaySeconds olmali");
  }
  const exponent = Math.min(Math.max(attempts - 1, 0), MAX_BACKOFF_EXPONENT);
  const raw = baseDelaySeconds * 2 ** exponent;
  return Math.min(raw, maxDelaySeconds);
}

// ─── 2) Complete kararı ──────────────────────────────────────────────────────

export type CompleteDisposition = "succeeded" | "requeued_newer_event";

/**
 * İşlenen olayın complete kararı (SQL: yh_outbox_complete).
 *   claimed === current → succeeded
 *   claimed  <  current → requeued_newer_event (claim sonrası yeni olay geldi)
 *   claimed  >  current → imkânsız (sürüm yalnız artar) → throw (fail-closed)
 */
export function decideComplete(
  claimedVersion: number,
  currentVersion: number,
): CompleteDisposition {
  if (!isSafePositiveInt(claimedVersion)) {
    throw new Error("decideComplete: claimedVersion pozitif tam sayi olmali");
  }
  if (!isSafePositiveInt(currentVersion)) {
    throw new Error("decideComplete: currentVersion pozitif tam sayi olmali");
  }
  if (claimedVersion > currentVersion) {
    throw new Error("decideComplete: claimedVersion currentVersion ustunde (imkansiz)");
  }
  return claimedVersion === currentVersion ? "succeeded" : "requeued_newer_event";
}

// ─── 3) Fail kararı ──────────────────────────────────────────────────────────

export type FailDisposition = "requeued_newer_event" | "retry_scheduled" | "dead";

export interface FailDecision {
  readonly disposition: FailDisposition;
  /** Yalnız `retry_scheduled` iken saniye cinsinden gecikme; aksi halde `null`. */
  readonly delaySeconds: number | null;
}

export interface FailDecisionInput {
  /** Yapılmış deneme sayısı (claim'de +1). */
  readonly attempts: number;
  readonly claimedVersion: number;
  readonly currentVersion: number;
  readonly maxAttempts?: number;
  readonly baseDelaySeconds?: number;
  readonly maxDelaySeconds?: number;
}

/**
 * Başarısız işlemin kararı (SQL: yh_outbox_fail).
 *   claimed  >  current → throw (imkânsız)
 *   claimed  <  current → requeued_newer_event (yeni olay; eski hata dead yapamaz)
 *   claimed === current & attempts >= maxAttempts → dead
 *   claimed === current & attempts <  maxAttempts → retry_scheduled (+backoff)
 */
export function decideFail(input: FailDecisionInput): FailDecision {
  const {
    attempts,
    claimedVersion,
    currentVersion,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelaySeconds = DEFAULT_BASE_DELAY_SECONDS,
    maxDelaySeconds = DEFAULT_MAX_DELAY_SECONDS,
  } = input;

  if (!isSafePositiveInt(attempts)) {
    throw new Error("decideFail: attempts pozitif tam sayi olmali");
  }
  if (!isSafePositiveInt(claimedVersion) || !isSafePositiveInt(currentVersion)) {
    throw new Error("decideFail: sürüm degerleri pozitif tam sayi olmali");
  }
  if (!isSafePositiveInt(maxAttempts)) {
    throw new Error("decideFail: maxAttempts pozitif tam sayi olmali");
  }
  if (claimedVersion > currentVersion) {
    throw new Error("decideFail: claimedVersion currentVersion ustunde (imkansiz)");
  }

  if (claimedVersion < currentVersion) {
    return { disposition: "requeued_newer_event", delaySeconds: null };
  }
  if (attempts >= maxAttempts) {
    return { disposition: "dead", delaySeconds: null };
  }
  return {
    disposition: "retry_scheduled",
    delaySeconds: computeBackoffSeconds(attempts, baseDelaySeconds, maxDelaySeconds),
  };
}

// ─── 4) Lease recovery kararı ────────────────────────────────────────────────

export type LeaseRecoveryDecision = "recover" | "keep";

export interface LeaseRecoveryInput {
  readonly status: OutboxStatus;
  /** Kilit zamanı (epoch-ms). processing için zorunlu; aksi halde null olabilir. */
  readonly lockedAtMs: number | null;
  /** Şu anki zaman (epoch-ms; çağıran geçer, saat okunmaz). */
  readonly nowMs: number;
  readonly leaseSeconds: number;
}

/**
 * Süresi geçmiş processing kilidini kurtarma kararı (SQL: yh_outbox_sweep_expired).
 *   status !== processing → keep (sweep hedefi değil; attempts/version korunur)
 *   processing & lockedAt null → throw (lock tutarlılığı ihlali)
 *   processing & (now - lockedAt) > lease → recover; aksi → keep
 * Yalnız lease timeout kurtarır; dead YAPMAZ.
 */
export function decideLeaseRecovery(input: LeaseRecoveryInput): LeaseRecoveryDecision {
  const { status, lockedAtMs, nowMs, leaseSeconds } = input;
  assertStatus(status, "lease");
  if (!isSafePositiveInt(leaseSeconds)) {
    throw new Error("decideLeaseRecovery: leaseSeconds pozitif tam sayi olmali");
  }
  if (!isFiniteNumber(nowMs)) {
    throw new Error("decideLeaseRecovery: nowMs sonlu sayi olmali");
  }

  if (status !== "processing") {
    return "keep";
  }
  if (lockedAtMs === null) {
    throw new Error("decideLeaseRecovery: processing satirda lockedAt null olamaz");
  }
  if (!isFiniteNumber(lockedAtMs)) {
    throw new Error("decideLeaseRecovery: lockedAtMs sonlu sayi olmali");
  }
  const elapsedMs = nowMs - lockedAtMs;
  return elapsedMs > leaseSeconds * 1000 ? "recover" : "keep";
}

// ─── 5) Durum geçişi doğrulaması ─────────────────────────────────────────────

/**
 * İzin verilen worker yaşam-döngüsü geçişleri.
 *   pending    → processing            (claim)
 *   processing → succeeded | pending | dead   (complete / fail / sweep)
 *   succeeded  → pending               (yeni olay ile yeniden enqueue — BF-11C)
 *   dead       → pending               (elle / yeniden enqueue)
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OutboxStatus, readonly OutboxStatus[]>> = {
  pending: ["processing"],
  processing: ["succeeded", "pending", "dead"],
  succeeded: ["pending"],
  dead: ["pending"],
};

/** Geçiş izinli mi? (aynı-duruma geçiş listede yoksa `false`). */
export function isValidTransition(from: OutboxStatus, to: OutboxStatus): boolean {
  assertStatus(from, "from");
  assertStatus(to, "to");
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Geçiş izinsizse açık hata fırlatır (fail-closed). */
export function assertTransition(from: OutboxStatus, to: OutboxStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`outboxState: gecersiz gecis ${from} -> ${to}`);
  }
}
