"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { chakraColorDot } from "@/lib/bioenergy/chakraColorUtils";
import {
  CHAKRAS_FONT_DEFAULT,
  CHAKRAS_FONT_MOBILE_MIN,
  chakrasTypography,
  type ChakrasTypography,
} from "@/lib/bioenergy/chakrasFontSize";
import {
  chakraDisplayName,
  chakraCardBadge,
  fetchChakraRecordById,
  CHAKRAS_LIST_PATH,
  type ChakraDetailItem,
} from "@/lib/bioenergy/chakrasListFetch";
import { useChakrasFontSize } from "@/lib/bioenergy/useChakrasFontSize";
import { BIOENERJI_FOLDER_BASE } from "../biyoenerjiFolderConfig";
import { supabase } from "@/lib/supabase";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

type ChakraForm = {
  name: string;
  organs: string;
  glands: string;
  color: string;
  stones: string;
  causes: string;
  physical: string;
  mental: string;
  notes: string;
};

type DetailSectionTone = "violet" | "cyan" | "amber" | "emerald" | "fuchsia" | "indigo" | "rose";

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
  fuchsia: {
    wrap:
      "rounded-[28px] border-2 border-fuchsia-300/60 bg-gradient-to-br from-fuchsia-100/95 via-pink-50/90 to-violet-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(192,38,211,0.22)] sm:p-10",
    title: "text-fuchsia-950",
  },
  indigo: {
    wrap:
      "rounded-[28px] border-2 border-indigo-300/60 bg-gradient-to-br from-indigo-100/95 via-indigo-50/90 to-blue-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(99,102,241,0.2)] sm:p-10",
    title: "text-indigo-950",
  },
  rose: {
    wrap:
      "rounded-[28px] border-2 border-rose-300/60 bg-gradient-to-br from-rose-100/95 via-rose-50/90 to-pink-50/85 p-6 shadow-[0_16px_44px_-16px_rgba(244,63,94,0.2)] sm:p-10",
    title: "text-rose-950",
  },
};

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
  typography: ChakrasTypography;
  tone: DetailSectionTone;
}) {
  const shell = SECTION_SHELL[tone];
  return (
    <article className={shell.wrap}>
      <h2 className={`text-2xl font-black sm:text-3xl ${shell.title}`}>{title}</h2>
      <div
        className="mt-6 min-w-0 [&_.space-y-4]:space-y-7 [&_.space-y-3]:space-y-6"
        style={typography.bodyStyle}
      >
        {formatStoneContent(text, { fontSizePx: typography.fontSizePx })}
      </div>
    </article>
  );
}

function recordToForm(record: ChakraDetailItem): ChakraForm {
  return {
    name: record.name ?? "",
    organs: record.organs ?? "",
    glands: record.glands ?? "",
    color: record.color ?? "",
    stones: record.stones ?? "",
    causes: record.causes ?? "",
    physical: record.physical ?? "",
    mental: record.mental ?? "",
    notes: record.notes ?? "",
  };
}

export default function CakralarDetail({ id }: { id: string }) {
  const router = useRouter();
  const lastGoodRecordRef = useRef<ChakraDetailItem | null>(null);
  const isMobile = useMobileViewport();
  const {
    fontSizePx,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useChakrasFontSize();

  const contentFontSizePx = isMobile
    ? Math.max(CHAKRAS_FONT_MOBILE_MIN, fontSizePx)
    : fontSizePx;

  const contentTypography = useMemo(
    () => chakrasTypography(contentFontSizePx),
    [contentFontSizePx],
  );

  const [record, setRecord] = useState<ChakraDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [wordBusy, setWordBusy] = useState(false);

  const downloadWord = useCallback(async () => {
    if (!record) return;
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/biyoenerji/chakra-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: "single", chakraId: record.id }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (record.name || "cakra").toLowerCase()
        .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
        .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      a.download = `biyoenerji-cakra-${safe}-${new Date().toISOString().slice(0,10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }, [record]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ChakraForm>({
    name: "",
    organs: "",
    glands: "",
    color: "",
    stones: "",
    causes: "",
    physical: "",
    mental: "",
    notes: "",
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
      const result = await fetchChakraRecordById(tenantId, recordId);
      setLoading(false);

      if (result.error) {
        setErrorMessage(`Kayıt okunamadı: ${result.error}`);
        if (lastGoodRecordRef.current) setRecord(lastGoodRecordRef.current);
        else setRecord(null);
        return;
      }

      if (!result.data) {
        setErrorMessage("Kayıt bulunamadı.");
        if (lastGoodRecordRef.current) setRecord(lastGoodRecordRef.current);
        else setRecord(null);
        return;
      }

      lastGoodRecordRef.current = result.data;
      setRecord(result.data);
      setErrorMessage("");
      setForm(recordToForm(result.data));
    } catch (err) {
      setLoading(false);
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CakralarDetail] loadRecord exception:", message);
      setErrorMessage(`Beklenmeyen hata: ${message}`);
      if (lastGoodRecordRef.current) setRecord(lastGoodRecordRef.current);
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

    const nameTrim = form.name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("bioenergy_chakras")
      .update({
        name: nameTrim,
        organs: trimOrEmpty(form.organs),
        glands: trimOrEmpty(form.glands),
        color: trimOrEmpty(form.color),
        stones: trimOrEmpty(form.stones),
        causes: trimOrEmpty(form.causes),
        physical: trimOrEmpty(form.physical),
        mental: trimOrEmpty(form.mental),
        notes: trimOrEmpty(form.notes),
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
      .from("bioenergy_chakras")
      .delete()
      .eq("id", record.id)
      .eq("tenant_id", tenantId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
      return;
    }

    router.push(CHAKRAS_LIST_PATH);
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-fuchsia-200/60 bg-fuchsia-50/80">
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
          href={CHAKRAS_LIST_PATH}
          className="mt-6 inline-flex rounded-2xl bg-slate-900 px-6 py-3.5 text-base font-black text-white"
        >
          Listeye Dön
        </Link>
      </div>
    );
  }

  if (!record) return null;

  const displayTitle = chakraDisplayName(record);
  const badge = chakraCardBadge(record);
  const dotColor = chakraColorDot(record.color);

  const sections: { title: string; text: string; tone: DetailSectionTone }[] = [];
  if (record.organs?.trim()) sections.push({ title: "Organlar", text: record.organs.trim(), tone: "cyan" });
  if (record.glands?.trim()) sections.push({ title: "Bezler", text: record.glands.trim(), tone: "violet" });
  if (record.color?.trim()) sections.push({ title: "Renk", text: record.color.trim(), tone: "rose" });
  if (record.stones?.trim()) sections.push({ title: "Taşlar", text: record.stones.trim(), tone: "indigo" });
  if (record.causes?.trim()) sections.push({ title: "Nedenler", text: record.causes.trim(), tone: "amber" });
  if (record.physical?.trim()) sections.push({ title: "Fiziksel", text: record.physical.trim(), tone: "emerald" });
  if (record.mental?.trim()) sections.push({ title: "Zihinsel", text: record.mental.trim(), tone: "fuchsia" });
  if (record.notes?.trim()) sections.push({ title: "Notlar", text: record.notes.trim(), tone: "violet" });

  return (
    <div className="w-full min-w-0 max-w-none">
      <div className="mb-5 flex flex-wrap items-center gap-2.5 sm:mb-6 sm:gap-3">
        <Link
          href={CHAKRAS_LIST_PATH}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-fuchsia-300 bg-white px-4 py-3 text-[15px] font-black text-fuchsia-900 shadow-md transition hover:bg-fuchsia-50 sm:px-5 sm:py-3.5 sm:text-base"
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

      <header className="mb-8 rounded-[32px] border-2 border-fuchsia-300/70 bg-gradient-to-br from-fuchsia-100/95 via-white/95 to-violet-50/90 p-5 shadow-[0_20px_50px_-18px_rgba(192,38,211,0.22)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {badge ? (
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-md ring-2 ring-white/50">
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/80"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
                {badge}
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
              defaultFontSizePx={CHAKRAS_FONT_DEFAULT}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-fuchsia-200/80 pt-5">
          {record && (
            <button
              type="button"
              onClick={() => void downloadWord()}
              disabled={wordBusy}
              className="rounded-2xl border-2 border-blue-300 bg-blue-50 px-6 py-3 text-base font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
            >
              {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="rounded-2xl border-2 border-fuchsia-300 bg-fuchsia-50 px-6 py-3 text-base font-black text-fuchsia-950 transition hover:bg-fuchsia-100"
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
        {sections.length > 0 ? (
          sections.map((section) => (
            <DetailContentCard
              key={section.title}
              title={section.title}
              text={section.text}
              typography={contentTypography}
              tone={section.tone}
            />
          ))
        ) : (
          <DetailContentCard
            title="İçerik"
            text="Bu kayıt için henüz organ, renk veya not girilmemiş."
            typography={contentTypography}
            tone="amber"
          />
        )}
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="Çakra kaydını düzenle"
        subtitle="Kaydettikten sonra detay yenilenir."
        titleId="chakra-edit-modal-title"
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
              onClick={() => record && setForm(recordToForm(record))}
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
            <span className="mb-2 block text-[12px] font-black text-slate-800">Çakra Adı *</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Renk</span>
            <input
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="h-12 w-full rounded-xl border border-rose-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-rose-200/90 focus:ring-2 focus:ring-rose-100/55"
            />
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Organlar</span>}
            modalTitle="Organlar"
            value={form.organs}
            onChange={(v) => setForm((f) => ({ ...f, organs: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Bezler</span>}
            modalTitle="Bezler"
            value={form.glands}
            onChange={(v) => setForm((f) => ({ ...f, glands: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-violet-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Taşlar</span>}
            modalTitle="Taşlar"
            value={form.stones}
            onChange={(v) => setForm((f) => ({ ...f, stones: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-indigo-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-indigo-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Nedenler</span>}
            modalTitle="Nedenler"
            value={form.causes}
            onChange={(v) => setForm((f) => ({ ...f, causes: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-amber-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-amber-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Fiziksel</span>}
            modalTitle="Fiziksel"
            value={form.physical}
            onChange={(v) => setForm((f) => ({ ...f, physical: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-emerald-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Zihinsel</span>}
            modalTitle="Zihinsel"
            value={form.mental}
            onChange={(v) => setForm((f) => ({ ...f, mental: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-fuchsia-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-fuchsia-100/50"
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
            <h3 className="text-xl font-black text-slate-950">
              Bu çakra kaydını silmek istediğinizden emin misiniz?
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
