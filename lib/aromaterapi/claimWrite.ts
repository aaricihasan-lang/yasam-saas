import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi V2 — C3D-D Bilgi Kaydı (claim) YAZMA istemci sarmalayıcısı (client-safe).
 *
 * Mevcut C2S/C2T motorunu tüketir; backend/RPC/route DEĞİŞTİRMEZ. server-only dosya
 * import ETMEZ (claimMutations.ts'e dokunmaz). tenant/actor/id gövdeye ASLA konmaz —
 * yalnız server guard çözer. Ham DB/response gövdesi kullanıcıya sızmaz; yalnız stabil
 * kod → Türkçe mesaj. Kullanıcıya "claim" gösterilmez (UI: Bilgi Kaydı).
 */

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

// ---- Child yazma tipleri (C2S RPC allowlist'leriyle birebir) ----
export type WriteRoute = { route_code: string };
export type WritePopulation = { population_code: string; age_min?: number | null; age_max?: number | null };
export type WriteSource = {
  source_id: string;
  source_role: string;
  locator_text?: string | null;
  url_fragment?: string | null;
  source_original_excerpt?: string | null;
  faithful_translation?: string | null;
  verification_status?: string | null;
};
export type WritePassage = {
  passage_id: string;
  passage_kind: string;
  evidence_relation: string;
  verification_status?: string | null;
};
export type WriteRelation = { other_claim_id: string; relation_type: string; explanation_tr: string };

// ---- Create / Update request tipleri ----
export type CreateKnowledgeRecordInput = {
  preparation_id: string;
  claim_type: string;
  conclusion: string;
  conclusion_provenance: string;
  evidence_layer: string;
  rationale_status: string;
  safety_topic?: string | null;
  preparation_context?: string | null;
  outcome_type?: string | null;
  rationale?: string | null;
  routes?: WriteRoute[];
  populations?: WritePopulation[];
  sources?: WriteSource[];
  passages?: WritePassage[];
  relations?: WriteRelation[];
  /** create reason OPSİYONEL. */
  reason?: string | null;
};

export type UpdatePatch = Partial<{
  claim_type: string;
  safety_topic: string | null;
  preparation_context: string | null;
  conclusion: string;
  conclusion_provenance: string;
  outcome_type: string | null;
  evidence_layer: string;
  rationale: string | null;
  rationale_status: string;
  status: string;
}>;

export type UpdateKnowledgeRecordInput = {
  /** update reason ZORUNLU. */
  reason: string;
  expected_updated_at?: string | null;
  patch?: UpdatePatch;
  /** Child: omitted=preserve, []=clear, [...]=replace. */
  routes?: WriteRoute[];
  populations?: WritePopulation[];
  sources?: WriteSource[];
  passages?: WritePassage[];
  relations?: WriteRelation[];
};

export type WriteResult = {
  ok: boolean;
  claimId: string | null;
  warnings: unknown[];
  errorCode: string | null;
  /** 409 optimistic concurrency (AROMA_STALE_CLAIM). */
  stale: boolean;
  /** 403 demo. */
  demoForbidden: boolean;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function toResult(res: Response, j: Record<string, unknown>): WriteResult {
  if (res.ok && j.ok === true) {
    return {
      ok: true,
      claimId: (j.claim_id as string) ?? null,
      warnings: Array.isArray(j.warnings) ? (j.warnings as unknown[]) : [],
      errorCode: null,
      stale: false,
      demoForbidden: false,
    };
  }
  const code = typeof j.code === "string" ? j.code : `HTTP_${res.status}`;
  return {
    ok: false,
    claimId: null,
    warnings: [],
    errorCode: code,
    stale: code === "AROMA_STALE_CLAIM",
    demoForbidden: code === "AROMA_DEMO_FORBIDDEN",
  };
}

/** POST /api/aromaterapi/claims — Yeni Bilgi Kaydı. tenant/actor server'dan. */
export async function createKnowledgeRecord(
  input: CreateKnowledgeRecordInput,
  signal?: AbortSignal,
): Promise<WriteResult> {
  try {
    const res = await fetch("/api/aromaterapi/claims", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
      signal,
    });
    return toResult(res, await readJson(res));
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, claimId: null, warnings: [], errorCode: null, stale: false, demoForbidden: false };
    }
    return { ok: false, claimId: null, warnings: [], errorCode: "AROMA_CLAIM_WRITE_FAILED", stale: false, demoForbidden: false };
  }
}

/** PATCH /api/aromaterapi/claims/[id] — Bilgi Kaydı güncelle (reason zorunlu). */
export async function updateKnowledgeRecord(
  id: string,
  input: UpdateKnowledgeRecordInput,
  signal?: AbortSignal,
): Promise<WriteResult> {
  try {
    const res = await fetch(`/api/aromaterapi/claims/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(input),
      signal,
    });
    return toResult(res, await readJson(res));
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, claimId: null, warnings: [], errorCode: null, stale: false, demoForbidden: false };
    }
    return { ok: false, claimId: null, warnings: [], errorCode: "AROMA_CLAIM_WRITE_FAILED", stale: false, demoForbidden: false };
  }
}

const WRITE_MESSAGES: Record<string, string> = {
  AROMA_DEMO_FORBIDDEN: "Demo hesabında kayıt oluşturma/düzenleme yapılamaz.",
  AROMA_STALE_CLAIM: "Bu kayıt siz düzenlerken başkası tarafından güncellendi. Lütfen yeniden yükleyip tekrar deneyin.",
  AROMA_REASON_INVALID: "Gerekçe zorunludur ve 1–2000 karakter olmalıdır.",
  AROMA_MISSING_REQUIRED_FIELD: "Zorunlu alanları doldurun.",
  AROMA_INVALID_UUID: "Geçersiz preparat/kayıt bağlantısı.",
  AROMA_INVALID_FIELD_TYPE: "Bir alanın türü geçersiz.",
  AROMA_INVALID_TIMESTAMP: "Eşzamanlılık damgası geçersiz.",
  AROMA_INVALID_BODY: "İstek gövdesi geçersiz.",
  AROMA_FORBIDDEN_FIELD: "İzin verilmeyen bir alan gönderildi.",
  AROMA_UNKNOWN_FIELD: "Bilinmeyen bir alan gönderildi.",
  AROMA_IMMUTABLE_FIELD: "Değiştirilemez bir alan gönderildi.",
  AROMA_INVALID_PAYLOAD: "Alt kayıt (rota/popülasyon/kaynak/pasaj/ilişki) yapısı geçersiz.",
  AROMA_DUPLICATE_ROUTE: "Aynı uygulama yolu birden çok kez eklenemez.",
  AROMA_DUPLICATE_POPULATION: "Aynı popülasyon birden çok kez eklenemez.",
  AROMA_PASSAGE_SOURCE_NOT_LINKED: "Seçilen pasaj bu kaydın kaynaklarına bağlı değil.",
  AROMA_SELF_RELATION: "Bir kayıt kendisiyle ilişkilendirilemez.",
  AROMA_RELATION_TARGET_NOT_FOUND: "İlişkilendirilen kayıt bulunamadı.",
  AROMA_CHECK_VIOLATION: "Değerler kurallara uymuyor; seçimlerinizi gözden geçirin.",
  AROMA_UNIQUE_VIOLATION: "Bu kayıt zaten mevcut (benzersizlik ihlali).",
  AROMA_FK_VIOLATION: "İlişkili bir kayıt bulunamadı.",
  AROMA_CLAIM_NOT_FOUND: "Kayıt bulunamadı.",
  AROMA_CLAIM_WRITE_FAILED: "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin.",
};

export function writeMessageForCode(code: string | null): string {
  if (!code) return "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin.";
  return WRITE_MESSAGES[code] ?? "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin.";
}
