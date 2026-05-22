"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import {
  ENERGY_BODIES_FONT_DEFAULT,
  type EnergyBodiesTypography,
} from "@/lib/bioenergy/energyBodiesFontSize";
import { useEnergyBodiesFontSize } from "@/lib/bioenergy/useEnergyBodiesFontSize";
import { CrudEmptyState } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

type BioenergyEnergyBodyRecord = {
  id: string;
  tenant_id: string;
  source_uid: string;
  genel_tanim: string | null;
  gorevi: string | null;
  bozulma: string | null;
  onerilen_taslar: string | null;
  not_text: string | null;
  created_at: string;
};

type EnergyBodyForm = {
  source_uid: string;
  genel_tanim: string;
  gorevi: string;
  bozulma: string;
  onerilen_taslar: string;
  not_text: string;
};

const emptyForm: EnergyBodyForm = {
  source_uid: "",
  genel_tanim: "",
  gorevi: "",
  bozulma: "",
  onerilen_taslar: "",
  not_text: "",
};

function trimOrEmpty(v: string) {
  return v.trim();
}

function formatDate(iso: string) {
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

function energyBodySearchBlob(row: BioenergyEnergyBodyRecord) {
  return [
    row.genel_tanim,
    row.gorevi,
    row.bozulma,
    row.onerilen_taslar,
    row.not_text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

function EnergyBodyStats({
  total,
  uidCount,
  lastDate,
}: {
  total: number;
  uidCount: number;
  lastDate: string;
}) {
  const items = [
    { label: "Toplam kayıt", value: String(total) },
    { label: "Kaynak UID", value: String(uidCount) },
    { label: "Son kayıt", value: lastDate },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border-2 border-violet-200/70 bg-white/90 px-5 py-5 shadow-md ring-1 ring-violet-100/50 sm:px-6 sm:py-6"
        >
          <p className="text-base font-bold text-slate-500">{item.label}</p>
          <p className="mt-2 break-words text-3xl font-black tabular-nums tracking-tight text-violet-700 sm:text-4xl">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function DetailFieldCard({
  title,
  text,
  typography,
}: {
  title: string;
  text: string | null | undefined;
  typography: EnergyBodiesTypography;
}) {
  const display = text?.trim() || "";

  return (
    <article className="rounded-[22px] border-2 border-cyan-100/80 bg-gradient-to-br from-white/95 via-cyan-50/35 to-violet-50/25 p-5 shadow-[0_12px_36px_-18px_rgba(139,92,246,0.18)] sm:p-6">
      <h4 className="text-xl font-black text-slate-950 sm:text-2xl">{title}</h4>
      <div className="mt-4 min-w-0" style={typography.bodyStyle}>
        {display ? (
          formatStoneContent(display, { fontSizePx: typography.fontSizePx })
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-5 py-8 text-center font-medium italic text-slate-400">
            Henüz bilgi girilmedi.
          </p>
        )}
      </div>
    </article>
  );
}

const listPanelClass =
  "flex min-h-[min(72vh,640px)] w-full min-w-0 flex-col rounded-[32px] border-[3px] border-violet-300/45 bg-gradient-to-br from-violet-50/85 via-white/92 to-fuchsia-50/55 p-5 shadow-[0_0_48px_rgba(139,92,246,0.14)] sm:p-6 lg:max-w-[480px] lg:shrink-0 xl:max-w-[500px]";

const detailPanelClass =
  "flex min-h-[min(72vh,640px)] min-w-0 flex-1 flex-col rounded-[32px] border-[3px] border-cyan-300/45 bg-gradient-to-br from-cyan-50/75 via-white/94 to-violet-50/45 p-6 shadow-[0_0_48px_rgba(34,211,238,0.14)] sm:p-8";

const newRecordBtnPremium =
  "inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-4 text-base font-black text-white shadow-[0_12px_32px_rgba(139,92,246,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(34,211,238,0.25)] sm:w-auto sm:px-8 sm:py-4";

export default function EnerjiBedenleri() {
  const {
    fontSizePx,
    typography: detailTypography,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useEnergyBodiesFontSize();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<BioenergyEnergyBodyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EnergyBodyForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<"create" | "edit">("create");
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

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  const loadRecords = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setLoadErrorMessage(null);
    setInfoError("");
    const { data, error } = await supabase
      .from("bioenergy_energy_bodies")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("source_uid");

    setLoading(false);

    if (error) {
      setLoadErrorMessage(`Enerji bedenleri okunamadı: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as BioenergyEnergyBodyRecord[]);
  }, [tenantId]);

  useEffect(() => {
    runInEffect(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((row) => energyBodySearchBlob(row).includes(q));
  }, [rows, searchQuery]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const uids = new Set(rows.map((r) => r.source_uid?.trim()).filter(Boolean));
    const newest = rows.reduce<string | null>((acc, row) => {
      if (!row.created_at) return acc;
      if (!acc || row.created_at > acc) return row.created_at;
      return acc;
    }, null);
    const last = newest ? formatDate(newest) : "—";
    return { total: rows.length, uids: uids.size, last };
  }, [rows]);

  function fillFormFromRow(row: BioenergyEnergyBodyRecord) {
    setForm({
      source_uid: row.source_uid ?? "",
      genel_tanim: row.genel_tanim ?? "",
      gorevi: row.gorevi ?? "",
      bozulma: row.bozulma ?? "",
      onerilen_taslar: row.onerilen_taslar ?? "",
      not_text: row.not_text ?? "",
    });
  }

  function selectRow(row: BioenergyEnergyBodyRecord) {
    setSelectedId(row.id);
    setFormModalOpen(false);
    setInfoError("");
    setInfoSuccess("");
  }

  function resetFormSelection() {
    setSelectedId(null);
    setForm({ ...emptyForm });
  }

  function closeFormModal() {
    setFormModalOpen(false);
  }

  function openCreateModal() {
    setFormModalMode("create");
    setForm({ ...emptyForm });
    setSelectedId(null);
    setFormModalOpen(true);
    setInfoError("");
  }

  function openEditModal() {
    if (!selectedRow) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    setFormModalMode("edit");
    fillFormFromRow(selectedRow);
    setFormModalOpen(true);
    setInfoError("");
  }

  function modalTemizle() {
    if (formModalMode === "create") {
      setForm({ ...emptyForm });
    } else if (selectedRow) {
      fillFormFromRow(selectedRow);
    }
  }

  async function handleKaydet() {
    const uidTrim = form.source_uid.trim();
    if (!uidTrim) {
      showSoft("err", "Kaynak uid zorunludur (ör. eterik).");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase.from("bioenergy_energy_bodies").insert({
      tenant_id: tenantId,
      source_uid: uidTrim,
      genel_tanim: trimOrEmpty(form.genel_tanim),
      gorevi: trimOrEmpty(form.gorevi),
      bozulma: trimOrEmpty(form.bozulma),
      onerilen_taslar: trimOrEmpty(form.onerilen_taslar),
      not_text: trimOrEmpty(form.not_text),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error.message}`);
      return;
    }

    setFormModalOpen(false);
    await loadRecords();
    showSoft("ok", "Enerji bedeni kaydı oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const uidTrim = form.source_uid.trim();
    if (!uidTrim) {
      showSoft("err", "Kaynak uid zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("bioenergy_energy_bodies")
      .update({
        source_uid: uidTrim,
        genel_tanim: trimOrEmpty(form.genel_tanim),
        gorevi: trimOrEmpty(form.gorevi),
        bozulma: trimOrEmpty(form.bozulma),
        onerilen_taslar: trimOrEmpty(form.onerilen_taslar),
        not_text: trimOrEmpty(form.not_text),
      })
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    setSaving(false);

    if (error) {
      showSoft("err", `Güncellenemedi: ${error.message}`);
      return;
    }

    setFormModalOpen(false);
    await loadRecords();
    showSoft("ok", "Kayıt güncellendi.");
  }

  function openDeleteConfirm() {
    if (!selectedId) {
      showSoft("err", "Silmek için listeden bir kayıt seçin.");
      return;
    }
    setDeleteConfirmOpen(true);
    setInfoError("");
  }

  async function executeDelete() {
    if (!selectedId) return;

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("bioenergy_energy_bodies")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
      return;
    }

    await loadRecords();
    resetFormSelection();
    showSoft("ok", "Kayıt silindi.");
  }

  return (
    <section className="w-full min-w-0">
      <div className="mb-6 space-y-5">
        <EnergyBodyStats
          total={moduleStats.total}
          uidCount={moduleStats.uids}
          lastDate={moduleStats.last}
        />

        <label className="block w-full">
          <span className="mb-2 block text-base font-bold text-slate-600">
            Genel tanım, görev, bozulma, taşlar, not içinde ara
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Örn. eterik, aura, görev, bozulma…"
            className="h-[3.25rem] w-full rounded-2xl border-2 border-cyan-200 bg-white/95 px-5 text-[17px] font-semibold text-slate-800 shadow-inner outline-none transition placeholder:text-base placeholder:font-medium placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30"
          />
        </label>
      </div>

      {loadErrorMessage ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-base font-bold text-rose-800">
          {loadErrorMessage}
        </div>
      ) : null}

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,500px)_minmax(0,1fr)] xl:gap-8">
        <div className={listPanelClass}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-black text-violet-800">
              Kayıtlar ({filteredRows.length})
            </span>
            {loading ? (
              <span className="text-base font-bold text-slate-400">Yükleniyor…</span>
            ) : null}
          </div>

          <button type="button" onClick={openCreateModal} className={`${newRecordBtnPremium} mb-4`}>
            + Yeni Kayıt
          </button>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <p className="py-10 text-center text-base font-medium text-slate-400">Yükleniyor…</p>
            ) : loadErrorMessage ? null : rows.length === 0 ? (
              <CrudEmptyState
                icon="◎"
                title="Liste boş"
                subtitle="Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                tone="cyan"
              />
            ) : filteredRows.length === 0 ? (
              <p className="py-10 text-center text-base font-medium text-slate-500">
                Aramayı güncelleyin veya Yeni Kayıt ile enerji bedeni ekleyin.
              </p>
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRow(row)}
                    className={`w-full rounded-2xl border-2 px-5 py-4 text-left transition-all duration-200 ${
                      active
                        ? "scale-[1.01] border-violet-300 bg-gradient-to-r from-violet-50/95 to-cyan-50/95 shadow-[0_0_0_2px_rgba(139,92,246,0.2),0_0_32px_rgba(34,211,238,0.22)] ring-2 ring-violet-300/55"
                        : "border-violet-100/60 bg-white/70 hover:border-cyan-200/80 hover:bg-white hover:shadow-lg"
                    }`}
                  >
                    <p className="text-lg font-black capitalize leading-snug tracking-tight text-slate-900 sm:text-xl">
                      {row.source_uid?.trim() || "—"}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={detailPanelClass}>
          {selectedRow ? (
            <>
              <div className="flex flex-col gap-4 border-b border-cyan-100/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-black tracking-[0.14em] text-cyan-900 ring-1 ring-cyan-200/60">
                    SEÇİLİ KAYIT
                  </div>
                  <h3 className="text-[1.75rem] font-black capitalize leading-tight text-slate-900 sm:text-[30px]">
                    {selectedRow.source_uid?.trim() || "—"}
                  </h3>
                </div>
                <DogaltasFontSizeControl
                  fontSizePx={fontSizePx}
                  onDecrease={decreaseFontSize}
                  onReset={resetFontSize}
                  onIncrease={increaseFontSize}
                  canDecrease={canDecreaseFontSize}
                  canIncrease={canIncreaseFontSize}
                  isDefault={isDefaultFontSize}
                  defaultFontSizePx={ENERGY_BODIES_FONT_DEFAULT}
                  compact
                />
              </div>

              <div className="mt-6 grid flex-1 gap-5">
                <DetailFieldCard
                  title="Genel Tanım"
                  text={selectedRow.genel_tanim}
                  typography={detailTypography}
                />
                <DetailFieldCard title="Görevi" text={selectedRow.gorevi} typography={detailTypography} />
                <DetailFieldCard
                  title="Bozulma Belirtileri"
                  text={selectedRow.bozulma}
                  typography={detailTypography}
                />
                <DetailFieldCard
                  title="Taşlar"
                  text={selectedRow.onerilen_taslar}
                  typography={detailTypography}
                />
                <DetailFieldCard title="Not" text={selectedRow.not_text} typography={detailTypography} />
              </div>

              <div className="mt-8 flex flex-wrap gap-3 border-t border-cyan-100/70 pt-6">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-2xl border-2 border-cyan-200 bg-cyan-50 px-6 py-3 text-base font-black text-cyan-950 shadow-sm transition hover:bg-cyan-100"
                >
                  Güncelle
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={openDeleteConfirm}
                  className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-6 py-3 text-base font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-45"
                >
                  Sil
                </button>
              </div>
            </>
          ) : (
            <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-200/80 bg-cyan-50/30 px-6 text-center">
              <p className="max-w-md text-lg font-semibold leading-relaxed text-slate-500">
                Soldan bir kayıt seçin veya yeni enerji bedeni eklemek için{" "}
                <span className="font-black text-violet-700">+ Yeni Kayıt</span> düğmesini kullanın.
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni enerji bedeni" : "Enerji bedenini düzenle"}
        subtitle="Kaydettikten sonra panel kapanır ve liste yenilenir."
        titleId="energy-body-form-modal-title"
        accentRingClass="ring-cyan-100/50"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={closeFormModal}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={modalTemizle}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Temizle
            </button>
            {formModalMode === "create" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleKaydet()}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_26px_-8px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 disabled:opacity-55"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleGuncelle()}
                className="rounded-xl border border-cyan-200/70 bg-cyan-50/90 px-4 py-2.5 text-[12px] font-black text-cyan-950 shadow-sm transition hover:bg-cyan-100/90 disabled:opacity-55"
              >
                {saving ? "Güncelleniyor…" : "Güncelle"}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
              Kaynak uid
            </span>
            <input
              value={form.source_uid}
              onChange={(e) => setForm((f) => ({ ...f, source_uid: e.target.value }))}
              placeholder="ör. eterik, duygusal, zihinsel, ruhsal"
              className="h-12 w-full rounded-xl border border-cyan-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-cyan-200/90 focus:ring-2 focus:ring-cyan-100/60"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/90" />
                Genel Tanım
              </span>
            }
            modalTitle="Genel Tanım"
            value={form.genel_tanim}
            onChange={(v) => setForm((f) => ({ ...f, genel_tanim: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-emerald-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90" />
                Görevi
              </span>
            }
            modalTitle="Görevi"
            value={form.gorevi}
            onChange={(v) => setForm((f) => ({ ...f, gorevi: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-violet-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500/80" />
                Bozulma Belirtileri
              </span>
            }
            modalTitle="Bozulma Belirtileri"
            value={form.bozulma}
            onChange={(v) => setForm((f) => ({ ...f, bozulma: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-rose-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-rose-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/90" />
                Önerilen Taşlar
              </span>
            }
            modalTitle="Önerilen Taşlar"
            value={form.onerilen_taslar}
            onChange={(v) => setForm((f) => ({ ...f, onerilen_taslar: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-amber-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-amber-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500/80" />
                Not
              </span>
            }
            modalTitle="Not"
            value={form.not_text}
            onChange={(v) => setForm((f) => ({ ...f, not_text: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-teal-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-teal-100/50 transition"
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
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.12)] ring-1 ring-cyan-100/50 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="energy-body-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
              SİLME ONAYI
            </div>
            <h3 id="energy-body-delete-title" className="mt-2 text-[17px] font-black leading-snug text-slate-950">
              Bu enerji bedeni kaydını silmek istediğinizden emin misiniz?
            </h3>
            <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-500">
              İşlem geri alınamaz. Kayıt listeden kaldırılır.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void executeDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {saving ? "Siliniyor…" : "Evet, sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
