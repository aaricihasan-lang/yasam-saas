"use client";

// ============================================================
// YEBS A8 — Paylaşımlı Kanıt (evidence) yöneticisi (claim + relation)
//
// kind ile API seti seçilir (claimsApi vs relationsApi). Kanıt satırları
// listelenir; ekleme/düzenleme/doğrulama/bağ kaldırma işlemleri backend
// sözleşmesine BİREBİR uyar. Backend her zaman son otoritedir:
//   - verification_status ∈ unverified/verified/rejected
//   - rejected→verified DOĞRUDAN YASAK (asla teklif edilmez)
//   - verified/rejected kanıtın İÇERİĞİ kilitli (önce "Doğrulanmadı"ya al)
//   - rejected kanıt KORUNUR (detach yalnız unverified satırda)
//   - attach: verification_status GÖNDERİLMEZ; ilişki için evidence_layer zorunlu
//   - her PATCH/DELETE/verify: expected_updated_at (=satır updated_at) + reason
// Bilinmeyen alan ASLA gönderilmez; ham hata ASLA gösterilmez (codeMeta).
// ============================================================

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, Pencil, Plus, ShieldCheck, ShieldX, Trash2, Undo2, X } from "lucide-react";
import { claimsApi, relationsApi, type VerificationBody } from "@/app/admin/yebs/adminYebsApi";
import type { ApiResult, ListEnvelope } from "@/lib/yebs/ui/types";
import { EVIDENCE_ROLES, RATIONALE_STATUSES, EVIDENCE_LAYERS } from "@/lib/yebs/ui/types";
import {
  EVIDENCE_ROLE_LABEL, EVIDENCE_LAYER_LABEL, verificationMeta,
} from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { useToast } from "@/components/ui/ToastProvider";
import { VerificationBadge, LoadingBlock, ErrorBlock, EmptyBlock, Field, SelectInput, TextInput } from "@/app/admin/yebs/components/primitives";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";
import { SourcePicker } from "@/app/admin/yebs/components/pickers";
import { useYebsList } from "@/app/admin/yebs/components/list";

// Parent status'ün kanıt mutasyonuna izin verdiği durumlar (backend parent-lock ile hizalı).
const PARENT_EDITABLE = new Set(["draft", "under_review", "needs_verification"]);

// Kanıt satırının ortak (üst küme) şekli — claim=18, relation=19 (evidence_layer opsiyonel).
type EvidenceRow = {
  id: string;
  source_id: string;
  source_role: string;
  evidence_layer?: string;
  locator_text: string | null;
  url_fragment: string | null;
  source_original_excerpt: string | null;
  source_original_language_tag: string | null;
  source_original_script_code: string | null;
  transliteration: string | null;
  transliteration_scheme: string | null;
  faithful_translation: string | null;
  translation_language_tag: string | null;
  rationale: string | null;
  rationale_status: string;
  verification_status: string;
  created_at: string;
  updated_at: string;
};

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

/** trim → boşsa null; aksi halde trim'li değer. */
function nn(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export function EvidenceSection({
  kind, parentId, parentStatus, onChanged,
}: {
  kind: "claim" | "relation";
  parentId: string;
  parentStatus: string;
  onChanged?: () => void;
}) {
  const { showToast } = useToast();
  const isRelation = kind === "relation";
  const parentEditable = PARENT_EDITABLE.has(parentStatus);

  // ---- API sarmalayıcıları (kind'e göre) ----
  const fetcher = useCallback(
    async (offset: number, limit: number, signal: AbortSignal): Promise<ApiResult<ListEnvelope<EvidenceRow>>> => {
      const r = isRelation
        ? await relationsApi.listSources(parentId, { limit, offset }, signal)
        : await claimsApi.listSources(parentId, { limit, offset }, signal);
      return r as ApiResult<ListEnvelope<EvidenceRow>>;
    },
    [isRelation, parentId],
  );

  const attach = useCallback(
    (body: Record<string, unknown>) =>
      isRelation ? relationsApi.attachSource(parentId, body) : claimsApi.attachSource(parentId, body),
    [isRelation, parentId],
  );
  const update = useCallback(
    (id: string, body: Record<string, unknown>) =>
      isRelation ? relationsApi.updateSource(parentId, id, body) : claimsApi.updateSource(parentId, id, body),
    [isRelation, parentId],
  );
  const detach = useCallback(
    (id: string, body: { expected_updated_at: string; reason: string }) =>
      isRelation ? relationsApi.detachSource(parentId, id, body) : claimsApi.detachSource(parentId, id, body),
    [isRelation, parentId],
  );
  const verify = useCallback(
    (id: string, body: VerificationBody) =>
      isRelation ? relationsApi.verifySource(parentId, id, body) : claimsApi.verifySource(parentId, id, body),
    [isRelation, parentId],
  );

  const state = useYebsList<EvidenceRow>(fetcher, `${kind}:${parentId}`, 25);

  // ---- modal/drawer durumları ----
  const [attachOpen, setAttachOpen] = useState(false);
  const [editRow, setEditRow] = useState<EvidenceRow | null>(null);
  const [detachRow, setDetachRow] = useState<EvidenceRow | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<{ row: EvidenceRow; target: string } | null>(null);

  const afterMutation = useCallback((msg: string) => {
    state.reload();
    onChanged?.();
    showToast({ type: "success", message: msg });
  }, [state, onChanged, showToast]);

  const columns = useMemo(() => {
    const cols: { key: string; header: string; cell: (row: EvidenceRow) => ReactNode; className?: string }[] = [
      { key: "source", header: "Kaynak", cell: (r) => <span className="font-mono text-xs text-slate-700">{shortId(r.source_id)}</span> },
      { key: "role", header: "Rol", cell: (r) => EVIDENCE_ROLE_LABEL[r.source_role] ?? r.source_role },
    ];
    if (isRelation) {
      cols.push({ key: "layer", header: "Kanıt Katmanı", cell: (r) => (r.evidence_layer ? EVIDENCE_LAYER_LABEL[r.evidence_layer] ?? r.evidence_layer : "—") });
    }
    cols.push(
      { key: "ver", header: "Doğrulama", cell: (r) => <VerificationBadge status={r.verification_status} /> },
      { key: "updated", header: "Güncelleme", cell: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{fmtDate(r.updated_at)}</span> },
      { key: "actions", header: "", className: "text-right", cell: (r) => <RowActions row={r} /> },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRelation, parentEditable]);

  function RowActions({ row }: { row: EvidenceRow }) {
    if (!parentEditable) return <span className="text-[11px] text-slate-400">—</span>;
    const isUnverified = row.verification_status === "unverified";
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button type="button" onClick={() => setEditRow(row)}
          className="btn-soft inline-flex items-center gap-1 px-2 py-1 text-[11px]">
          <Pencil className="h-3 w-3" aria-hidden /> Düzenle
        </button>
        {isUnverified ? (
          <>
            <button type="button" onClick={() => setVerifyTarget({ row, target: "verified" })}
              className="btn-secondary inline-flex items-center gap-1 px-2 py-1 text-[11px]">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Doğrula
            </button>
            <button type="button" onClick={() => setVerifyTarget({ row, target: "rejected" })}
              className="btn-outline-danger inline-flex items-center gap-1 px-2 py-1 text-[11px]">
              <ShieldX className="h-3 w-3" aria-hidden /> Reddet
            </button>
            <button type="button" onClick={() => setDetachRow(row)}
              className="btn-soft inline-flex items-center gap-1 px-2 py-1 text-[11px] text-rose-600">
              <Trash2 className="h-3 w-3" aria-hidden /> Bağı kaldır
            </button>
          </>
        ) : (
          // verified / rejected → yalnız "Doğrulanmadı"ya al (rejected→verified DOĞRUDAN yok)
          <button type="button" onClick={() => setVerifyTarget({ row, target: "unverified" })}
            className="btn-soft inline-flex items-center gap-1 px-2 py-1 text-[11px]">
            <Undo2 className="h-3 w-3" aria-hidden /> Doğrulanmadı&apos;ya al
          </button>
        )}
      </div>
    );
  }

  function renderCard(row: EvidenceRow): ReactNode {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-slate-700">{shortId(row.source_id)}</span>
          <VerificationBadge status={row.verification_status} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span>Rol: <span className="font-semibold text-slate-700">{EVIDENCE_ROLE_LABEL[row.source_role] ?? row.source_role}</span></span>
          {isRelation && <span>Katman: <span className="font-semibold text-slate-700">{row.evidence_layer ? EVIDENCE_LAYER_LABEL[row.evidence_layer] ?? row.evidence_layer : "—"}</span></span>}
          <span>{fmtDate(row.updated_at)}</span>
        </div>
        <RowActions row={row} />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-800">Kanıtlar</h3>
          <p className="text-[11px] text-slate-500">
            Doğrulanmış nitelikli kanıt olmadan kayıt doğrulanamaz/yayımlanamaz. Reddedilen kanıt kayıt olarak korunur.
          </p>
        </div>
        {parentEditable ? (
          <button type="button" onClick={() => setAttachOpen(true)}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
            <Plus className="h-4 w-4" aria-hidden /> Kanıt ekle
          </button>
        ) : (
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
            Bu kayıt yayın sürecinde; kanıt eklenemez/düzenlenemez.
          </span>
        )}
      </div>

      {state.loading && state.rows.length === 0 ? (
        <LoadingBlock label="Kanıtlar yükleniyor…" />
      ) : state.error ? (
        <ErrorBlock message={state.error} onRetry={state.reload} />
      ) : state.rows.length === 0 ? (
        <EmptyBlock message="Bu kayda henüz kanıt bağlanmamış." />
      ) : (
        <EvidenceTable columns={columns} rows={state.rows} renderCard={renderCard} />
      )}

      {/* Kanıt ekle */}
      {attachOpen && (
        <EvidenceDrawer
          kind={kind}
          mode="attach"
          onSubmit={attach}
          onClose={() => setAttachOpen(false)}
          onDone={() => afterMutation("Kanıt eklendi.")}
        />
      )}

      {/* Kanıt düzenle */}
      {editRow && (
        <EvidenceDrawer
          kind={kind}
          mode="edit"
          initial={editRow}
          contentLocked={editRow.verification_status === "verified" || editRow.verification_status === "rejected"}
          onSubmit={(body) => update(editRow.id, body)}
          onUnlock={() => { setEditRow(null); setVerifyTarget({ row: editRow, target: "unverified" }); }}
          onClose={() => setEditRow(null)}
          onDone={() => afterMutation("Kanıt güncellendi.")}
        />
      )}

      {/* Bağ kaldır (yalnız unverified) */}
      {detachRow && (
        <ReasonPrompt
          title="Kanıt bağını kaldır"
          recordLabel={`Kaynak ${shortId(detachRow.source_id)}`}
          submitLabel="Bağı kaldır"
          destructive
          submit={(reason) => detach(detachRow.id, { expected_updated_at: detachRow.updated_at, reason })}
          onClose={() => setDetachRow(null)}
          onDone={() => afterMutation("Kanıt bağı kaldırıldı.")}
        >
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            Bu işlem yalnız doğrulanmamış kanıt bağını kaldırır. Reddedilen/doğrulanan kanıtlar korunur.
          </p>
        </ReasonPrompt>
      )}

      {/* Doğrulama geçişi */}
      {verifyTarget && (
        <ReasonPrompt
          title={
            verifyTarget.target === "verified" ? "Kanıtı doğrula"
              : verifyTarget.target === "rejected" ? "Kanıtı reddet"
                : "Kanıtı 'Doğrulanmadı'ya al"
          }
          recordLabel={`Kaynak ${shortId(verifyTarget.row.source_id)}`}
          submitLabel={
            verifyTarget.target === "verified" ? "Doğrula"
              : verifyTarget.target === "rejected" ? "Reddet" : "Doğrulanmadı'ya al"
          }
          destructive={verifyTarget.target === "rejected"}
          submit={(reason) => verify(verifyTarget.row.id, {
            verification_status: verifyTarget.target,
            expected_updated_at: verifyTarget.row.updated_at,
            reason,
          })}
          onClose={() => setVerifyTarget(null)}
          onDone={() => afterMutation("Kanıt doğrulama durumu güncellendi.")}
        >
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Durum: <span className="font-semibold">{verificationMeta(verifyTarget.row.verification_status).label}</span>
            {" → "}
            <span className="font-semibold">{verificationMeta(verifyTarget.target).label}</span>
            {verifyTarget.target === "unverified" && (
              <span className="mt-1 block text-[11px] text-slate-500">Bu, kanıtın içeriğini yeniden düzenlemeye açar.</span>
            )}
          </p>
        </ReasonPrompt>
      )}
    </section>
  );
}

// ---- Kanıt tablosu (masaüstü tablo + mobil kart) ----
function EvidenceTable({
  columns, rows, renderCard,
}: {
  columns: { key: string; header: string; cell: (row: EvidenceRow) => ReactNode; className?: string }[];
  rows: EvidenceRow[];
  renderCard: (row: EvidenceRow) => ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/90 text-left text-xs text-slate-500">
            <tr>{columns.map((c) => <th key={c.key} className={`px-3 py-2 font-semibold ${c.className ?? ""}`}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-violet-50/30">
                {columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.className ?? ""}`}>{c.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">{renderCard(row)}</div>
        ))}
      </div>
    </>
  );
}

// ============================================================
// Kanıt ekleme/düzenleme drawer'ı
// ============================================================
function EvidenceDrawer({
  kind, mode, initial, contentLocked, onSubmit, onUnlock, onClose, onDone,
}: {
  kind: "claim" | "relation";
  mode: "attach" | "edit";
  initial?: EvidenceRow;
  contentLocked?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<ApiResult<unknown>>;
  onUnlock?: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const isRelation = kind === "relation";
  const isEdit = mode === "edit";

  const [sourceId, setSourceId] = useState<string | null>(initial?.source_id ?? null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(initial ? shortId(initial.source_id) : null);
  const [evidenceLayer, setEvidenceLayer] = useState<string>(initial?.evidence_layer ?? (isRelation ? EVIDENCE_LAYERS[0] : ""));
  const [sourceRole, setSourceRole] = useState<string>(initial?.source_role ?? EVIDENCE_ROLES[0]);
  const [rationaleStatus, setRationaleStatus] = useState<string>(initial?.rationale_status ?? RATIONALE_STATUSES[0]);
  const [rationale, setRationale] = useState<string>(initial?.rationale ?? "");
  const [locator, setLocator] = useState<string>(initial?.locator_text ?? "");
  const [urlFragment, setUrlFragment] = useState<string>(initial?.url_fragment ?? "");
  const [excerpt, setExcerpt] = useState<string>(initial?.source_original_excerpt ?? "");
  const [excerptLang, setExcerptLang] = useState<string>(initial?.source_original_language_tag ?? "");
  const [excerptScript, setExcerptScript] = useState<string>(initial?.source_original_script_code ?? "");
  const [translit, setTranslit] = useState<string>(initial?.transliteration ?? "");
  const [translitScheme, setTranslitScheme] = useState<string>(initial?.transliteration_scheme ?? "");
  const [faithful, setFaithful] = useState<string>(initial?.faithful_translation ?? "");
  const [transLang, setTransLang] = useState<string>(initial?.translation_language_tag ?? "");
  const [reason, setReason] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locked = Boolean(contentLocked);
  const fromSource = rationaleStatus === "from_source";
  const hasExcerpt = excerpt.trim() !== "";

  // Hafif ön-doğrulama (backend nihai otoritedir).
  const validationHint = useMemo<string | null>(() => {
    if (!sourceId) return "Kaynak seçilmelidir.";
    if (isRelation && !evidenceLayer) return "Kanıt katmanı seçilmelidir.";
    if (fromSource && rationale.trim() === "") return "Kaynaktan gerekçe seçildi; gerekçe metni gereklidir.";
    if (!fromSource && rationale.trim() !== "") return "Kaynak gerekçe vermiyor seçiliyken gerekçe metni boş olmalıdır.";
    if (hasExcerpt && excerptLang.trim() === "") return "Alıntı girildiğinde özgün dil etiketi gereklidir.";
    if (!hasExcerpt && (excerptLang.trim() !== "" || excerptScript.trim() !== "")) return "Dil/yazı yalnız alıntı ile birlikte girilebilir.";
    if (translit.trim() !== "" && !hasExcerpt) return "Çevriyazı yalnız alıntı ile birlikte girilebilir.";
    if (translitScheme.trim() !== "" && translit.trim() === "") return "Çevriyazı şeması için çevriyazı gereklidir.";
    if (faithful.trim() !== "" && !hasExcerpt) return "Sadık çeviri yalnız alıntı ile birlikte girilebilir.";
    if ((faithful.trim() !== "") !== (transLang.trim() !== "")) return "Sadık çeviri ve çeviri dil etiketi birlikte girilmelidir.";
    if (isEdit && reason.trim() === "") return "Düzenleme için gerekçe gereklidir.";
    return null;
  }, [sourceId, isRelation, evidenceLayer, fromSource, rationale, hasExcerpt, excerptLang, excerptScript, translit, translitScheme, faithful, transLang, isEdit, reason]);

  const canSubmit = !busy && !locked && validationHint === null;

  function buildBody(): Record<string, unknown> {
    if (isEdit && initial) {
      const body: Record<string, unknown> = {
        expected_updated_at: initial.updated_at,
        reason: reason.trim(),
        source_role: sourceRole,
        rationale_status: rationaleStatus,
        locator_text: nn(locator),
        url_fragment: nn(urlFragment),
        source_original_excerpt: nn(excerpt),
        source_original_language_tag: nn(excerptLang),
        source_original_script_code: nn(excerptScript),
        transliteration: nn(translit),
        transliteration_scheme: nn(translitScheme),
        faithful_translation: nn(faithful),
        translation_language_tag: nn(transLang),
        rationale: fromSource ? nn(rationale) : null,
      };
      if (isRelation) body.evidence_layer = evidenceLayer;
      return body;
    }
    // attach: yalnız dolu alanlar; verification_status GÖNDERİLMEZ
    const body: Record<string, unknown> = {
      source_id: sourceId,
      source_role: sourceRole,
      rationale_status: rationaleStatus,
    };
    if (isRelation) body.evidence_layer = evidenceLayer;
    const put = (k: string, v: string) => { const t = v.trim(); if (t !== "") body[k] = t; };
    put("locator_text", locator);
    put("url_fragment", urlFragment);
    put("source_original_excerpt", excerpt);
    put("source_original_language_tag", excerptLang);
    put("source_original_script_code", excerptScript);
    put("transliteration", translit);
    put("transliteration_scheme", translitScheme);
    put("faithful_translation", faithful);
    put("translation_language_tag", transLang);
    if (fromSource) put("rationale", rationale);
    if (reason.trim() !== "") body.reason = reason.trim();
    return body;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    const r = await onSubmit(buildBody());
    setBusy(false);
    if (r.ok) { onDone(); onClose(); return; }
    setErr(codeMeta(r.code).message);
  }

  const disabled = locked || busy;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-label={isEdit ? "Kanıt düzenle" : "Kanıt ekle"}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-white/70 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-black text-slate-900">{isEdit ? "Kanıt düzenle" : "Kanıt ekle"}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{isRelation ? "İlişki kanıtı" : "İddia kanıtı"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {locked && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <p className="font-semibold">Kanıt içeriği kilitli.</p>
              <p>Düzenlemek için önce &apos;Doğrulanmadı&apos; durumuna alın.</p>
              {onUnlock && (
                <button type="button" onClick={onUnlock}
                  className="btn-soft mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-[11px]">
                  <Undo2 className="h-3 w-3" aria-hidden /> Doğrulanmadı&apos;ya al
                </button>
              )}
            </div>
          )}

          {/* Kaynak */}
          {isEdit ? (
            <Field label="Kaynak (değiştirilemez)">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-mono text-xs">{initial ? shortId(initial.source_id) : ""}</span>
              </div>
            </Field>
          ) : (
            <SourcePicker value={sourceId} valueLabel={sourceLabel} onPick={(id, d) => { setSourceId(id); setSourceLabel(d); }} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {isRelation && (
              <Field label="Kanıt Katmanı *">
                <SelectInput value={evidenceLayer} disabled={disabled} onChange={(e) => setEvidenceLayer(e.target.value)}>
                  {EVIDENCE_LAYERS.map((l) => <option key={l} value={l}>{EVIDENCE_LAYER_LABEL[l] ?? l}</option>)}
                </SelectInput>
              </Field>
            )}
            <Field label="Kanıt Rolü *">
              <SelectInput value={sourceRole} disabled={disabled} onChange={(e) => setSourceRole(e.target.value)}>
                {EVIDENCE_ROLES.map((r) => <option key={r} value={r}>{EVIDENCE_ROLE_LABEL[r] ?? r}</option>)}
              </SelectInput>
            </Field>
            <Field label="Gerekçe Durumu *">
              <SelectInput value={rationaleStatus} disabled={disabled} onChange={(e) => setRationaleStatus(e.target.value)}>
                {RATIONALE_STATUSES.map((r) => (
                  <option key={r} value={r}>{r === "from_source" ? "Kaynaktan" : "Kaynak gerekçe vermiyor"}</option>
                ))}
              </SelectInput>
            </Field>
          </div>

          {fromSource && (
            <Field label="Gerekçe metni *" hint="Kaynaktan gerekçe seçildiğinde zorunlu (≤20000).">
              <textarea value={rationale} disabled={disabled} onChange={(e) => setRationale(e.target.value)} rows={2} maxLength={20000}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50" />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Konum metni (locator)"><TextInput value={locator} disabled={disabled} onChange={(e) => setLocator(e.target.value)} maxLength={2000} /></Field>
            <Field label="URL parçası"><TextInput value={urlFragment} disabled={disabled} onChange={(e) => setUrlFragment(e.target.value)} maxLength={2000} /></Field>
          </div>

          <Field label="Özgün alıntı" hint="Girilirse dil etiketi gerekir.">
            <textarea value={excerpt} disabled={disabled} onChange={(e) => setExcerpt(e.target.value)} rows={2} maxLength={50000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Özgün dil etiketi" hint="BCP-47 (örn. ar, tr, en)."><TextInput value={excerptLang} disabled={disabled} onChange={(e) => setExcerptLang(e.target.value)} placeholder="ar" /></Field>
            <Field label="Özgün yazı kodu" hint="ISO 15924 (örn. Arab, Latn)."><TextInput value={excerptScript} disabled={disabled} onChange={(e) => setExcerptScript(e.target.value)} placeholder="Arab" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Çevriyazı" hint="Alıntı ile birlikte.">
              <textarea value={translit} disabled={disabled} onChange={(e) => setTranslit(e.target.value)} rows={2} maxLength={50000}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50" />
            </Field>
            <Field label="Çevriyazı şeması" hint="Çevriyazı ile birlikte."><TextInput value={translitScheme} disabled={disabled} onChange={(e) => setTranslitScheme(e.target.value)} maxLength={200} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sadık çeviri" hint="Çeviri dil etiketi ile birlikte.">
              <textarea value={faithful} disabled={disabled} onChange={(e) => setFaithful(e.target.value)} rows={2} maxLength={50000}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50" />
            </Field>
            <Field label="Çeviri dil etiketi" hint="BCP-47."><TextInput value={transLang} disabled={disabled} onChange={(e) => setTransLang(e.target.value)} placeholder="tr" /></Field>
          </div>

          <Field label={isEdit ? "Gerekçe (zorunlu)" : "İşlem gerekçesi (opsiyonel)"}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000}
              placeholder={isEdit ? "Düzenleme gerekçesi (zorunlu)…" : "İşlem gerekçesi…"}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </Field>

          {validationHint && !locked && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">{validationHint}</p>}
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} disabled={busy} className="btn-soft px-4">Vazgeç</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="btn-success inline-flex items-center gap-1.5 px-4 disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {isEdit ? "Kaydet" : "Kanıt ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}
