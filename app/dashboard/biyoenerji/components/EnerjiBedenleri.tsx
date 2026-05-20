"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import {
  CrudEmptyState,
  ModuleStats,
  formGlassPanelClass,
  listColumnClass,
  newRecordBtnClass,
  searchInputClass,
  sectionShellClass,
} from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

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

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-cyan-100/80 bg-white/85 p-4 shadow-[0_8px_28px_-16px_rgba(8,145,178,0.18)] ring-1 ring-cyan-50/70 backdrop-blur-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800/80">
        {title}
      </p>
      <div className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

export default function EnerjiBedenleri() {
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

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setLoadErrorMessage(null);
    setInfoError("");
    const { data, error } = await supabase
      .from("bioenergy_energy_bodies")
      .select("*")
      .order("source_uid");

    setLoading(false);

    if (error) {
      setLoadErrorMessage(`Enerji bedenleri okunamadı: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as BioenergyEnergyBodyRecord[]);
  }, []);

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
      tenant_id: TENANT_ID,
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
      .eq("id", selectedId);

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
      .eq("id", selectedId);

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
    <section className={sectionShellClass}>
      <div className="mb-6 flex flex-col gap-4 border-b border-cyan-100/50 pb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-4xl font-black text-slate-950">Enerji Bedenleri</h2>
            <p className="mt-2 text-lg font-medium text-slate-600">
              Listeden seçin; düzenleme ve yeni kayıt geniş panelde açılır.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 xl:max-w-xl">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-cyan-600/75">
                Ara (genel tanım, görev, bozulma, taşlar, not)
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={searchInputClass("cyan")}
              />
            </label>
          </div>
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Kaynak uid"
          midCount={moduleStats.uids}
          lastDate={moduleStats.last}
          tone="cyan"
        />
      </div>

      {loadErrorMessage ? (
        <div className="mb-3 rounded-xl border border-rose-100/80 bg-rose-50/90 px-4 py-2.5 text-[12px] font-bold text-rose-800 shadow-sm ring-1 ring-rose-100/50">
          {loadErrorMessage}
        </div>
      ) : null}

      {(infoSuccess || infoError) && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {infoSuccess ? (
            <div className="flex-1 rounded-xl border border-emerald-100/80 bg-emerald-50/90 px-4 py-2.5 text-[12px] font-bold text-emerald-800 shadow-sm ring-1 ring-emerald-100/50">
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-xl border border-rose-100/80 bg-rose-50/90 px-4 py-2.5 text-[12px] font-bold text-rose-800 shadow-sm ring-1 ring-rose-100/50">
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex min-h-[min(68vh,560px)] flex-col gap-6 xl:flex-row">
        <div className={`${listColumnClass} order-1 xl:order-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-cyan-700/90">
              Kayıtlar ({filteredRows.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {loading ? (
                <span className="text-[10px] font-bold text-slate-400">Yükleniyor…</span>
              ) : null}
              <button type="button" onClick={openCreateModal} className={newRecordBtnClass}>
                + Yeni Kayıt
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-400">Yükleniyor…</p>
            ) : loadErrorMessage ? null : rows.length === 0 ? (
              <CrudEmptyState
                icon="◎"
                title="Liste boş"
                subtitle="Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                tone="cyan"
              />
            ) : filteredRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-500">
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
                    className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all duration-200 ease-out will-change-transform ${
                      active
                        ? "scale-[1.01] border-cyan-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(34,211,238,0.18),0_14px_36px_-12px_rgba(8,145,178,0.13)] ring-2 ring-cyan-200/45 ring-offset-1 ring-offset-transparent"
                        : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-cyan-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <p className="text-base font-black capitalize leading-snug tracking-tight text-slate-900 sm:text-lg">
                      {row.source_uid?.trim() || "—"}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`${formGlassPanelClass} order-2 min-w-0 flex-1 xl:order-none`}>
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex rounded-full bg-cyan-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-cyan-900 ring-1 ring-cyan-200/45">
                SEÇİLİ KAYIT
              </div>
              <h3 className="mt-2 text-2xl font-black capitalize leading-snug text-slate-900 sm:text-3xl">
                {selectedRow.source_uid?.trim() || "—"}
              </h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-1">
                <DetailCard title="Genel Tanım">
                  <p className="whitespace-pre-wrap">
                    {selectedRow.genel_tanim?.trim() || "—"}
                  </p>
                </DetailCard>
                <DetailCard title="Görevi">
                  <p className="whitespace-pre-wrap">{selectedRow.gorevi?.trim() || "—"}</p>
                </DetailCard>
                <DetailCard title="Bozulma Belirtileri">
                  <p className="whitespace-pre-wrap">{selectedRow.bozulma?.trim() || "—"}</p>
                </DetailCard>
                <DetailCard title="Önerilen Taşlar">
                  <p className="whitespace-pre-wrap">
                    {selectedRow.onerilen_taslar?.trim() || "—"}
                  </p>
                </DetailCard>
                <DetailCard title="Not">
                  <p className="whitespace-pre-wrap">{selectedRow.not_text?.trim() || "—"}</p>
                </DetailCard>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-white/55 pt-5">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-xl border border-cyan-200/70 bg-cyan-50/90 px-4 py-2.5 text-[12px] font-black text-cyan-950 shadow-sm transition hover:bg-cyan-100/90"
                >
                  Güncelle
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={openDeleteConfirm}
                  className="rounded-xl border border-rose-200/70 bg-rose-50/90 px-4 py-2.5 text-[12px] font-black text-rose-800 transition hover:bg-rose-100/90 disabled:opacity-45"
                >
                  Sil
                </button>
              </div>
            </>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-2 text-center">
              <p className="max-w-sm text-[13px] font-semibold leading-relaxed text-slate-500">
                Soldan bir kayıt seçin veya yeni enerji bedeni eklemek için üstteki düğmeyi kullanın.
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
