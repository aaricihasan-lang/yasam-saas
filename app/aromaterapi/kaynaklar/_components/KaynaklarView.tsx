"use client";

import Link from "next/link";
import { useId, useState } from "react";
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
import { fetchSourceList, fetchSource } from "@/lib/aromaterapi/sourceData";
import { updateSource, sourceMessageForCode } from "@/lib/aromaterapi/sourceWrite";
import type { SourceListItem } from "@/lib/aromaterapi/readTypes";
import { SOURCE_STATUS_TR, SOURCE_TYPE_TR, tr } from "@/lib/aromaterapi/readLabels";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { KaynakForm } from "@/app/aromaterapi/kaynaklar/_components/KaynakForm";

/**
 * Kaynaklar — gerçek tenant-scoped kaynak listesi (arama + filtre + sayfalama) +
 * uzman authoring (oluştur/düzenle/arşivle). Kaynak "silme" = arşivleme (status→archived);
 * atıflı kaynak hard delete edilmez (provenans korunur). RPC + audit yolu.
 */

const SOURCE_FILTER_KEYS = ["source_type", "status", "year"] as const;

const SOURCE_TYPE_OPTIONS = Object.entries(SOURCE_TYPE_TR).map(([value, label]) => ({ value, label }));
const SOURCE_STATUS_OPTIONS = Object.entries(SOURCE_STATUS_TR).map(([value, label]) => ({ value, label }));

type EditorState = { mode: "create" } | { mode: "edit"; id: string } | null;

export function KaynaklarView() {
  const s = useAromaterapiListQuery<SourceListItem>({
    fetcher: fetchSourceList,
    filterKeys: SOURCE_FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const { showToast } = useToast();
  const selection = useReadListSelection({ exportUrl: "/api/aromaterapi/sources/word-report", resetKey: `${s.q}|${JSON.stringify(s.filters)}|${s.sort}`, showToast });

  const isDemo = readYasamUser()?.is_demo_account === true;
  const [editor, setEditor] = useState<EditorState>(null);
  const [archiveTarget, setArchiveTarget] = useState<SourceListItem | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiving, setArchiving] = useState(false);

  function handleSaved(created: boolean) {
    setEditor(null);
    showToast({ title: "Başarılı", message: created ? "Kaynak eklendi." : "Kaynak güncellendi.", type: "success" });
    s.retry();
  }

  function closeArchive() {
    setArchiveTarget(null);
    setArchiveReason("");
  }

  async function handleArchive() {
    if (!archiveTarget || archiving) return;
    if (archiveReason.trim() === "") return;
    setArchiving(true);
    // Full-replacement update için tam künye gerekir (liste satırında olmayan alanlar).
    const det = await fetchSource(archiveTarget.id);
    if (!det.ok || !det.data) {
      setArchiving(false);
      showToast({ title: "Hata", message: sourceMessageForCode(det.errorCode), type: "error" });
      return;
    }
    const d = det.data;
    const res = await updateSource(archiveTarget.id, {
      source_type: d.source_type,
      title: d.title,
      authors: d.authors,
      organization: d.organization,
      publication_year: d.publication_year,
      doi: d.doi,
      pmid: d.pmid,
      isbn: d.isbn,
      url: d.url,
      document_no: d.document_no,
      notes: d.notes,
      status: "archived",
      expected_updated_at: d.updated_at,
      reason: archiveReason.trim(),
    });
    setArchiving(false);
    if (res.ok) {
      closeArchive();
      showToast({ title: "Arşivlendi", message: "Kaynak arşive alındı.", type: "success" });
      s.retry();
    } else {
      showToast({ title: "Hata", message: sourceMessageForCode(res.errorCode), type: "error" });
    }
  }

  if (editor) {
    return (
      <KaynakForm
        mode={editor.mode}
        sourceId={editor.mode === "edit" ? editor.id : undefined}
        isDemo={isDemo}
        onSaved={() => handleSaved(editor.mode === "create")}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <>
      <ReadListScreen<SourceListItem>
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
        emptyTitle="Henüz kaynak yok"
        emptyMessage="Kendi kaynak künyelerinizi eklemek için “+ Yeni Kaynak”a dokunun."
        gridClassName="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        action={
          isDemo ? null : (
            <button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 text-[13px] font-black text-white shadow-md transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
            >
              + Yeni Kaynak
            </button>
          )
        }
        search={
          <ReadSearchBar
            value={s.qInput}
            onChange={s.setQInput}
            placeholder="Başlık, yazar, DOI, ISBN ara…"
          />
        }
        filters={
          <>
            <ReadFilterSelect
              label="Kaynak türü"
              value={s.filters.source_type ?? ""}
              options={SOURCE_TYPE_OPTIONS}
              onChange={(v) => s.setFilter("source_type", v)}
            />
            <ReadFilterSelect
              label="Durum"
              value={s.filters.status ?? ""}
              options={SOURCE_STATUS_OPTIONS}
              onChange={(v) => s.setFilter("status", v)}
            />
            <YearFilter value={s.filters.year ?? ""} onChange={(v) => s.setFilter("year", v)} />
            <ReadFilterSelect
              label="Sırala"
              value={s.sort}
              allLabel="Başlığa göre (A–Z)"
              options={[
                { value: "year", label: "Yayın yılı (yeni)" },
                { value: "updated", label: "Son güncelleme" },
              ]}
              onChange={s.setSort}
            />
          </>
        }
        renderItem={(row) => (
          <SourceRow
            key={row.id}
            row={row}
            isDemo={isDemo}
            onEdit={() => setEditor({ mode: "edit", id: row.id })}
            onArchive={() => {
              setArchiveReason("");
              setArchiveTarget(row);
            }}
          />
        )}
      />

      <AromaterapiConfirmDialog
        open={archiveTarget !== null}
        tone="danger"
        title="Bu kaynağı arşive almak istiyor musunuz?"
        description={
          <>
            <strong>{archiveTarget?.title}</strong> kaynağı arşive alınacak (durum: Arşivlenmiş). Atıflı
            kaynaklar silinmez; arşiv listelerde durum filtresiyle görünmeye devam eder.
          </>
        }
        confirmLabel={archiving ? "Arşivleniyor…" : "Evet, Arşivle"}
        cancelLabel="Vazgeç"
        confirmDisabled={archiving || archiveReason.trim() === ""}
        onConfirm={() => void handleArchive()}
        onCancel={closeArchive}
      >
        <label className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
          Gerekçe <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={archiveReason}
          onChange={(e) => setArchiveReason(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Arşivleme nedenini kısaca yazın…"
          className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none focus-visible:border-rose-300 focus-visible:ring-2 focus-visible:ring-rose-300/50"
        />
      </AromaterapiConfirmDialog>
    </>
  );
}

function YearFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        Yıl
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1400}
        max={2100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="örn. 2019"
        className="min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3 text-[13px] font-bold text-slate-700 shadow-sm outline-none transition focus-visible:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-300/50"
      />
    </div>
  );
}

function SourceRow({
  row,
  isDemo,
  onEdit,
  onArchive,
}: {
  row: SourceListItem;
  isDemo: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const meta = [row.authors, row.organization, row.publication_year ? String(row.publication_year) : null]
    .filter(Boolean)
    .join(" · ");
  const isArchived = row.status === "archived";
  return (
    <article className="flex h-full flex-col rounded-2xl border border-violet-100/70 bg-white/90 p-4 shadow-sm">
      <Link
        href={`/aromaterapi/kaynaklar/${row.id}`}
        className="group focus-visible:outline-none"
      >
        <h3 className="text-[15px] font-black leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-violet-800">
          {row.title}
        </h3>
        {meta ? (
          <p className="mt-1 text-[12px] font-semibold text-slate-500 [overflow-wrap:anywhere]">{meta}</p>
        ) : null}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <MetaChip tone="violet">{tr.label(SOURCE_TYPE_TR, row.source_type)}</MetaChip>
        <MetaChip tone="slate">{row.passage_count.toLocaleString("tr-TR")} pasaj</MetaChip>
        <MetaChip tone="amber">{tr.label(SOURCE_STATUS_TR, row.status)}</MetaChip>
      </div>
      {!isDemo ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
          >
            Düzenle
          </button>
          {!isArchived ? (
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-amber-200 bg-white px-3 text-[12px] font-black text-amber-700 shadow-sm transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
            >
              Arşivle
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
