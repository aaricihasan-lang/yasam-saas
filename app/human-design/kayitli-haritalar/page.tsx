"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  HUMAN_DESIGN_TYPES,
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_PROFILES,
} from "@/lib/human-design/constants";
import {
  hdTypeLabelFromCode,
  hdAuthorityLabelFromCode,
  hdProfileLabelFromCode,
  hdDefinitionLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HumanDesignShell } from "../components/HumanDesignShell";
import {
  listChartsWithClients,
  deleteHdChart,
  type HdChartWithClient,
} from "./helpers/hdKayitliHaritalar";
import { HdHaritaDetayModal } from "./components/HdHaritaDetayModal";
import { HdComputedChartModal } from "./components/HdComputedChartModal";
import { listComputedCharts, type ComputedChartListRow } from "@/lib/human-design/api/chartsClient";

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return val;
  }
}

export default function HdKayitliHaritalarPage() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const isDemo = readYasamUser()?.is_demo_account === true;

  const [rows, setRows] = useState<HdChartWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [authorityFilter, setAuthorityFilter] = useState("");
  const [profileFilter, setProfileFilter] = useState("");
  const [detayRow, setDetayRow] = useState<HdChartWithClient | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // FAZ 9D — kaynak sekmesi + hesaplanmış (computed) liste (9B GET)
  const [tab, setTab] = useState<"manual" | "computed">("manual");
  const [computedRows, setComputedRows] = useState<ComputedChartListRow[]>([]);
  const [computedLoading, setComputedLoading] = useState(false);
  const [computedError, setComputedError] = useState("");
  const [computedSearch, setComputedSearch] = useState("");
  const [computedDetailId, setComputedDetailId] = useState<string | null>(null);
  const [computedMsg, setComputedMsg] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    const { rows: data, error } = await listChartsWithClients();
    setLoading(false);
    if (error) {
      showToast({ message: `Yüklenemedi: ${error}`, type: "error" });
    } else {
      setRows(data);
    }
  }, [showToast]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const loadComputed = useCallback(async () => {
    setComputedLoading(true);
    setComputedError("");
    setComputedMsg("");
    const { rows: data, error } = await listComputedCharts();
    setComputedLoading(false);
    if (error) setComputedError(error);
    else setComputedRows(data);
  }, []);

  useEffect(() => { if (tab === "computed") loadComputed(); }, [tab, loadComputed]);

  const computedFiltered = useMemo(() => {
    const q = computedSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return computedRows;
    return computedRows.filter((r) => {
      const hay = `${r.client_name ?? ""} ${r.birth_place ?? ""} ${r.type_code ?? ""} ${r.authority_code ?? ""} ${r.profile_code ?? ""} ${r.birth_date ?? ""} ${r.created_at}`.toLocaleLowerCase("tr-TR");
      return hay.includes(q);
    });
  }, [computedRows, computedSearch]);

  async function handleDelete(row: HdChartWithClient) {
    if (isDemo) { showToast({ message: "Demo hesabında harita silinemez.", type: "info" }); return; }
    const clientName = row.client?.name ?? row.client_name ?? "Bu danışan";
    const ok = await confirm({
      title: "Haritayı sil",
      message: `"${clientName}" danışanına ait Human Design haritası kalıcı olarak silinecek. Emin misiniz?`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;

    setDeletingId(row.id);
    const { error } = await deleteHdChart(row.id);
    setDeletingId(null);

    if (error) {
      showToast({ message: `Silinemedi: ${error}`, type: "error" });
    } else {
      showToast({ message: "Harita silindi.", type: "success" });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      if (typeFilter && row.type_code !== typeFilter) return false;
      if (authorityFilter && row.authority_code !== authorityFilter) return false;
      if (profileFilter && row.profile_code !== profileFilter) return false;
      if (q) {
        const name = (row.client?.name ?? row.client_name ?? "").toLocaleLowerCase("tr-TR");
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, authorityFilter, profileFilter]);

  return (
    <HumanDesignShell>
      <BfcacheRefreshHandler />
      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Human Design kayıtlı haritalar demo hesabında görüntülenebilir. Silme işlemi yapılamaz." />
      )}
      {/* Başlık */}
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Human Design — Kayıtlı Haritalar
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Kaydedilmiş Human Design haritalarını listele, detaylarına eriş ve rapor oluştur.
        </p>
      </div>

      {/* Kaynak sekmeleri */}
      <div className="mb-3 inline-flex rounded-xl border border-indigo-200/80 bg-white/90 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${tab === "manual" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50"}`}
        >
          Manuel
        </button>
        <button
          type="button"
          onClick={() => setTab("computed")}
          className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${tab === "computed" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-indigo-50"}`}
        >
          Hesaplanmış
        </button>
      </div>

      {/* İçerik — Manuel */}
      {tab === "manual" && (
      <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
        {/* Filtre Satırı */}
        <div className="flex flex-wrap items-center gap-3 border-b border-indigo-100/80 bg-white/75 p-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Danışan adı ara..."
            className="h-9 min-w-[160px] flex-1 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400"
          >
            <option value="">Tüm Tipler</option>
            {HUMAN_DESIGN_TYPES.map((t) => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
          <select
            value={authorityFilter}
            onChange={(e) => setAuthorityFilter(e.target.value)}
            className="h-9 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400"
          >
            <option value="">Tüm Otoriteler</option>
            {HUMAN_DESIGN_AUTHORITIES.map((a) => (
              <option key={a.code} value={a.code}>{a.label}</option>
            ))}
          </select>
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="h-9 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400"
          >
            <option value="">Tüm Profiller</option>
            {HUMAN_DESIGN_PROFILES.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadRows}
            className="h-9 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            Yenile
          </button>
        </div>

        {/* Tablo */}
        <div className="bg-gradient-to-b from-white/95 to-indigo-50/25">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-500">
              Yükleniyor...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-500">
              {rows.length === 0 ? "Henüz harita kaydı yok." : "Filtreye uyan kayıt bulunamadı."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-indigo-50/80">
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">Danışan</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 sm:table-cell">Tip</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 md:table-cell">Otorite</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">Profil</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 xl:table-cell">Tanım</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">Kayıt Tarihi</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-600">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50/80">
                  {filtered.map((row) => {
                    const clientName = row.client?.name ?? row.client_name ?? "—";
                    const clientId = row.client_id ?? "";
                    return (
                      <tr key={row.id} className="bg-white transition-colors hover:bg-indigo-50/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{clientName}</p>
                          {row.client?.birth_place && (
                            <p className="text-xs text-slate-500">{row.client.birth_place}</p>
                          )}
                          {/* mobile: show type badge */}
                          {row.type_code && (
                            <span className="mt-0.5 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 sm:hidden">
                              {hdTypeLabelFromCode(row.type_code)}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200/60">
                            {hdTypeLabelFromCode(row.type_code)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-700 md:table-cell">
                          {hdAuthorityLabelFromCode(row.authority_code)}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-700 lg:table-cell">
                          {hdProfileLabelFromCode(row.profile_code)}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-700 xl:table-cell">
                          {hdDefinitionLabelFromCode(row.definition_code)}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetayRow(row)}
                              className="h-7 rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                            >
                              Detay
                            </button>
                            {clientId && (
                              <>
                                <Link
                                  href={`/human-design/harita-kaydi?clientId=${clientId}`}
                                  className="flex h-7 items-center rounded-lg border border-violet-200 bg-white px-2.5 text-xs font-bold text-violet-700 no-underline transition hover:border-violet-400 hover:bg-violet-50"
                                >
                                  Düzenle
                                </Link>
                                <Link
                                  href={`/human-design/rapor-olustur?clientId=${clientId}`}
                                  className="flex h-7 items-center rounded-lg border border-fuchsia-200 bg-white px-2.5 text-xs font-bold text-fuchsia-700 no-underline transition hover:border-fuchsia-400 hover:bg-fuchsia-50"
                                >
                                  Rapor
                                </Link>
                              </>
                            )}
                            <button
                              type="button"
                              disabled={deletingId === row.id}
                              onClick={() => handleDelete(row)}
                              className="h-7 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
                            >
                              {deletingId === row.id ? "..." : "Sil"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-indigo-50/80 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
                {filtered.length} / {rows.length} kayıt
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* İçerik — Hesaplanmış (computed; 9B GET) */}
      {tab === "computed" && (
      <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 border-b border-indigo-100/80 bg-white/75 p-4">
          <input
            type="text"
            value={computedSearch}
            onChange={(e) => setComputedSearch(e.target.value)}
            placeholder="Yer, tip veya tarih ara..."
            className="h-9 min-w-[160px] flex-1 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={loadComputed}
            className="h-9 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            Yenile
          </button>
        </div>
        {computedMsg && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">{computedMsg}</div>
        )}
        {computedError && (
          <div role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">{computedError}</div>
        )}
        <div className="bg-gradient-to-b from-white/95 to-indigo-50/25">
          {computedLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-500">Yükleniyor...</div>
          ) : computedFiltered.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-500">
              {computedRows.length === 0 ? "Henüz hesaplanmış harita kaydı yok." : "Aramaya uyan kayıt bulunamadı."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-indigo-50/80">
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">Kayıt</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 sm:table-cell">Tip</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 md:table-cell">Otorite</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">Profil</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">Kayıt Tarihi</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-600">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50/80">
                  {computedFiltered.map((row) => (
                    <tr key={row.id} className="bg-white transition-colors hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{row.client_name || "Kişisel Kayıt"}</p>
                        <p className="text-xs text-slate-500">
                          {formatDate(row.birth_date)}{row.birth_place ? ` · ${row.birth_place}` : ""}
                        </p>
                        {row.type_code && (
                          <span className="mt-0.5 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 sm:hidden">{row.type_code}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200/60">{row.type_code || "—"}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-700 md:table-cell">{row.authority_code || "—"}</td>
                      <td className="hidden px-4 py-3 text-xs text-slate-700 lg:table-cell">{row.profile_code || "—"}</td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setComputedDetailId(row.id)}
                            className="h-7 rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                          >
                            Detay
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-indigo-50/80 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
                {computedFiltered.length} / {computedRows.length} kayıt
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {detayRow && (
        <HdHaritaDetayModal
          row={detayRow}
          onClose={() => setDetayRow(null)}
        />
      )}

      {computedDetailId && (
        <HdComputedChartModal
          id={computedDetailId}
          onClose={() => setComputedDetailId(null)}
          onDeleted={(deletedId) => {
            setComputedRows((prev) => prev.filter((r) => r.id !== deletedId));
            setComputedDetailId(null);
            setComputedMsg("Kayıt silindi.");
          }}
        />
      )}
    </HumanDesignShell>
  );
}
