"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";
import { BulkExportBar } from "@/components/common/BulkExportBar";
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
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";

type BioenergySession = {
  id: string;
  tenant_id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

type SessionForm = {
  title: string;
  content: string;
  category: string;
  source: string;
  note: string;
};

const emptyForm: SessionForm = {
  title: "",
  content: "",
  category: "",
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

export default function BiyoenerjiSeanslari() {
  const { isDemo } = useDemoGuard();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<BioenergySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchContent, setSearchContent] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SessionForm>({ ...emptyForm });
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

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setInfoError("");
    const { data, error } = await supabase
      .from("bioenergy_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      showSoft("err", `Kayıtlar yüklenemedi: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as BioenergySession[]);
  }, [showSoft, tenantId]);

  useEffect(() => {
    runInEffect(() => {
      void loadSessions();
    });
  }, [loadSessions]);

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

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const moduleStats = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category?.trim()).filter(Boolean));
    const last = rows.length ? formatDate(rows[0].created_at) : "—";
    return { total: rows.length, cats: cats.size, last };
  }, [rows]);

  const hasSearch = Boolean(searchTitle.trim() || searchContent.trim());

  const toggleExportSelection = useCallback((id: string) => {
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  async function exportSessionsWord(mode: "selected" | "all" | "single", singleId?: string) {
    if (!tenantId) return;
    const userId = readYasamUser()?.id;
    if (!userId) { showSoft("err", "Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın."); return; }
    setWordBusy(true);
    try {
      const body: Record<string, unknown> = { tenantId, userId, exportMode: mode === "single" ? "single" : mode };
      if (mode === "single" && singleId) body.sessionId = singleId;
      else if (mode === "selected") {
        const ids = [...selectedForExport];
        if (!ids.length) return;
        body.sessionIds = ids;
      }
      const res = await fetch("/api/biyoenerji/session-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { showSoft("err", "Rapor oluşturulamadı."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `biyoenerji-seans-${mode === "selected" ? "secili" : mode === "single" ? "tek" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showSoft("ok", "Seans raporu indirildi.");
    } catch { showSoft("err", "Rapor oluşturulamadı."); } finally {
      setWordBusy(false);
    }
  }

  function fillFormFromRow(row: BioenergySession) {
    setForm({
      title: row.title ?? "",
      content: row.content ?? "",
      category: row.category ?? "",
      source: row.source ?? "",
      note: row.note ?? "",
    });
  }

  function selectRow(row: BioenergySession) {
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

    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Seans başlığı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { error } = await supabase
      .from("bioenergy_sessions")
      .insert({
        tenant_id: tenantId,
        title: titleTrim,
        content: trimOrNull(form.content),
        category: trimOrNull(form.category),
        source: trimOrNull(form.source),
        note: trimOrNull(form.note),
      });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error.message}`);
      return;
    }

    setFormModalOpen(false);
    await loadSessions();
    showSoft("ok", "Seans kaydı oluşturuldu.");
  }

  async function handleGuncelle() {
    if (!tenantId || !selectedId) {
      showSoft("err", "Güncellemek için listeden bir kayıt seçin.");
      return;
    }
    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "Seans başlığı zorunludur.");
      return;
    }

    setSaving(true);
    setInfoError("");
    const { data: updatedRows, error } = await supabase
      .from("bioenergy_sessions")
      .update({
        title: titleTrim,
        content: trimOrNull(form.content),
        category: trimOrNull(form.category),
        source: trimOrNull(form.source),
        note: trimOrNull(form.note),
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
    await loadSessions();
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
      .from("bioenergy_sessions")
      .delete()
      .eq("id", selectedId)
      .eq("tenant_id", tenantId);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error.message}`);
      return;
    }

    await loadSessions();
    resetFormSelection();
    showSoft("ok", "Kayıt silindi.");
  }

  return (
    <section className={sectionShellClass}>
      {isDemo && (
        <div className="mb-4 rounded-[14px] border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none" aria-hidden>🔎</span>
            <div>
              <p className="text-sm font-black text-blue-900">Demo Modu — Biyoenerji Seansları</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                Bu sayfa demo amaçlıdır. Seans içerikleri demo güvenliği nedeniyle flu gösterilmektedir.
                Yeni kayıt, düzenleme, silme ve dışa aktarma işlemleri devre dışıdır.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 border-b border-violet-100/60 pb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:max-w-2xl">
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
          midLabel="Kategori"
          midCount={moduleStats.cats}
          lastDate={moduleStats.last}
          tone="violet"
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

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className={`${listColumnClass} order-1 xl:order-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-violet-600/90">
              Kayıtlar ({filteredRows.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {loading ? (
                <span className="text-[10px] font-bold text-slate-400">Yükleniyor…</span>
              ) : null}
              {!isDemo && (
                <button type="button" onClick={openCreateModal} className={newRecordBtnClass}>
                  + Yeni Kayıt
                </button>
              )}
            </div>
          </div>
          {/* Word export çubuğu */}
          {!isDemo && !loading && filteredRows.length > 0 && (
            <div className="mb-2">
              <BulkExportBar
                selectedCount={selectedForExport.size}
                totalCount={rows.length}
                onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
                onClearSelection={() => setSelectedForExport(new Set())}
                onExportSelected={() => void exportSessionsWord("selected")}
                onExportAll={() => void exportSessionsWord("all")}
                isExporting={wordBusy}
              />
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="px-2 py-6 text-center text-[13px] font-medium text-slate-400">Yükleniyor…</p>
            ) : filteredRows.length === 0 ? (
              <CrudEmptyState
                icon="◇"
                title="Liste boş"
                subtitle={
                  hasSearch
                    ? "Arama kriterlerinizi değiştirin veya Yeni Kayıt ile seans ekleyin."
                    : "Henüz kayıt yok. Yeni Kayıt ile ilk seansınızı oluşturabilirsiniz."
                }
                tone="violet"
              />
            ) : (
              filteredRows.map((row) => {
                const active = selectedId === row.id;
                const exportSelected = selectedForExport.has(row.id);
                return (
                  <div key={row.id} className="relative">
                    {!isDemo && (
                      <label
                        className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2 flex h-4 w-4 cursor-pointer items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={exportSelected}
                          onChange={() => toggleExportSelection(row.id)}
                          className="h-3.5 w-3.5 rounded border-violet-300 accent-violet-600"
                        />
                      </label>
                    )}
                  <button
                    type="button"
                    onClick={() => selectRow(row)}
                    className={`w-full rounded-xl border ${isDemo ? "pl-3.5" : "pl-7"} pr-3.5 py-3 text-left transition-all duration-200 ease-out will-change-transform ${
                      active
                        ? "scale-[1.01] border-violet-300/60 bg-white/95 shadow-[0_0_0_2px_rgba(167,139,250,0.18),0_14px_36px_-12px_rgba(109,40,217,0.14)] ring-2 ring-violet-200/45 ring-offset-1 ring-offset-transparent"
                        : exportSelected
                          ? "border-blue-300/60 bg-blue-50/80"
                          : "border-transparent bg-white/40 hover:-translate-y-0.5 hover:border-violet-100/75 hover:bg-white/88 hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="line-clamp-2 text-[13px] font-black leading-snug text-slate-900">
                      {row.title?.trim() || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>{formatDate(row.created_at)}</span>
                      {row.category?.trim() ? (
                        <span className="rounded-full bg-gradient-to-r from-violet-100/90 to-fuchsia-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-900/90 shadow-inner ring-1 ring-violet-200/45">
                          {row.category}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={`${formGlassPanelClass} order-2 xl:order-none`}>
          {selectedRow ? (
            <>
              <div className="mb-1 inline-flex rounded-full bg-violet-50/90 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-violet-800 ring-1 ring-violet-200/45">
                SEÇİLİ KAYIT
              </div>
              <h3 className="mt-2 text-[17px] font-black leading-snug text-slate-900 sm:text-[18px]">
                {selectedRow.title?.trim() || "—"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                <span>{formatDate(selectedRow.created_at)}</span>
                {selectedRow.category?.trim() ? (
                  <span className="rounded-full bg-gradient-to-r from-violet-100/90 to-fuchsia-50/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-900/90 ring-1 ring-violet-200/45">
                    {selectedRow.category}
                  </span>
                ) : null}
                {selectedRow.source?.trim() ? (
                  <span className="rounded-full border border-amber-100/80 bg-amber-50/80 px-2 py-0.5 text-[10px] font-black text-amber-950/90">
                    Kaynak: {selectedRow.source}
                  </span>
                ) : null}
              </div>
              <DemoBlur isProtected={isDemo}>
                <p className="mt-4 text-[12px] font-semibold leading-relaxed text-slate-600">
                  {previewText(selectedRow.content)}
                </p>
              </DemoBlur>
              {!isDemo && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-white/55 pt-5">
                  <button
                    type="button"
                    disabled={wordBusy}
                    onClick={() => void exportSessionsWord("single", selectedRow.id)}
                    className="rounded-xl border border-blue-200/70 bg-blue-50/90 px-4 py-2.5 text-[12px] font-black text-blue-800 transition hover:bg-blue-100/90 disabled:opacity-50"
                  >
                    {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
                  </button>
                  <button
                    type="button"
                    onClick={openEditModal}
                    className="rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2.5 text-[12px] font-black text-violet-900 shadow-[0_4px_18px_-8px_rgba(109,40,217,0.12)] transition hover:bg-violet-100/90"
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
              )}
            </>
          ) : (
            <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-200 bg-white/65 px-4 text-center">
              <p className="max-w-sm text-sm font-medium text-slate-400">
                {isDemo ? "Soldan bir kayıt seçerek özetini görün." : "Soldan bir kayıt seçerek özetini görün veya yeni kayıt ekleyin."}
              </p>
            </div>
          )}
        </div>
      </div>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={closeFormModal}
        title={formModalMode === "create" ? "Yeni seans kaydı" : "Seans kaydını düzenle"}
        subtitle={
          formModalMode === "edit"
            ? "Değişiklikleri kaydettikten sonra panel kapanır ve liste yenilenir."
            : "Zorunlu alanları doldurup kaydedin; panel kapanır ve liste yenilenir."
        }
        titleId="seans-form-modal-title"
        accentRingClass="ring-violet-100/50"
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
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_8px_22px_-6px_rgba(16,185,129,0.28)] transition hover:bg-emerald-700 disabled:opacity-55"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleGuncelle()}
                className="rounded-xl border border-violet-200/70 bg-violet-50/90 px-4 py-2.5 text-[12px] font-black text-violet-900 shadow-sm transition hover:bg-violet-100/90 disabled:opacity-55"
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
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500/90 shadow-[0_0_8px_rgba(109,40,217,0.35)]" />
              Seans Başlığı
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-white/70 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none ring-1 ring-violet-100/40 transition duration-200 focus:border-violet-200/70 focus:ring-2 focus:ring-violet-100/45"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/85" />
              Kategori
            </span>
            <div className={badgeFieldWrapClass("cyan")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent py-0.5 text-[13px] font-semibold text-slate-900 outline-none"
              />
            </div>
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/85" />
                Seans Metni
              </span>
            }
            modalTitle="Seans Metni"
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-white/70 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-emerald-100/40 transition duration-200"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/85" />
              Kaynak
            </span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-white/70 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none ring-1 ring-amber-100/40 transition duration-200 focus:border-amber-200/70 focus:ring-2 focus:ring-amber-100/45"
            />
          </label>
          <LongTextareaField
            label={
              <span className="mb-2 flex items-center gap-2 text-[12px] font-black text-slate-800">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/75" />
                Not
              </span>
            }
            modalTitle="Not"
            value={form.note}
            onChange={(v) => setForm((f) => ({ ...f, note: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-white/70 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-fuchsia-100/40 transition duration-200"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/40 px-4 py-8 backdrop-blur-sm"
          role="presentation"
          onClick={() => !saving && setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[22px] border border-white/90 bg-white/88 p-6 shadow-[0_20px_50px_-18px_rgba(15,23,42,0.12)] ring-1 ring-violet-100/50 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bio-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
              SİLME ONAYI
            </div>
            <h3 id="bio-delete-title" className="mt-2 text-[17px] font-black leading-snug text-slate-950">
              Bu seans kaydını silmek istediğinizden emin misiniz?
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
