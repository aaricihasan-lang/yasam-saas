"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CrudEmptyState,
  ModuleStats,
  badgeFieldWrapClass,
  formGlassPanelClass,
  listColumnClass,
  searchInputClass,
  sectionShellClass,
} from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type SubconsciousCauseRecord = {
  id: string;
  tenant_id: string;
  illness_name: string | null;
  category: string | null;
  subconscious_reason: string | null;
  emotional_pattern: string | null;
  affirmation: string | null;
  healing_note: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

type SubconsciousCauseForm = {
  illness_name: string;
  category: string;
  subconscious_reason: string;
  emotional_pattern: string;
  affirmation: string;
  healing_note: string;
  source: string;
  note: string;
};

const emptyForm: SubconsciousCauseForm = {
  illness_name: "",
  category: "",
  subconscious_reason: "",
  emotional_pattern: "",
  affirmation: "",
  healing_note: "",
  source: "",
  note: "",
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
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

function previewText(s: string | null, max = 200) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "Özet için henüz metin yok.";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default function BilincaltiSebepleri() {
  const [rows, setRows] = useState<SubconsciousCauseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchIllness, setSearchIllness] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchReason, setSearchReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SubconsciousCauseForm>({ ...emptyForm });
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
    setInfoError("");
    const { data, error } = await supabase
      .from("subconscious_causes")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      showSoft("err", `Kayıtlar yüklenemedi: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as SubconsciousCauseRecord[]);
  }, [showSoft]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const i = searchIllness.trim().toLocaleLowerCase("tr-TR");
    const c = searchCategory.trim().toLocaleLowerCase("tr-TR");
    const r = searchReason.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const illnessOk =
        !i || (row.illness_name ?? "").toLocaleLowerCase("tr-TR").includes(i);
      const categoryOk =
        !c || (row.category ?? "").toLocaleLowerCase("tr-TR").includes(c);
      const reasonOk =
        !r ||
        (row.subconscious_reason ?? "").toLocaleLowerCase("tr-TR").includes(r);
      return illnessOk && categoryOk && reasonOk;
    });
  }, [rows, searchIllness, searchCategory, searchReason]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((x) => x.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));
    const last = rows.length ? formatDate(rows[0].created_at) : "—";
    return { total: rows.length, cats: cats.size, last };
  }, [rows]);

  const hasSearch = Boolean(
    searchIllness.trim() || searchCategory.trim() || searchReason.trim(),
  );

  function fillFormFromRow(row: SubconsciousCauseRecord) {
    setForm({
      illness_name: row.illness_name ?? "",
      category: row.category ?? "",
      subconscious_reason: row.subconscious_reason ?? "",
      emotional_pattern: row.emotional_pattern ?? "",
      affirmation: row.affirmation ?? "",
      healing_note: row.healing_note ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    });
  }

  function selectRow(row: SubconsciousCauseRecord) {
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
    const nameTrim = form.illness_name.trim();
    if (!nameTrim) {
      showSoft("err", "Hastalık adı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase.from("subconscious_causes").insert({
      tenant_id: TENANT_ID,
      illness_name: nameTrim,
      category: trimOrNull(form.category),
      subconscious_reason: trimOrNull(form.subconscious_reason),
      emotional_pattern: trimOrNull(form.emotional_pattern),
      affirmation: trimOrNull(form.affirmation),
      healing_note: trimOrNull(form.healing_note),
      source: trimOrNull(form.source),
      note: trimOrNull(form.note),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error.message}`);
      return;
    }

    setFormModalOpen(false);
    await loadRecords();
    showSoft("ok", "Kayıt oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const nameTrim = form.illness_name.trim();
    if (!nameTrim) {
      showSoft("err", "Hastalık adı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("subconscious_causes")
      .update({
        illness_name: nameTrim,
        category: trimOrNull(form.category),
        subconscious_reason: trimOrNull(form.subconscious_reason),
        emotional_pattern: trimOrNull(form.emotional_pattern),
        affirmation: trimOrNull(form.affirmation),
        healing_note: trimOrNull(form.healing_note),
        source: trimOrNull(form.source),
        note: trimOrNull(form.note),
      })
      .eq("id", selectedId)
      .eq("tenant_id", TENANT_ID);

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
      .from("subconscious_causes")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", TENANT_ID);

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

  const newRecordBtnClass =
    "inline-flex shrink-0 items-center justify-center rounded-xl border border-fuchsia-200/70 bg-gradient-to-r from-fuchsia-50/95 via-white/90 to-violet-50/80 px-3.5 py-2 text-[11px] font-black uppercase tracking-wide text-fuchsia-950 shadow-[0_6px_20px_-8px_rgba(192,38,211,0.2)] ring-1 ring-fuchsia-100/50 transition hover:border-fuchsia-300/80 active:scale-[0.98] sm:px-4";

  return (
    <section className={`${sectionShellClass} ring-fuchsia-100/35`}>
      <div className="mb-4 flex flex-col gap-3 border-b border-fuchsia-100/50 pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
            Hastalıkların Bilinçaltı Sebepleri
          </h2>
          <p className="mt-1 text-[12px] font-medium text-slate-500">
            Listeden seçin; düzenleme ve yeni kayıt geniş panelde açılır.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
              Hastalık adı
            </span>
            <input
              type="search"
              value={searchIllness}
              onChange={(e) => setSearchIllness(e.target.value)}
              className={searchInputClass("violet")}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-fuchsia-600/75">
              Kategori
            </span>
            <input
              type="search"
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              className={searchInputClass("fuchsia")}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-cyan-600/75">
              Bilinçaltı sebep
            </span>
            <input
              type="search"
              value={searchReason}
              onChange={(e) => setSearchReason(e.target.value)}
              className={searchInputClass("cyan")}
            />
          </label>
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Kategori"
          midCount={moduleStats.cats}
          lastDate={moduleStats.last}
          tone="fuchsia"
        />
      </div>

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

      <div className="flex min-h-[min(68vh,560px)] flex-col gap-4 lg:flex-row lg:gap-6">
        <div
          className={`${listColumnClass} order-1 border-fuchsia-100/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(253,244,255,0.42)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_28px_-14px_rgba(192,38,211,0.06)] lg:order-none`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-fuchsia-700/90">
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
            ) : filteredRows.length === 0 ? (
              <CrudEmptyState
                icon="◐"
                title="Liste boş"
                subtitle={
                  hasSearch
                    ? "Aramayı güncelleyin veya Yeni Kayıt ile kayıt ekleyin."
                    : "Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                }
                tone="fuchsia"
              />
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRow(row)}
                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ease-out will-change-transform ${
                      active
                        ? "scale-[1.01] border-fuchsia-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(217,70,239,0.16),0_14px_36px_-12px_rgba(147,51,234,0.12)] ring-2 ring-fuchsia-200/45 ring-offset-1 ring-offset-transparent"
                        : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-fuchsia-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="line-clamp-2 text-[13px] font-black leading-snug text-slate-900">
                      {row.illness_name?.trim() || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      {row.category?.trim() ? (
                        <span className="rounded-full bg-gradient-to-r from-fuchsia-100/90 to-violet-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-950/90 shadow-inner ring-1 ring-fuchsia-200/45">
                          {row.category}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          className={`${formGlassPanelClass} order-2 min-h-[min(280px,42vh)] min-w-0 flex-1 border-fuchsia-100/35 ring-violet-100/30 lg:order-none`}
        >
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex rounded-full bg-fuchsia-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-fuchsia-900 ring-1 ring-fuchsia-200/45">
                SEÇİLİ KAYIT
              </div>
              <h3 className="mt-2 text-[17px] font-black leading-snug text-slate-900 sm:text-[18px]">
                {selectedRow.illness_name?.trim() || "—"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                <span>{formatDate(selectedRow.created_at)}</span>
                {selectedRow.category?.trim() ? (
                  <span className="rounded-full bg-gradient-to-r from-fuchsia-100/90 to-violet-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-950/90 ring-1 ring-fuchsia-200/45">
                    {selectedRow.category}
                  </span>
                ) : null}
                {selectedRow.source?.trim() ? (
                  <span className="rounded-full border border-amber-100/80 bg-amber-50/80 px-2 py-0.5 text-[10px] font-black text-amber-950/90">
                    Kaynak: {selectedRow.source}
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-[12px] font-semibold leading-relaxed text-slate-600">
                {previewText(selectedRow.subconscious_reason)}
              </p>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-white/55 pt-5">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/90 px-4 py-2.5 text-[12px] font-black text-fuchsia-950 shadow-sm transition hover:bg-fuchsia-100/90"
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
                Soldan bir kayıt seçin veya yeni kayıt oluşturmak için üstteki düğmeyi kullanın.
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni bilinçaltı kaydı" : "Bilinçaltı kaydını düzenle"}
        subtitle="Kaydettikten sonra panel kapanır ve liste yenilenir."
        titleId="subconscious-form-modal-title"
        accentRingClass="ring-fuchsia-100/50"
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
                className="rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/90 px-4 py-2.5 text-[12px] font-black text-fuchsia-950 shadow-sm transition hover:bg-fuchsia-100/90 disabled:opacity-55"
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
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(109,40,217,0.35)]" />
              Hastalık adı
            </span>
            <input
              value={form.illness_name}
              onChange={(e) => setForm((f) => ({ ...f, illness_name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/90" />
              Kategori
            </span>
            <div className={badgeFieldWrapClass("fuchsia")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Örn. duygusal, travma…"
              />
            </div>
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
                Bilinçaltı sebep
              </span>
            }
            modalTitle="Bilinçaltı sebep"
            value={form.subconscious_reason}
            onChange={(v) => setForm((f) => ({ ...f, subconscious_reason: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500/85" />
                Duygusal örüntü
              </span>
            }
            modalTitle="Duygusal örüntü"
            value={form.emotional_pattern}
            onChange={(v) => setForm((f) => ({ ...f, emotional_pattern: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-rose-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-rose-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/90" />
                Afirmasyon
              </span>
            }
            modalTitle="Afirmasyon"
            value={form.affirmation}
            onChange={(v) => setForm((f) => ({ ...f, affirmation: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-emerald-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500/85" />
                İyileşme notu
              </span>
            }
            modalTitle="İyileşme notu"
            value={form.healing_note}
            onChange={(v) => setForm((f) => ({ ...f, healing_note: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-indigo-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-indigo-100/50 transition"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/90" />
              Kaynak
            </span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-amber-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-amber-200/90 focus:ring-2 focus:ring-amber-100/55"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500/70" />
                Not
              </span>
            }
            modalTitle="Not"
            value={form.note}
            onChange={(v) => setForm((f) => ({ ...f, note: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-slate-100/60 transition"
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
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.12)] ring-1 ring-fuchsia-100/50 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subconscious-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
              SİLME ONAYI
            </div>
            <h3 id="subconscious-delete-title" className="mt-2 text-[17px] font-black leading-snug text-slate-950">
              Bu bilinçaltı sebebi kaydını silmek istediğinizden emin misiniz?
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
