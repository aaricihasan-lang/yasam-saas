"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import {
  ENERGY_BODIES_FONT_DEFAULT,
  type EnergyBodiesTypography,
} from "@/lib/bioenergy/energyBodiesFontSize";
import { useEnergyBodiesFontSize } from "@/lib/bioenergy/useEnergyBodiesFontSize";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { CrudEmptyState } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

async function exportEnergyBodiesWord(
  tenantId: string,
  userId: string,
  exportMode: "all" | "selected" | "single",
  ids: Set<string> | string,
  setWordBusy: (v: boolean) => void,
) {
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, userId, exportMode };
    if (exportMode === "single" && typeof ids === "string") {
      body.id = ids;
    } else if (exportMode === "selected" && ids instanceof Set) {
      const arr = [...ids];
      if (!arr.length) return;
      body.ids = arr;
    }
    const res = await fetch("/api/biyoenerji/energy-body-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biyoenerji-enerji-bedenleri-${exportMode === "selected" ? "secili" : exportMode === "single" ? "tek" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* sessiz */ } finally {
    setWordBusy(false);
  }
}

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
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-violet-700">
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
    <article className="rounded-xl border border-cyan-100/70 bg-gradient-to-br from-white/95 via-cyan-50/30 to-violet-50/20 p-4">
      <h4 className="text-sm font-black text-slate-800">{title}</h4>
      <div className="mt-2.5 min-w-0" style={typography.bodyStyle}>
        {display ? (
          formatStoneContent(display, { fontSizePx: typography.fontSizePx })
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200/80 bg-slate-50/70 px-4 py-5 text-center text-sm font-medium italic text-slate-400">
            Henüz bilgi girilmedi.
          </p>
        )}
      </div>
    </article>
  );
}

const listPanelClass =
  "flex min-h-[240px] w-full min-w-0 flex-col rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/80 via-white/92 to-fuchsia-50/50 p-4 shadow-[0_0_20px_rgba(139,92,246,0.08)] lg:max-w-[400px] lg:shrink-0 xl:max-w-[420px]";

const detailPanelClass =
  "flex min-h-[240px] min-w-0 flex-1 flex-col rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50/70 via-white/94 to-violet-50/40 p-4 shadow-[0_0_20px_rgba(34,211,238,0.08)]";

const newRecordBtnPremium =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

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
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);

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
    const { data: updatedRows, error } = await supabase
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
      .eq("tenant_id", tenantId)
      .select("id");

    setSaving(false);

    if (error) {
      showSoft("err", `Güncellenemedi: ${error.message}`);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      showSoft("err", "Kayıt bulunamadı veya güncelleme yetkiniz yok.");
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
      <div className="mb-4 flex flex-col gap-3 border-b border-violet-100/60 pb-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full xl:max-w-sm">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-cyan-600/75">
              Tanım, görev, bozulma, taşlar, not içinde ara
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Örn. eterik, aura, görev, bozulma…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/40"
            />
          </label>
        </div>
        <EnergyBodyStats
          total={moduleStats.total}
          uidCount={moduleStats.uids}
          lastDate={moduleStats.last}
        />
      </div>

      {loadErrorMessage ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {loadErrorMessage}
        </div>
      ) : null}

      {(infoSuccess || infoError) && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] xl:gap-5">
        <div className={listPanelClass}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wide text-violet-600/90">
              Kayıtlar ({filteredRows.length})
            </span>
            <div className="flex items-center gap-2">
              {loading ? (
                <span className="text-[10px] font-bold text-slate-400">Yükleniyor…</span>
              ) : null}
              <button type="button" onClick={openCreateModal} className={newRecordBtnPremium}>
                + Yeni Kayıt
              </button>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="mb-2">
              <BulkExportBar
                selectedCount={selectedForExport.size}
                totalCount={rows.length}
                onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
                onClearSelection={() => setSelectedForExport(new Set())}
                onExportSelected={() => void exportEnergyBodiesWord(tenantId ?? "", readYasamUser()?.id ?? "", "selected", selectedForExport, setWordBusy)}
                onExportAll={() => void exportEnergyBodiesWord(tenantId ?? "", readYasamUser()?.id ?? "", "all", selectedForExport, setWordBusy)}
                isExporting={wordBusy}
              />
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="py-6 text-center text-sm font-medium text-slate-400">Yükleniyor…</p>
            ) : loadErrorMessage ? null : rows.length === 0 ? (
              <CrudEmptyState
                icon="◎"
                title="Liste boş"
                subtitle="Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                tone="cyan"
              />
            ) : filteredRows.length === 0 ? (
              <p className="py-6 text-center text-sm font-medium text-slate-500">
                Aramayı güncelleyin veya Yeni Kayıt ile enerji bedeni ekleyin.
              </p>
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const isExportSelected = selectedForExport.has(row.id);
                return (
                  <div key={row.id} className="relative">
                    <label
                      className="absolute right-3 top-3 z-10 flex h-5 w-5 cursor-pointer items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isExportSelected}
                        onChange={() => setSelectedForExport((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                          return next;
                        })}
                        className="h-4 w-4 rounded accent-cyan-600 shadow"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => selectRow(row)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                        active
                          ? "scale-[1.01] border-violet-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(167,139,250,0.18)] ring-2 ring-violet-200/45"
                          : isExportSelected
                          ? "border-cyan-300/60 bg-cyan-50/80"
                          : "border-transparent bg-white/50 hover:border-violet-100/75 hover:bg-white/88 hover:shadow-sm"
                      }`}
                    >
                      <p className="text-[13px] font-black capitalize leading-snug tracking-tight text-slate-900">
                        {row.source_uid?.trim() || "—"}
                      </p>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={detailPanelClass}>
          {selectedRow ? (
            <>
              <div className="flex flex-col gap-3 border-b border-cyan-100/60 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1.5 inline-flex rounded-full bg-cyan-50 px-2.5 py-0.5 text-[9px] font-black tracking-[0.14em] text-cyan-900 ring-1 ring-cyan-200/60">
                    SEÇİLİ KAYIT
                  </div>
                  <h3 className="text-xl font-black capitalize leading-tight text-slate-900 sm:text-2xl">
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

              <div className="mt-4 grid flex-1 gap-3">
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

              <div className="mt-4 flex flex-wrap gap-2 border-t border-cyan-100/60 pt-4">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-xl border border-cyan-200/70 bg-cyan-50/90 px-4 py-2 text-[12px] font-black text-cyan-950 shadow-sm transition hover:bg-cyan-100/90"
                >
                  Güncelle
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={openDeleteConfirm}
                  className="rounded-xl border border-rose-200/70 bg-rose-50/90 px-4 py-2 text-[12px] font-black text-rose-800 transition hover:bg-rose-100/90 disabled:opacity-45"
                >
                  Sil
                </button>
                <button
                  type="button"
                  disabled={wordBusy}
                  onClick={() => void exportEnergyBodiesWord(tenantId ?? "", readYasamUser()?.id ?? "", "single", selectedRow.id, setWordBusy)}
                  className="rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2 text-[12px] font-black text-violet-950 shadow-sm transition hover:bg-violet-100/90 disabled:opacity-45"
                >
                  {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-200/70 bg-cyan-50/30 px-6 text-center">
              <p className="max-w-sm text-sm font-medium text-slate-400">
                Soldan bir kayıt seçin veya yeni enerji bedeni ekleyin.
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
