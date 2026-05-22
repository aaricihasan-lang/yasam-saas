"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { backgroundSyncYasamUserFromDb } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { getSymbolLanguageCardTheme } from "@/lib/bioenergy/symbolLanguageCardTheme";
import {
  fetchSymbolLanguageCount,
  fetchSymbolLanguagePage,
  previewSymbolLanguageText,
  symbolDisplayName,
  type SymbolLanguageListItem,
} from "@/lib/bioenergy/symbolLanguageListFetch";
import { symbolLanguageDetailHref } from "@/lib/bioenergy/symbolLanguageRoutes";
import { supabase } from "@/lib/supabase";
import { badgeFieldWrapClass, CrudEmptyState } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const SEARCH_DEBOUNCE_MS = 300;

type SymbolForm = {
  symbol_name: string;
  category: string;
  meaning: string;
  subconscious_message: string;
  source: string;
};

const emptyForm: SymbolForm = {
  symbol_name: "",
  category: "",
  meaning: "",
  subconscious_message: "",
  source: "",
};

function trimOrNull(v: string) {
  const t = v.trim();
  return t.length > 0 ? t : null;
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
  "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 px-8 py-4 text-base font-black text-white shadow-[0_12px_32px_rgba(109,40,217,0.28)] transition duration-300 hover:-translate-y-0.5 hover:from-violet-700 hover:to-cyan-700 hover:shadow-[0_16px_40px_rgba(6,182,212,0.25)]";

const loadMoreBtnClass =
  "rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-violet-50 px-8 py-4 text-base font-black text-slate-800 shadow-md transition hover:from-emerald-100 hover:to-violet-100 disabled:opacity-60";

const detailOpenBtnClass =
  "relative z-10 mt-auto flex w-full shrink-0 items-center justify-center rounded-2xl bg-slate-950 py-4 text-[17px] font-black text-white shadow-lg transition duration-300 group-hover:bg-violet-700 group-focus-visible:bg-violet-700";

export default function SembolDili() {
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<SymbolLanguageListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SymbolForm>({ ...emptyForm });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");

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
        fetchSymbolLanguagePage(tenantId, { offset, search }),
        opts.reset
          ? fetchSymbolLanguageCount(tenantId)
          : Promise.resolve({ count: totalInDb, error: null }),
        opts.reset
          ? fetchSymbolLanguageCount(tenantId, search)
          : Promise.resolve({ count: searchResultCount, error: null }),
        opts.reset
          ? supabase
              .from("bioenergy_symbols")
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
        setLoadErrorMessage(`Sembol kayıtları okunamadı: ${pageRes.error}`);
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

    const nameTrim = form.symbol_name.trim();
    if (!nameTrim) {
      showSoft("err", "Sembol adı zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("bioenergy_symbols").insert({
      tenant_id: tenantId,
      symbol: nameTrim,
      title: nameTrim,
      category: trimOrNull(form.category),
      meaning: trimOrNull(form.meaning),
      subconscious_message: trimOrNull(form.subconscious_message),
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
    showSoft("ok", "Sembol kaydı oluşturuldu.");
  }

  return (
    <section className="w-full min-w-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setFormModalOpen(true)} className={newRecordBtnPremium}>
          + Yeni Kayıt
        </button>
      </div>

      <div className="mb-6 grid w-full grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
        <div className="rounded-2xl border-2 border-emerald-200/70 bg-white/90 px-5 py-5 shadow-md sm:px-6 sm:py-6">
          <p className="text-base font-bold text-slate-500">Toplam kayıt</p>
          <p className="mt-2 text-3xl font-black tabular-nums text-emerald-700 sm:text-4xl">
            {totalInDb}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-violet-200/70 bg-white/90 px-5 py-5 shadow-md sm:px-6 sm:py-6">
          <p className="text-base font-bold text-slate-500">
            {isSearchActive ? "Arama sonucu" : "Görünen sonuç"}
          </p>
          <p className="mt-2 text-3xl font-black tabular-nums text-violet-700 sm:text-4xl">
            {searchResultCount}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-cyan-200/70 bg-white/90 px-5 py-5 shadow-md sm:px-6 sm:py-6">
          <p className="text-base font-bold text-slate-500">Son kayıt</p>
          <p className="mt-2 text-lg font-black leading-snug text-cyan-800 sm:text-xl">
            {formatDate(lastCreatedAt)}
          </p>
        </div>
      </div>

      <label className="mb-6 block w-full">
        <span className="mb-2 block text-base font-bold text-slate-600">Kütüphane araması</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Sembol adı, kategori, anlam ve bilinçaltı mesajı içinde ara..."
          className="h-[3.25rem] w-full rounded-2xl border-2 border-emerald-200 bg-white/95 px-5 text-[17px] font-semibold text-slate-800 shadow-inner outline-none transition placeholder:text-base placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30"
        />
        {listBusy ? (
          <p className="mt-2 text-sm font-bold text-emerald-700">Aranıyor…</p>
        ) : isSearchActive ? (
          <p className="mt-2 text-sm font-bold text-emerald-700">
            Arama: “{debouncedSearch}” · {searchResultCount} eşleşme
          </p>
        ) : null}
      </label>

      {loadErrorMessage ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-base font-bold text-rose-800">
          {loadErrorMessage}
        </div>
      ) : null}

      {(infoSuccess || infoError) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          {infoSuccess ? (
            <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-base font-bold text-emerald-800">
              {infoSuccess}
            </div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-base font-bold text-rose-800">
              {infoError}
            </div>
          ) : null}
        </div>
      )}

      {listLoading && rows.length === 0 ? (
        <p className="py-16 text-center text-lg font-semibold text-slate-400">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <CrudEmptyState
          icon="✦"
          title={isSearchActive ? "Sonuç bulunamadı" : "Kütüphane boş"}
          subtitle={
            isSearchActive
              ? "Arama terimini değiştirin veya yeni kayıt ekleyin."
              : "Yeni Kayıt ile ilk sembol kaydını ekleyebilirsiniz."
          }
          tone="emerald"
        />
      ) : (
        <>
          <div className="grid w-full grid-cols-1 gap-7 md:grid-cols-2 md:gap-8 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row, index) => {
              const detailHref = symbolLanguageDetailHref(row.id);
              const preview = previewSymbolLanguageText(row.meaning, row.subconscious_message);
              const theme = getSymbolLanguageCardTheme(index);
              const hasCategory = Boolean(row.category?.trim());
              const displayTitle = symbolDisplayName(row);

              if (!detailHref) return null;

              return (
                <Link
                  key={row.id}
                  href={detailHref}
                  className={`group relative flex h-[300px] flex-col overflow-hidden rounded-3xl border-[2.5px] p-6 shadow-[0_16px_40px_-14px_rgba(15,23,42,0.22)] transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${theme.card} ${theme.hover}`}
                >
                  {hasCategory ? (
                    <span
                      className={`mb-3 inline-flex w-fit max-w-full truncate rounded-full px-3.5 py-1.5 text-xs font-black uppercase tracking-wide ${theme.badge}`}
                    >
                      {row.category}
                    </span>
                  ) : (
                    <span
                      className={`mb-3 inline-flex w-fit rounded-full px-3.5 py-1.5 text-xs font-bold ${theme.badgeMuted}`}
                    >
                      Kategorisiz
                    </span>
                  )}

                  <h2 className="line-clamp-2 text-[20px] font-black leading-snug text-slate-950">
                    {displayTitle}
                  </h2>

                  <p className="mt-3 line-clamp-2 min-h-[3.25rem] flex-1 text-[16px] leading-relaxed text-slate-800/90">
                    {preview}
                  </p>

                  <span className={detailOpenBtnClass}>Detayı Aç →</span>
                </Link>
              );
            })}
          </div>

          {hasMore ? (
            <div className="mt-10 flex justify-center">
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
        title="Yeni sembol kaydı"
        subtitle="Kaydettikten sonra kütüphanede görünür."
        titleId="symbol-form-modal-title"
        accentRingClass="ring-emerald-100/50"
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
            <span className="mb-2 block text-[12px] font-black text-slate-800">Sembol Adı *</span>
            <input
              value={form.symbol_name}
              onChange={(e) => setForm((f) => ({ ...f, symbol_name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-emerald-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-emerald-200/90 focus:ring-2 focus:ring-emerald-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
            <div className={badgeFieldWrapClass("emerald")}>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Örn. hayvan, doğa…"
              />
            </div>
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Anlam</span>}
            modalTitle="Anlam"
            value={form.meaning}
            onChange={(v) => setForm((f) => ({ ...f, meaning: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={
              <span className="mb-2 block text-[12px] font-black text-slate-800">
                Bilinçaltı Mesajı
              </span>
            }
            modalTitle="Bilinçaltı Mesajı"
            value={form.subconscious_message}
            onChange={(v) => setForm((f) => ({ ...f, subconscious_message: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-violet-100/50"
            disabled={saving}
          />
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak</span>
            <input
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="h-12 w-full rounded-xl border border-amber-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-amber-200/90 focus:ring-2 focus:ring-amber-100/55"
            />
          </label>
        </div>
      </BiyoenerjiCrudFormModal>
    </section>
  );
}
