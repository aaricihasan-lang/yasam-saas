"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AromaterapiFormShell,
  AromaterapiFormSection,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { TextField, EnumSelect } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";
import { fetchArticleList, type ArticleItem } from "@/lib/aromaterapi/articleData";
import {
  createArticle,
  updateArticle,
  deleteArticle,
  articleMessageForCode,
  type ArticleBody,
} from "@/lib/aromaterapi/articleWrite";
import { ARTICLE_CATEGORIES } from "@/lib/aromaterapi/articleFields";

/**
 * Bilgi Bankası — uzmanın KENDİ notları (knowledge_articles) için authoring paneli.
 * Additive: mevcut referans-sheet görünümünü değiştirmez; bu panel kendi verisini yönetir.
 */

/**
 * I18N: kategori değerleri (ARTICLE_CATEGORIES: genel, kimyasal-bilesimler, …) kanonik — DB'ye yazılır, değişmez.
 * Yalnız GÖSTERİM aromatherapy.articles.categories.<kod>'dan gelir; katalogda olmayan (serbest metin) kategori ham gösterilir.
 * Hata kodu → metin: tr'de articleMessageForCode birebir; diğer dilde aromatherapy.articles.errors.<kod> (yoksa genel metin).
 */
const CATEGORY_KEYS: ReadonlySet<string> = new Set<string>(ARTICLE_CATEGORIES);

function useArticleText() {
  const t = useTranslations("aromatherapy.articles");
  const locale = useLocale();
  const categoryLabel = useCallback(
    (code: string) => (CATEGORY_KEYS.has(code) ? t(`categories.${code}`) : code),
    [t],
  );
  const errorText = useCallback(
    (code: string | null) =>
      locale === "tr" ? articleMessageForCode(code) : code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"),
    [t, locale],
  );
  return { t, categoryLabel, errorText };
}

type EditorState = { mode: "create" } | { mode: "edit"; item: ArticleItem } | null;

export function ArticlesPanel({ isDemo = false }: { isDemo?: boolean }) {
  const { showToast } = useToast();
  const { t, categoryLabel, errorText } = useArticleText();
  const [rows, setRows] = useState<ArticleItem[]>([]);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArticleItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // loading render'da türetilir (effect gövdesinde senkron setState YOK — codebase deseni).
  const loading = fetchedKey !== `${q}|${tick}`;

  useEffect(() => {
    const controller = new AbortController();
    const key = `${q}|${tick}`;
    fetchArticleList(q, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok) {
        setRows(res.rows);
        setErrorCode(null);
      } else if (res.errorCode !== null) {
        setRows([]);
        setErrorCode(res.errorCode);
      }
      setFetchedKey(key);
    });
    return () => controller.abort();
  }, [q, tick]);

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await deleteArticle(deleteTarget.id);
    setDeleting(false);
    if (res.ok) {
      setDeleteTarget(null);
      showToast({ title: t("deletedTitle"), message: t("deleted"), type: "success" });
      refresh();
    } else {
      showToast({ title: t("errorTitle"), message: errorText(res.errorCode), type: "error" });
    }
  }

  if (editor) {
    return (
      <section className="rounded-[20px] border border-amber-100/70 bg-white/92 p-5 shadow-sm sm:p-6">
        <ArticleForm
          mode={editor.mode}
          initial={editor.mode === "edit" ? editor.item : null}
          isDemo={isDemo}
          onSaved={(created) => {
            setEditor(null);
            showToast({ title: t("successTitle"), message: created ? t("added") : t("updated"), type: "success" });
            refresh();
          }}
          onCancel={() => setEditor(null)}
        />
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-amber-100/70 bg-white/85 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[16px] font-black tracking-tight text-slate-900">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            {t("subtitle")}
          </p>
        </div>
        {!isDemo ? (
          <button
            type="button"
            onClick={() => setEditor({ mode: "create" })}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 text-[12.5px] font-black text-white shadow-md transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
          >
            {t("newNote")}
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-[13px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/50"
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="py-6 text-center text-[13px] font-medium text-slate-500">{t("loading")}</p>
        ) : errorCode ? (
          <p className="py-6 text-center text-[13px] font-bold text-rose-600">{errorText(errorCode)}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-6 text-center text-[13px] font-medium text-slate-500">
            {q.trim() ? t("noMatch") : t("empty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((item) => (
              <ArticleCard
                key={item.id}
                item={item}
                isDemo={isDemo}
                onEdit={() => setEditor({ mode: "edit", item })}
                onDelete={() => setDeleteTarget(item)}
                categoryLabel={categoryLabel(item.category)}
              />
            ))}
          </div>
        )}
      </div>

      <AromaterapiConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title={t("deleteTitle")}
        description={
          <>
            {t.rich("deleteBody", { name: deleteTarget?.title ?? "", strong: (c) => <strong>{c}</strong> })}
          </>
        }
        confirmLabel={deleting ? t("deleting") : t("deleteConfirm")}
        cancelLabel={t("deleteCancel")}
        confirmDisabled={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

function ArticleCard({
  item,
  isDemo,
  onEdit,
  onDelete,
  categoryLabel,
}: {
  item: ArticleItem;
  isDemo: boolean;
  onEdit: () => void;
  onDelete: () => void;
  categoryLabel: string;
}) {
  const t = useTranslations("aromatherapy.articles");
  return (
    <article className="flex h-full flex-col rounded-2xl border border-amber-100/70 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[15px] font-black text-slate-900 [overflow-wrap:anywhere]">{item.title}</h3>
        <span className="rounded-full border border-amber-200 bg-amber-50/70 px-2 py-0.5 text-[10.5px] font-black text-amber-700">
          {categoryLabel}
        </span>
      </div>
      {item.summary ? (
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-600 [overflow-wrap:anywhere]">
          {item.summary}
        </p>
      ) : null}
      {!isDemo ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm transition hover:border-slate-300"
          >
            {t("edit")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-black text-rose-600 shadow-sm transition hover:bg-rose-50"
          >
            {t("delete")}
          </button>
        </div>
      ) : null}
    </article>
  );
}

type FormState = { title: string; category: string; summary: string; content: string; source: string };

function ArticleForm({
  mode,
  initial,
  isDemo,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: ArticleItem | null;
  isDemo: boolean;
  onSaved: (created: boolean) => void;
  onCancel: () => void;
}) {
  const initialState = useMemo<FormState>(
    () => ({
      title: initial?.title ?? "",
      category: initial?.category || "genel",
      summary: initial?.summary ?? "",
      content: initial?.content ?? "",
      source: initial?.source ?? "",
    }),
    [initial],
  );
  const [f, setF] = useState<FormState>(initialState);
  const { categoryLabel, errorText } = useArticleText();
  const tf = useTranslations("aromatherapy.articles.form");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrorCode(null);
  };

  const dirty = useMemo(
    () => (Object.keys(f) as (keyof FormState)[]).some((k) => f[k] !== initialState[k]),
    [f, initialState],
  );
  useAromaterapiDirtyGuard(dirty && !isDemo);

  const titleError = triedSubmit && f.title.trim() === "" ? tf("titleRequired") : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isDemo || submitting) return;
    setTriedSubmit(true);
    if (f.title.trim() === "") return;

    const body: ArticleBody = {
      title: f.title.trim(),
      category: f.category || "genel",
      summary: f.summary.trim(),
      content: f.content.trim(),
      source: f.source.trim(),
    };

    setSubmitting(true);
    setErrorCode(null);
    const res = mode === "create" ? await createArticle(body) : await updateArticle(initial?.id ?? "", body);
    setSubmitting(false);

    if (res.ok) {
      onSaved(mode === "create");
      return;
    }
    setErrorCode(res.errorCode);
  }

  return (
    <AromaterapiFormShell
      mode={mode}
      title={mode === "create" ? tf("createTitle") : tf("editTitle")}
      description={tf("description")}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitting={submitting}
      isDemo={isDemo}
      dirty={dirty}
      errorMessage={errorCode ? errorText(errorCode) : null}
    >
      <AromaterapiFormSection title={tf("section")}>
        <TextField label={tf("titleLabel")} value={f.title} onChange={(v) => set("title", v)} required disabled={isDemo} error={titleError} />
        <EnumSelect
          label={tf("category")}
          value={f.category}
          onChange={(v) => set("category", v || "genel")}
          options={ARTICLE_CATEGORIES.map((v) => ({ value: v, label: categoryLabel(v) }))}
          disabled={isDemo}
          allLabel={categoryLabel("genel")}
        />
        <TextField label={tf("summary")} value={f.summary} onChange={(v) => set("summary", v)} disabled={isDemo} multiline rows={2} hint={tf("summaryHint")} />
        <TextField label={tf("content")} value={f.content} onChange={(v) => set("content", v)} disabled={isDemo} multiline rows={8} />
        <TextField label={tf("source")} value={f.source} onChange={(v) => set("source", v)} disabled={isDemo} hint={tf("sourceHint")} />
      </AromaterapiFormSection>
    </AromaterapiFormShell>
  );
}
