"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { runInEffect } from "@/lib/runInEffect";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import {
  effectiveSections,
  getCatalog,
  getTemplate,
  isKnownTemplateVersion,
  normalizeLocale,
  templateFieldIndex,
} from "@/lib/danisan/anamnez/schema";
import {
  addCustomField,
  clearAnswer,
  deleteCustomField,
  hiddenFieldsWithAnswers,
  hideField,
  overallProgress,
  renameCustomField,
  resetToStandard,
  restoreField,
  sectionProgress,
  setLabelOverride,
  setSectionEnabled,
} from "@/lib/danisan/anamnez/customize";
import {
  applyImport,
  listSourceChanges,
  planSectionImport,
  sectionSourceStates,
  type ConflictChoice,
  type ImportPlan,
} from "@/lib/danisan/anamnez/sources";
import { anamnezAuthHeaders, anamnezBase, anamnezFetch } from "@/lib/danisan/anamnez/client";
import { clientDisplayFromSnapshot, formatInstantDate, formatIsoDate, todayIsoIstanbul } from "@/lib/danisan/anamnez/format";
import { isEmptyAnswer } from "@/lib/danisan/anamnez/validate";
import { EMPTY_FORM_CUSTOM } from "@/lib/danisan/anamnez/types";
import type {
  AnamnezAttachment,
  AnamnezRecord,
  AnamnezSectionKey,
  AnswerValue,
  Answers,
  FieldSourceState,
  FormCustom,
  SourceLinks,
  SourceMeta,
  SourceValues,
} from "@/lib/danisan/anamnez/types";
import { AnamnezAttachments } from "./AnamnezAttachments";
import {
  AddFieldDialog,
  ChangesDialog,
  ImportConflictDialog,
  LabelEditDialog,
  errorKey,
  makeLabelResolver,
} from "./AnamnezDialogs";
import { AnamnezSectionCard, SourceBadge } from "./AnamnezSectionCard";
import { ANAMNEZ_PDF_CTA_HIDE, ANAMNEZ_PDF_HINT_HIDE, aInput, aLabel, freeTextFieldProps } from "./styles";

type LoadedPayload = {
  anamnesis: AnamnezRecord;
  attachments: AnamnezAttachment[];
  sources: SourceValues;
  sourceMeta: SourceMeta;
  healthNote: string | null;
  explicitConsent: boolean | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "ready" };

export function AnamnezEditor({ clientId, anamnesisId }: { clientId: string; anamnesisId: string }) {
  const t = useTranslations("clients.anamnez");
  const locale = normalizeLocale(useLocale());
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const deleteConfirm = useDeleteConfirm();
  const base = `${anamnezBase(clientId)}/${encodeURIComponent(anamnesisId)}`;
  const backHref = `/dashboard/clients/${encodeURIComponent(clientId)}?tab=anamnez`;

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [rec, setRec] = useState<AnamnezRecord | null>(null);
  const [formCustom, setFormCustom] = useState<FormCustom | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [links, setLinks] = useState<SourceLinks>({});
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [dirty, setDirty] = useState(false);
  const [attachments, setAttachments] = useState<AnamnezAttachment[]>([]);
  const [sources, setSources] = useState<SourceValues | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMeta | null>(null);
  const [healthNote, setHealthNote] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [explicitConsent, setExplicitConsent] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["A"]));
  const [busy, setBusy] = useState<null | "save" | "complete" | "delete" | "new" | "pdf" | "filledPdf">(null);

  const [importState, setImportState] = useState<{ plan: ImportPlan; section: string } | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [addFieldSection, setAddFieldSection] = useState<AnamnezSectionKey | null>(null);
  const [labelKey, setLabelKey] = useState<string | null>(null);

  useUnsavedGuard(dirty);

  const applyPayload = useCallback((p: LoadedPayload) => {
    setRec(p.anamnesis);
    setFormCustom(p.anamnesis.form_custom);
    setAnswers(p.anamnesis.answers ?? {});
    setLinks(p.anamnesis.source_links ?? {});
    setTitle(p.anamnesis.title ?? "");
    setDate(p.anamnesis.assessment_date);
    setAttachments(p.attachments ?? []);
    setSources(p.sources);
    setSourceMeta(p.sourceMeta);
    setHealthNote(p.healthNote);
    setExplicitConsent(p.explicitConsent);
    setDirty(false);
  }, []);

  const reload = useCallback(async () => {
    setLoad({ kind: "loading" });
    const res = await anamnezFetch<LoadedPayload>(base);
    if (!res.ok) {
      setLoad({ kind: "error", code: res.code });
      return;
    }
    if (!isKnownTemplateVersion(res.data.anamnesis.template_version)) {
      setLoad({ kind: "error", code: "INVALID" });
      return;
    }
    applyPayload(res.data);
    setLoad({ kind: "ready" });
  }, [base, applyPayload]);

  useEffect(() => {
    runInEffect(() => void reload());
  }, [reload]);

  const version = rec?.template_version ?? "std-v1";
  const locked = rec?.status === "completed";
  const template = useMemo(() => getTemplate(version), [version]);
  const catalog = useMemo(() => getCatalog(version, locale), [version, locale]);
  const fc = useMemo(() => formCustom ?? EMPTY_FORM_CUSTOM, [formCustom]);

  const sections = useMemo(() => effectiveSections(version, fc), [version, fc]);
  const progress = useMemo(() => sectionProgress(version, fc, answers), [version, fc, answers]);
  const overall = useMemo(() => overallProgress(version, fc, answers), [version, fc, answers]);
  const srcStates = useMemo(
    () => (sources ? sectionSourceStates(version, fc, answers, links, sources) : []),
    [version, fc, answers, links, sources],
  );
  const sectionStateMap = useMemo(() => Object.fromEntries(srcStates.map((s) => [s.section, s.state])) as Record<string, FieldSourceState>, [srcStates]);
  const fieldStateMap = useMemo(() => {
    const m: Record<string, FieldSourceState> = {};
    for (const s of srcStates) for (const f of s.fields) m[f.key] = f.state;
    return m;
  }, [srcStates]);
  const changes = useMemo(
    () => (sources ? listSourceChanges(version, fc, answers, links, sources, locale) : []),
    [version, fc, answers, links, sources, locale],
  );
  const hiddenList = useMemo(() => hiddenFieldsWithAnswers(version, fc, answers), [version, fc, answers]);
  const importedKeys = useMemo(() => new Set(Object.entries(links).filter(([, l]) => l.a === "imported").map(([k]) => k)), [links]);
  const labelFor = useMemo(() => makeLabelResolver(version, locale, fc.labels, fc.custom), [version, locale, fc.labels, fc.custom]);
  const fieldIndex = useMemo(() => templateFieldIndex(version), [version]);

  const markDirty = () => setDirty(true);
  const toastError = (code: string) => showToast({ type: "error", title: t("title"), message: t(`errors.${errorKey(code)}`) });

  const onAnswer = useCallback((key: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const onToggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Bölüm bazlı içe aktarma ──
  const nowIso = () => new Date().toISOString();
  const onImport = useCallback(
    (section: string) => {
      if (!sources || !formCustom) return;
      const plan = planSectionImport(version, formCustom, section, answers, sources, locale);
      if (plan.conflicts.length > 0) {
        setImportState({ plan, section });
        return;
      }
      const res = applyImport(plan, {}, answers, links, sources, version, nowIso());
      setAnswers(res.answers);
      setLinks(res.links);
      setDirty(true);
      showToast({
        type: plan.fills.length ? "success" : "info",
        title: t("import.action"),
        message: plan.fills.length ? t("import.done", { count: plan.fills.length }) : t("import.nothing"),
      });
    },
    [sources, formCustom, version, answers, links, locale, showToast, t],
  );

  function applyChoices(plan: ImportPlan, choices: Record<string, ConflictChoice>) {
    if (!sources) return;
    const res = applyImport(plan, choices, answers, links, sources, version, nowIso());
    setAnswers(res.answers);
    setLinks(res.links);
    setDirty(true);
  }

  // ── Form özelleştirme (yalnız bu anamnez) ──
  const updateFc = (next: FormCustom) => {
    setFormCustom(next);
    markDirty();
  };

  const onRemoveField = useCallback(
    async (key: string) => {
      if (!formCustom) return;
      const has = !isEmptyAnswer(answers[key]);
      const ok = await confirm({
        title: t("hidden.removeTitle"),
        message: has ? t("hidden.removeWithAnswer") : t("hidden.removeNoAnswer"),
        tone: "warning",
        confirmText: t("hidden.removeConfirm"),
        cancelText: t("custom.cancel"),
      });
      if (ok) updateFc(hideField(formCustom, key));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formCustom, answers, confirm, t],
  );

  const onDeleteCustom = useCallback(
    async (key: string) => {
      if (!formCustom) return;
      const has = !isEmptyAnswer(answers[key]);
      const ok = await deleteConfirm({
        title: t("custom.deleteTitle"),
        message: has ? t("custom.deleteWithAnswer") : t("custom.deleteNoAnswer"),
        confirmText: t("delete.confirm"),
        cancelText: t("delete.cancel"),
      });
      if (!ok) return;
      const r = deleteCustomField(formCustom, answers, key);
      setFormCustom(r.formCustom);
      setAnswers(r.answers);
      markDirty();
    },
    [formCustom, answers, deleteConfirm, t],
  );

  const onToggleSection = useCallback(
    (section: string, enabled: boolean) => {
      if (!formCustom) return;
      updateFc(setSectionEnabled(formCustom, section as AnamnezSectionKey, enabled));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formCustom],
  );

  const onAddField = useCallback((section: string) => setAddFieldSection(section as AnamnezSectionKey), []);
  const onEditLabel = useCallback((key: string) => setLabelKey(key), []);
  const onViewChanges = useCallback(() => setChangesOpen(true), []);

  async function onRestore(key: string) {
    if (formCustom) updateFc(restoreField(formCustom, key));
  }

  async function onClearAnswer(key: string) {
    const ok = await deleteConfirm({
      title: t("hidden.clearTitle"),
      message: t("hidden.clearMessage"),
      confirmText: t("hidden.clearConfirm"),
      cancelText: t("custom.cancel"),
    });
    if (!ok) return;
    setAnswers((prev) => clearAnswer(prev, key));
    markDirty();
  }

  async function onResetStandard() {
    if (!formCustom) return;
    const ok = await confirm({
      title: t("editor.resetTitle"),
      message: t("editor.resetMessage"),
      tone: "warning",
      confirmText: t("editor.resetConfirm"),
      cancelText: t("custom.cancel"),
    });
    if (ok) updateFc(resetToStandard(formCustom, answers));
  }

  // ── Kaydet / Tamamla / Sil ──
  async function save(): Promise<boolean> {
    if (!rec || !formCustom || busy) return false;
    setBusy("save");
    const res = await anamnezFetch<{ revision: number; answers: Answers; formCustom: FormCustom; sourceLinks?: SourceLinks }>(base, {
      method: "PATCH",
      body: {
        baseRevision: rec.revision,
        formCustom,
        answers,
        sourceLinks: links,
        title: title.trim() || null,
        assessmentDate: date,
      },
    });
    setBusy(null);
    if (!res.ok) {
      if (res.code === "CONFLICT") {
        showToast({ type: "error", title: t("title"), message: t("editor.conflict"), duration: 9000 });
      } else toastError(res.code);
      return false;
    }
    setRec({ ...rec, revision: res.data.revision, title: title.trim() || null, assessment_date: date, form_custom: res.data.formCustom, answers: res.data.answers, source_links: res.data.sourceLinks ?? links });
    setFormCustom(res.data.formCustom);
    setAnswers(res.data.answers);
    if (res.data.sourceLinks) setLinks(res.data.sourceLinks);
    setDirty(false);
    showToast({ type: "success", title: t("title"), message: t("editor.saved") });
    return true;
  }

  async function complete() {
    if (!rec || busy) return;
    const ok = await confirm({
      title: t("editor.completeTitle"),
      message: t("editor.completeMessage"),
      tone: "warning",
      confirmText: t("editor.completeConfirm"),
      cancelText: t("custom.cancel"),
    });
    if (!ok) return;
    let revision = rec.revision;
    if (dirty) {
      const saved = await save();
      if (!saved) return;
      revision = rec.revision + 1;
    }
    setBusy("complete");
    const res = await anamnezFetch(`${base}/complete`, { method: "POST", body: { baseRevision: revision } });
    setBusy(null);
    if (!res.ok) return toastError(res.code);
    showToast({ type: "success", title: t("title"), message: t("editor.completed") });
    await reload();
  }

  async function startNew(mode: "previous" | "refresh") {
    if (!rec || busy) return;
    setBusy("new");
    const res = await anamnezFetch<{ anamnesis: { id: string } }>(anamnezBase(clientId), {
      method: "POST",
      body: { mode, fromId: rec.id, assessmentDate: todayIsoIstanbul(), title: null, requestId: crypto.randomUUID() },
    });
    setBusy(null);
    if (res.ok) {
      setChangesOpen(false);
      router.push(`/dashboard/clients/${encodeURIComponent(clientId)}/anamnez/${res.data.anamnesis.id}`);
      return;
    }
    if (res.code === "DRAFT_EXISTS" && typeof res.data.draftId === "string") {
      showToast({ type: "warning", title: t("title"), message: t("create.draftExists") });
      router.push(`/dashboard/clients/${encodeURIComponent(clientId)}/anamnez/${res.data.draftId}`);
      return;
    }
    toastError(res.code);
  }

  async function remove() {
    if (!rec || busy) return;
    const name = clientDisplayFromSnapshot(rec.client_snapshot) || "—";
    const dateText = formatIsoDate(rec.assessment_date, locale);
    const files = attachments.length;
    const ok = locked
      ? await deleteConfirm({
          title: t("delete.completedTitle"),
          message: t("delete.completedMessage", { name, date: dateText, files }),
          requireText: t("delete.confirmWord"),
          requireTextLabel: t("delete.confirmLabel"),
          confirmText: t("delete.confirm"),
          cancelText: t("delete.cancel"),
        })
      : await deleteConfirm({
          title: t("delete.draftTitle"),
          message: t("delete.draftMessage", { date: dateText, files }),
          confirmText: t("delete.confirm"),
          cancelText: t("delete.cancel"),
        });
    if (!ok) return;
    setBusy("delete");
    const res = await anamnezFetch(base, {
      method: "DELETE",
      body: locked ? { confirmText: t("delete.confirmWord") } : { confirmDraft: true },
    });
    setBusy(null);
    if (!res.ok) return toastError(res.code);
    setDirty(false);
    showToast({ type: "success", title: t("title"), message: t("delete.deleted") });
    router.push(backHref);
  }

  async function downloadBlank() {
    if (busy) return;
    setBusy("pdf");
    try {
      const res = await fetch(`${anamnezBase(clientId)}/blank-form?aid=${encodeURIComponent(anamnesisId)}&locale=${locale}`, {
        headers: anamnezAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        let code = "generic";
        try { code = ((await res.json()) as { code?: string }).code ?? "generic"; } catch { /* yok */ }
        toastError(code);
        return;
      }
      await downloadFileResponse(res, locale === "en" ? "intake-form.pdf" : "anamnez-formu.pdf");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Kayıtlı (dolu) form PDF'i — sunucudaki son kaydı yazar. Kaydedilmemiş değişiklik varken pasif
   * (PDF ekrandakiyle çelişmesin); `rev` ile istenir → arada başka oturum kaydettiyse 409 CONFLICT.
   * Cihaz tespitiyle gizlenmez (K8).
   */
  async function downloadFilled() {
    if (busy || dirty || !rec) return;
    setBusy("filledPdf");
    try {
      const res = await fetch(`${base}/pdf?rev=${rec.revision}&locale=${locale}`, {
        headers: anamnezAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        let code = "generic";
        try { code = ((await res.json()) as { code?: string }).code ?? "generic"; } catch { /* yok */ }
        toastError(code);
        return;
      }
      await downloadFileResponse(res, `anamnez-${rec.assessment_date}.pdf`);
    } catch {
      toastError("generic");
    } finally {
      setBusy(null);
    }
  }

  async function goBack(e: MouseEvent) {
    if (!dirty) return;
    e.preventDefault();
    const ok = await confirm({
      title: t("editor.unsaved"),
      message: t("editor.leaveMessage"),
      tone: "warning",
      confirmText: t("editor.leaveConfirm"),
      cancelText: t("custom.cancel"),
    });
    if (ok) {
      setDirty(false);
      router.push(backHref);
    }
  }

  // ── Render ──
  if (load.kind === "loading" || (load.kind === "ready" && !rec)) {
    return (
      <Shell>
        <div className="animate-pulse space-y-3" aria-busy="true" aria-label={t("editor.loading")}>
          <div className="h-8 w-48 rounded-lg bg-slate-200" />
          <div className="h-32 rounded-2xl bg-white/80" />
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-2xl bg-white/80" />)}
        </div>
      </Shell>
    );
  }
  if (load.kind === "error" || !rec || !formCustom) {
    const code = load.kind === "error" ? load.code : "generic";
    return (
      <Shell>
        <Link href={backHref} className="text-[13px] font-extrabold text-indigo-700 hover:underline">← {t("editor.back")}</Link>
        <div className="mt-3 rounded-2xl bg-white p-5 text-[15px] font-bold text-slate-700 shadow">
          {code === "NOT_FOUND" ? t("editor.notFound") : t(`errors.${errorKey(code)}`)}
          {code !== "NOT_FOUND" ? (
            <button type="button" onClick={() => void reload()} className="ml-3 text-indigo-700 underline">{t("list.retry")}</button>
          ) : null}
        </div>
      </Shell>
    );
  }

  const name = clientDisplayFromSnapshot(rec.client_snapshot);
  const kindLabel = t(`kind.${rec.kind}`);
  const labelTarget = labelKey
    ? fc.custom.find((c) => c.key === labelKey) ?? null
    : null;
  const pct = overall.total ? Math.round((overall.filled / overall.total) * 100) : 0;

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} onClick={(e) => void goBack(e)} className="inline-flex min-h-[40px] items-center text-[13px] font-extrabold text-indigo-700 hover:underline">
          ← {t("editor.back")}
        </Link>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void downloadBlank()} disabled={busy !== null} className={`${ANAMNEZ_PDF_CTA_HIDE} min-h-[40px] items-center rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60`}>
            {busy === "pdf" ? t("list.blankFormBusy") : t("list.blankForm")}
          </button>
          <button
            type="button"
            onClick={() => void downloadFilled()}
            disabled={busy !== null || dirty}
            title={dirty ? t("list.filledFormSaveFirst") : undefined}
            aria-describedby={dirty ? "anamnez-filled-pdf-hint" : undefined}
            className={`${ANAMNEZ_PDF_CTA_HIDE} min-h-[40px] items-center rounded-xl border border-teal-300 bg-white px-3 text-[13px] font-bold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy === "filledPdf" ? t("list.filledFormBusy") : t("list.filledForm")}
          </button>
          <button type="button" onClick={() => void remove()} disabled={busy !== null} className="btn-outline btn-outline-danger min-h-[40px] disabled:opacity-60">
            {locked ? t("delete.completedAction") : t("delete.draftAction")}
          </button>
        </div>
        {dirty ? (
          <p id="anamnez-filled-pdf-hint" className={`${ANAMNEZ_PDF_HINT_HIDE} w-full text-right text-[12px] font-semibold text-amber-700`}>
            {t("list.filledFormSaveFirst")}
          </p>
        ) : null}
      </div>

      {/* Başlık kartı */}
      <section className="relative overflow-hidden rounded-[22px] border border-white/80 bg-white/90 p-4 shadow-lg">
        <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-teal-200 opacity-50 blur-[34px]" />
        <div className="relative flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-black text-teal-800">{t("title")}</span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${locked ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-800"}`}>
            {locked ? `🔒 ${t("status.completed")}` : t("status.draft")}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{version}</span>
          {changes.length > 0 ? <SourceBadge state="changed" /> : null}
        </div>
        <h1 className="relative mt-2 text-[22px] font-black text-slate-900 sm:text-[24px]">{name || "—"}</h1>
        <p className="relative text-[14px] font-bold text-slate-600">{rec.title || kindLabel}</p>

        {locked ? (
          <p className="relative mt-2 text-[13px] font-semibold text-slate-600">
            {t("editor.dateLabel")}: {formatIsoDate(rec.assessment_date, locale)} · {t("editor.completedAt")}: {formatInstantDate(rec.completed_at, locale)}
          </p>
        ) : (
          <div className="relative mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={aLabel}>{t("editor.dateLabel")}</span>
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); markDirty(); }} className={`${aInput} mt-1`} />
            </label>
            <label className="block">
              <span className={aLabel}>{t("editor.titleLabel")}</span>
              <input type="text" {...freeTextFieldProps("title")} value={title} maxLength={120} placeholder={kindLabel} onChange={(e) => { setTitle(e.target.value); markDirty(); }} className={`${aInput} mt-1`} />
            </label>
          </div>
        )}

        <div className="relative mt-3">
          <div className="flex items-center justify-between text-[12px] font-bold text-slate-500">
            <span>{t("editor.progress", { filled: overall.filled, total: overall.total })}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="relative mt-3 text-[11px] font-medium leading-relaxed text-slate-400">{t("wellnessNote")}</p>
      </section>

      {explicitConsent === false ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-semibold text-amber-900">{t("consent.missing")}</p>
          <Link href={`/dashboard/clients/${encodeURIComponent(clientId)}?tab=genel`} className="shrink-0 text-[13px] font-extrabold text-amber-900 underline">
            {t("consent.action")}
          </Link>
        </div>
      ) : null}

      {locked ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-extrabold text-slate-800">🔒 {t("editor.lockedTitle")}</p>
            <p className="text-[13px] font-medium text-slate-600">{t("editor.lockedHint")}</p>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => void startNew("previous")} className="btn-secondary min-h-[42px] shrink-0 disabled:opacity-60">
            {t("editor.newFromThis")}
          </button>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-extrabold text-amber-900">⚠ {locked ? t("changes.bannerCompleted") : t("changes.bannerDraft")}</p>
          <button type="button" onClick={() => setChangesOpen(true)} className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-amber-400 bg-white px-3 text-[13px] font-extrabold text-amber-800 hover:bg-amber-100">
            {t("changes.view")}
          </button>
        </div>
      ) : null}

      {/* Satış öncesi kapanış: tamamlanmış anamnez gerçekten kilitli — belge ekleme/kaldırma yok (API de 409 LOCKED). */}
      <AnamnezAttachments base={base} attachments={attachments} locale={locale} canUpload={!locked} onChange={setAttachments} />

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setExpanded(new Set(sections.map((s) => s.key)))} className="text-[12px] font-extrabold text-slate-600 hover:underline">{t("editor.expandAll")}</button>
        <span className="text-slate-300">·</span>
        <button type="button" onClick={() => setExpanded(new Set())} className="text-[12px] font-extrabold text-slate-600 hover:underline">{t("editor.collapseAll")}</button>
      </div>

      <div className="space-y-2.5">
        {sections.map((s) => (
          <AnamnezSectionCard
            key={s.key}
            section={s}
            template={template}
            catalog={catalog}
            answers={answers}
            fieldStates={fieldStateMap}
            importedKeys={importedKeys}
            sectionState={sectionStateMap[s.key] ?? "none"}
            progress={progress[s.key] ?? { filled: 0, total: 0 }}
            expanded={expanded.has(s.key)}
            locked={locked}
            sourceMetaFor={(key) => {
              if (!sourceMeta) return null;
              const at = key === "B.height_cm" ? sourceMeta.heightMeasuredAt : key === "B.weight_kg" ? sourceMeta.weightMeasuredAt : null;
              return at && fieldStateMap[key] && fieldStateMap[key] !== "none" ? t("import.measuredAt", { date: formatInstantDate(at, locale) }) : null;
            }}
            extraTop={
              s.key === "B" && healthNote ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-extrabold text-violet-900">{t("editor.healthNoteTitle")}</p>
                    <button type="button" aria-expanded={healthOpen} onClick={() => setHealthOpen((v) => !v)} className="text-[12px] font-extrabold text-violet-800 underline">
                      {healthOpen ? t("editor.healthNoteHide") : t("editor.healthNoteShow")}
                    </button>
                  </div>
                  <p className="mt-0.5 text-[12px] font-medium text-violet-800/80">{t("editor.healthNoteHint")}</p>
                  {healthOpen ? (
                    <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-slate-700 select-text">{healthNote}</p>
                  ) : null}
                </div>
              ) : null
            }
            onToggle={onToggle}
            onAnswer={onAnswer}
            onImport={onImport}
            onViewChanges={onViewChanges}
            onToggleSection={onToggleSection}
            onRemoveField={(k) => void onRemoveField(k)}
            onEditLabel={onEditLabel}
            onDeleteCustom={(k) => void onDeleteCustom(k)}
            onAddField={onAddField}
          />
        ))}
      </div>

      {hiddenList.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <summary className="cursor-pointer text-[14px] font-extrabold text-slate-800">{t("hidden.title", { count: hiddenList.length })}</summary>
          <p className="mt-1 text-[12px] font-medium text-slate-500">{t("hidden.hint")}</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {hiddenList.map((h) => (
              <li key={h.key} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-slate-800">{h.section}. {labelFor(h.key)}</div>
                  <div className={`text-[12px] font-semibold ${h.hasAnswer ? "text-amber-700" : "text-slate-400"}`}>
                    {h.hasAnswer ? t("hidden.hasAnswer") : t("hidden.noAnswer")}
                  </div>
                </div>
                {!locked ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void onRestore(h.key)} className="inline-flex min-h-[40px] items-center rounded-xl border border-teal-300 px-3 text-[13px] font-extrabold text-teal-700 hover:bg-teal-50">
                      {t("hidden.restore")}
                    </button>
                    {h.hasAnswer ? (
                      <button type="button" onClick={() => void onClearAnswer(h.key)} className="inline-flex min-h-[40px] items-center rounded-xl px-3 text-[13px] font-bold text-rose-700 hover:bg-rose-50">
                        {t("hidden.clearAnswer")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!locked ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void onResetStandard()} className="text-[12px] font-extrabold text-slate-500 underline hover:text-slate-700">
            {t("editor.resetStandard")}
          </button>
        </div>
      ) : null}

      {/* Yapışkan kaydet çubuğu (yalnız taslak) */}
      {!locked ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
            <span className={`text-[12px] font-extrabold ${dirty ? "text-amber-700" : "text-emerald-700"}`} aria-live="polite">
              {dirty ? `● ${t("editor.unsaved")}` : `✓ ${t("editor.allSaved")}`}
            </span>
            <div className="flex flex-1 justify-end gap-2 sm:flex-none">
              <button type="button" onClick={() => void complete()} disabled={busy !== null} className="btn-secondary min-h-[44px] flex-1 disabled:opacity-60 sm:flex-none">
                {busy === "complete" ? t("editor.completing") : t("editor.complete")}
              </button>
              <button type="button" onClick={() => void save()} disabled={busy !== null || !dirty} className="btn-primary min-h-[44px] flex-1 disabled:opacity-60 sm:flex-none">
                {busy === "save" ? t("editor.saving") : t("editor.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Diyaloglar */}
      <ImportConflictDialog
        open={importState !== null}
        conflicts={importState?.plan.conflicts ?? []}
        version={version}
        locale={locale}
        labelFor={labelFor}
        onCancel={() => setImportState(null)}
        onApply={(choices) => {
          if (importState) applyChoices(importState.plan, choices);
          setImportState(null);
        }}
      />
      <ChangesDialog
        open={changesOpen}
        changes={changes}
        version={version}
        locale={locale}
        locked={locked}
        labelFor={labelFor}
        busy={busy !== null}
        onClose={() => setChangesOpen(false)}
        onStartNew={() => void startNew("refresh")}
        onApply={(choices) => {
          applyChoices(
            {
              fills: [],
              equal: [],
              conflicts: changes.map((c) => ({
                key: c.key,
                field: c.field,
                current: c.anamnesisValue,
                incoming: c.sourceValue,
                addRows: c.field.type === "rows" ? c.addedRows ?? [] : undefined,
              })),
            },
            choices,
          );
          setChangesOpen(false);
        }}
      />
      <AddFieldDialog
        open={addFieldSection !== null}
        section={addFieldSection}
        sectionTitle={addFieldSection ? catalog.sections[addFieldSection]?.title ?? addFieldSection : ""}
        onClose={() => setAddFieldSection(null)}
        onAdd={(input) => {
          if (formCustom) updateFc(addCustomField(formCustom, input));
          setExpanded((prev) => new Set(prev).add(input.section));
          setAddFieldSection(null);
        }}
      />
      <LabelEditDialog
        open={labelKey !== null}
        current={labelKey ? labelFor(labelKey) : ""}
        standard={labelKey && !labelTarget && fieldIndex.has(labelKey) ? catalog.fields[labelKey]?.label ?? labelKey : null}
        onClose={() => setLabelKey(null)}
        onSave={(label) => {
          if (formCustom && labelKey) {
            if (labelTarget) {
              if (label) updateFc(renameCustomField(formCustom, labelKey, label));
            } else {
              updateFc(setLabelOverride(formCustom, labelKey, label));
            }
          }
          setLabelKey(null);
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-2 pb-32 text-slate-950 sm:p-3.5 sm:pb-32">
      <div className="mx-auto w-full max-w-4xl space-y-3">{children}</div>
    </main>
  );
}
