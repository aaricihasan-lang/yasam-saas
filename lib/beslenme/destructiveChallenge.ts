import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHALLENGE_RATE_LIMIT,
  CHALLENGE_TTL_MS,
  type ChallengeAction,
  challengeCodeHash,
  challengeScopeHash,
  generateChallengeCode,
  isWellFormedCode,
  mapConsumeOutcome,
} from "./challengeCore";

/**
 * Beslenme — sunucu tarafı 4 haneli challenge (oluştur / tüket). Challenge authenticated
 * kullanıcıya + tenant'a + işlem türüne + kapsam özetine bağlıdır; 5 dk geçerli; tek kullanımlık;
 * 5 yanlış denemede kilitlenir. Tüketim nutrition_challenge_consume RPC'si ile ATOMİK.
 */

export type CreatedChallenge = { challenge_id: string; code: string; expires_at: string; count: number };

export async function createDestructiveChallenge(
  db: SupabaseClient,
  args: { tenantId: string; userId: string; action: ChallengeAction; scopeKeys: string[] },
): Promise<{ ok: true; value: CreatedChallenge } | { ok: false; code: string; status: number }> {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await db
    .from("nutrition_destructive_challenges")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .gte("created_at", since);
  if ((count ?? 0) >= CHALLENGE_RATE_LIMIT) return { ok: false, code: "CHALLENGE_RATE_LIMITED", status: 429 };

  // Bu kullanıcının süresi geçmiş kayıtlarını temizle (kısa ömürlü güvenlik kaydı; iş verisi değil).
  await db
    .from("nutrition_destructive_challenges")
    .delete()
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const id = crypto.randomUUID();
  const code = generateChallengeCode();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const keys = [...new Set(args.scopeKeys)];
  const { error } = await db.from("nutrition_destructive_challenges").insert({
    id,
    tenant_id: args.tenantId,
    user_id: args.userId,
    action: args.action,
    scope_hash: challengeScopeHash(args.action, keys),
    item_count: keys.length,
    code_hash: challengeCodeHash(id, code),
    expires_at: expiresAt,
  });
  if (error) {
    // 23514 = action CHECK ihlali: işlem türü bu veritabanında henüz tanımlı değil (ör. "plan_delete"
    // için 20271003100100 migration'ı uygulanmamış). Kararlı kod → route kullanıcıya net mesaj verir;
    // challenge oluşmadığı için onay adımı da ÇALIŞMAZ (hiçbir kayıt silinmez).
    if ((error as { code?: string }).code === "23514") return { ok: false, code: "ACTION_UNAVAILABLE", status: 503 };
    return { ok: false, code: "CHALLENGE_FAILED", status: 500 };
  }
  return { ok: true, value: { challenge_id: id, code, expires_at: expiresAt, count: keys.length } };
}

/** Onay: kapsam SUNUCUDA yeniden hesaplanmış olarak verilir. ok → null; aksi → hata. */
export async function consumeDestructiveChallenge(
  db: SupabaseClient,
  args: {
    tenantId: string;
    userId: string;
    action: ChallengeAction;
    challengeId: unknown;
    code: unknown;
    scopeKeys: string[];
  },
): Promise<{ code: string; status: number } | null> {
  const idOk = typeof args.challengeId === "string" && /^[0-9a-f-]{36}$/i.test(args.challengeId);
  if (!idOk) return { code: "CHALLENGE_REQUIRED", status: 400 };
  if (!isWellFormedCode(args.code)) return { code: "CHALLENGE_INVALID_CODE", status: 400 };
  const challengeId = args.challengeId as string;
  const { data, error } = await db.rpc("nutrition_challenge_consume", {
    p_id: challengeId,
    p_tenant_id: args.tenantId,
    p_user_id: args.userId,
    p_action: args.action,
    p_scope_hash: challengeScopeHash(args.action, args.scopeKeys),
    p_code_hash: challengeCodeHash(challengeId, args.code),
  });
  if (error) return { code: "CHALLENGE_FAILED", status: 500 };
  return mapConsumeOutcome(String(data));
}
