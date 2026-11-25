"use client";

/**
 * NKB-V2-D2 — Ana/Yan Kulvar kaynak yönetimi (yalnız KAYDEDİLMİŞ kayıtlarda).
 *  - Bağlı kaynaklar: listele, bağlantı meta düzenle, bağlantıyı KALDIR (yalnız junction).
 *  - Kaynak bağla: kütüphaneden seç + kapsam (section_key) + sayfa/locator/birincil/sıra.
 *  - Kaynak kütüphanesi: oluştur / düzenle / SİL (bağlıysa 409 → anlaşılır mesaj).
 * "Bağlantıyı kaldır" ile "Kaynağı tamamen sil" AYRI işlemlerdir (karıştırılmaz).
 * tenant_id gönderilmez; hata mesajları API'nin güvenli metinleridir.
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  createRecordSource,
  createSource,
  deleteRecordSource,
  deleteSource,
  updateRecordSourceById,
  updateSourceById,
  type NumerologySourceRow,
  type RecordSourceRow,
} from "../helpers/sourcesApi";
import {
  MSG_DEMO_NO_WRITE,
  MSG_LINK_DUPLICATE,
  MSG_SOURCE_IN_USE,
  SECTION_KEY_OPTIONS,
  buildLinkInputFromForm,
  buildSourceInputFromForm,
  classifyWriteResult,
  joinLinksWithSources,
  pageDisplay,
  sectionKeyLabel,
  type LinkFormState,
  type SourceFormState,
} from "../helpers/sourceUiLogic";

const EMPTY_LINK_FORM: LinkFormState = {
  source_id: "",
  section_key: "",
  page_start: "",
  page_end: "",
  locator: "",
  is_primary: false,
  display_order: "",
  internal_note: "",
};

const EMPTY_SOURCE_FORM: SourceFormState = {
  display_label: "",
  title: "",
  authors: "",
  organization: "",
  source_type: "",
  level_or_edition: "",
  publication_year: "",
  language: "",
  notes: "",
};

const inputCls =
  "h-9 w-full rounded-xl border border-violet-200/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200/60 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40 placeholder:text-slate-400";
const selectCls = `${inputCls}`;
const textareaCls =
  "w-full rounded-xl border border-violet-200/90 bg-white px-3 py-2 text-sm font-medium leading-relaxed text-slate-900 shadow-sm outline-none ring-1 ring-purple-200/60 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40 placeholder:text-slate-400";
const labelCls = "mb-1 block text-xs font-bold text-slate-700";
const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl border border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-sm font-black text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const btnSoft =
  "inline-flex h-9 items-center justify-center rounded-xl border border-violet-200/90 bg-white px-4 text-sm font-bold text-violet-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80 disabled:cursor-not-allowed disabled:opacity-60";
const btnDanger =
  "inline-flex h-9 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60";

function sourceRowToForm(s: NumerologySourceRow): SourceFormState {
  return {
    display_label: s.display_label,
    title: s.title ?? "",
    authors: s.authors ?? "",
    organization: s.organization ?? "",
    source_type: s.source_type ?? "",
    level_or_edition: s.level_or_edition ?? "",
    publication_year: s.publication_year !== null ? String(s.publication_year) : "",
    language: s.language ?? "",
    notes: s.notes ?? "",
  };
}

function linkRowToForm(l: RecordSourceRow): LinkFormState {
  return {
    source_id: l.source_id,
    section_key: l.section_key ?? "",
    page_start: l.page_start !== null ? String(l.page_start) : "",
    page_end: l.page_end !== null ? String(l.page_end) : "",
    locator: l.locator ?? "",
    is_primary: l.is_primary,
    display_order: String(l.display_order ?? 0),
    internal_note: l.internal_note ?? "",
  };
}

function SourceFormFields({
  form,
  set,
  disabled,
}: {
  form: SourceFormState;
  set: (patch: Partial<SourceFormState>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("numerology.knowledge.sourceManager");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls}>{t("displayLabel")}</label>
        <input
          className={inputCls}
          value={form.display_label}
          onChange={(e) => set({ display_label: e.target.value })}
          placeholder={t("displayLabelPlaceholder")}
          disabled={disabled}
        />
      </div>
      <div>
        <label className={labelCls}>{t("work")}</label>
        <input className={inputCls} value={form.title} onChange={(e) => set({ title: e.target.value })} disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("authors")}</label>
        <input className={inputCls} value={form.authors} onChange={(e) => set({ authors: e.target.value })} disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("organization")}</label>
        <input className={inputCls} value={form.organization} onChange={(e) => set({ organization: e.target.value })} disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("sourceType")}</label>
        <input className={inputCls} value={form.source_type} onChange={(e) => set({ source_type: e.target.value })} disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("levelEdition")}</label>
        <input className={inputCls} value={form.level_or_edition} onChange={(e) => set({ level_or_edition: e.target.value })} disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("publicationYear")}</label>
        <input className={inputCls} value={form.publication_year} onChange={(e) => set({ publication_year: e.target.value })} inputMode="numeric" disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("language")}</label>
        <input className={inputCls} value={form.language} onChange={(e) => set({ language: e.target.value })} disabled={disabled} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>{t("notes")}</label>
        <textarea className={textareaCls} rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} disabled={disabled} />
      </div>
    </div>
  );
}

function LinkFormFields({
  form,
  set,
  disabled,
  sources,
  lockSource,
}: {
  form: LinkFormState;
  set: (patch: Partial<LinkFormState>) => void;
  disabled: boolean;
  sources: NumerologySourceRow[];
  lockSource: boolean;
}) {
  const t = useTranslations("numerology.knowledge");
  // I18N: section_key seçenek değerleri kanonik koddur; TR'de SECTION_KEY_OPTIONS etiketi aynen, EN'de katalogdan.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls}>{t("sourceManager.source")}</label>
        <select className={selectCls} value={form.source_id} onChange={(e) => set({ source_id: e.target.value })} disabled={disabled || lockSource}>
          <option value="">{t("sourceManager.chooseSource")}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t("sourceManager.scope")}</label>
        <select className={selectCls} value={form.section_key} onChange={(e) => set({ section_key: e.target.value })} disabled={disabled}>
          {SECTION_KEY_OPTIONS.map((o) => (
            <option key={o.value || "tum"} value={o.value}>
              {isSourceLocale ? o.label : t(`shared.sectionLabels.${o.value || "all"}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t("sourceManager.order")}</label>
        <input className={inputCls} value={form.display_order} onChange={(e) => set({ display_order: e.target.value })} inputMode="numeric" placeholder="0" disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("sourceManager.pageStart")}</label>
        <input className={inputCls} value={form.page_start} onChange={(e) => set({ page_start: e.target.value })} inputMode="numeric" disabled={disabled} />
      </div>
      <div>
        <label className={labelCls}>{t("sourceManager.pageEnd")}</label>
        <input className={inputCls} value={form.page_end} onChange={(e) => set({ page_end: e.target.value })} inputMode="numeric" disabled={disabled} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>{t("sourceManager.locator")}</label>
        <input className={inputCls} value={form.locator} onChange={(e) => set({ locator: e.target.value })} placeholder={t("sourceManager.locatorPlaceholder")} disabled={disabled} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>{t("sourceManager.internalNote")}</label>
        <input className={inputCls} value={form.internal_note} onChange={(e) => set({ internal_note: e.target.value })} disabled={disabled} />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
        <input type="checkbox" checked={form.is_primary} onChange={(e) => set({ is_primary: e.target.checked })} disabled={disabled} className="h-4 w-4 accent-violet-600" />
        {t("sourceManager.primarySource")}
      </label>
    </div>
  );
}

export function KulvarSourceManager({
  recordId,
  recordAnalysisType,
  sources,
  links,
  loading,
  reload,
}: {
  recordId: string;
  recordAnalysisType: string;
  sources: NumerologySourceRow[];
  links: RecordSourceRow[];
  loading: boolean;
  reload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("numerology.knowledge");
  const ts = useTranslations("numerology.knowledge.sourceManager");
  // I18N: TR'de yardımcı/sunucu metinleri birebir; EN'de katalog. Sunucu hata metni dil-bağımsız kod taşımadığından
  // EN'de modülün genel hata metni gösterilir. Form doğrulama metinleri (helpers/sourceUiLogic) yardımcıya aittir → aynen.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const msgLinkDuplicate = isSourceLocale ? MSG_LINK_DUPLICATE : ts("linkDuplicate");
  const msgSourceInUse = isSourceLocale ? MSG_SOURCE_IN_USE : ts("sourceInUse");
  // I18N-F1-R5: form doğrulama hatası — TR'de yardımcı metni AYNEN; EN'de dil-bağımsız koddan.
  const formError = (e: { error: string; code?: string; field?: string }): string =>
    isSourceLocale || !e.code
      ? isSourceLocale ? e.error : ts("formErrors.SOURCE_INVALID")
      : e.field
        ? ts("formErrors.withField", { field: ts(`formErrors.fields.${e.field}`), error: ts(`formErrors.${e.code}`) })
        : ts(`formErrors.${e.code}`);
  const sectionLabel = (key: RecordSourceRow["section_key"]): string =>
    isSourceLocale ? sectionKeyLabel(key) : t(`shared.sectionLabels.${key ?? "all"}`);
  const pageText = (link: RecordSourceRow): string => {
    if (isSourceLocale) return pageDisplay(link);
    const { page_start: s, page_end: e } = link;
    if (s === null && e === null) return "";
    if (s !== null && e !== null && s !== e) return t("shared.pageRange", { start: s, end: e });
    return t("shared.pageSingle", { page: s ?? e ?? 0 });
  };
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [linkForm, setLinkForm] = useState<LinkFormState>({ ...EMPTY_LINK_FORM });
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkForm, setEditLinkForm] = useState<LinkFormState>({ ...EMPTY_LINK_FORM });

  const [sourceForm, setSourceForm] = useState<SourceFormState>({ ...EMPTY_SOURCE_FORM });
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editSourceForm, setEditSourceForm] = useState<SourceFormState>({ ...EMPTY_SOURCE_FORM });

  const joined = joinLinksWithSources(links, sources);

  async function run(
    fn: () => Promise<{ error: string | null; conflict?: boolean; demo?: boolean }>,
    conflictMsg?: string,
  ) {
    if (busy) return false;
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fn();
      const outcome = classifyWriteResult(res, { conflictMsg });
      if (outcome.kind === "demo") {
        // Demo no-op: gerçek başarı gösterme, reload etme, id/liste değiştirme.
        showToast({ message: isSourceLocale ? outcome.message ?? MSG_DEMO_NO_WRITE : ts("demoNoWrite"), type: "info" });
        return false;
      }
      if (outcome.kind === "conflict") {
        setLocalError(isSourceLocale ? outcome.message : conflictMsg ?? ts("operationFailed"));
        return false;
      }
      if (outcome.kind === "error") {
        setLocalError(isSourceLocale ? outcome.message : ts("operationFailed"));
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleAttach() {
    const built = buildLinkInputFromForm(linkForm, { recordAnalysisType });
    if (!built.ok) {
      setLocalError(formError(built));
      return;
    }
    const ok = await run(() => createRecordSource(recordId, built.value), msgLinkDuplicate);
    if (ok) {
      setLinkForm({ ...EMPTY_LINK_FORM });
      showToast({ message: ts("attached"), type: "success" });
    }
  }

  async function handleDetach(linkId: string) {
    const ok = await confirm({
      title: ts("detachTitle"),
      message: ts("detachMessage"),
      tone: "warning",
      confirmText: ts("detachConfirm"),
      cancelText: t("shared.cancel"),
    });
    if (!ok) return;
    const done = await run(() => deleteRecordSource(linkId));
    if (done) showToast({ message: ts("detached"), type: "success" });
  }

  async function handleSaveLinkEdit(linkId: string) {
    const built = buildLinkInputFromForm(editLinkForm, { recordAnalysisType });
    if (!built.ok) {
      setLocalError(formError(built));
      return;
    }
    const { source_id: _omit, ...meta } = built.value;
    void _omit;
    const ok = await run(() => updateRecordSourceById(linkId, meta), msgLinkDuplicate);
    if (ok) {
      setEditingLinkId(null);
      showToast({ message: ts("linkUpdated"), type: "success" });
    }
  }

  async function handleCreateSource() {
    const built = buildSourceInputFromForm(sourceForm);
    if (!built.ok) {
      setLocalError(formError(built));
      return;
    }
    const ok = await run(() => createSource(built.value).then((r) => ({ error: r.error, demo: r.demo })));
    if (ok) {
      setSourceForm({ ...EMPTY_SOURCE_FORM });
      showToast({ message: ts("sourceCreated"), type: "success" });
    }
  }

  async function handleSaveSourceEdit(sourceId: string) {
    const built = buildSourceInputFromForm(editSourceForm);
    if (!built.ok) {
      setLocalError(formError(built));
      return;
    }
    const ok = await run(() => updateSourceById(sourceId, built.value));
    if (ok) {
      setEditingSourceId(null);
      showToast({ message: ts("sourceUpdated"), type: "success" });
    }
  }

  async function handleDeleteSource(sourceId: string) {
    const ok = await confirm({
      title: ts("deleteSourceTitle"),
      message: ts("deleteSourceMessage"),
      tone: "danger",
      confirmText: t("shared.delete"),
      cancelText: t("shared.cancel"),
    });
    if (!ok) return;
    const done = await run(() => deleteSource(sourceId), msgSourceInUse);
    if (done) showToast({ message: ts("sourceDeleted"), type: "success" });
  }

  return (
    <div className="min-w-0 space-y-6">
      {localError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{localError}</p>
      ) : null}

      {/* 1) Bağlı kaynaklar */}
      <section className="min-w-0">
        <h4 className="text-sm font-black uppercase tracking-wide text-violet-800">{ts("linkedSources")}</h4>
        {loading ? (
          <p className="mt-2 text-sm font-medium text-slate-500">{t("shared.loading")}</p>
        ) : joined.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-slate-500">{ts("noLinks")}</p>
        ) : (
          <ul className="mt-2 grid gap-3">
            {joined.map(({ link, source }) => (
              <li key={link.id} className={`min-w-0 border-b border-slate-100/70 pb-3 last:border-b-0 last:pb-0 md:rounded-2xl md:border-2 md:bg-white md:p-3 md:pb-3 md:shadow-sm md:last:border-2 md:last:pb-3 ${link.is_primary ? "md:border-violet-400" : "md:border-violet-200/80"}`}>
                {editingLinkId === link.id ? (
                  <div className="space-y-3">
                    <LinkFormFields form={editLinkForm} set={(p) => setEditLinkForm((s) => ({ ...s, ...p }))} disabled={busy} sources={sources} lockSource />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnPrimary} disabled={busy} onClick={() => void handleSaveLinkEdit(link.id)}>{t("shared.save")}</button>
                      <button type="button" className={btnSoft} disabled={busy} onClick={() => setEditingLinkId(null)}>{t("shared.cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-base font-black text-slate-900">{source?.display_label ?? ts("noSource")}</span>
                        {link.is_primary ? <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">{t("shared.primary")}</span> : null}
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{sectionLabel(link.section_key)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-slate-600">
                        {pageText(link) ? <span>{pageText(link)}</span> : null}
                        {link.locator ? <span className="break-words">{link.locator}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" className={btnSoft} disabled={busy} onClick={() => { setEditingLinkId(link.id); setEditLinkForm(linkRowToForm(link)); }}>{t("shared.edit")}</button>
                      <button type="button" className={btnDanger} disabled={busy} onClick={() => void handleDetach(link.id)}>{ts("detach")}</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2) Kaynak bağla */}
      <section className="min-w-0 rounded-2xl border border-violet-200/70 bg-violet-50/30 p-3">
        <h4 className="text-sm font-black uppercase tracking-wide text-violet-800">{ts("attachSource")}</h4>
        {sources.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-slate-500">{ts("createSourceFirst")}</p>
        ) : (
          <div className="mt-2 space-y-3">
            <LinkFormFields form={linkForm} set={(p) => setLinkForm((s) => ({ ...s, ...p }))} disabled={busy} sources={sources} lockSource={false} />
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => void handleAttach()}>{ts("attach")}</button>
          </div>
        )}
      </section>

      {/* 3) Kaynak kütüphanesi */}
      <section className="min-w-0">
        <h4 className="text-sm font-black uppercase tracking-wide text-violet-800">{ts("library")}</h4>
        {sources.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-slate-500">{ts("noSources")}</p>
        ) : (
          <ul className="mt-2 grid gap-3">
            {sources.map((s) => (
              <li key={s.id} className="min-w-0 border-b border-slate-100/70 pb-3 last:border-b-0 last:pb-0 md:rounded-2xl md:border-2 md:border-violet-200/80 md:bg-white md:p-3 md:pb-3 md:shadow-sm md:last:border-2 md:last:pb-3">
                {editingSourceId === s.id ? (
                  <div className="space-y-3">
                    <SourceFormFields form={editSourceForm} set={(p) => setEditSourceForm((f) => ({ ...f, ...p }))} disabled={busy} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnPrimary} disabled={busy} onClick={() => void handleSaveSourceEdit(s.id)}>{t("shared.save")}</button>
                      <button type="button" className={btnSoft} disabled={busy} onClick={() => setEditingSourceId(null)}>{t("shared.cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-base font-black text-slate-900">{s.display_label}</p>
                      {s.title ? <p className="break-words text-sm font-medium text-slate-600">{s.title}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" className={btnSoft} disabled={busy} onClick={() => { setEditingSourceId(s.id); setEditSourceForm(sourceRowToForm(s)); }}>{t("shared.edit")}</button>
                      <button type="button" className={btnDanger} disabled={busy} onClick={() => void handleDeleteSource(s.id)}>{ts("deleteSource")}</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-2xl border border-violet-200/70 bg-violet-50/30 p-3">
          <p className="mb-2 text-sm font-black text-violet-800">{ts("newSource")}</p>
          <SourceFormFields form={sourceForm} set={(p) => setSourceForm((f) => ({ ...f, ...p }))} disabled={busy} />
          <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => void handleCreateSource()}>{ts("createSource")}</button>
        </div>
      </section>
    </div>
  );
}
