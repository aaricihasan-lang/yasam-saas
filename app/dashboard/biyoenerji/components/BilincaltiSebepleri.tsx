"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CrudEmptyState,
  ModuleStats,
  badgeFieldWrapClass,
  formGlassPanelClass,
  listColumnClass,
  newRecordBtnClass,
  searchInputClass,
  sectionShellClass,
} from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

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

const emptyForm: SubconsciousCauseForm = {
  source_uid: "",
  title: "",
  category: "",
  content: "",
  note_text: "",
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

function subconsciousSearchBlob(row: BioenergySubconsciousRecord) {
  return [row.title, row.category, row.content, row.note_text]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

export default function BilincaltiSebepleri() {
  const [rows, setRows] = useState<BioenergySubconsciousRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
    setLoadErrorMessage(null);
    setInfoError("");
    const { data, error } = await supabase
      .from("bioenergy_subconscious_causes")
      .select("*")
      .order("title");

    setLoading(false);

    if (error) {
      setLoadErrorMessage(`Bilinçaltı sebepleri okunamadı: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as BioenergySubconsciousRecord[]);
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void loadRecords();
    });
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((row) => subconsciousSearchBlob(row).includes(q));
  }, [rows, searchQuery]);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((x) => x.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));
    const newest = rows.reduce<string | null>((acc, row) => {
      if (!row.created_at) return acc;
      if (!acc || row.created_at > acc) return row.created_at;
      return acc;
    }, null);
    const last = newest ? formatDate(newest) : "—";
    return { total: rows.length, cats: cats.size, last };
  }, [rows]);

  function fillFormFromRow(row: BioenergySubconsciousRecord) {
    setForm({
      source_uid: row.source_uid ?? "",
      title: row.title ?? "",
      category: row.category ?? "",
      content: row.content ?? "",
      note_text: row.note_text ?? "",
    });
  }

  function selectRow(row: BioenergySubconsciousRecord) {
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
    const uidTrim = form.source_uid.trim();
    if (!titleTrim) {
      showSoft("err", "Başlık zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase.from("bioenergy_subconscious_causes").insert({
      tenant_id: TENANT_ID,
      source_uid: uidTrim || slugifySourceUid(titleTrim),
      title: titleTrim,
      category: trimOrEmpty(form.category),
      content: trimOrEmpty(form.content),
      note_text: trimOrEmpty(form.note_text),
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
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Başlık zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("bioenergy_subconscious_causes")
      .update({
        source_uid: form.source_uid.trim() || slugifySourceUid(titleTrim),
        title: titleTrim,
        category: trimOrEmpty(form.category),
        content: trimOrEmpty(form.content),
        note_text: trimOrEmpty(form.note_text),
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
      .from("bioenergy_subconscious_causes")
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
      <div className="mb-4 flex flex-col gap-3 border-b border-fuchsia-100/50 pb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
            Hastalıkların Bilinçaltı Sebepleri
          </h2>
          <p className="mt-1 text-[12px] font-medium text-slate-500">
            Listeden seçin; düzenleme ve yeni kayıt geniş panelde açılır.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-fuchsia-600/75">
              Ara (başlık, kategori, içerik, not)
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={searchInputClass("fuchsia")}
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
            ) : loadErrorMessage ? null : rows.length === 0 ? (
              <CrudEmptyState
                icon="◐"
                title="Liste boş"
                subtitle="Henüz kayıt yok. Yeni Kayıt ile ilk kaydınızı oluşturabilirsiniz."
                tone="fuchsia"
              />
            ) : filteredRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-500">
                Aramayı güncelleyin veya Yeni Kayıt ile kayıt ekleyin.
              </p>
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
                      {row.title?.trim() || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      {row.category?.trim() ? (
                        <span className="rounded-full bg-gradient-to-r from-fuchsia-100/90 to-violet-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-950/90 shadow-inner ring-1 ring-fuchsia-200/45">
                          {row.category}
                        </span>
                      ) : (
                        <span>—</span>
                      )}
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
                {selectedRow.title?.trim() || "—"}
              </h3>
              <div className="mt-4 space-y-3 text-[12px] leading-relaxed">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-fuchsia-700/75">
                    Kategori
                  </p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {selectedRow.category?.trim() || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-violet-600/75">
                    İçerik
                  </p>
                  <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-600">
                    {selectedRow.content?.trim() || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-cyan-600/75">
                    Not
                  </p>
                  <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-600">
                    {selectedRow.note_text?.trim() || "—"}
                  </p>
                </div>
              </div>
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
              Kaynak uid
            </span>
            <input
              value={form.source_uid}
              onChange={(e) => setForm((f) => ({ ...f, source_uid: e.target.value }))}
              placeholder="JSON uid ile eşleşir"
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/90" />
              Başlık
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
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
                İçerik
              </span>
            }
            modalTitle="İçerik"
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500/70" />
                Not
              </span>
            }
            modalTitle="Not"
            value={form.note_text}
            onChange={(v) => setForm((f) => ({ ...f, note_text: v }))}
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
