"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { supabase } from "@/lib/supabase";
import { badgeFieldWrapClass } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
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

type DetailSectionTone = "violet" | "amber" | "slate";

const SECTION_SHELL: Record<
  DetailSectionTone,
  { wrap: string; label: string }
> = {
  violet: {
    wrap: "rounded-lg border border-violet-200/60 bg-violet-50/40 p-3 sm:p-4",
    label: "text-violet-600",
  },
  amber: {
    wrap: "rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 sm:p-4",
    label: "text-amber-600",
  },
  slate: {
    wrap: "rounded-lg border border-slate-200/60 bg-slate-50/40 p-3 sm:p-4",
    label: "text-slate-500",
  },
};

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

function DetailContentCard({
  title,
  text,
  typography,
  tone,
}: {
  title: string;
  text: string;
  typography: SubconsciousCausesTypography;
  tone: DetailSectionTone;
}) {
  const shell = SECTION_SHELL[tone];

  return (
    <article className={shell.wrap}>
      <h2 className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${shell.label}`}>{title}</h2>
      <div className="min-w-0" style={typography.bodyStyle}>
        {formatStoneContent(text, { fontSizePx: typography.fontSizePx })}
      </div>
    </article>
  );
}

export default function BilincaltiSebepleriDetail({ id }: { id: string }) {
  const router = useRouter();
  const isMobile = useMobileViewport();
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

    const { data, error } = await supabase
      .from("bioenergy_subconscious_causes")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", recordId)
      .maybeSingle();

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıt okunamadı: ${error.message}`);
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
    const { error } = await supabase
      .from("bioenergy_subconscious_causes")
      .update({
        source_uid: form.source_uid.trim() || slugifySourceUid(titleTrim),
        title: titleTrim,
        category: trimOrEmpty(form.category),
        content: trimOrEmpty(form.content),
        note_text: trimOrEmpty(form.note_text),
      })
      .eq("id", record.id)
      .eq("tenant_id", tenantId);

    setSaving(false);

    if (error) {
      showSoft("err", `Güncellenemedi: ${error.message}`);
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
    const { error } = await supabase
      .from("bioenergy_subconscious_causes")
      .delete()
      .eq("id", record.id)
      .eq("tenant_id", tenantId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
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
        <Link
          href={SUBCONSCIOUS_CAUSES_LIST_PATH}
          className="mt-6 inline-flex rounded-2xl bg-slate-900 px-6 py-3.5 text-base font-black text-white"
        >
          Listeye Dön
        </Link>
      </div>
    );
  }

  if (!record) return null;

  const contentText = record.content?.trim() ?? "";
  const noteText = record.note_text?.trim() ?? "";
  const categoryText = record.category?.trim() ?? "";
  const sourceUidText = record.source_uid?.trim() ?? "";
  const hasExtraInfo = Boolean(categoryText || sourceUidText);

  const extraLines: string[] = [];
  if (categoryText) extraLines.push(`Kategori: ${categoryText}`);
  if (sourceUidText) extraLines.push(`Kaynak UID: ${sourceUidText}`);

  return (
    <div className="w-full min-w-0 max-w-none">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link
          href={SUBCONSCIOUS_CAUSES_LIST_PATH}
          className="inline-flex items-center gap-1 rounded-md border border-fuchsia-300/70 bg-white px-2.5 py-1 text-xs font-semibold text-fuchsia-900 shadow-sm transition hover:bg-fuchsia-50"
        >
          ← Listeye Dön
        </Link>
        <Link
          href={BIOENERJI_FOLDER_BASE}
          className="inline-flex items-center gap-1 rounded-md border border-violet-300/70 bg-white px-2.5 py-1 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-50"
        >
          Biyoenerji Ana Klasörüne Dön
        </Link>
      </div>

      {(infoSuccess || infoError) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          {infoSuccess ? (
            <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      <header className="mb-3 rounded-xl border border-violet-200/50 bg-white/70 p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {categoryText ? (
              <span className="mb-1.5 inline-flex rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {categoryText}
              </span>
            ) : null}
            <h1 className="text-lg font-bold leading-snug tracking-tight text-slate-950 sm:text-xl">
              {record.title?.trim() || "İsimsiz kayıt"}
            </h1>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
              {formatDate(record.created_at)}
            </p>
          </div>
          <div className="shrink-0">
            <DogaltasFontSizeControl
              fontSizePx={fontSizePx}
              onDecrease={decreaseFontSize}
              onReset={resetFontSize}
              onIncrease={increaseFontSize}
              canDecrease={canDecreaseFontSize}
              canIncrease={canIncreaseFontSize}
              isDefault={isDefaultFontSize}
              defaultFontSizePx={SUBCONSCIOUS_CAUSES_FONT_DEFAULT}
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-200/50 pt-2.5">
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="inline-flex h-7 items-center rounded-md border border-fuchsia-200 bg-fuchsia-50 px-2.5 text-[11px] font-semibold text-fuchsia-800 transition hover:bg-fuchsia-100"
          >
            Düzenle
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDeleteConfirmOpen(true)}
            className="inline-flex h-7 items-center rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-45"
          >
            Sil
          </button>
          <button
            type="button"
            disabled={wordBusy}
            onClick={() => void downloadWord()}
            className="inline-flex h-7 items-center rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-45"
          >
            {wordBusy ? "Hazırlanıyor..." : "Word Raporu"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {contentText ? (
          <DetailContentCard
            title="İçerik"
            text={contentText}
            typography={contentTypography}
            tone="violet"
          />
        ) : null}
        {noteText ? (
          <DetailContentCard
            title="Not"
            text={noteText}
            typography={contentTypography}
            tone="amber"
          />
        ) : null}
        {hasExtraInfo ? (
          <DetailContentCard
            title="Kategori / Ek Bilgiler"
            text={extraLines.join("\n\n")}
            typography={contentTypography}
            tone="slate"
          />
        ) : null}
      </div>

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
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak uid</span>
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

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-md"
          role="presentation"
          onClick={() => !saving && setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-2xl ring-1 ring-fuchsia-100/50"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-slate-950">Bu kaydı silmek istediğinizden emin misiniz?</h3>
            <p className="mt-2 text-base text-slate-500">İşlem geri alınamaz.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void executeDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white"
              >
                {saving ? "Siliniyor…" : "Evet, sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
