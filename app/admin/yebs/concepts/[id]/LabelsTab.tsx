"use client";

// ============================================================
// YEBS A8 — Kavram Etiketleri (concept labels) yöneticisi
//
// Etiketler kavram kaydının PARÇASIDIR; ayrı yaşam döngüsü YOKTUR (transition yok).
// Yalnız kavram 'draft' iken eklenir/düzenlenir/silinir (YEBS_CONCEPT_STATUS_LOCKED).
// Yayın kapısı: en az bir etiket ve en az bir BİRİNCİL etiket gerekir.
// Backend her zaman otoritedir; UI yalnız ön-uyarır. Optimistik güncelleme YOK —
// her mutasyondan sonra yetkili yeniden-yükleme + parent onChanged().
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import type { ApiResult, ConceptLabelRow } from "@/lib/yebs/ui/types";
import { LABEL_KINDS } from "@/lib/yebs/ui/types";
import { LABEL_KIND_LABEL } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { conceptsApi } from "@/app/admin/yebs/adminYebsApi";
import { ReasonPrompt } from "@/app/admin/yebs/components/ReasonPrompt";
import { LoadingBlock, ErrorBlock, TextInput, SelectInput, Field } from "@/app/admin/yebs/components/primitives";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";

const fmt = (s: string) => new Date(s).toLocaleString("tr-TR");

type LabelFields = {
  language_tag: string;
  script_code: string;
  label: string;
  label_kind: string;
  transliteration_scheme: string;
  is_primary: boolean;
};

const EMPTY: LabelFields = {
  language_tag: "",
  script_code: "",
  label: "",
  label_kind: "",
  transliteration_scheme: "",
  is_primary: false,
};

export function LabelsTab({
  conceptId,
  conceptStatus,
  onChanged,
}: {
  conceptId: string;
  conceptStatus: string;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const confirmDelete = useDeleteConfirm();

  const [rows, setRows] = useState<ConceptLabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const locked = conceptStatus !== "draft";

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    const r = await conceptsApi.listLabels(conceptId, ac.signal);
    if (ac.signal.aborted) return;
    if (r.ok) setRows(r.data.rows);
    else setError(codeMeta(r.code).message);
    setLoading(false);
  }, [conceptId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  // --- create form ---
  const [create, setCreate] = useState<LabelFields>(EMPTY);
  const [createReason, setCreateReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const canCreate =
    !locked &&
    create.language_tag.trim() !== "" &&
    create.script_code.trim() !== "" &&
    create.label.trim() !== "" &&
    create.label_kind !== "" &&
    !creating;

  async function submitCreate() {
    if (!canCreate) return;
    setCreating(true);
    setCreateErr(null);
    const body: Record<string, unknown> = {
      language_tag: create.language_tag.trim(),
      script_code: create.script_code.trim(),
      label: create.label.trim(),
      label_kind: create.label_kind,
      is_primary: create.is_primary,
    };
    const scheme = create.transliteration_scheme.trim();
    if (scheme) body.transliteration_scheme = scheme;
    const r0 = createReason.trim();
    if (r0) body.reason = r0;

    const r = await conceptsApi.createLabel(conceptId, body);
    setCreating(false);
    if (r.ok) {
      showToast({ type: "success", message: "Etiket eklendi." });
      setCreate(EMPTY);
      setCreateReason("");
      await load();
      onChanged();
      return;
    }
    setCreateErr(codeMeta(r.code).message);
  }

  // --- edit ---
  const [editRow, setEditRow] = useState<ConceptLabelRow | null>(null);
  const [edit, setEdit] = useState<LabelFields>(EMPTY);

  function openEdit(row: ConceptLabelRow) {
    setEditRow(row);
    setEdit({
      language_tag: row.language_tag,
      script_code: row.script_code,
      label: row.label,
      label_kind: row.label_kind,
      transliteration_scheme: row.transliteration_scheme ?? "",
      is_primary: row.is_primary,
    });
  }

  const submitEdit = useCallback(
    async (reason: string): Promise<ApiResult<unknown>> => {
      if (!editRow) return { ok: false, code: "YEBS_LABEL_NOT_FOUND", error: "Etiket bulunamadı.", status: 404 };
      const scheme = edit.transliteration_scheme.trim();
      const body: Record<string, unknown> = {
        expected_updated_at: editRow.updated_at,
        reason,
        language_tag: edit.language_tag.trim(),
        script_code: edit.script_code.trim(),
        label: edit.label.trim(),
        label_kind: edit.label_kind,
        transliteration_scheme: scheme === "" ? null : scheme,
        is_primary: edit.is_primary,
      };
      const r = await conceptsApi.updateLabel(conceptId, editRow.id, body);
      if (r.ok) {
        showToast({ type: "success", message: "Etiket güncellendi." });
        await load();
        onChanged();
      }
      return r;
    },
    [conceptId, edit, editRow, load, onChanged, showToast],
  );

  // --- delete ---
  const [deleteRow, setDeleteRow] = useState<ConceptLabelRow | null>(null);

  const primaryCount = rows.filter((r) => r.is_primary).length;

  async function askDelete(row: ConceptLabelRow) {
    const isLastPrimary = row.is_primary && primaryCount <= 1;
    const ok = await confirmDelete({
      title: "Etiketi sil",
      message: isLastPrimary
        ? `“${row.label}” tek birincil etiket. Silerseniz kavram yayımlanamaz (en az bir birincil etiket gerekir). Yine de silmek istiyor musunuz?`
        : `“${row.label}” etiketini silmek istediğinizden emin misiniz?`,
      confirmText: "Sil",
    });
    if (ok) setDeleteRow(row);
  }

  const submitDelete = useCallback(
    async (reason: string): Promise<ApiResult<unknown>> => {
      if (!deleteRow) return { ok: false, code: "YEBS_LABEL_NOT_FOUND", error: "Etiket bulunamadı.", status: 404 };
      const r = await conceptsApi.deleteLabel(conceptId, deleteRow.id, {
        expected_updated_at: deleteRow.updated_at,
        reason,
      });
      if (r.ok) {
        showToast({ type: "success", message: "Etiket silindi." });
        await load();
        onChanged();
      }
      return r;
    },
    [conceptId, deleteRow, load, onChanged, showToast],
  );

  const hasLabel = rows.length > 0;
  const hasPrimary = primaryCount > 0;

  return (
    <div className="space-y-4">
      {/* Açıklama + yayın kapısı ipucu */}
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm text-slate-600">
        <p>
          Etiketler kaydın parçasıdır; ayrı yaşam döngüsü yoktur. Etiketler kavramın farklı dil,
          yazı ve türlerdeki insan-okunur adlarıdır (özgün, çevriyazı, sadık çeviri, yaygın ad, alternatif).
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className={`inline-flex items-center gap-1 font-semibold ${hasLabel ? "text-emerald-700" : "text-amber-700"}`}>
            {hasLabel ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Star className="h-3.5 w-3.5" aria-hidden />}
            En az bir etiket {hasLabel ? "var" : "gerekir"}
          </span>
          <span className={`inline-flex items-center gap-1 font-semibold ${hasPrimary ? "text-emerald-700" : "text-amber-700"}`}>
            {hasPrimary ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Star className="h-3.5 w-3.5" aria-hidden />}
            En az bir birincil etiket {hasPrimary ? "var" : "gerekir"}
          </span>
        </div>
        {locked && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Bu kavram taslak değil; etiketler yalnız taslak durumundayken eklenebilir, düzenlenebilir veya silinebilir.
          </p>
        )}
      </div>

      {/* Etiket ekleme */}
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-black text-slate-800">
          <Plus className="h-4 w-4" aria-hidden /> Etiket ekle
        </h3>
        <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">
          <Field label="Dil etiketi *" hint="BCP-47 (ör. tr, zh, ar-Arab).">
            <TextInput value={create.language_tag} onChange={(e) => setCreate({ ...create, language_tag: e.target.value })} placeholder="tr" />
          </Field>
          <Field label="Yazı kodu *" hint="ISO 15924 (ör. Latn, Hans, Arab).">
            <TextInput value={create.script_code} onChange={(e) => setCreate({ ...create, script_code: e.target.value })} placeholder="Latn" />
          </Field>
          <Field label="Etiket (ad) *">
            <TextInput value={create.label} onChange={(e) => setCreate({ ...create, label: e.target.value })} placeholder="Kavramın bu dildeki adı" />
          </Field>
          <Field label="Etiket türü *">
            <SelectInput value={create.label_kind} onChange={(e) => setCreate({ ...create, label_kind: e.target.value })} aria-label="Etiket türü">
              <option value="" disabled>Seçin…</option>
              {LABEL_KINDS.map((k) => (
                <option key={k} value={k}>{LABEL_KIND_LABEL[k] ?? k}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Çevriyazı şeması (opsiyonel)" hint="Ör. Pinyin, Hepburn.">
            <TextInput value={create.transliteration_scheme} onChange={(e) => setCreate({ ...create, transliteration_scheme: e.target.value })} placeholder="Pinyin" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={create.is_primary} onChange={(e) => setCreate({ ...create, is_primary: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Birincil etiket (bu dil için)
          </label>
          <Field label="Gerekçe (opsiyonel)">
            <TextInput value={createReason} onChange={(e) => setCreateReason(e.target.value)} maxLength={2000} placeholder="Denetim gerekçesi" />
          </Field>
        </fieldset>
        {createErr && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{createErr}</p>}
        <div className="mt-3">
          <button type="button" onClick={() => void submitCreate()} disabled={!canCreate} className="btn-success inline-flex items-center gap-1.5 px-4 disabled:opacity-40">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Ekle
          </button>
        </div>
      </div>

      {/* Etiket listesi */}
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
          Henüz etiket yok. Yayın için en az bir birincil etiket ekleyin.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{row.label}</span>
                  {row.is_primary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                      <Star className="h-3 w-3" aria-hidden /> Birincil
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {row.language_tag} · {row.script_code} · {LABEL_KIND_LABEL[row.label_kind] ?? row.label_kind}
                  {row.transliteration_scheme ? ` · ${row.transliteration_scheme}` : ""} · {fmt(row.updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => openEdit(row)} disabled={locked} aria-label="Etiketi düzenle" title="Düzenle" className="btn-soft inline-flex items-center gap-1 px-2.5 py-1.5 text-xs disabled:opacity-40">
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Düzenle
                </button>
                <button type="button" onClick={() => void askDelete(row)} disabled={locked} aria-label="Etiketi sil" title="Sil" className="btn-outline-danger inline-flex items-center gap-1 px-2.5 py-1.5 text-xs disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Düzenleme modalı — alanlar + zorunlu gerekçe */}
      {editRow && (
        <ReasonPrompt
          title="Etiketi düzenle"
          recordLabel={editRow.label}
          submitLabel="Kaydet"
          submit={submitEdit}
          onClose={() => setEditRow(null)}
          onDone={() => setEditRow(null)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Dil etiketi *">
              <TextInput value={edit.language_tag} onChange={(e) => setEdit({ ...edit, language_tag: e.target.value })} />
            </Field>
            <Field label="Yazı kodu *">
              <TextInput value={edit.script_code} onChange={(e) => setEdit({ ...edit, script_code: e.target.value })} />
            </Field>
            <Field label="Etiket (ad) *">
              <TextInput value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
            </Field>
            <Field label="Etiket türü *">
              <SelectInput value={edit.label_kind} onChange={(e) => setEdit({ ...edit, label_kind: e.target.value })} aria-label="Etiket türü">
                {LABEL_KINDS.map((k) => (
                  <option key={k} value={k}>{LABEL_KIND_LABEL[k] ?? k}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Çevriyazı şeması (opsiyonel)">
              <TextInput value={edit.transliteration_scheme} onChange={(e) => setEdit({ ...edit, transliteration_scheme: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={edit.is_primary} onChange={(e) => setEdit({ ...edit, is_primary: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Birincil etiket
            </label>
          </div>
        </ReasonPrompt>
      )}

      {/* Silme gerekçesi modalı */}
      {deleteRow && (
        <ReasonPrompt
          title="Etiketi sil"
          recordLabel={deleteRow.label}
          submitLabel="Sil"
          destructive
          submit={submitDelete}
          onClose={() => setDeleteRow(null)}
          onDone={() => setDeleteRow(null)}
        >
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Bu etiket kalıcı olarak silinecek. İşlem için gerekçe zorunludur.
          </p>
        </ReasonPrompt>
      )}
    </div>
  );
}
