"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import {
  CrudEmptyState,
  ModuleStats,
  formGlassPanelClass,
  listColumnClass,
  searchInputClass,
  sectionShellClass,
} from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type ChakraNoteRecord = {
  id: string;
  tenant_id: string;
  chakra_name: string | null;
  chakra_color: string | null;
  location: string | null;
  theme: string | null;
  imbalance_symptoms: string | null;
  balanced_state: string | null;
  healing_methods: string | null;
  affirmation: string | null;
  stone_support: string | null;
  frequency_note: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

type ChakraNoteForm = {
  chakra_name: string;
  chakra_color: string;
  location: string;
  theme: string;
  imbalance_symptoms: string;
  balanced_state: string;
  healing_methods: string;
  affirmation: string;
  stone_support: string;
  frequency_note: string;
  source: string;
  note: string;
};

const emptyForm: ChakraNoteForm = {
  chakra_name: "",
  chakra_color: "",
  location: "",
  theme: "",
  imbalance_symptoms: "",
  balanced_state: "",
  healing_methods: "",
  affirmation: "",
  stone_support: "",
  frequency_note: "",
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

/** Geçerli #hex ise rgba döndürür; değilse null */
function hexToRgba(hex: string, alpha: number): string | null {
  const h = hex.trim();
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(h)) return null;
  let r: number;
  let g: number;
  let b: number;
  if (h.length === 4) {
    r = parseInt(h[1] + h[1], 16);
    g = parseInt(h[2] + h[2], 16);
    b = parseInt(h[3] + h[3], 16);
  } else {
    r = parseInt(h.slice(1, 3), 16);
    g = parseInt(h.slice(3, 5), 16);
    b = parseInt(h.slice(5, 7), 16);
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return `rgba(${r},${g},${b},${alpha})`;
}

function formPanelStyle(colorInput: string): CSSProperties {
  const tint = hexToRgba(colorInput, 0.14);
  const tintMid = hexToRgba(colorInput, 0.08);
  if (tint && tintMid) {
    return {
      backgroundImage: `linear-gradient(165deg, rgba(255,255,255,0.97) 0%, ${tintMid} 32%, ${tint} 55%, rgba(255,251,235,0.45) 100%)`,
    };
  }
  return {
    backgroundImage:
      "linear-gradient(165deg, rgba(255,255,255,0.96) 0%, rgba(255,247,237,0.42) 48%, rgba(254,243,199,0.28) 100%)",
  };
}

export default function Cakralar() {
  const [rows, setRows] = useState<ChakraNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searchTheme, setSearchTheme] = useState("");
  const [searchHealing, setSearchHealing] = useState("");
  const [searchAffirmation, setSearchAffirmation] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ChakraNoteForm>({ ...emptyForm });
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
      .from("chakra_notes")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      showSoft("err", `Kayıtlar yüklenemedi: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as ChakraNoteRecord[]);
  }, [showSoft]);

  useEffect(() => {
    runInEffect(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const n = searchName.trim().toLocaleLowerCase("tr-TR");
    const t = searchTheme.trim().toLocaleLowerCase("tr-TR");
    const h = searchHealing.trim().toLocaleLowerCase("tr-TR");
    const a = searchAffirmation.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const nameOk =
        !n || (row.chakra_name ?? "").toLocaleLowerCase("tr-TR").includes(n);
      const themeOk =
        !t || (row.theme ?? "").toLocaleLowerCase("tr-TR").includes(t);
      const healingOk =
        !h ||
        (row.healing_methods ?? "").toLocaleLowerCase("tr-TR").includes(h);
      const affOk =
        !a || (row.affirmation ?? "").toLocaleLowerCase("tr-TR").includes(a);
      return nameOk && themeOk && healingOk && affOk;
    });
  }, [rows, searchName, searchTheme, searchHealing, searchAffirmation]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const themes = new Set(rows.map((r) => r.theme?.trim()).filter(Boolean));
    const last = rows.length ? formatDate(rows[0].created_at) : "—";
    return { total: rows.length, themes: themes.size, last };
  }, [rows]);

  const hasSearch = Boolean(
    searchName.trim() ||
      searchTheme.trim() ||
      searchHealing.trim() ||
      searchAffirmation.trim(),
  );

  const detailBgStyle = useMemo(
    () => (selectedRow ? formPanelStyle(selectedRow.chakra_color ?? "") : undefined),
    [selectedRow],
  );

  const modalFormBgStyle = useMemo(
    () => formPanelStyle(form.chakra_color),
    [form.chakra_color],
  );

  function fillFormFromRow(row: ChakraNoteRecord) {
    setForm({
      chakra_name: row.chakra_name ?? "",
      chakra_color: row.chakra_color ?? "",
      location: row.location ?? "",
      theme: row.theme ?? "",
      imbalance_symptoms: row.imbalance_symptoms ?? "",
      balanced_state: row.balanced_state ?? "",
      healing_methods: row.healing_methods ?? "",
      affirmation: row.affirmation ?? "",
      stone_support: row.stone_support ?? "",
      frequency_note: row.frequency_note ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    });
  }

  function selectRow(row: ChakraNoteRecord) {
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
    const nameTrim = form.chakra_name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase.from("chakra_notes").insert({
      tenant_id: TENANT_ID,
      chakra_name: nameTrim,
      chakra_color: trimOrNull(form.chakra_color),
      location: trimOrNull(form.location),
      theme: trimOrNull(form.theme),
      imbalance_symptoms: trimOrNull(form.imbalance_symptoms),
      balanced_state: trimOrNull(form.balanced_state),
      healing_methods: trimOrNull(form.healing_methods),
      affirmation: trimOrNull(form.affirmation),
      stone_support: trimOrNull(form.stone_support),
      frequency_note: trimOrNull(form.frequency_note),
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
    showSoft("ok", "Çakra notu oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const nameTrim = form.chakra_name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("chakra_notes")
      .update({
        chakra_name: nameTrim,
        chakra_color: trimOrNull(form.chakra_color),
        location: trimOrNull(form.location),
        theme: trimOrNull(form.theme),
        imbalance_symptoms: trimOrNull(form.imbalance_symptoms),
        balanced_state: trimOrNull(form.balanced_state),
        healing_methods: trimOrNull(form.healing_methods),
        affirmation: trimOrNull(form.affirmation),
        stone_support: trimOrNull(form.stone_support),
        frequency_note: trimOrNull(form.frequency_note),
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
      .from("chakra_notes")
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
    "inline-flex shrink-0 items-center justify-center rounded-xl border border-orange-200/70 bg-gradient-to-r from-orange-50/95 via-white/90 to-amber-50/80 px-3.5 py-2 text-[11px] font-black uppercase tracking-wide text-orange-950 shadow-[0_6px_20px_-8px_rgba(234,88,12,0.2)] ring-1 ring-orange-100/50 transition hover:border-orange-300/80 active:scale-[0.98] sm:px-4";

  return (
    <section className={`${sectionShellClass} ring-orange-100/35`}>
      <div className="mb-4 flex flex-col gap-3 border-b border-orange-100/50 pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">Çakralar</h2>
          <p className="mt-1 text-[12px] font-medium text-slate-500">
            Listeden seçin; düzenleme ve yeni kayıt geniş panelde açılır.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-orange-700/75">
              Çakra adı
            </span>
            <input
              type="search"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className={searchInputClass("orange")}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-rose-600/75">
              Tema
            </span>
            <input
              type="search"
              value={searchTheme}
              onChange={(e) => setSearchTheme(e.target.value)}
              className={searchInputClass("fuchsia")}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-amber-700/75">
              Şifa yöntemleri
            </span>
            <input
              type="search"
              value={searchHealing}
              onChange={(e) => setSearchHealing(e.target.value)}
              className={searchInputClass("amber")}
            />
          </label>
          <label className="block min-w-0 sm:col-span-2 xl:col-span-1">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
              Olumlama
            </span>
            <input
              type="search"
              value={searchAffirmation}
              onChange={(e) => setSearchAffirmation(e.target.value)}
              className={searchInputClass("violet")}
            />
          </label>
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Tema"
          midCount={moduleStats.themes}
          lastDate={moduleStats.last}
          tone="orange"
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
          className={`${listColumnClass} order-1 border-orange-100/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(255,247,237,0.42)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_28px_-14px_rgba(234,88,12,0.06)] lg:order-none`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-orange-800/90">
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
                icon="⬡"
                title="Liste boş"
                subtitle={
                  hasSearch
                    ? "Aramayı güncelleyin veya Yeni Kayıt ile çakra notu ekleyin."
                    : "Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                }
                tone="orange"
              />
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const dotColor = hexToRgba(row.chakra_color ?? "", 1) ?? "rgb(251, 146, 60)";
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRow(row)}
                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ease-out will-change-transform ${
                      active
                        ? "scale-[1.01] border-orange-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(251,146,60,0.2),0_14px_36px_-12px_rgba(234,88,12,0.14)] ring-2 ring-orange-200/45 ring-offset-1 ring-offset-transparent"
                        : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-orange-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(254,243,199,0.75)_50%,rgba(255,237,213,0.82)_100%)] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-orange-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_14px_-6px_rgba(234,88,12,0.15)] ring-1 ring-orange-200/55"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.45)] ring-2 ring-white/90"
                          style={{ backgroundColor: dotColor }}
                          aria-hidden
                        />
                        <span className="truncate">{row.chakra_name?.trim() || "—"}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      {row.theme?.trim() ? (
                        <span className="max-w-[min(100%,200px)] truncate rounded-full bg-gradient-to-r from-rose-50/95 to-fuchsia-50/70 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-900/85 ring-1 ring-rose-100/70">
                          {row.theme}
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
          className={`${formGlassPanelClass} order-2 min-h-[min(280px,42vh)] min-w-0 flex-1 border-orange-100/40 ring-orange-100/25 transition-[background] duration-300 lg:order-none`}
          style={detailBgStyle}
        >
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex rounded-full bg-orange-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-orange-950 ring-1 ring-orange-200/45">
                SEÇİLİ KAYIT
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[14px] font-black text-slate-900 shadow-sm ring-1 ring-orange-100/50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/90"
                    style={{
                      backgroundColor:
                        hexToRgba(selectedRow.chakra_color ?? "", 1) ?? "rgb(251, 146, 60)",
                    }}
                    aria-hidden
                  />
                  {selectedRow.chakra_name?.trim() || "—"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                <span>{formatDate(selectedRow.created_at)}</span>
                {selectedRow.location?.trim() ? (
                  <span className="rounded-full border border-amber-100/80 bg-amber-50/80 px-2 py-0.5 text-[10px] font-black text-amber-950/90">
                    {selectedRow.location}
                  </span>
                ) : null}
                {selectedRow.source?.trim() ? (
                  <span className="rounded-full border border-teal-100/80 bg-teal-50/80 px-2 py-0.5 text-[10px] font-black text-teal-950/90">
                    Kaynak: {selectedRow.source}
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-[12px] font-semibold leading-relaxed text-slate-600">
                {previewText(selectedRow.theme)}
              </p>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-white/55 pt-5">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-xl border border-orange-200/70 bg-orange-50/90 px-4 py-2.5 text-[12px] font-black text-orange-950 shadow-sm transition hover:bg-orange-100/90"
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
                Soldan bir kayıt seçin veya yeni çakra notu eklemek için üstteki düğmeyi kullanın.
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni çakra notu" : "Çakra notunu düzenle"}
        subtitle="Kaydettikten sonra panel kapanır ve liste yenilenir."
        titleId="chakra-form-modal-title"
        accentRingClass="ring-orange-100/50"
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
                className="rounded-xl border border-orange-200/70 bg-orange-50/90 px-4 py-2.5 text-[12px] font-black text-orange-950 shadow-sm transition hover:bg-orange-100/90 disabled:opacity-55"
              >
                {saving ? "Güncelleniyor…" : "Güncelle"}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-5 rounded-2xl px-1 py-1" style={modalFormBgStyle}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.35)]" />
              Çakra Adı
            </span>
            <input
              value={form.chakra_name}
              onChange={(e) => setForm((f) => ({ ...f, chakra_name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-orange-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-orange-200/90 focus:ring-2 focus:ring-orange-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500/90" />
              Çakra Rengi
            </span>
            <input
              value={form.chakra_color}
              onChange={(e) => setForm((f) => ({ ...f, chakra_color: e.target.value }))}
              className="h-12 w-full rounded-xl border border-rose-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-rose-200/90 focus:ring-2 focus:ring-rose-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/90" />
              Konum
            </span>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="h-12 w-full rounded-xl border border-amber-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-amber-200/90 focus:ring-2 focus:ring-amber-100/55"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/85" />
                Tema
              </span>
            }
            modalTitle="Tema"
            value={form.theme}
            onChange={(v) => setForm((f) => ({ ...f, theme: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-fuchsia-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-fuchsia-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500/75" />
                Dengesizlik Belirtileri
              </span>
            }
            modalTitle="Dengesizlik Belirtileri"
            value={form.imbalance_symptoms}
            onChange={(v) => setForm((f) => ({ ...f, imbalance_symptoms: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-red-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-red-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/90" />
                Dengeli Durum
              </span>
            }
            modalTitle="Dengeli Durum"
            value={form.balanced_state}
            onChange={(v) => setForm((f) => ({ ...f, balanced_state: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-emerald-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
                Şifa Yöntemleri
              </span>
            }
            modalTitle="Şifa Yöntemleri"
            value={form.healing_methods}
            onChange={(v) => setForm((f) => ({ ...f, healing_methods: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90" />
                Olumlama
              </span>
            }
            modalTitle="Olumlama"
            value={form.affirmation}
            onChange={(v) => setForm((f) => ({ ...f, affirmation: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-violet-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500/85" />
                Taş Desteği
              </span>
            }
            modalTitle="Taş Desteği"
            value={form.stone_support}
            onChange={(v) => setForm((f) => ({ ...f, stone_support: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-indigo-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-indigo-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500/90" />
                Frekans Notu
              </span>
            }
            modalTitle="Frekans Notu"
            value={form.frequency_note}
            onChange={(v) => setForm((f) => ({ ...f, frequency_note: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-sky-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-sky-100/50 transition"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600/80" />
              Kaynak
            </span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-teal-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-teal-200/90 focus:ring-2 focus:ring-teal-100/55"
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
            minRows={2}
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
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.12)] ring-1 ring-orange-100/50 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chakra-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
              SİLME ONAYI
            </div>
            <h3 id="chakra-delete-title" className="mt-2 text-[17px] font-black leading-snug text-slate-950">
              Bu çakra notunu silmek istediğinizden emin misiniz?
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
