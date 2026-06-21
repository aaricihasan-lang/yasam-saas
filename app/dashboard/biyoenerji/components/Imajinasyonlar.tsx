"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { backgroundSyncYasamUserFromDb, readYasamUser } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { getImaginationCardTheme } from "@/lib/bioenergy/imaginationsCardTheme";
import {
  fetchImaginationsCount,
  fetchImaginationsPage,
  previewImaginationText,
  type ImaginationListItem,
} from "@/lib/bioenergy/imaginationsListFetch";
import { imaginationDetailHref } from "@/lib/bioenergy/imaginationsRoutes";
import { supabase } from "@/lib/supabase";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { badgeFieldWrapClass, CrudEmptyState } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

async function exportImaginationsWord(
  tenantId: string,
  userId: string,
  exportMode: "all" | "selected",
  selectedIds: Set<string>,
  setWordBusy: (v: boolean) => void,
  onSuccess?: () => void,
  onError?: () => void,
) {
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, userId, exportMode };
    if (exportMode === "selected") {
      const arr = [...selectedIds];
      if (!arr.length) return;
      body.ids = arr;
    }
    const res = await fetch("/api/biyoenerji/imagination-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { onError?.(); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biyoenerji-imajinasyon-${exportMode === "selected" ? "secili" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    onSuccess?.();
  } catch { onError?.(); } finally {
    setWordBusy(false);
  }
}

const SEARCH_DEBOUNCE_MS = 300;

type BioImaginationForm = {
  title: string;
  category: string;
  text: string;
  notes: string;
  source: string;
};

const emptyForm: BioImaginationForm = {
  title: "",
  category: "",
  text: "",
  notes: "",
  source: "",
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function trimOrEmpty(v: string) {
  return v.trim();
}

function slugifySourceId(value: string) {
  const slug = value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || String(Date.now());
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
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

const newRecordBtnPremium =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

const loadMoreBtnClass =
  "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60";

const detailOpenBtnClass =
  "relative z-10 mt-auto flex w-full shrink-0 items-center justify-center rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white shadow-sm transition duration-200 group-hover:bg-violet-700 group-focus-visible:bg-violet-700";

export default function Imajinasyonlar() {
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<ImaginationListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BioImaginationForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");
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

  const resolveTenant = useCallback(async () => {
    const cached = getSessionTenantId();
    if (cached) {
      setQueryTenantId(cached);
      backgroundSyncYasamUserFromDb();
      return cached;
    }
    const synced = await getSyncedTenantId();
    if (synced) setQueryTenantId(synced);
    return synced;
  }, []);

  const fetchList = useCallback(
    async (opts: { reset: boolean; append?: boolean; offset?: number }) => {
      const tenantId = queryTenantId ?? getSessionTenantId();
      if (!tenantId) {
        setListLoading(false);
        setLoadingMore(false);
        setLoadErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
        return;
      }

      if (opts.reset) {
        setListLoading(true);
        setLoadErrorMessage("");
      } else {
        setLoadingMore(true);
      }

      const offset = opts.offset ?? 0;
      const search = debouncedSearch.trim() || undefined;

      const [pageRes, totalRes, searchCountRes, lastRes] = await Promise.all([
        fetchImaginationsPage(tenantId, { offset, search }),
        opts.reset
          ? fetchImaginationsCount(tenantId)
          : Promise.resolve({ count: totalInDb, error: null }),
        opts.reset
          ? fetchImaginationsCount(tenantId, search)
          : Promise.resolve({ count: searchResultCount, error: null }),
        opts.reset
          ? supabase
              .from("bioenergy_imaginations")
              .select("created_at")
              .eq("tenant_id", tenantId)
              .order("created_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (opts.reset) setListLoading(false);
      setLoadingMore(false);

      if (pageRes.error) {
        setLoadErrorMessage(`İmajinasyonlar okunamadı: ${pageRes.error}`);
        if (opts.reset) setRows([]);
        return;
      }

      if (opts.reset) {
        if (totalRes.error) {
          setLoadErrorMessage(`Kayıt sayısı alınamadı: ${totalRes.error}`);
        } else {
          setTotalInDb(totalRes.count);
        }
        if (searchCountRes.error) {
          setSearchResultCount(0);
        } else {
          setSearchResultCount(searchCountRes.count);
        }
        const lastRow = lastRes.data as { created_at?: string } | null;
        setLastCreatedAt(lastRow?.created_at ?? null);
      }

      setRows((current) =>
        opts.append ? [...current, ...pageRes.rows] : pageRes.rows,
      );
    },
    [debouncedSearch, queryTenantId, searchResultCount, totalInDb],
  );

  useEffect(() => {
    void resolveTenant();
  }, [resolveTenant]);

  useEffect(() => {
    if (!queryTenantId) return;
    void fetchList({ reset: true });
  }, [queryTenantId, debouncedSearch, fetchList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const hasMore = rows.length < searchResultCount;
  const listBusy =
    listLoading || (Boolean(searchTerm.trim()) && searchTerm.trim() !== debouncedSearch);
  const isSearchActive = Boolean(debouncedSearch);

  async function handleKaydet() {
    const tenantId = queryTenantId ?? (await getSyncedTenantId());
    if (!tenantId) {
      showSoft("err", MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const titleTrim = form.title.trim();
    if (!titleTrim) {
      showSoft("err", "İmajinasyon başlığı zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("bioenergy_imaginations").insert({
      tenant_id: tenantId,
      source_id: slugifySourceId(titleTrim),
      title: titleTrim,
      category: trimOrNull(form.category) || "Genel",
      text: trimOrEmpty(form.text),
      notes: trimOrEmpty(form.notes),
      source: trimOrNull(form.source),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Kayıt eklenemedi: ${error.message}`);
      return;
    }

    setFormModalOpen(false);
    setForm({ ...emptyForm });
    await fetchList({ reset: true });
    showSoft("ok", "İmajinasyon kaydı oluşturuldu.");
  }

  return (
    <section className="w-full min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setFormModalOpen(true)} className={newRecordBtnPremium}>
          + Yeni Kayıt
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Toplam kayıt</p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-violet-700">
            {totalInDb}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {isSearchActive ? "Arama sonucu" : "Görünen sonuç"}
          </p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-cyan-700">
            {searchResultCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Son kayıt</p>
          <p className="mt-0.5 truncate text-base font-black tracking-tight text-amber-800">
            {formatDate(lastCreatedAt)}
          </p>
        </div>
      </div>

      <label className="mb-4 block w-full xl:max-w-sm">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Kütüphane araması</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Başlık, kategori, metin, not ve kaynak içinde ara..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
        />
        {listBusy ? (
          <p className="mt-1 text-[10px] font-semibold text-amber-600">Aranıyor…</p>
        ) : isSearchActive ? (
          <p className="mt-1 text-[10px] font-semibold text-amber-600"> Arama: “{debouncedSearch}” · {searchResultCount} eşleşme
          </p>
        ) : null}
      </label>

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

      {listLoading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-slate-400">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <CrudEmptyState
          icon="✧"
          title={isSearchActive ? "Sonuç bulunamadı" : "Kütüphane boş"}
          subtitle={
            isSearchActive
              ? "Arama terimini değiştirin veya yeni kayıt ekleyin."
              : "Yeni Kayıt ile ilk imajinasyonu ekleyebilirsiniz."
          }
          tone="amber"
        />
      ) : (
        <>
          <div className="mb-6">
            <BulkExportBar
              selectedCount={selectedForExport.size}
              totalCount={totalInDb}
              onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
              onClearSelection={() => setSelectedForExport(new Set())}
              onExportSelected={() => void exportImaginationsWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "selected", selectedForExport, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
              onExportAll={() => void exportImaginationsWord(queryTenantId ?? "", readYasamUser()?.id ?? "", "all", selectedForExport, setWordBusy, () => showSoft("ok", "Rapor indirildi."), () => showSoft("err", "Rapor oluşturulamadı."))}
              isExporting={wordBusy}
            />
          </div>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row, index) => {
              const detailHref = imaginationDetailHref(row.id);
              const preview = previewImaginationText(row.text, row.notes, row.source);
              const theme = getImaginationCardTheme(index);
              const hasCategory = Boolean(row.category?.trim());
              const isExportSelected = selectedForExport.has(row.id);

              if (!detailHref) return null;

              return (
                <div key={row.id} className="relative">
                  <label
                    className="absolute right-3 top-3 z-20 flex h-5 w-5 cursor-pointer items-center justify-center"
                    onClick={(e) => e.preventDefault()}
                  >
                    <input
                      type="checkbox"
                      checked={isExportSelected}
                      onChange={() => setSelectedForExport((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                        return next;
                      })}
                      className="h-4 w-4 rounded accent-amber-600 shadow"
                    />
                  </label>
                <Link
                  href={detailHref}
                  className={`group relative flex h-[220px] flex-col overflow-hidden rounded-2xl border p-4 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.18)] transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${isExportSelected ? "ring-2 ring-amber-400/60 ring-offset-1" : ""} ${theme.card} ${theme.hover}`}
                >
                  {hasCategory ? (
                    <span
                      className={`mb-2 inline-flex w-fit max-w-full truncate rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${theme.badge}`}
                    >
                      {row.category}
                    </span>
                  ) : (
                    <span
                      className={`mb-2 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold ${theme.badgeMuted}`}
                    >
                      Kategorisiz
                    </span>
                  )}

                  <h2 className="line-clamp-2 text-[15px] font-black leading-snug text-slate-950">
                    {row.title?.trim() || "İsimsiz kayıt"}
                  </h2>

                  <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-relaxed text-slate-700/90">
                    {preview}
                  </p>

                  <span className={detailOpenBtnClass}>Detayı Aç →</span>
                </Link>
                </div>
              );
            })}
          </div>

          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                disabled={loadingMore || listLoading}
                onClick={() => void fetchList({ reset: false, append: true, offset: rows.length })}
                className={loadMoreBtnClass}
              >
                {loadingMore
                  ? "Yükleniyor…"
                  : `Daha Fazla Göster (${rows.length} / ${searchResultCount})`}
              </button>
            </div>
          ) : null}
        </>
      )}

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="Yeni imajinasyon"
        subtitle="Kaydettikten sonra kütüphanede görünür."
        titleId="imagination-form-modal-title"
        accentRingClass="ring-amber-100/50"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormModalOpen(false)}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setForm({ ...emptyForm })}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Temizle
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleKaydet()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_26px_-8px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 disabled:opacity-55"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">İmajinasyon Başlığı *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
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
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Metin</span>}
            modalTitle="Metin"
            value={form.text}
            onChange={(v) => setForm((f) => ({ ...f, text: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Notlar</span>}
            modalTitle="Notlar"
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-slate-100/60"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak</span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
            />
          </label>
        </div>
      </BiyoenerjiCrudFormModal>
    </section>
  );
}
