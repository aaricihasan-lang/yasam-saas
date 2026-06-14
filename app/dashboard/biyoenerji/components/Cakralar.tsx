"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { backgroundSyncYasamUserFromDb } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { chakraColorDot } from "@/lib/bioenergy/chakraColorUtils";
import { getChakraCardTheme } from "@/lib/bioenergy/chakrasCardTheme";
import {
  chakraCardBadge,
  chakraDisplayName,
  fetchChakrasCount,
  fetchChakrasPage,
  previewChakraText,
  type ChakraListItem,
} from "@/lib/bioenergy/chakrasListFetch";
import { chakraDetailHref } from "@/lib/bioenergy/chakrasRoutes";
import { supabase } from "@/lib/supabase";
import { CrudEmptyState } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const SEARCH_DEBOUNCE_MS = 300;

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

async function exportChakrasWord(
  tenantId: string,
  mode: "selected" | "all",
  selectedIds: Set<string>,
  setWordBusy: (v: boolean) => void,
) {
  setWordBusy(true);
  try {
    const body: Record<string, unknown> = { tenantId, exportMode: mode };
    if (mode === "selected") {
      const ids = [...selectedIds];
      if (!ids.length) return;
      body.chakraIds = ids;
    }
    const res = await fetch("/api/biyoenerji/chakra-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biyoenerji-cakra-${mode === "selected" ? "secili" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* sessiz */ } finally {
    setWordBusy(false);
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
  "inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

const loadMoreBtnClass =
  "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60";

const detailOpenBtnClass =
  "relative z-10 mt-auto flex w-full shrink-0 items-center justify-center rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white shadow-sm transition duration-200 group-hover:bg-violet-700 group-focus-visible:bg-violet-700";

export default function Cakralar() {
  const lastGoodRowsRef = useRef<ChakraListItem[]>([]);
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<ChakraListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ChakraForm>({ ...emptyForm });
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

      try {
        const [pageRes, totalRes, searchCountRes, lastRes] = await Promise.all([
          fetchChakrasPage(tenantId, { offset, search }),
          opts.reset
            ? fetchChakrasCount(tenantId)
            : Promise.resolve({ data: totalInDb, error: null, usedFallback: false }),
          opts.reset
            ? fetchChakrasCount(tenantId, search)
            : Promise.resolve({ data: searchResultCount, error: null, usedFallback: false }),
          opts.reset
            ? supabase
                .from("bioenergy_chakras")
                .select("created_at")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (opts.reset) setListLoading(false);
        setLoadingMore(false);

        const pageRows = pageRes.data;
        const hadPageError = Boolean(pageRes.error);

        if (hadPageError) {
          const warnParts = [`Çakra kayıtları okunamadı: ${pageRes.error}`];
          if (pageRes.usedFallback) {
            warnParts.push("Arama filtresi kaldırılarak liste gösteriliyor.");
          }
          setLoadErrorMessage(warnParts.join(" "));

          if (pageRows.length > 0) {
            const merged = opts.append ? [...lastGoodRowsRef.current, ...pageRows] : pageRows;
            lastGoodRowsRef.current = merged;
            setRows(merged);
          } else if (lastGoodRowsRef.current.length > 0) {
            setRows(lastGoodRowsRef.current);
          } else if (opts.reset) {
            setRows([]);
          }
        } else {
          setLoadErrorMessage("");
          const merged = opts.append ? [...lastGoodRowsRef.current, ...pageRows] : pageRows;
          lastGoodRowsRef.current = merged;
          setRows(merged);
        }

        if (opts.reset) {
          if (!totalRes.error) setTotalInDb(totalRes.data);
          if (!searchCountRes.error) setSearchResultCount(searchCountRes.data);
          const lastRow = lastRes.data as { created_at?: string } | null;
          if (!lastRes.error) setLastCreatedAt(lastRow?.created_at ?? null);
        }
      } catch (err) {
        if (opts.reset) setListLoading(false);
        setLoadingMore(false);
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Cakralar] fetchList exception:", message);
        setLoadErrorMessage(`Beklenmeyen hata: ${message}`);
        if (lastGoodRowsRef.current.length > 0) setRows(lastGoodRowsRef.current);
      }
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

    const nameTrim = form.name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
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
    setForm({ ...emptyForm });
    await fetchList({ reset: true });
    showSoft("ok", "Çakra kaydı oluşturuldu.");
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
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-fuchsia-700">
            {totalInDb}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {isSearchActive ? "Arama sonucu" : "Görünen sonuç"}
          </p>
          <p className="mt-0.5 truncate text-xl font-black tabular-nums tracking-tight text-violet-700">
            {searchResultCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Son kayıt</p>
          <p className="mt-0.5 truncate text-base font-black tracking-tight text-cyan-800">
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
          placeholder="Çakra adı, organ, renk, neden veya not içinde ara..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-200/40"
        />
        {listBusy ? (
          <p className="mt-1 text-[10px] font-semibold text-fuchsia-600">Aranıyor…</p>
        ) : isSearchActive ? (
          <p className="mt-1 text-[10px] font-semibold text-fuchsia-600"> Arama: “{debouncedSearch}” · {searchResultCount} eşleşme
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
          icon="⬡"
          title={isSearchActive ? "Sonuç bulunamadı" : "Kütüphane boş"}
          subtitle={
            isSearchActive
              ? "Arama terimini değiştirin veya yeni kayıt ekleyin."
              : "Yeni Kayıt ile ilk çakra kaydını ekleyebilirsiniz."
          }
          tone="orange"
        />
      ) : (
        <>
          {/* BulkExportBar */}
          <div className="mb-6">
            <BulkExportBar
              selectedCount={selectedForExport.size}
              totalCount={totalInDb}
              onSelectAll={() => setSelectedForExport(new Set(rows.map((r) => r.id)))}
              onClearSelection={() => setSelectedForExport(new Set())}
              onExportSelected={() => void exportChakrasWord(queryTenantId ?? "", "selected", selectedForExport, setWordBusy)}
              onExportAll={() => void exportChakrasWord(queryTenantId ?? "", "all", selectedForExport, setWordBusy)}
              isExporting={wordBusy}
            />
          </div>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row, index) => {
              const detailHref = chakraDetailHref(row.id);
              const preview = previewChakraText(row.organs, row.causes, row.notes);
              const theme = getChakraCardTheme(index);
              const badge = chakraCardBadge(row);
              const displayTitle = chakraDisplayName(row);
              const dotColor = chakraColorDot(row.color);
              const isExportSelected = selectedForExport.has(row.id);

              if (!detailHref) return null;

              return (
                <div key={row.id} className="relative">
                  {/* Checkbox */}
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
                      className="h-4 w-4 rounded accent-fuchsia-600 shadow"
                    />
                  </label>
                <Link
                  href={detailHref}
                  className={`group relative flex h-[220px] flex-col overflow-hidden rounded-2xl border p-4 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.18)] transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-600 ${isExportSelected ? "ring-2 ring-fuchsia-400/60 ring-offset-1" : ""} ${theme.card} ${theme.hover}`}
                >
                  {badge ? (
                    <span
                      className={`mb-2 inline-flex w-fit max-w-full items-center gap-2 truncate rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${theme.badge}`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/80"
                        style={{ backgroundColor: dotColor }}
                        aria-hidden
                      />
                      {badge}
                    </span>
                  ) : (
                    <span
                      className={`mb-2 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold ${theme.badgeMuted}`}
                    >
                      Renk / organ yok
                    </span>
                  )}

                  <h2 className="line-clamp-2 text-[15px] font-black leading-snug text-slate-950">
                    {displayTitle}
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
        title="Yeni çakra kaydı"
        subtitle="Kaydettikten sonra kütüphanede görünür."
        titleId="chakra-form-modal-title"
        accentRingClass="ring-fuchsia-100/50"
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
              className="rounded-xl bg-fuchsia-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_26px_-8px_rgba(192,38,211,0.35)] transition hover:bg-fuchsia-700 disabled:opacity-55"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Çakra Adı *</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Renk</span>
            <input
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              placeholder="#FF5733 veya kırmızı"
              className="h-12 w-full rounded-xl border border-rose-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-rose-200/90 focus:ring-2 focus:ring-rose-100/55"
            />
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Organlar</span>}
            modalTitle="Organlar"
            value={form.organs}
            onChange={(v) => setForm((f) => ({ ...f, organs: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Bezler</span>}
            modalTitle="Bezler"
            value={form.glands}
            onChange={(v) => setForm((f) => ({ ...f, glands: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-violet-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Taşlar</span>}
            modalTitle="Taşlar"
            value={form.stones}
            onChange={(v) => setForm((f) => ({ ...f, stones: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-indigo-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-indigo-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Nedenler</span>}
            modalTitle="Nedenler"
            value={form.causes}
            onChange={(v) => setForm((f) => ({ ...f, causes: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-amber-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-amber-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Fiziksel</span>}
            modalTitle="Fiziksel"
            value={form.physical}
            onChange={(v) => setForm((f) => ({ ...f, physical: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-emerald-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Zihinsel</span>}
            modalTitle="Zihinsel"
            value={form.mental}
            onChange={(v) => setForm((f) => ({ ...f, mental: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-fuchsia-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-fuchsia-100/50"
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
        </div>
      </BiyoenerjiCrudFormModal>
    </section>
  );
}
