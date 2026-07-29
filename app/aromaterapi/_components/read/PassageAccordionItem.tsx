"use client";

import { useEffect, useState } from "react";
import {
  LayerCard,
  MetaChip,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { fetchPassage } from "@/lib/aromaterapi/sourceData";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import type {
  PassageDetail,
  PassageEditorialLayer,
  PassageListItem,
} from "@/lib/aromaterapi/readTypes";
import {
  EDITORIAL_NOTE_TYPE_TR,
  FIDELITY_TR,
  PASSAGE_KIND_TR,
  RIGHTS_STATUS_TR,
  tr,
} from "@/lib/aromaterapi/readLabels";

/**
 * Kaynak detayında bir pasaj satırı. Açılınca pasaj katmanlarını (özgün metin /
 * sadık çeviri / editoryal açıklama / editoryal yorum-uzman notu) lazy yükler ve
 * AYRI kartlarda gösterir. Katmanlar birbirinin yerine fallback YAPMAZ; bir katman
 * boşsa dürüst "yok" notu gösterilir, başka katmanla doldurulmaz.
 */
export function PassageAccordionItem({ passage }: { passage: PassageListItem }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PassageDetail | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  // loading türetilir: açık ama henüz yüklenmemiş/hatasız (effect'te senkron setState yok).
  const loading = open && !fetched && !errorCode;

  useEffect(() => {
    if (!open || fetched) return;
    const controller = new AbortController();
    fetchPassage(passage.id, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && res.data) {
        setDetail(res.data);
        setFetched(true);
      } else if (res.errorCode) {
        setErrorCode(res.errorCode);
        setFetched(true);
      }
    });
    return () => controller.abort();
  }, [open, fetched, passage.id]);

  const panelId = `passage-panel-${passage.id}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-100/70 bg-white/90 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-violet-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
      >
        <span className="min-w-0">
          <span className="block text-[14px] font-black text-slate-800 [overflow-wrap:anywhere]">
            {passage.locator_label}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <MetaChip tone="violet">{tr.label(PASSAGE_KIND_TR, passage.passage_kind)}</MetaChip>
            <MetaChip tone="slate">{passage.original_lang}</MetaChip>
            <MetaChip tone="amber">{tr.label(RIGHTS_STATUS_TR, passage.rights_status)}</MetaChip>
          </span>
        </span>
        <span aria-hidden className={`shrink-0 text-violet-400 transition ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open ? (
        <div id={panelId} className="space-y-3 border-t border-violet-100/60 bg-violet-50/20 p-4">
          {loading ? (
            <p className="py-3 text-center text-[13px] font-semibold text-slate-400">
              Katmanlar yükleniyor…
            </p>
          ) : errorCode ? (
            <p role="alert" className="py-3 text-center text-[13px] font-bold text-rose-600">
              {messageForCode(errorCode)}
            </p>
          ) : detail ? (
            <PassageLayers detail={detail} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PassageLayers({ detail }: { detail: PassageDetail }) {
  return (
    <div className="space-y-3">
      {/* 1) Özgün Kaynak Metni */}
      <LayerCard index={1} title="Özgün Kaynak Metni" tone="amber">
        {detail.original_text && detail.original_text.trim() !== "" ? (
          detail.original_text
        ) : (
          <EmptyLayer text="Bu pasaj yalnız atıf içeriyor; birebir özgün metin kaydı yok." />
        )}
      </LayerCard>

      {/* 2) Sadık Çeviriler */}
      <div className="space-y-2">
        <LayerHeading index={2} title="Sadık Çeviriler" />
        {detail.translations.length === 0 ? (
          <ShallowEmpty text="Bu pasaj için sadık çeviri girilmemiş." />
        ) : (
          detail.translations.map((t) => (
            <LayerCard
              key={t.id}
              tone="emerald"
              title={`${t.source_lang} → ${t.target_lang}`}
              meta={
                <>
                  <MetaChip tone="emerald">{tr.label(FIDELITY_TR, t.fidelity)}</MetaChip>
                  <MetaChip tone="slate">rev. {t.revision}</MetaChip>
                </>
              }
            >
              {t.translated_text}
            </LayerCard>
          ))
        )}
      </div>

      {/* 3) Editoryal Açıklamalar */}
      <div className="space-y-2">
        <LayerHeading index={3} title="Editoryal Açıklamalar" />
        <EditorialList layers={detail.editorial_explanations} tone="violet" emptyText="Editoryal açıklama girilmemiş." />
      </div>

      {/* 4/5) Editoryal Yorum & Uzman Notu */}
      <div className="space-y-2">
        <LayerHeading index={4} title="Editoryal Yorum & Uzman Notu" />
        <EditorialList
          layers={detail.editorial_interpretations}
          tone="sky"
          emptyText="Editoryal yorum veya uzman notu girilmemiş."
        />
      </div>
    </div>
  );
}

function EditorialList({
  layers,
  tone,
  emptyText,
}: {
  layers: PassageEditorialLayer[];
  tone: "violet" | "sky";
  emptyText: string;
}) {
  if (layers.length === 0) return <ShallowEmpty text={emptyText} />;
  return (
    <>
      {layers.map((n) => (
        <LayerCard
          key={n.id}
          tone={tone}
          title={tr.label(EDITORIAL_NOTE_TYPE_TR, n.note_type)}
          meta={
            <>
              <MetaChip tone="slate">{n.note_lang}</MetaChip>
              <MetaChip tone="slate">rev. {n.revision}</MetaChip>
            </>
          }
        >
          {n.note_text}
        </LayerCard>
      ))}
    </>
  );
}

function LayerHeading({ index, title }: { index: number; title: string }) {
  return (
    <h4 className="text-[12px] font-black uppercase tracking-wide text-slate-500">
      {index}. {title}
    </h4>
  );
}

function EmptyLayer({ text }: { text: string }) {
  return <span className="text-[13px] font-medium italic text-slate-400">{text}</span>;
}

function ShallowEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2.5 text-[12.5px] font-medium italic text-slate-400">
      {text}
    </p>
  );
}
