"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, FileText, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  SUBCONSCIOUS_CAUSES_FONT_DEFAULT,
  SUBCONSCIOUS_CAUSES_FONT_MOBILE_MIN,
  subconsciousCausesTypography,
  type SubconsciousCausesTypography,
} from "@/lib/bioenergy/subconsciousCausesFontSize";
import { SUBCONSCIOUS_CAUSES_LIST_PATH } from "@/lib/bioenergy/subconsciousCausesListFetch";
import { useSubconsciousCausesFontSize } from "@/lib/bioenergy/useSubconsciousCausesFontSize";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";
import { bioApiDelete, bioApiGetOne, bioApiUpdate } from "@/lib/biyoenerji/secureApi";
import { badgeFieldWrapClass } from "./BiyoenerjiUi";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoGate } from "@/components/demo/DemoGate";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { BiyoenerjiConfirmModal } from "./BiyoenerjiConfirmModal";
import { LongTextareaField } from "./LargeTextModal";

type BioenergySubconsciousRecord = {
  id: string;
  tenant_id: string;
  source_uid: string;
  title: string | null;
  category: string | null;
  content: string | null;
  note_text: string | null;
  created_at: string;
};

type SubconsciousCauseForm = {
  source_uid: string;
  title: string;
  category: string;
  content: string;
  note_text: string;
};

const tbBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40";
const tbBtnDanger =
  "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-[13px] font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 disabled:opacity-40";

function trimOrEmpty(v: string) {
  return v.trim();
}

function slugifySourceUid(value: string) {
  const slug = value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || String(Date.now());
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function DetailSection({
  title,
  text,
  typography,
}: {
  title: string;
  text: string;
  typography: SubconsciousCausesTypography;
}) {
  return (
    <section className="border-t border-slate-200/60 py-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      <div className="min-w-0" style={typography.bodyStyle}>
        {formatStoneContent(text, { fontSizePx: typography.fontSizePx })}
      </div>
    </section>
  );
}

export default function BilincaltiSebepleriDetail({ id }: { id: string }) {
  const router = useRouter();
  const isMobile = useMobileViewport();
  const { isDemo } = useDemoGuard();
  const {
    fontSizePx,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useSubconsciousCausesFontSize();

  const contentFontSizePx = isMobile
    ? Math.max(SUBCONSCIOUS_CAUSES_FONT_MOBILE_MIN, fontSizePx)
    : fontSizePx;

  const contentTypography = useMemo(
    () => subconsciousCausesTypography(contentFontSizePx),
    [contentFontSizePx],
  );

  const [record, setRecord] = useState<BioenergySubconsciousRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);

  const downloadWord = useCallback(async () => {
    const tenantId = await getSyncedTenantId();
    if (!tenantId || !record) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/biyoenerji/subconscious-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: "single", id: record.id }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bilincalti-sebep-${record.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }, [record]);
  const [form, setForm] = useState<SubconsciousCauseForm>({
    source_uid: "",
    title: "",
    category: "",
    content: "",
    note_text: "",
  });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const showSoft = useCallback((kind: "ok" | "err", text: string) => {
    if (kind === "ok") {
      setInfoError("");
      setInfoSuccess(text);
    } else {
      setInfoSuccess("");
      setInfoError(text);
    }
  }, []);

  useEffect(() => {
    if (!infoSuccess && !infoError) return;
    const t = window.setTimeout(() => {
      setInfoSuccess("");
      setInfoError("");
    }, 5200);
    return () => window.clearTimeout(t);
  }, [infoSuccess, infoError]);

  const loadRecord = useCallback(async () => {
    const recordId = id.trim();
    if (!recordId) {
      setLoading(false);
      setErrorMessage("Geçersiz kayıt bağlantısı.");
      setRecord(null);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { row: data, error } = await bioApiGetOne("subconscious-causes", recordId);

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıt okunamadı: ${error}`);
      setRecord(null);
      return;
    }

    if (!data) {
      setErrorMessage("Kayıt bulunamadı.");
      setRecord(null);
      return;
    }

    const row = data as BioenergySubconsciousRecord;
    setRecord(row);
    setForm({
      source_uid: row.source_uid ?? "",
      title: row.title ?? "",
      category: row.category ?? "",
      content: row.content ?? "",
      note_text: row.note_text ?? "",
    });
  }, [id]);

  useEffect(() => {
    if (!id.trim()) {
      setLoading(false);
      setErrorMessage("Geçersiz kayıt bağlantısı.");
      setRecord(null);
      return;
    }
    void loadRecord();
  }, [loadRecord, id]);

  async function handleGuncelle() {
    const tenantId = await getSyncedTenantId();
    if (!tenantId || !record) return;

    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Başlık zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await bioApiUpdate("subconscious-causes", record.id, {
      source_uid: form.source_uid.trim() || slugifySourceUid(titleTrim),
      title: titleTrim,
      category: trimOrEmpty(form.category),
      content: trimOrEmpty(form.content),
      note_text: trimOrEmpty(form.note_text),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Güncellenemedi: ${error}`);
      return;
    }

    setFormModalOpen(false);
    await loadRecord();
    showSoft("ok", "Kayıt güncellendi.");
  }

  async function executeDelete() {
    const tenantId = await getSyncedTenantId();
    if (!tenantId || !record) return;

    setSaving(true);
    const { error } = await bioApiDelete("subconscious-causes", record.id);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }

    router.push(SUBCONSCIOUS_CAUSES_LIST_PATH);
  }

  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-violet-200/50 bg-violet-50/60">
        <p className="text-lg font-semibold text-slate-600">Kayıt yükleniyor…</p>
      </div>
    );
  }

  if (errorMessage && !record) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
        <p className="text-lg font-bold text-rose-800">{errorMessage}</p>
      </div>
    );
  }

  if (!record) return null;

  const contentText = record.content?.trim() ?? "";
  const noteText = record.note_text?.trim() ?? "";
  const categoryText = record.category?.trim() ?? "";
  const sourceUidText = record.source_uid?.trim() ?? "";

  return (
    <div className="w-full min-w-0 max-w-none">

      {/* Feedback */}
      {(infoSuccess || infoError) && (
        <div className="mb-4 flex flex-col gap-1.5 sm:flex-row">
          {infoSuccess ? (
            <div className="flex-1 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-[12px] font-medium text-emerald-700">{infoSuccess}</div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-md border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-[12px] font-medium text-rose-700">{infoError}</div>
          ) : null}
        </div>
      )}

      {/* Title row + actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="min-w-0 flex-1">
          {categoryText ? (
            <span className="mb-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              {categoryText}
            </span>
          ) : null}
          <h1 className="flex items-center gap-2.5 text-3xl font-black tracking-tight text-slate-900">
            <Brain className="h-7 w-7 shrink-0 text-amber-500" strokeWidth={2} aria-hidden />
            <span className="min-w-0 break-words">{record.title?.trim() || "İsimsiz kayıt"}</span>
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            {formatDate(record.created_at)}
            {sourceUidText ? ` · ${sourceUidText}` : ""}
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
          <DogaltasFontSizeControl
            fontSizePx={fontSizePx}
            onDecrease={decreaseFontSize}
            onReset={resetFontSize}
            onIncrease={increaseFontSize}
            canDecrease={canDecreaseFontSize}
            canIncrease={canIncreaseFontSize}
            isDefault={isDefaultFontSize}
            defaultFontSizePx={SUBCONSCIOUS_CAUSES_FONT_DEFAULT}
            compact
          />
          {!isDemo && (
            <>
              <div className="hidden h-7 w-px bg-slate-200 sm:block" aria-hidden />
              <button type="button" onClick={() => setFormModalOpen(true)} className={tbBtn}>
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                Düzenle
              </button>
              <button type="button" disabled={saving} onClick={() => setDeleteConfirmOpen(true)} className={tbBtnDanger}>
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                Sil
              </button>
              <button type="button" disabled={wordBusy} onClick={() => void downloadWord()} className={tbBtn}>
                <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                {wordBusy ? "Hazırlanıyor…" : "Word"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Document sections */}
      <DemoGate
        isProtected={isDemo}
        message="Bu kayıt içeriği demo hesabında sınırlı gösterilir. Tam sürümde tüm bilgilere erişilebilir."
      >
        <div>
          {contentText ? <DetailSection title="İçerik" text={contentText} typography={contentTypography} /> : null}
          {noteText ? <DetailSection title="Not" text={noteText} typography={contentTypography} /> : null}
          {isDemo && !contentText && !noteText ? (
            <DetailSection title="İçerik" text="Demo içerik alanı." typography={contentTypography} />
          ) : null}
        </div>
      </DemoGate>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="Bilinçaltı kaydını düzenle"
        subtitle="Kaydettikten sonra detay yenilenir."
        titleId="subconscious-edit-modal-title"
        accentRingClass="ring-fuchsia-100/50"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormModalOpen(false)}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                setForm({
                  source_uid: record.source_uid ?? "",
                  title: record.title ?? "",
                  category: record.category ?? "",
                  content: record.content ?? "",
                  note_text: record.note_text ?? "",
                })
              }
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Sıfırla
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleGuncelle()}
              className="rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/90 px-4 py-2.5 text-[12px] font-black text-fuchsia-950 shadow-sm transition hover:bg-fuchsia-100/90 disabled:opacity-55"
            >
              {saving ? "Güncelleniyor…" : "Güncelle"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak Anahtarı</span>
            <input
              value={form.source_uid}
              onChange={(e) => setForm((f) => ({ ...f, source_uid: e.target.value }))}
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Başlık *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
            <div className={badgeFieldWrapClass("fuchsia")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none"
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">İçerik</span>}
            modalTitle="İçerik"
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Not</span>}
            modalTitle="Not"
            value={form.note_text}
            onChange={(v) => setForm((f) => ({ ...f, note_text: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-slate-100/60"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiConfirmModal
        open={deleteConfirmOpen}
        title="Bu kaydı silmek istediğinizden emin misiniz?"
        message="Bu işlem geri alınamaz."
        busy={saving}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void executeDelete()}
      />
    </div>
  );
}
