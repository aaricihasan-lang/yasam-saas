"use client";

import { useState } from "react";
import { useAromaterapiListQuery } from "@/app/aromaterapi/_components/read/useAromaterapiListQuery";
import { ReadListScreen } from "@/app/aromaterapi/_components/read/ReadListScreen";
import { useReadListSelection } from "@/app/aromaterapi/_components/read/useReadListSelection";
import { useToast } from "@/components/ui/ToastProvider";
import {
  MetaChip,
  ReadFilterSelect,
  ReadSearchBar,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";
import { fetchGlossaryList } from "@/lib/aromaterapi/glossaryData";
import { deleteGlossaryTerm } from "@/lib/aromaterapi/glossaryWrite";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";
import { GLOSSARY_STATUS_TR } from "@/lib/aromaterapi/readLabels";
import { useTranslations } from "next-intl";
import { useEnumLabel, useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { SozlukForm } from "@/app/aromaterapi/bilgi-bankasi/sozluk/_components/SozlukForm";

/**
 * Sözlük — gerçek tenant-scoped terim listesi (arama + durum filtresi + sayfalama) +
 * uzman authoring (oluştur/düzenle/sil). Silme onaylı ve terim adıyla açıktır.
 * NOT: şemada dil kolonu yok → dil filtresi uygulanmaz (TR/EN ayrı kolonlar).
 */

const FILTER_KEYS = ["status"] as const;

type EditorState = { mode: "create" } | { mode: "edit"; row: GlossaryTermListItem } | null;

export function SozlukView() {
  const s = useAromaterapiListQuery<GlossaryTermListItem>({
    fetcher: fetchGlossaryList,
    filterKeys: FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const { showToast } = useToast();
  const t = useTranslations("aromatherapy.glossary");
  const enumOptions = useEnumOptions();
  // Yazma hata kodu → ekran metni (TR = glossaryWrite GLOSSARY_MESSAGES birebir).
  const errorText = (code: string | null) => (code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
  const selection = useReadListSelection({ exportUrl: "/api/aromaterapi/glossary/word-report", resetKey: `${s.q}|${JSON.stringify(s.filters)}|${s.sort}`, showToast });

  const isDemo = readYasamUser()?.is_demo_account === true;
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlossaryTermListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleSaved(created: boolean) {
    setEditor(null);
    showToast({ title: t("successTitle"), message: created ? t("added") : t("updated"), type: "success" });
    s.retry();
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const res = await deleteGlossaryTerm(deleteTarget.id);
    setDeleting(false);
    if (res.ok) {
      setDeleteTarget(null);
      showToast({ title: t("deletedTitle"), message: t("deleted"), type: "success" });
      s.retry();
    } else {
      showToast({ title: t("errorTitle"), message: errorText(res.errorCode), type: "error" });
    }
  }

  if (editor) {
    return (
      <SozlukForm
        mode={editor.mode}
        initial={editor.mode === "edit" ? editor.row : null}
        isDemo={isDemo}
        onSaved={() => handleSaved(editor.mode === "create")}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <>
      <ReadListScreen<GlossaryTermListItem>
        selection={selection}
        loading={s.loading}
        errorCode={s.errorCode}
        rows={s.rows}
        total={s.total}
        page={s.page}
        limit={s.limit}
        hasActiveQuery={hasActive}
        onPage={s.goToPage}
        onRetry={s.retry}
        emptyTitle={t("emptyTitle")}
        emptyMessage={t("emptyMessage")}
        gridClassName="grid grid-cols-1 gap-3 lg:grid-cols-2"
        action={
          isDemo ? null : (
            <button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 text-[13px] font-black text-white shadow-md transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
            >
              {t("newTerm")}
            </button>
          )
        }
        search={
          <ReadSearchBar value={s.qInput} onChange={s.setQInput} placeholder={t("searchPlaceholder")} />
        }
        filters={
          <>
            <ReadFilterSelect
              label={t("statusLabel")}
              value={s.filters.status ?? ""}
              options={enumOptions(Object.keys(GLOSSARY_STATUS_TR), GLOSSARY_STATUS_TR)}
              onChange={(v) => s.setFilter("status", v)}
            />
            <ReadFilterSelect
              label={t("sortLabel")}
              value={s.sort}
              allLabel={t("sortAlpha")}
              options={[{ value: "updated", label: t("sortUpdated") }]}
              onChange={s.setSort}
            />
          </>
        }
        renderItem={(row) => (
          <TermCard
            key={row.id}
            row={row}
            isDemo={isDemo}
            onEdit={() => setEditor({ mode: "edit", row })}
            onDelete={() => setDeleteTarget(row)}
          />
        )}
      />

      <AromaterapiConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title={t("deleteTitle")}
        description={
          <>
            {t.rich("deleteBody", { name: deleteTarget?.canonical_term_tr ?? "", strong: (c) => <strong>{c}</strong> })}
          </>
        }
        confirmLabel={deleting ? t("deleting") : t("deleteConfirm")}
        cancelLabel={t("deleteCancel")}
        confirmDisabled={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

function TermCard({
  row,
  isDemo,
  onEdit,
  onDelete,
}: {
  row: GlossaryTermListItem;
  isDemo: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("aromatherapy.glossary");
  const enumLabel = useEnumLabel();
  const hasPro = Boolean(row.professional_definition_tr);
  return (
    <article className="flex h-full flex-col rounded-2xl border border-rose-100/70 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[15px] font-black text-slate-900 [overflow-wrap:anywhere]">
          {row.canonical_term_tr}
        </h3>
        {row.canonical_term_en ? (
          <span className="text-[12px] font-semibold italic text-slate-400">
            {row.canonical_term_en}
          </span>
        ) : null}
        <MetaChip tone="rose">{enumLabel(GLOSSARY_STATUS_TR, row.status)}</MetaChip>
      </div>
      <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
        {row.short_definition_tr}
      </p>
      {hasPro ? (
        <div className="pt-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 px-3 text-[12px] font-black text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
          >
            {open ? t("hidePro") : t("showPro")}
          </button>
          {open ? (
            <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-rose-200 pl-3 text-[13px] font-medium leading-relaxed text-slate-600">
              {row.professional_definition_tr}
            </p>
          ) : null}
        </div>
      ) : null}
      {!isDemo ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
          >
            {t("edit")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-black text-rose-600 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
          >
            {t("delete")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
