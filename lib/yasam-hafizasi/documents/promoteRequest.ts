/**
 * BF-14 Ertelenmiş Kaynaklar — Belge/Video "Yaşam Hafızası kaynağı olarak kaydet"
 * (promotion) istek doğrulama (SAF; test edilebilir).
 *
 * BAĞLAYICI (§9B/§14): istemci SERBEST İÇERİK göndermez; yalnız ownership-doğrulanmış bir
 * job REFERANSI + provenans meta gönderir. title/passage metni SERVER tarafında job'ın
 * kayıtlı çıktısından yeniden okunur (arbitrary client text trusted source OLMAZ).
 * tenant BURADA OKUNMAZ (session'dan). classification başlangıçta 'unclassified'.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 2000;

export type PromoteJobKind = "video" | "transcript" | "document";

export interface ParsedPromoteRequest {
  jobKind: PromoteJobKind;
  jobId: string;
  /** Opsiyonel provenans meta (server yine job'dan title/metni türetir). */
  provenance: {
    sourceAuthor?: string;
    sourcePublisher?: string;
    sourceUrl?: string;
    rightsNote?: string;
    provenanceNote?: string;
  };
}

export type ParsePromoteResult =
  | { ok: true; value: ParsedPromoteRequest }
  | { ok: false; code: string };

function isJobKind(v: unknown): v is PromoteJobKind {
  return v === "video" || v === "transcript" || v === "document";
}

/** Yalnız güvenli http(s) URL; aksi halde reddedilir (serbest scheme YASAK). */
function isSafeUrl(v: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(v) && v.length <= 2000;
}

function optNote(v: unknown, code: string): { ok: true; value?: string } | { ok: false; code: string } {
  if (v === undefined || v === null) return { ok: true };
  if (typeof v !== "string") return { ok: false, code };
  const t = v.trim();
  if (t.length === 0) return { ok: true };
  if (t.length > NOTE_MAX) return { ok: false, code };
  return { ok: true, value: t };
}

export function parsePromoteRequest(body: unknown): ParsePromoteResult {
  if (!body || typeof body !== "object") return { ok: false, code: "YH_DOC_INVALID_BODY" };
  const b = body as Record<string, unknown>;

  if (!isJobKind(b.jobKind)) return { ok: false, code: "YH_DOC_INVALID_JOB_KIND" };
  if (typeof b.jobId !== "string" || !UUID_RE.test(b.jobId)) return { ok: false, code: "YH_DOC_INVALID_JOB_ID" };

  const author = optNote(b.sourceAuthor, "YH_DOC_INVALID_AUTHOR");
  if (!author.ok) return { ok: false, code: author.code };
  const publisher = optNote(b.sourcePublisher, "YH_DOC_INVALID_PUBLISHER");
  if (!publisher.ok) return { ok: false, code: publisher.code };
  const rights = optNote(b.rightsNote, "YH_DOC_INVALID_RIGHTS");
  if (!rights.ok) return { ok: false, code: rights.code };
  const prov = optNote(b.provenanceNote, "YH_DOC_INVALID_PROVENANCE");
  if (!prov.ok) return { ok: false, code: prov.code };

  let sourceUrl: string | undefined;
  if (b.sourceUrl !== undefined && b.sourceUrl !== null) {
    if (typeof b.sourceUrl !== "string" || !isSafeUrl(b.sourceUrl.trim())) {
      return { ok: false, code: "YH_DOC_INVALID_URL" };
    }
    sourceUrl = b.sourceUrl.trim();
  }

  return {
    ok: true,
    value: {
      jobKind: b.jobKind,
      jobId: b.jobId,
      provenance: {
        ...(author.value ? { sourceAuthor: author.value } : {}),
        ...(publisher.value ? { sourcePublisher: publisher.value } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(rights.value ? { rightsNote: rights.value } : {}),
        ...(prov.value ? { provenanceNote: prov.value } : {}),
      },
    },
  };
}
