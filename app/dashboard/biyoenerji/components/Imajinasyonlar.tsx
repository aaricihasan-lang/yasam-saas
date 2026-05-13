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

type BioImaginationRecord = {
  id: string;
  tenant_id: string;
  title: string | null;
  category: string | null;
  purpose: string | null;
  preparation: string | null;
  imagination_text: string | null;
  duration: string | null;
  warning: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

type BioImaginationForm = {
  title: string;
  category: string;
  purpose: string;
  preparation: string;
  imagination_text: string;
  duration: string;
  warning: string;
  source: string;
  note: string;
};

const emptyForm: BioImaginationForm = {
  title: "",
  category: "",
  purpose: "",
  preparation: "",
  imagination_text: "",
  duration: "",
  warning: "",
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

export default function Imajinasyonlar() {
  const [rows, setRows] = useState<BioImaginationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchPurpose, setSearchPurpose] = useState("");
  const [searchImagination, setSearchImagination] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<BioImaginationForm>({ ...emptyForm });
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
      .from("bio_imaginations")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      showSoft("err", `Kayıtlar yüklenemedi: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as BioImaginationRecord[]);
  }, [showSoft]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const t = searchTitle.trim().toLocaleLowerCase("tr-TR");
    const c = searchCategory.trim().toLocaleLowerCase("tr-TR");
    const p = searchPurpose.trim().toLocaleLowerCase("tr-TR");
    const m = searchImagination.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const titleOk =
        !t || (row.title ?? "").toLocaleLowerCase("tr-TR").includes(t);
      const categoryOk =
        !c || (row.category ?? "").toLocaleLowerCase("tr-TR").includes(c);
      const purposeOk =
        !p || (row.purpose ?? "").toLocaleLowerCase("tr-TR").includes(p);
      const imaginationOk =
        !m ||
        (row.imagination_text ?? "").toLocaleLowerCase("tr-TR").includes(m);
      return titleOk && categoryOk && purposeOk && imaginationOk;
    });
  }, [rows, searchTitle, searchCategory, searchPurpose, searchImagination]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));
    const last = rows.length ? formatDate(rows[0].created_at) : "—";
    return { total: rows.length, cats: cats.size, last };
  }, [rows]);

  const hasSearch = Boolean(
    searchTitle.trim() ||
      searchCategory.trim() ||
      searchPurpose.trim() ||
      searchImagination.trim(),
  );

  function fillFormFromRow(row: BioImaginationRecord) {
    setForm({
      title: row.title ?? "",
      category: row.category ?? "",
      purpose: row.purpose ?? "",
      preparation: row.preparation ?? "",
      imagination_text: row.imagination_text ?? "",
      duration: row.duration ?? "",
      warning: row.warning ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    });
  }

  function selectRow(row: BioImaginationRecord) {
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
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "İmajinasyon başlığı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase.from("bio_imaginations").insert({
      tenant_id: TENANT_ID,
      title: titleTrim,
      category: trimOrNull(form.category),
      purpose: trimOrNull(form.purpose),
      preparation: trimOrNull(form.preparation),
      imagination_text: trimOrNull(form.imagination_text),
      duration: trimOrNull(form.duration),
      warning: trimOrNull(form.warning),
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
    showSoft("ok", "İmajinasyon kaydı oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "İmajinasyon başlığı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("bio_imaginations")
      .update({
        title: titleTrim,
        category: trimOrNull(form.category),
        purpose: trimOrNull(form.purpose),
        preparation: trimOrNull(form.preparation),
        imagination_text: trimOrNull(form.imagination_text),
        duration: trimOrNull(form.duration),
        warning: trimOrNull(form.warning),
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
      .from("bio_imaginations")
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
    "inline-flex shrink-0 items-center justify-center rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/95 via-white/90 to-orange-50/80 px-3.5 py-2 text-[11px] font-black uppercase tracking-wide text-amber-950 shadow-[0_6px_20px_-8px_rgba(217,119,6,0.2)] ring-1 ring-amber-100/50 transition hover:border-amber-300/80 active:scale-[0.98] sm:px-4";

  return (
    <section className={`${sectionShellClass} ring-amber-100/35`}>
      <div className="mb-4 flex flex-col gap-3 border-b border-amber-100/50 pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">İmajinasyonlar</h2>
          <p className="mt-1 text-[12px] font-medium text-slate-500">
            Listeden seçin; düzenleme ve yeni kayıt geniş panelde açılır.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
              Başlık
            </span>
            <input
              type="search"
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
              className={searchInputClass("violet")}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-amber-700/75">
              Kategori
            </span>
            <input
              type="search"
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              className={searchInputClass("amber")}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-fuchsia-600/75">
              Amaç
            </span>
            <input
              type="search"
              value={searchPurpose}
              onChange={(e) => setSearchPurpose(e.target.value)}
              className={searchInputClass("fuchsia")}
            />
          </label>
          <label className="block min-w-0 sm:col-span-2 xl:col-span-1">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-cyan-600/75">
              İmajinasyon metni
            </span>
            <input
              type="search"
              value={searchImagination}
              onChange={(e) => setSearchImagination(e.target.value)}
              className={searchInputClass("cyan")}
            />
          </label>
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Kategori"
          midCount={moduleStats.cats}
          lastDate={moduleStats.last}
          tone="amber"
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
          className={`${listColumnClass} order-1 border-amber-100/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(255,251,235,0.45)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_28px_-14px_rgba(217,119,6,0.06)] lg:order-none`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-amber-800/90">
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
                icon="✧"
                title="Liste boş"
                subtitle={
                  hasSearch
                    ? "Aramayı güncelleyin veya Yeni Kayıt ile kayıt ekleyin."
                    : "Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                }
                tone="amber"
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
                        ? "scale-[1.01] border-amber-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(251,191,36,0.2),0_14px_36px_-12px_rgba(217,119,6,0.14)] ring-2 ring-amber-200/45 ring-offset-1 ring-offset-transparent"
                        : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-amber-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="line-clamp-2 text-[13px] font-black leading-snug text-slate-900">
                      {row.title?.trim() || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      {row.category?.trim() ? (
                        <span className="rounded-full bg-gradient-to-r from-amber-100/90 to-orange-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-950/90 shadow-inner ring-1 ring-amber-200/45">
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
          className={`${formGlassPanelClass} order-2 min-h-[min(280px,42vh)] min-w-0 flex-1 border-amber-100/35 ring-rose-100/25 lg:order-none`}
        >
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex rounded-full bg-amber-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-amber-950 ring-1 ring-amber-200/45">
                SEÇİLİ KAYIT
              </div>
              <h3 className="mt-2 text-[17px] font-black leading-snug text-slate-900 sm:text-[18px]">
                {selectedRow.title?.trim() || "—"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                <span>{formatDate(selectedRow.created_at)}</span>
                {selectedRow.category?.trim() ? (
                  <span className="rounded-full bg-gradient-to-r from-amber-100/90 to-orange-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-950/90 ring-1 ring-amber-200/45">
                    {selectedRow.category}
                  </span>
                ) : null}
                {selectedRow.duration?.trim() ? (
                  <span className="rounded-full border border-teal-100/80 bg-teal-50/80 px-2 py-0.5 text-[10px] font-black text-teal-950/90">
                    Süre: {selectedRow.duration}
                  </span>
                ) : null}
                {selectedRow.source?.trim() ? (
                  <span className="rounded-full border border-emerald-100/80 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-black text-emerald-950/90">
                    Kaynak: {selectedRow.source}
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-[12px] font-semibold leading-relaxed text-slate-600">
                {previewText(selectedRow.imagination_text ?? selectedRow.purpose)}
              </p>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-white/55 pt-5">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-4 py-2.5 text-[12px] font-black text-amber-950 shadow-sm transition hover:bg-amber-100/90"
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
                Soldan bir kayıt seçin veya yeni imajinasyon eklemek için üstteki düğmeyi kullanın.
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni imajinasyon" : "İmajinasyonu düzenle"}
        subtitle="Kaydettikten sonra panel kapanır ve liste yenilenir."
        titleId="imagination-form-modal-title"
        accentRingClass="ring-amber-100/50"
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
                className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-4 py-2.5 text-[12px] font-black text-amber-950 shadow-sm transition hover:bg-amber-100/90 disabled:opacity-55"
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
              İmajinasyon Başlığı
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/90" />
              Kategori
            </span>
            <div className={badgeFieldWrapClass("amber")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Örn. gevşeme, şifa…"
              />
            </div>
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500/85" />
                Amaç
              </span>
            }
            modalTitle="Amaç"
            value={form.purpose}
            onChange={(v) => setForm((f) => ({ ...f, purpose: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-rose-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-rose-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500/85" />
                Hazırlık
              </span>
            }
            modalTitle="Hazırlık"
            value={form.preparation}
            onChange={(v) => setForm((f) => ({ ...f, preparation: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-orange-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-orange-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
                İmajinasyon Metni
              </span>
            }
            modalTitle="İmajinasyon Metni"
            value={form.imagination_text}
            onChange={(v) => setForm((f) => ({ ...f, imagination_text: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500/85" />
              Süre
            </span>
            <input
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
              className="h-12 w-full rounded-xl border border-teal-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-teal-200/90 focus:ring-2 focus:ring-teal-100/55"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500/75" />
                Uyarı
              </span>
            }
            modalTitle="Uyarı"
            value={form.warning}
            onChange={(v) => setForm((f) => ({ ...f, warning: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-red-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-red-100/50 transition"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600/80" />
              Kaynak
            </span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
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
            className="w-full max-w-[420px] rounded-[22px] border border-white/88 bg-white/88 p-6 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.12)] ring-1 ring-amber-100/50 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bio-imagination-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
              SİLME ONAYI
            </div>
            <h3 id="bio-imagination-delete-title" className="mt-2 text-[17px] font-black leading-snug text-slate-950">
              Bu imajinasyon kaydını silmek istediğinizden emin misiniz?
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
