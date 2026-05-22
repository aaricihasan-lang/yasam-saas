"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { backgroundSyncYasamUserFromDb } from "@/lib/auth/yasamUser";
import {
  getSessionTenantId,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchSubconsciousCausesCount,
  fetchSubconsciousCausesPage,
  previewSubconsciousText,
  SUBCONSCIOUS_CAUSES_LIST_PATH,
  type SubconsciousCauseListItem,
} from "@/lib/bioenergy/subconsciousCausesListFetch";
import { supabase } from "@/lib/supabase";
import { badgeFieldWrapClass, CrudEmptyState } from "./BiyoenerjiUi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { LongTextareaField } from "./LargeTextModal";

const SEARCH_DEBOUNCE_MS = 300;

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
  "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-8 py-4 text-base font-black text-white shadow-[0_12px_32px_rgba(192,38,211,0.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(139,92,246,0.25)]";

const loadMoreBtnClass =
  "rounded-2xl border-2 border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-violet-50 px-8 py-4 text-base font-black text-slate-800 shadow-md transition hover:from-fuchsia-100 hover:to-violet-100 disabled:opacity-60";

export default function BilincaltiSebepleri() {
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<SubconsciousCauseListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalInDb, setTotalInDb] = useState(0);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SubconsciousCauseForm>({ ...emptyForm });
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
        fetchSubconsciousCausesPage(tenantId, { offset, search }),
        opts.reset
          ? fetchSubconsciousCausesCount(tenantId)
          : Promise.resolve({ count: totalInDb, error: null }),
        opts.reset
          ? fetchSubconsciousCausesCount(tenantId, search)
          : Promise.resolve({ count: searchResultCount, error: null }),
        opts.reset
          ? supabase
              .from("bioenergy_subconscious_causes")
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
        setLoadErrorMessage(`Bilinçaltı sebepleri okunamadı: ${pageRes.error}`);
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
      showSoft("err", "Başlık zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("bioenergy_subconscious_causes").insert({
      tenant_id: tenantId,
      source_uid: form.source_uid.trim() || slugifySourceUid(titleTrim),
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
    setForm({ ...emptyForm });
    await fetchList({ reset: true });
    showSoft("ok", "Kayıt oluşturuldu.");
  }

  return (
    <section className="w-full min-w-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setFormModalOpen(true)} className={newRecordBtnPremium}>
          + Yeni Kayıt
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border-2 border-fuchsia-200/70 bg-white/90 px-5 py-5 shadow-md sm:px-6 sm:py-6">
          <p className="text-base font-bold text-slate-500">Toplam kayıt</p>
          <p className="mt-2 text-3xl font-black tabular-nums text-fuchsia-700 sm:text-4xl">
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
        <span className="mb-2 block text-base font-bold text-slate-600">
          Başlık, kategori, içerik ve not içinde ara
        </span>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Örn. travma, duygusal, hastalık, sebep…"
          className="h-[3.25rem] w-full rounded-2xl border-2 border-fuchsia-200 bg-white/95 px-5 text-[17px] font-semibold text-slate-800 shadow-inner outline-none transition placeholder:text-base placeholder:font-medium placeholder:text-slate-400 focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-300/30"
        />
        {listBusy ? (
          <p className="mt-2 text-sm font-bold text-fuchsia-700">Aranıyor…</p>
        ) : isSearchActive ? (
          <p className="mt-2 text-sm font-bold text-fuchsia-700">
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
          icon="◐"
          title={isSearchActive ? "Sonuç bulunamadı" : "Kütüphane boş"}
          subtitle={
            isSearchActive
              ? "Arama terimini değiştirin veya yeni kayıt ekleyin."
              : "Yeni Kayıt ile ilk bilinçaltı sebebini ekleyebilirsiniz."
          }
          tone="fuchsia"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const detailHref = `${SUBCONSCIOUS_CAUSES_LIST_PATH}/${encodeURIComponent(row.id)}`;
              const preview = previewSubconsciousText(row.content, row.note_text);

              return (
                <article
                  key={row.id}
                  className="flex min-h-[280px] flex-col rounded-3xl border-2 border-fuchsia-200/60 bg-gradient-to-br from-white/95 via-fuchsia-50/40 to-violet-50/30 p-6 shadow-[0_12px_36px_-16px_rgba(192,38,211,0.2)] transition duration-300 hover:-translate-y-1 hover:border-fuchsia-300 hover:shadow-xl"
                >
                  {row.category?.trim() ? (
                    <span className="mb-3 inline-flex w-fit rounded-full bg-gradient-to-r from-fuchsia-100 to-violet-50 px-3.5 py-1 text-xs font-black uppercase tracking-wide text-fuchsia-950 ring-1 ring-fuchsia-200/60">
                      {row.category}
                    </span>
                  ) : (
                    <span className="mb-3 inline-flex w-fit rounded-full bg-slate-100 px-3.5 py-1 text-xs font-bold text-slate-500">
                      Kategorisiz
                    </span>
                  )}

                  <h2 className="line-clamp-2 text-xl font-black leading-snug text-slate-950 sm:text-[1.35rem]">
                    {row.title?.trim() || "İsimsiz kayıt"}
                  </h2>

                  <p className="mt-4 line-clamp-3 flex-1 text-base leading-relaxed text-slate-600">
                    {preview}
                  </p>

                  <Link
                    href={detailHref}
                    className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 py-3.5 text-base font-black text-white shadow-md transition hover:bg-fuchsia-800"
                  >
                    Detayı Aç →
                  </Link>
                </article>
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
        title="Yeni bilinçaltı kaydı"
        subtitle="Kaydettikten sonra kütüphanede görünür."
        titleId="subconscious-form-modal-title"
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
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_10px_26px_-8px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 disabled:opacity-55"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kaynak uid</span>
            <input
              value={form.source_uid}
              onChange={(e) => setForm((f) => ({ ...f, source_uid: e.target.value }))}
              placeholder="JSON uid ile eşleşir (isteğe bağlı)"
              className="h-12 w-full rounded-xl border border-violet-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-violet-200/90 focus:ring-2 focus:ring-violet-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Başlık *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Kategori</span>
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
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">İçerik</span>}
            modalTitle="İçerik"
            value={form.content}
            onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            minRows={5}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-cyan-100/50 transition"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Not</span>}
            modalTitle="Not"
            value={form.note_text}
            onChange={(v) => setForm((f) => ({ ...f, note_text: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-slate-100/60 transition"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>
    </section>
  );
}
