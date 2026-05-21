"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
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

type BioenergyChakraRecord = {
  id: string;
  tenant_id: string;
  source_uid: string;
  name: string | null;
  organs: string | null;
  glands: string | null;
  color: string | null;
  stones: string | null;
  causes: string | null;
  physical: string | null;
  mental: string | null;
  notes: string | null;
  created_at: string;
};

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

const emptyForm: ChakraForm = {
  name: "",
  organs: "",
  glands: "",
  color: "",
  stones: "",
  causes: "",
  physical: "",
  mental: "",
  notes: "",
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

function colorDotStyle(color: string | null): string {
  return hexToRgba(color ?? "", 1) ?? "rgb(251, 146, 60)";
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

function chakraSearchBlob(row: BioenergyChakraRecord) {
  return [
    row.name,
    row.organs,
    row.glands,
    row.color,
    row.stones,
    row.causes,
    row.physical,
    row.mental,
    row.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

export default function Cakralar() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<BioenergyChakraRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ChakraForm>({ ...emptyForm });
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
    setLoadError(false);
    setInfoError("");
    const { data, error } = await supabase
      .from("bioenergy_chakras")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");

    setLoading(false);

    if (error) {
      setLoadError(true);
      setRows([]);
      return;
    }

    setRows((data || []) as BioenergyChakraRecord[]);
  }, [tenantId]);

  useEffect(() => {
    runInEffect(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((row) => chakraSearchBlob(row).includes(q));
  }, [rows, searchQuery]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const colors = new Set(rows.map((r) => r.color?.trim()).filter(Boolean));
    const newest = rows.reduce<string | null>((acc, row) => {
      if (!row.created_at) return acc;
      if (!acc || row.created_at > acc) return row.created_at;
      return acc;
    }, null);
    const last = newest ? formatDate(newest) : "—";
    return { total: rows.length, colors: colors.size, last };
  }, [rows]);

  const detailBgStyle = useMemo(
    () => (selectedRow ? formPanelStyle(selectedRow.color ?? "") : undefined),
    [selectedRow],
  );

  const modalFormBgStyle = useMemo(() => formPanelStyle(form.color), [form.color]);

  function fillFormFromRow(row: BioenergyChakraRecord) {
    setForm({
      name: row.name ?? "",
      organs: row.organs ?? "",
      glands: row.glands ?? "",
      color: row.color ?? "",
      stones: row.stones ?? "",
      causes: row.causes ?? "",
      physical: row.physical ?? "",
      mental: row.mental ?? "",
      notes: row.notes ?? "",
    });
  }

  function selectRow(row: BioenergyChakraRecord) {
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
    if (!tenantId) return;

    const nameTrim = form.name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase.from("bioenergy_chakras").insert({
      tenant_id: tenantId,
      source_uid: slugifySourceUid(nameTrim),
      name: nameTrim,
      organs: trimOrEmpty(form.organs),
      glands: trimOrEmpty(form.glands),
      color: trimOrEmpty(form.color),
      stones: trimOrEmpty(form.stones),
      causes: trimOrEmpty(form.causes),
      physical: trimOrEmpty(form.physical),
      mental: trimOrEmpty(form.mental),
      notes: trimOrEmpty(form.notes),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error.message}`);
      return;
    }

    setFormModalOpen(false);
    await loadRecords();
    showSoft("ok", "Çakra kaydı oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!tenantId || !selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const nameTrim = form.name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
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
    if (!tenantId || !selectedId) return;

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("bioenergy_chakras")
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
    <section className={sectionShellClass}>
      <div className="mb-4 flex flex-col gap-3 border-b border-orange-100/50 pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">Çakralar</h2>
          <p className="mt-1 text-[12px] font-medium text-slate-500">
            Listeden seçin; düzenleme ve yeni kayıt geniş panelde açılır.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-orange-700/75">
              Ara (ad, organ, renk, taş, neden, fiziksel, zihinsel, not)
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={searchInputClass("orange")}
            />
          </label>
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Renk"
          midCount={moduleStats.colors}
          lastDate={moduleStats.last}
          tone="orange"
        />
      </div>

      {loadError ? (
        <div className="mb-3 rounded-xl border border-rose-100/80 bg-rose-50/90 px-4 py-2.5 text-[12px] font-bold text-rose-800 shadow-sm ring-1 ring-rose-100/50">
          Hata: veri alınamadı
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
            ) : loadError ? null : rows.length === 0 ? (
              <CrudEmptyState
                icon="⬡"
                title="Liste boş"
                subtitle="Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                tone="orange"
              />
            ) : filteredRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-500">
                Aramayı güncelleyin veya Yeni Kayıt ile çakra ekleyin.
              </p>
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const dotColor = colorDotStyle(row.color);
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
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(254,243,199,0.75)_50%,rgba(255,237,213,0.82)_100%)] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-orange-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_14px_-6px_rgba(234,88,12,0.15)] ring-1 ring-orange-200/55">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_rgba(251,146,60,0.45)] ring-2 ring-white/90"
                          style={{ backgroundColor: dotColor }}
                          aria-hidden
                        />
                        <span className="truncate">{row.name?.trim() || "—"}</span>
                      </span>
                    </div>
                    {row.color?.trim() ? (
                      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {row.color}
                      </p>
                    ) : null}
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
                <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[14px] font-black text-slate-900 shadow-sm ring-1 ring-orange-100/50">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/90"
                    style={{ backgroundColor: colorDotStyle(selectedRow.color) }}
                    aria-hidden
                  />
                  {selectedRow.name?.trim() || "—"}
                </span>
              </div>
              <div className="mt-4 space-y-3 text-[12px] leading-relaxed">
                {(
                  [
                    ["Organlar", selectedRow.organs],
                    ["Bezler", selectedRow.glands],
                    ["Renk", selectedRow.color],
                    ["Taşlar", selectedRow.stones],
                    ["Nedenler", selectedRow.causes],
                    ["Fiziksel", selectedRow.physical],
                    ["Zihinsel", selectedRow.mental],
                    ["Notlar", selectedRow.notes],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-black uppercase tracking-wide text-orange-700/75">
                      {label}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-600">
                      {value?.trim() || "—"}
                    </p>
                  </div>
                ))}
              </div>
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
                Soldan bir kayıt seçin veya yeni çakra eklemek için üstteki düğmeyi kullanın.
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni çakra" : "Çakrayı düzenle"}
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
                className="rounded-xl border border-orange-200/70 bg-amber-50/90 px-4 py-2.5 text-[12px] font-black text-amber-950 shadow-sm transition hover:bg-amber-100/90 disabled:opacity-55"
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
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-orange-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-orange-200/90 focus:ring-2 focus:ring-orange-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500/90" />
              Renk
            </span>
            <input
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="h-12 w-full rounded-xl border border-rose-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-rose-200/90 focus:ring-2 focus:ring-rose-100/55"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/90" />
                Organlar
              </span>
            }
            modalTitle="Organlar"
            value={form.organs}
            onChange={(v) => setForm((f) => ({ ...f, organs: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-amber-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-amber-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/85" />
                Bezler
              </span>
            }
            modalTitle="Bezler"
            value={form.glands}
            onChange={(v) => setForm((f) => ({ ...f, glands: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-fuchsia-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-fuchsia-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500/85" />
                Taşlar
              </span>
            }
            modalTitle="Taşlar"
            value={form.stones}
            onChange={(v) => setForm((f) => ({ ...f, stones: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-indigo-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-indigo-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500/75" />
                Nedenler
              </span>
            }
            modalTitle="Nedenler"
            value={form.causes}
            onChange={(v) => setForm((f) => ({ ...f, causes: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-red-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-red-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
                Fiziksel
              </span>
            }
            modalTitle="Fiziksel"
            value={form.physical}
            onChange={(v) => setForm((f) => ({ ...f, physical: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90" />
                Zihinsel
              </span>
            }
            modalTitle="Zihinsel"
            value={form.mental}
            onChange={(v) => setForm((f) => ({ ...f, mental: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-violet-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500/70" />
                Notlar
              </span>
            }
            modalTitle="Notlar"
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
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
              Bu çakra kaydını silmek istediğinizden emin misiniz?
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
