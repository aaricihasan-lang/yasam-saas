"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  IMAGINATIONS_FONT_DEFAULT,
  IMAGINATIONS_FONT_MOBILE_MIN,
  imaginationsTypography,
  type ImaginationsTypography,
} from "@/lib/bioenergy/imaginationsFontSize";
import { IMAGINATIONS_LIST_PATH } from "@/lib/bioenergy/imaginationsListFetch";
import { useImaginationsFontSize } from "@/lib/bioenergy/useImaginationsFontSize";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";
import { supabase } from "@/lib/supabase";
import { badgeFieldWrapClass } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

type BioenergyImaginationRecord = {
  id: string;
  tenant_id: string;
  source_id: string;
  title: string | null;
  category: string | null;
  text: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
};

type BioImaginationForm = {
  title: string;
  category: string;
  text: string;
  notes: string;
  source: string;
};

type DetailSectionTone = "violet" | "cyan" | "amber" | "emerald" | "slate";

const SECTION_SHELL: Record<DetailSectionTone, { wrap: string; title: string }> = {
  violet: {
    wrap:
      "rounded-[28px] border-2 border-violet-300/60 bg-gradient-to-br from-violet-100/95 via-violet-50/90 to-purple-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(139,92,246,0.28)] sm:p-10",
    title: "text-violet-950",
  },
  cyan: {
    wrap:
      "rounded-[28px] border-2 border-cyan-300/60 bg-gradient-to-br from-cyan-100/95 via-cyan-50/90 to-sky-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(6,182,212,0.22)] sm:p-10",
    title: "text-cyan-950",
  },
  amber: {
    wrap:
      "rounded-[28px] border-2 border-amber-300/60 bg-gradient-to-br from-amber-100/95 via-amber-50/90 to-yellow-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(245,158,11,0.22)] sm:p-10",
    title: "text-amber-950",
  },
  emerald: {
    wrap:
      "rounded-[28px] border-2 border-emerald-300/60 bg-gradient-to-br from-emerald-100/95 via-emerald-50/90 to-teal-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(16,185,129,0.2)] sm:p-10",
    title: "text-emerald-950",
  },
  slate: {
    wrap:
      "rounded-[28px] border-2 border-slate-300/60 bg-gradient-to-br from-slate-100/95 via-slate-50/90 to-zinc-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(100,116,139,0.2)] sm:p-10",
    title: "text-slate-900",
  },
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function trimOrEmpty(v: string) {
  return v.trim();
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
  typography: ImaginationsTypography;
  tone: DetailSectionTone;
}) {
  const shell = SECTION_SHELL[tone];

  return (
    <article className={shell.wrap}>
      <h2 className={`text-2xl font-black sm:text-3xl ${shell.title}`}>{title}</h2>
      <div className="mt-6 min-w-0 [&_.space-y-4]:space-y-7 [&_.space-y-3]:space-y-6" style={typography.bodyStyle}>
        {formatStoneContent(text, { fontSizePx: typography.fontSizePx })}
      </div>
    </article>
  );
}

export default function ImajinasyonlarDetail({ id }: { id: string }) {
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
  } = useImaginationsFontSize();

  const contentFontSizePx = isMobile
    ? Math.max(IMAGINATIONS_FONT_MOBILE_MIN, fontSizePx)
    : fontSizePx;

  const contentTypography = useMemo(
    () => imaginationsTypography(contentFontSizePx),
    [contentFontSizePx],
  );

  const [record, setRecord] = useState<BioenergyImaginationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);

  const downloadWord = useCallback(async () => {
    const tenantId = await getSyncedTenantId();
    if (!tenantId || !record) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/biyoenerji/imagination-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: "single", id: record.id }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `imajinasyon-${record.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }, [record]);
  const [form, setForm] = useState<BioImaginationForm>({
    title: "",
    category: "",
    text: "",
    notes: "",
    source: "",
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
      .from("bioenergy_imaginations")
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

    const row = data as BioenergyImaginationRecord;
    setRecord(row);
    setForm({
      title: row.title ?? "",
      category: row.category ?? "",
      text: row.text ?? "",
      notes: row.notes ?? "",
      source: row.source ?? "",
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
      showSoft("err", "İmajinasyon başlığı zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("bioenergy_imaginations")
      .update({
        title: titleTrim,
        category: trimOrNull(form.category) || "Genel",
        text: trimOrEmpty(form.text),
        notes: trimOrEmpty(form.notes),
        source: trimOrNull(form.source),
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
      .from("bioenergy_imaginations")
      .delete()
      .eq("id", record.id)
      .eq("tenant_id", tenantId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
      return;
    }

    router.push(IMAGINATIONS_LIST_PATH);
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-amber-200/60 bg-amber-50/80">
        <p className="text-lg font-semibold text-slate-600">Kayıt yükleniyor…</p>
      </div>
    );
  }

  if (errorMessage && !record) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
        <p className="text-lg font-bold text-rose-800">{errorMessage}</p>
        <Link
          href={IMAGINATIONS_LIST_PATH}
          className="mt-6 inline-flex rounded-2xl bg-slate-900 px-6 py-3.5 text-base font-black text-white"
        >
          Listeye Dön
        </Link>
      </div>
    );
  }

  if (!record) return null;

  const textContent = record.text?.trim() ?? "";
  const notesContent = record.notes?.trim() ?? "";
  const sourceContent = record.source?.trim() ?? "";
  const categoryText = record.category?.trim() ?? "";
  const sourceIdText = record.source_id?.trim() ?? "";
  const hasExtraInfo = Boolean(sourceIdText);

  const extraLines: string[] = [];
  if (sourceIdText) extraLines.push(`Kaynak ID: ${sourceIdText}`);

  return (
    <div className="w-full min-w-0 max-w-none">
      <div className="mb-5 flex flex-wrap items-center gap-2.5 sm:mb-6 sm:gap-3">
        <Link
          href={IMAGINATIONS_LIST_PATH}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-white px-4 py-3 text-[15px] font-black text-amber-900 shadow-md transition hover:bg-amber-50 sm:px-5 sm:py-3.5 sm:text-base"
        >
          ← Listeye Dön
        </Link>
        <Link
          href={BIOENERJI_FOLDER_BASE}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-violet-300 bg-white px-4 py-3 text-[15px] font-black text-violet-900 shadow-md transition hover:bg-violet-50 sm:px-5 sm:py-3.5 sm:text-base"
        >
          Biyoenerji Ana Klasörüne Dön
        </Link>
      </div>

      {(infoSuccess || infoError) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          {infoSuccess ? (
            <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-base font-bold text-emerald-800">
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-base font-bold text-rose-800">
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      <header className="mb-8 rounded-[32px] border-2 border-amber-300/70 bg-gradient-to-br from-amber-100/95 via-white/95 to-cyan-50/90 p-5 shadow-[0_20px_50px_-18px_rgba(245,158,11,0.22)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {categoryText ? (
              <span className="mb-4 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-md ring-2 ring-white/50">
                {categoryText}
              </span>
            ) : null}
            <h1 className="text-[42px] font-black leading-[1.1] tracking-tight text-slate-950 sm:text-[48px] xl:text-[52px]">
              {record.title?.trim() || "İsimsiz kayıt"}
            </h1>
            <p className="mt-4 text-base font-medium text-slate-600 sm:text-lg">
              Kayıt tarihi: {formatDate(record.created_at)}
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
              defaultFontSizePx={IMAGINATIONS_FONT_DEFAULT}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-amber-200/80 pt-5">
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-6 py-3 text-base font-black text-amber-950 transition hover:bg-amber-100"
          >
            Düzenle
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDeleteConfirmOpen(true)}
            className="rounded-2xl border-2 border-rose-300 bg-rose-50 px-6 py-3 text-base font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-45"
          >
            Sil
          </button>
          <button
            type="button"
            disabled={wordBusy}
            onClick={() => void downloadWord()}
            className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-6 py-3 text-base font-black text-violet-950 transition hover:bg-violet-100 disabled:opacity-45"
          >
            {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-7 sm:gap-8">
        {textContent ? (
          <DetailContentCard
            title="Metin"
            text={textContent}
            typography={contentTypography}
            tone="violet"
          />
        ) : null}
        {notesContent ? (
          <DetailContentCard
            title="Not"
            text={notesContent}
            typography={contentTypography}
            tone="amber"
          />
        ) : null}
        {sourceContent ? (
          <DetailContentCard
            title="Kaynak"
            text={sourceContent}
            typography={contentTypography}
            tone="emerald"
          />
        ) : null}
        {hasExtraInfo ? (
          <DetailContentCard
            title="Ek Bilgiler"
            text={extraLines.join("\n\n")}
            typography={contentTypography}
            tone="slate"
          />
        ) : null}
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="İmajinasyonu düzenle"
        subtitle="Kaydettikten sonra detay yenilenir."
        titleId="imagination-edit-modal-title"
        accentRingClass="ring-amber-100/50"
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
                  title: record.title ?? "",
                  category: record.category ?? "",
                  text: record.text ?? "",
                  notes: record.notes ?? "",
                  source: record.source ?? "",
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
              className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-4 py-2.5 text-[12px] font-black text-amber-950 shadow-sm transition hover:bg-amber-100/90 disabled:opacity-55"
            >
              {saving ? "Güncelleniyor…" : "Güncelle"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">İmajinasyon Başlığı *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
            <div className={badgeFieldWrapClass("amber")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none"
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Metin</span>}
            modalTitle="Metin"
            value={form.text}
            onChange={(v) => setForm((f) => ({ ...f, text: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Notlar</span>}
            modalTitle="Notlar"
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-slate-100/60"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak</span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
            />
          </label>
        </div>
      </BiyoenerjiCrudFormModal>

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-md"
          role="presentation"
          onClick={() => !saving && setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-2xl ring-1 ring-amber-100/50"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-slate-950">
              Bu imajinasyon kaydını silmek istediğinizden emin misiniz?
            </h3>
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
