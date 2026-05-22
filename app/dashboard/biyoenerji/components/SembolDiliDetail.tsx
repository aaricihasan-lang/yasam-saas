"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  SYMBOL_LANGUAGE_FONT_DEFAULT,
  SYMBOL_LANGUAGE_FONT_MOBILE_MIN,
  symbolLanguageTypography,
  type SymbolLanguageTypography,
} from "@/lib/bioenergy/symbolLanguageFontSize";
import {
  fetchSymbolLanguageRecordById,
  SYMBOL_LANGUAGE_LIST_PATH,
  symbolDisplayName,
  type SymbolLanguageListItem,
} from "@/lib/bioenergy/symbolLanguageListFetch";
import { useSymbolLanguageFontSize } from "@/lib/bioenergy/useSymbolLanguageFontSize";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";
import { supabase } from "@/lib/supabase";
import { badgeFieldWrapClass } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

type SymbolForm = {
  symbol_name: string;
  category: string;
  meaning: string;
  source: string;
};

type DetailSectionTone = "violet" | "cyan" | "amber" | "emerald";

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
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
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
  typography: SymbolLanguageTypography;
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

export default function SembolDiliDetail({ id }: { id: string }) {
  const router = useRouter();
  const lastGoodRecordRef = useRef<SymbolLanguageListItem | null>(null);
  const isMobile = useMobileViewport();
  const {
    fontSizePx,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useSymbolLanguageFontSize();

  const contentFontSizePx = isMobile
    ? Math.max(SYMBOL_LANGUAGE_FONT_MOBILE_MIN, fontSizePx)
    : fontSizePx;

  const contentTypography = useMemo(
    () => symbolLanguageTypography(contentFontSizePx),
    [contentFontSizePx],
  );

  const [record, setRecord] = useState<SymbolLanguageListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SymbolForm>({
    symbol_name: "",
    category: "",
    meaning: "",
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

    try {
      const result = await fetchSymbolLanguageRecordById(tenantId, recordId);
      setLoading(false);

      if (result.error) {
        setErrorMessage(`Kayıt okunamadı: ${result.error}`);
        if (lastGoodRecordRef.current) {
          setRecord(lastGoodRecordRef.current);
        } else {
          setRecord(null);
        }
        return;
      }

      if (!result.data) {
        setErrorMessage("Kayıt bulunamadı.");
        if (lastGoodRecordRef.current) {
          setRecord(lastGoodRecordRef.current);
        } else {
          setRecord(null);
        }
        return;
      }

      const row = result.data;
      lastGoodRecordRef.current = row;
      setRecord(row);
      setErrorMessage("");
      const displayName = symbolDisplayName(row);
      setForm({
        symbol_name: displayName === "İsimsiz sembol" ? "" : displayName,
        category: row.category ?? "",
        meaning: row.meaning ?? "",
        source: row.source ?? "",
      });
    } catch (err) {
      setLoading(false);
      const message = err instanceof Error ? err.message : String(err);
      console.error("[SembolDiliDetail] loadRecord exception:", message);
      setErrorMessage(`Beklenmeyen hata: ${message}`);
      if (lastGoodRecordRef.current) {
        setRecord(lastGoodRecordRef.current);
      }
    }
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

    const nameTrim = form.symbol_name.trim();
    if (!nameTrim) {
      showSoft("err", "Sembol adı zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("bioenergy_symbols")
      .update({
        symbol: nameTrim,
        title: nameTrim,
        category: trimOrNull(form.category),
        meaning: trimOrNull(form.meaning),
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
      .from("bioenergy_symbols")
      .delete()
      .eq("id", record.id)
      .eq("tenant_id", tenantId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
      return;
    }

    router.push(SYMBOL_LANGUAGE_LIST_PATH);
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-emerald-200/60 bg-emerald-50/80">
        <p className="text-lg font-semibold text-slate-600">Kayıt yükleniyor…</p>
      </div>
    );
  }

  const showRecordWithWarning = Boolean(record && errorMessage);

  if (errorMessage && !record) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
        <p className="text-lg font-bold text-rose-800">{errorMessage}</p>
        <Link
          href={SYMBOL_LANGUAGE_LIST_PATH}
          className="mt-6 inline-flex rounded-2xl bg-slate-900 px-6 py-3.5 text-base font-black text-white"
        >
          Listeye Dön
        </Link>
      </div>
    );
  }

  if (!record) return null;

  const meaningContent = record.meaning?.trim() ?? "";
  const sourceContent = record.source?.trim() ?? "";
  const categoryText = record.category?.trim() ?? "";
  const displayTitle = symbolDisplayName(record);

  return (
    <div className="w-full min-w-0 max-w-none">
      <div className="mb-5 flex flex-wrap items-center gap-2.5 sm:mb-6 sm:gap-3">
        <Link
          href={SYMBOL_LANGUAGE_LIST_PATH}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-emerald-300 bg-white px-4 py-3 text-[15px] font-black text-emerald-900 shadow-md transition hover:bg-emerald-50 sm:px-5 sm:py-3.5 sm:text-base"
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

      {(infoSuccess || infoError || showRecordWithWarning) && (
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
          {showRecordWithWarning ? (
            <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-base font-bold text-amber-900">
              {errorMessage}
            </div>
          ) : null}
        </div>
      )}

      <header className="mb-8 rounded-[32px] border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-100/95 via-white/95 to-violet-50/90 p-5 shadow-[0_20px_50px_-18px_rgba(16,185,129,0.22)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {categoryText ? (
              <span className="mb-4 inline-flex rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-md ring-2 ring-white/50">
                {categoryText}
              </span>
            ) : null}
            <h1 className="text-[42px] font-black leading-[1.1] tracking-tight text-slate-950 sm:text-[48px] xl:text-[52px]">
              {displayTitle}
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
              defaultFontSizePx={SYMBOL_LANGUAGE_FONT_DEFAULT}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-emerald-200/80 pt-5">
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-6 py-3 text-base font-black text-emerald-950 transition hover:bg-emerald-100"
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
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-7 sm:gap-8">
        {meaningContent ? (
          <DetailContentCard
            title="Anlam"
            text={meaningContent}
            typography={contentTypography}
            tone="violet"
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
        {!meaningContent && !sourceContent ? (
          <DetailContentCard
            title="İçerik"
            text="Bu kayıt için henüz anlam veya kaynak girilmemiş."
            typography={contentTypography}
            tone="amber"
          />
        ) : null}
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="Sembol kaydını düzenle"
        subtitle="Kaydettikten sonra detay yenilenir."
        titleId="symbol-edit-modal-title"
        accentRingClass="ring-emerald-100/50"
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
              onClick={() => {
                const displayName = symbolDisplayName(record);
                setForm({
                  symbol_name: displayName === "İsimsiz sembol" ? "" : displayName,
                  category: record.category ?? "",
                  meaning: record.meaning ?? "",
                  source: record.source ?? "",
                });
              }}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Sıfırla
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleGuncelle()}
              className="rounded-xl border border-emerald-200/70 bg-emerald-50/90 px-4 py-2.5 text-[12px] font-black text-emerald-950 shadow-sm transition hover:bg-emerald-100/90 disabled:opacity-55"
            >
              {saving ? "Güncelleniyor…" : "Güncelle"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Sembol Adı *</span>
            <input
              value={form.symbol_name}
              onChange={(e) => setForm((f) => ({ ...f, symbol_name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
            <div className={badgeFieldWrapClass("emerald")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none"
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Anlam</span>}
            modalTitle="Anlam"
            value={form.meaning}
            onChange={(v) => setForm((f) => ({ ...f, meaning: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-violet-100/50"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak</span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-amber-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-amber-200/90 focus:ring-2 focus:ring-amber-100/55"
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
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-2xl ring-1 ring-emerald-100/50"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-slate-950">
              Bu sembol kaydını silmek istediğinizden emin misiniz?
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
