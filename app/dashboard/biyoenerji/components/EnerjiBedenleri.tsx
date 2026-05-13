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
import { LongTextareaField } from "./LargeTextModal";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type EnergyBodyRecord = {
  id: string;
  tenant_id: string;
  title: string | null;
  body_type: string | null;
  content: string | null;
  physical_notes: string | null;
  emotional_notes: string | null;
  spiritual_notes: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

type EnergyBodyForm = {
  title: string;
  body_type: string;
  content: string;
  physical_notes: string;
  emotional_notes: string;
  spiritual_notes: string;
  source: string;
  note: string;
};

const emptyForm: EnergyBodyForm = {
  title: "",
  body_type: "",
  content: "",
  physical_notes: "",
  emotional_notes: "",
  spiritual_notes: "",
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

export default function EnerjiBedenleri() {
  const [rows, setRows] = useState<EnergyBodyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchContent, setSearchContent] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EnergyBodyForm>({ ...emptyForm });
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
      .from("energy_bodies")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      showSoft("err", `Kayıtlar yüklenemedi: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as EnergyBodyRecord[]);
  }, [showSoft]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRows = useMemo(() => {
    const t = searchTitle.trim().toLocaleLowerCase("tr-TR");
    const c = searchContent.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const titleOk =
        !t || (row.title ?? "").toLocaleLowerCase("tr-TR").includes(t);
      const contentOk =
        !c || (row.content ?? "").toLocaleLowerCase("tr-TR").includes(c);
      return titleOk && contentOk;
    });
  }, [rows, searchTitle, searchContent]);

  const moduleStats = useMemo(() => {
    const types = new Set(rows.map((r) => r.body_type?.trim()).filter(Boolean));
    const last = rows.length ? formatDate(rows[0].created_at) : "—";
    return { total: rows.length, types: types.size, last };
  }, [rows]);

  const hasSearch = Boolean(searchTitle.trim() || searchContent.trim());

  function fillFormFromRow(row: EnergyBodyRecord) {
    setForm({
      title: row.title ?? "",
      body_type: row.body_type ?? "",
      content: row.content ?? "",
      physical_notes: row.physical_notes ?? "",
      emotional_notes: row.emotional_notes ?? "",
      spiritual_notes: row.spiritual_notes ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    });
  }

  function selectRow(row: EnergyBodyRecord) {
    setSelectedId(row.id);
    fillFormFromRow(row);
    setInfoError("");
    setInfoSuccess("");
  }

  function resetFormSelection() {
    setSelectedId(null);
    setForm({ ...emptyForm });
  }

  function handleTemizle() {
    resetFormSelection();
    setInfoError("");
    setInfoSuccess("");
    setDeleteConfirmOpen(false);
  }

  async function handleKaydet() {
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Başlık zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { data, error } = await supabase
      .from("energy_bodies")
      .insert({
        tenant_id: TENANT_ID,
        title: titleTrim,
        body_type: trimOrNull(form.body_type),
        content: trimOrNull(form.content),
        physical_notes: trimOrNull(form.physical_notes),
        emotional_notes: trimOrNull(form.emotional_notes),
        spiritual_notes: trimOrNull(form.spiritual_notes),
        source: trimOrNull(form.source),
        note: trimOrNull(form.note),
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error.message}`);
      return;
    }

    const inserted = data as EnergyBodyRecord;
    setRows((prev) => [inserted, ...prev]);
    resetFormSelection();
    showSoft("ok", "Enerji bedeni kaydı oluşturuldu.");
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
      .from("energy_bodies")
      .update({
        title: titleTrim,
        body_type: trimOrNull(form.body_type),
        content: trimOrNull(form.content),
        physical_notes: trimOrNull(form.physical_notes),
        emotional_notes: trimOrNull(form.emotional_notes),
        spiritual_notes: trimOrNull(form.spiritual_notes),
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

    setRows((prev) =>
      prev.map((r) =>
        r.id === selectedId
          ? {
              ...r,
              title: titleTrim,
              body_type: trimOrNull(form.body_type),
              content: trimOrNull(form.content),
              physical_notes: trimOrNull(form.physical_notes),
              emotional_notes: trimOrNull(form.emotional_notes),
              spiritual_notes: trimOrNull(form.spiritual_notes),
              source: trimOrNull(form.source),
              note: trimOrNull(form.note),
            }
          : r
      )
    );
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
      .from("energy_bodies")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", TENANT_ID);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== selectedId));
    resetFormSelection();
    showSoft("ok", "Kayıt silindi.");
  }

  return (
    <section className={`${sectionShellClass} ring-cyan-100/35`}>
      <div className="mb-4 flex flex-col gap-3 border-b border-cyan-100/50 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">Enerji Bedenleri</h2>
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              Kayıtları yönetin; listeden seçin, sağdan düzenleyin veya yeni ekleyin.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-lg sm:flex-row">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-violet-600/75">
                Başlıkta ara
              </span>
              <input
                type="search"
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                className={searchInputClass("violet")}
              />
            </label>
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-cyan-600/75">
                Metin içinde ara
              </span>
              <input
                type="search"
                value={searchContent}
                onChange={(e) => setSearchContent(e.target.value)}
                className={searchInputClass("cyan")}
              />
            </label>
          </div>
        </div>
        <ModuleStats
          total={moduleStats.total}
          midLabel="Beden tipi"
          midCount={moduleStats.types}
          lastDate={moduleStats.last}
          tone="cyan"
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

      <div className="flex min-h-[min(70vh,640px)] flex-col gap-4 lg:flex-row lg:gap-6">
        <div
          className={`${listColumnClass} order-1 border-cyan-100/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(236,254,255,0.4)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_28px_-14px_rgba(8,145,178,0.06)] lg:order-none`}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-cyan-700/90">
              Kayıtlar ({filteredRows.length})
            </span>
            {loading ? (
              <span className="text-[10px] font-bold text-slate-400">Yükleniyor…</span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-400">Yükleniyor…</p>
            ) : filteredRows.length === 0 ? (
              <CrudEmptyState
                icon="◎"
                title="Liste boş"
                subtitle={
                  hasSearch
                    ? "Aramayı güncelleyin veya yeni bir enerji bedeni kaydı ekleyin."
                    : "Henüz kayıt yok. Sağdaki formdan ilk kaydınızı oluşturabilirsiniz."
                }
                tone="cyan"
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
                        ? "scale-[1.01] border-cyan-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(34,211,238,0.18),0_14px_36px_-12px_rgba(8,145,178,0.13)] ring-2 ring-cyan-200/45 ring-offset-1 ring-offset-transparent"
                        : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-cyan-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="line-clamp-2 text-[13px] font-black leading-snug text-slate-900">
                      {row.title?.trim() || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      {row.body_type?.trim() ? (
                        <span className="rounded-full bg-gradient-to-r from-cyan-100/90 to-sky-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-cyan-950/90 shadow-inner ring-1 ring-cyan-200/45">
                          {row.body_type}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`${formGlassPanelClass} order-2 border-cyan-100/35 lg:order-none`}>
          <p className="mb-4 text-[11px] font-black uppercase tracking-wide text-slate-500">
            {selectedId ? "Seçili kayıt — güncelleyebilir veya silebilirsiniz" : "Yeni kayıt"}
          </p>
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(109,40,217,0.35)]" />
                Başlık
              </span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/90" />
                Beden tipi
              </span>
              <div className={badgeFieldWrapClass("cyan")}>
                <input
                  value={form.body_type}
                  onChange={(e) => setForm((f) => ({ ...f, body_type: e.target.value }))}
                  className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Örn. eterik, duygusal…"
                />
              </div>
            </label>
            <LongTextareaField
              label={
                <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/90" />
                  İçerik
                </span>
              }
              modalTitle="İçerik"
              value={form.content}
              onChange={(v) => setForm((f) => ({ ...f, content: v }))}
              minRows={5}
              className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-emerald-100/50 transition"
              disabled={saving}
            />
            <LongTextareaField
              label={
                <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500/90" />
                  Fiziksel notlar
                </span>
              }
              modalTitle="Fiziksel notlar"
              value={form.physical_notes}
              onChange={(v) => setForm((f) => ({ ...f, physical_notes: v }))}
              minRows={3}
              className="w-full resize-none rounded-xl border border-sky-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-sky-100/50 transition"
              disabled={saving}
            />
            <LongTextareaField
              label={
                <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/80" />
                  Duygusal notlar
                </span>
              }
              modalTitle="Duygusal notlar"
              value={form.emotional_notes}
              onChange={(v) => setForm((f) => ({ ...f, emotional_notes: v }))}
              minRows={3}
              className="w-full resize-none rounded-xl border border-fuchsia-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-fuchsia-100/50 transition"
              disabled={saving}
            />
            <LongTextareaField
              label={
                <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500/85" />
                  Ruhsal notlar
                </span>
              }
              modalTitle="Ruhsal notlar"
              value={form.spiritual_notes}
              onChange={(v) => setForm((f) => ({ ...f, spiritual_notes: v }))}
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
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500/80" />
                  Not
                </span>
              }
              modalTitle="Not"
              value={form.note}
              onChange={(v) => setForm((f) => ({ ...f, note: v }))}
              minRows={3}
              className="w-full resize-none rounded-xl border border-teal-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-teal-100/50 transition"
              disabled={saving}
            />
          </div>

          <div className="mt-7 flex flex-wrap gap-2 border-t border-cyan-100/45 pt-5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleKaydet()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_26px_-8px_rgba(16,185,129,0.35)] transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-[0_14px_34px_-10px_rgba(16,185,129,0.4)] disabled:translate-y-0 disabled:opacity-55"
            >
              Kaydet
            </button>
            <button
              type="button"
              disabled={saving || !selectedId}
              onClick={() => void handleGuncelle()}
              className="rounded-xl border border-cyan-200/70 bg-cyan-50/90 px-4 py-2.5 text-[12px] font-black text-cyan-950 shadow-[0_6px_18px_-10px_rgba(8,145,178,0.2)] transition hover:-translate-y-0.5 hover:bg-cyan-100/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Güncelle
            </button>
            <button
              type="button"
              disabled={saving || !selectedId}
              onClick={openDeleteConfirm}
              className="rounded-xl border border-rose-200/70 bg-rose-50/90 px-4 py-2.5 text-[12px] font-black text-rose-800 shadow-[0_6px_18px_-10px_rgba(244,63,94,0.18)] transition hover:-translate-y-0.5 hover:bg-rose-100/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Sil
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleTemizle}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-[0_6px_18px_-10px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-slate-50/95 disabled:translate-y-0 disabled:opacity-55"
            >
              Temizle
            </button>
          </div>
        </div>
      </div>

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-md"
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
