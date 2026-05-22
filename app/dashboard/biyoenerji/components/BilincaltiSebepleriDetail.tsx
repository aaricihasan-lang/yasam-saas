"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  SUBCONSCIOUS_CAUSES_FONT_DEFAULT,
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

function DetailContentCard({
  title,
  text,
  typography,
}: {
  title: string;
  text: string | null | undefined;
  typography: SubconsciousCausesTypography;
}) {
  const display = text?.trim() || "";

  return (
    <article className="rounded-[24px] border-2 border-fuchsia-200/70 bg-gradient-to-br from-white/95 via-fuchsia-50/35 to-violet-50/25 p-6 shadow-[0_12px_36px_-18px_rgba(192,38,211,0.18)] sm:p-8">
      <h2 className="text-2xl font-black text-slate-950">{title}</h2>
      <div className="mt-5 min-w-0" style={typography.bodyStyle}>
        {display ? (
          formatStoneContent(display, { fontSizePx: typography.fontSizePx })
        ) : (
          <p className="rounded-xl border border-dashed border-fuchsia-200/80 bg-fuchsia-50/40 px-5 py-8 text-center font-medium italic text-fuchsia-400/90">
            Henüz bilgi girilmedi.
          </p>
        )}
      </div>
    </article>
  );
}

export default function BilincaltiSebepleriDetail({ id }: { id: string }) {
  const router = useRouter();
  const {
    fontSizePx,
    typography,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useSubconsciousCausesFontSize();

  const [record, setRecord] = useState<BioenergySubconsciousRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
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
      .eq("id", id)
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
    void loadRecord();
  }, [loadRecord]);

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
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-fuchsia-200/60 bg-white/80">
        <p className="text-lg font-semibold text-slate-500">Kayıt yükleniyor…</p>
      </div>
    );
  }

  if (errorMessage && !record) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-8 text-center">
        <p className="text-lg font-bold text-rose-800">{errorMessage}</p>
        <Link
          href={SUBCONSCIOUS_CAUSES_LIST_PATH}
          className="mt-6 inline-flex rounded-2xl bg-slate-900 px-6 py-3 text-base font-black text-white"
        >
          Listeye Dön
        </Link>
      </div>
    );
  }

  if (!record) return null;

  return (
    <div className="w-full min-w-0">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={SUBCONSCIOUS_CAUSES_LIST_PATH}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-fuchsia-200 bg-white px-5 py-3.5 text-base font-black text-fuchsia-900 shadow-md transition hover:bg-fuchsia-50"
        >
          ← Listeye Dön
        </Link>
        <Link
          href={BIOENERJI_FOLDER_BASE}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-5 py-3.5 text-base font-black text-violet-900 shadow-md transition hover:bg-violet-50"
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

      <header className="mb-8 rounded-[32px] border-2 border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50/90 via-white/95 to-violet-50/80 p-6 shadow-lg sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            {record.category?.trim() ? (
              <span className="mb-3 inline-flex rounded-full bg-gradient-to-r from-fuchsia-100 to-violet-50 px-4 py-1.5 text-sm font-black uppercase tracking-wide text-fuchsia-950 ring-1 ring-fuchsia-200/60">
                {record.category}
              </span>
            ) : (
              <span className="mb-3 inline-flex rounded-full bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-500">
                Kategorisiz
              </span>
            )}
            <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl xl:text-[2.75rem]">
              {record.title?.trim() || "İsimsiz kayıt"}
            </h1>
            <p className="mt-3 text-base font-medium text-slate-500">
              Kayıt: {formatDate(record.created_at)}
              {record.source_uid?.trim() ? (
                <>
                  {" "}
                  · Kaynak uid: <span className="font-bold text-slate-700">{record.source_uid}</span>
                </>
              ) : null}
            </p>
          </div>
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

        <div className="mt-6 flex flex-wrap gap-3 border-t border-fuchsia-100/80 pt-5">
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50 px-6 py-3 text-base font-black text-fuchsia-950 transition hover:bg-fuchsia-100"
          >
            Düzenle
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDeleteConfirmOpen(true)}
            className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-6 py-3 text-base font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-45"
          >
            Sil
          </button>
        </div>
      </header>

      <div className="grid gap-6">
        <DetailContentCard title="İçerik" text={record.content} typography={typography} />
        <DetailContentCard title="Notlar" text={record.note_text} typography={typography} />
        {record.source_uid?.trim() ? (
          <DetailContentCard title="Kaynak UID" text={record.source_uid} typography={typography} />
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
