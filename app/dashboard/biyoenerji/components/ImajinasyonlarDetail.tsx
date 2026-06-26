"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  IMAGINATIONS_FONT_DEFAULT,
  IMAGINATIONS_FONT_MOBILE_MIN,
  imaginationsTypography,
  type ImaginationsTypography,
} from "@/lib/bioenergy/imaginationsFontSize";
import { IMAGINATIONS_LIST_PATH } from "@/lib/bioenergy/imaginationsListFetch";
import { useImaginationsFontSize } from "@/lib/bioenergy/useImaginationsFontSize";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";
import { bioApiDelete, bioApiGetOne, bioApiUpdate } from "@/lib/biyoenerji/secureApi";
import { badgeFieldWrapClass } from "./BiyoenerjiUi";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoGate } from "@/components/demo/DemoGate";
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

const tbBtn =
  "inline-flex items-center justify-center min-h-[40px] py-1.5 lg:h-7 lg:min-h-0 lg:py-0 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40";
const tbBtnDanger =
  "inline-flex items-center justify-center min-h-[40px] py-1.5 lg:h-7 lg:min-h-0 lg:py-0 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-rose-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 disabled:opacity-40";

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
}: {
  title: string;
  text: string;
  typography: ImaginationsTypography;
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

export default function ImajinasyonlarDetail({ id }: { id: string }) {
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
        body: JSON.stringify({ tenantId, userId: readYasamUser()?.id ?? "", exportMode: "single", id: record.id }),
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

    const { row: data, error } = await bioApiGetOne("imaginations", recordId);

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
    const { error } = await bioApiUpdate("imaginations", record.id, {
      title: titleTrim,
      category: trimOrNull(form.category) || "Genel",
      text: trimOrEmpty(form.text),
      notes: trimOrEmpty(form.notes),
      source: trimOrNull(form.source),
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
    const { error } = await bioApiDelete("imaginations", record.id);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
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
      </div>
    );
  }

  if (!record) return null;

  const textContent = record.text?.trim() ?? "";
  const notesContent = record.notes?.trim() ?? "";
  const sourceContent = record.source?.trim() ?? "";
  const categoryText = record.category?.trim() ?? "";
  const sourceIdText = record.source_id?.trim() ?? "";

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

      {/* Title + actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="min-w-0 flex-1">
          {categoryText ? (
            <span className="mb-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              {categoryText}
            </span>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {record.title?.trim() || "Isimsiz kayit"}
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            {formatDate(record.created_at)}
            {sourceIdText ? ` · ${sourceIdText}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <DogaltasFontSizeControl
            fontSizePx={fontSizePx}
            onDecrease={decreaseFontSize}
            onReset={resetFontSize}
            onIncrease={increaseFontSize}
            canDecrease={canDecreaseFontSize}
            canIncrease={canIncreaseFontSize}
            isDefault={isDefaultFontSize}
            defaultFontSizePx={IMAGINATIONS_FONT_DEFAULT}
            compact
          />
          {!isDemo && (
            <>
              <div className="h-4 w-px bg-slate-200" aria-hidden />
              <button type="button" onClick={() => setFormModalOpen(true)} className={tbBtn}>Duzenle</button>
              <button type="button" disabled={saving} onClick={() => setDeleteConfirmOpen(true)} className={tbBtnDanger}>Sil</button>
              <button type="button" disabled={wordBusy} onClick={() => void downloadWord()} className={tbBtn}>
                {wordBusy ? "..." : "Word"}
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
          {textContent ? <DetailContentCard title="Metin" text={textContent} typography={contentTypography} /> : null}
          {notesContent ? <DetailContentCard title="Not" text={notesContent} typography={contentTypography} /> : null}
          {sourceContent ? <DetailContentCard title="Kaynak" text={sourceContent} typography={contentTypography} /> : null}
          {isDemo && !textContent && !notesContent && !sourceContent ? (
            <DetailContentCard title="Metin" text="Demo içerik alanı." typography={contentTypography} />
          ) : null}
        </div>
      </DemoGate>

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
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="presentation" onClick={() => !saving && setDeleteConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200/80 bg-white p-5 shadow-xl"
            role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Bu imajinasyon kaydını silmek istediğinizden emin misiniz?</h3>
            <p className="mt-1 text-[13px] text-slate-500">Bu işlem geri alınamaz.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving} onClick={() => setDeleteConfirmOpen(false)}
                className="h-8 flex-1 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                Vazgeç
              </button>
              <button type="button" disabled={saving} onClick={() => void executeDelete()}
                className="h-8 flex-1 rounded-md bg-rose-600 text-[12px] font-medium text-white transition hover:bg-rose-700 disabled:opacity-60">
                {saving ? "Siliniyor..." : "Evet, sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
