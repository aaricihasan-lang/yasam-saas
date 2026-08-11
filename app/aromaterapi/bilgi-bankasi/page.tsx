"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  fetchReferenceSheets,
  type ReferenceRow,
  type ReferenceSheet,
} from "@/lib/aromaterapi/aromatherapyKnowledgeData";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { DemoGate } from "@/components/demo/DemoGate";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { DEMO_AROMA_KNOWLEDGE_SHEETS } from "@/lib/demo/demoAromaterapiKnowledge";
import { AromaterapiModuleNav } from "@/app/aromaterapi/_components/AromaterapiModuleNav";

// -------------------------------------------------------
// Tasarım token'ları
// -------------------------------------------------------

const pageBg =
  "relative min-h-screen bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950";

// -------------------------------------------------------
// Tab metadata
// -------------------------------------------------------

const TAB_ICONS: Record<string, string> = {
  "Genel Bilgi":                        "📖",
  "Uçucu Yağ Elde Etme Yöntemleri":    "⚗️",
  "Uçucu Yağların Etki Mekanizması":   "🧠",
};

// -------------------------------------------------------
// Genel Bilgi — satır sınıflandırıcı
// -------------------------------------------------------

type RowKind = "skip" | "major" | "section" | "paragraph" | "definition";

function classifyRow(row: ReferenceRow): RowKind {
  if (row.is_header) return "skip";
  const col0 = (row.cells["0"] ?? "").trim();
  const col1 = (row.cells["1"] ?? "").trim();
  if (!col0 && !col1) return "skip";
  if (col0 && col1) return "definition";
  const text = (col1 || col0).trim();
  const letters = text.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ]/g, "");
  const allCaps = letters.length > 0 && letters.toLocaleUpperCase("tr") === letters;
  if (allCaps) return "major";
  if (text.length <= 60) return "section";
  return "paragraph";
}

// -------------------------------------------------------
// Genel Bilgi renderer
// -------------------------------------------------------

function GenelBilgiRenderer({ rows }: { rows: ReferenceRow[] }) {
  const sorted = [...rows].sort((a, b) => a.row_index - b.row_index);
  return (
    <div>
      {sorted.map((row) => {
        const kind = classifyRow(row);
        if (kind === "skip") return null;

        const col0 = (row.cells["0"] ?? "").trim();
        const col1 = (row.cells["1"] ?? "").trim();
        const text = (col1 || col0).trim();

        // LEVEL 1 — büyük harf ana başlık: belirgin section bandı (yeni ana konu).
        if (kind === "major") {
          return (
            <div
              key={row.id}
              className="mt-12 mb-4 flex items-center gap-3 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/80 to-rose-50/40 px-4 py-3 first:mt-0"
            >
              <span aria-hidden className="h-5 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-amber-400 to-rose-400" />
              <h3 className="text-[15px] font-black uppercase tracking-[0.06em] text-amber-900">{text}</h3>
            </div>
          );
        }

        // LEVEL 2 — ana bölüm başlığı: güçlü section başlangıcı (accent + alt kural).
        if (kind === "section") {
          return (
            <div key={row.id} className="mt-9 mb-3 border-b border-amber-100/80 pb-2 first:mt-0">
              <h4 className="flex items-center gap-2.5 text-[16px] font-black tracking-tight text-slate-900">
                <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
                {text}
              </h4>
            </div>
          );
        }

        // Serbest paragraf — okunur ölçüde satır uzunluğu.
        if (kind === "paragraph") {
          return (
            <p key={row.id} className="mb-3 max-w-[72ch] text-[14px] leading-[1.75] text-slate-700">
              {text}
            </p>
          );
        }

        // LEVEL 3 — alt-konu satırı (etiket + açıklama; KART DEĞİL, nefesli satır).
        return (
          <div
            key={row.id}
            className="grid grid-cols-1 gap-x-8 gap-y-1 border-b border-slate-100/70 py-3.5 last:border-0 sm:grid-cols-[minmax(150px,240px)_1fr]"
          >
            <dt className="text-[13px] font-black text-slate-800">{col0}</dt>
            <dd className="max-w-[68ch] text-[14px] leading-[1.75] text-slate-600">{col1}</dd>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------
// Elde Etme Yöntemleri — 4-kolon tablo
// -------------------------------------------------------

function EldeEtmeRenderer({ rows }: { rows: ReferenceRow[] }) {
  const sorted = [...rows].sort((a, b) => a.row_index - b.row_index);
  const nonHeader = sorted.filter((r) => !r.is_header);
  if (nonHeader.length === 0) return null;

  const [colHeaderRow, ...bodyRows] = nonHeader;

  // Sütun sayısını veriden belirle
  const numCols = colHeaderRow
    ? Math.max(0, ...Object.keys(colHeaderRow.cells).map(Number)) + 1
    : 4;

  const cols = Array.from({ length: numCols }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="border-b-2 border-amber-200/60 bg-amber-50/60 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-amber-800"
              >
                {colHeaderRow?.cells[String(c)] ?? ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={row.id} className={ri % 2 === 0 ? "bg-white/50" : "bg-slate-50/40"}>
              {cols.map((c) => (
                <td
                  key={c}
                  className="border-b border-slate-100/60 px-4 py-3 align-top text-[14px] text-slate-700"
                >
                  {row.cells[String(c)] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------
// Genel (fallback) renderer — hücreleri düz metin olarak gösterir
// -------------------------------------------------------

function DefaultRenderer({ rows }: { rows: ReferenceRow[] }) {
  const sorted = [...rows].sort((a, b) => a.row_index - b.row_index);
  const allValues = sorted.flatMap((row) =>
    Object.values(row.cells as Record<string, string>).filter((v) => v.trim().length > 0)
  );
  return (
    <div className="space-y-3">
      {allValues.map((v, i) => (
        <p key={i} className="max-w-[72ch] text-[14px] leading-[1.75] text-slate-600">
          {v}
        </p>
      ))}
    </div>
  );
}

// -------------------------------------------------------
// Sheet içerik — sheet_name'e göre renderer seçer
// -------------------------------------------------------

function SheetContent({ sheet }: { sheet: ReferenceSheet }) {
  if (sheet.sheet_name === "Genel Bilgi") {
    return <GenelBilgiRenderer rows={sheet.rows} />;
  }
  if (sheet.sheet_name === "Uçucu Yağ Elde Etme Yöntemleri") {
    return <EldeEtmeRenderer rows={sheet.rows} />;
  }
  return <DefaultRenderer rows={sheet.rows} />;
}

// -------------------------------------------------------
// Ana sayfa
// -------------------------------------------------------

export default function BilgiBankasiPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [sheets, setSheets] = useState<ReferenceSheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    // Demo hesap: gerçek tenant referans içeriği ÇEKİLMEZ (DevTools ile dahi
    // okunamaması için). Sekme başlıkları görünür, gövde örnek fixture'dır.
    if (isDemo) {
      const data = DEMO_AROMA_KNOWLEDGE_SHEETS;
      setSheets(data);
      if (data.length > 0 && !activeId) setActiveId(data[0]!.id);
      setLoading(false);
      return;
    }

    const tid = await getSyncedTenantId();
    if (!tid) {
      setLoading(false);
      setErrorMsg(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }
    const { sheets: data, error } = await fetchReferenceSheets(tid);
    setLoading(false);
    if (error) { setErrorMsg(`Veriler yüklenemedi: ${error}`); return; }
    setSheets(data);
    if (data.length > 0 && !activeId) setActiveId(data[0]!.id);
  }, [isDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { runInEffect(() => { void loadSheets(); }); }, [loadSheets]);
  useBfcacheRefresh();

  const activeSheet = sheets.find((s) => s.id === activeId) ?? null;

  return (
    <main className={pageBg}>
      {/* Arka plan blur lekeleri */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-[400px] w-[400px] rounded-full bg-violet-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[300px] w-[300px] rounded-full bg-amber-200/15 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1280px] space-y-4 px-4 py-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">

        <AromaterapiModuleNav />

        {/* C3C: Sözlük alt-görünümüne kontrollü erişim (mevcut sheet/demo davranışı değişmez). */}
        <div className="flex justify-end">
          <Link
            href="/aromaterapi/bilgi-bankasi/sozluk"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200/70 bg-white/80 px-3.5 text-[12.5px] font-black text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
          >
            <span aria-hidden>📖</span>
            Sözlük&apos;e git →
          </Link>
        </div>

        {isDemo && (
          <DemoModuleBanner message="Bilgi bankası içerikleri demo hesabında korunur. Sekme başlıkları görünür; makale içerikleri tam sürümde açılır." />
        )}

        {/* ─── HEADER ─────────────────────────────────────────────── */}
        <header className="rounded-[24px] border border-amber-200/50 bg-white/85 p-5 shadow-sm backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/90 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 shadow-sm">
                <span>📚</span>
                <span>Aromaterapi — Bilgi Bankası</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Bilgi Bankası
              </h1>
              <p className="mt-1.5 text-[12px] font-medium text-slate-500">
                Uzman referans içerikleri ve notları
              </p>
            </div>
            <Link
              href="/aromaterapi"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/60 bg-gradient-to-r from-amber-500 to-rose-500 px-3.5 text-[12px] font-black text-white shadow-md transition hover:brightness-105"
            >
              <span aria-hidden className="text-sm leading-none">←</span>
              <span className="hidden sm:inline">Aromaterapi</span>
            </Link>
          </div>
        </header>

        {errorMsg ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMsg}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[20px] bg-white/80 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Yükleniyor…</p>
          </div>
        ) : sheets.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border border-amber-100/70 bg-white/85 p-8 text-center shadow-sm sm:p-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/60 text-3xl shadow-sm">📚</div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Henüz bilgi bankası içeriği yok</h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
              Bu bölüm uzman referans içerikleri ve notları içindir. İçerikler hazırlandıkça burada görünecektir.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              🔜 İçerik ekleme yakında
            </span>
          </div>
        ) : (
          <>
            {/* ─── TAB ÇUBUĞU ─────────────────────────────────────── */}
            <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-1.5 pb-0.5">
                {sheets.map((sheet) => {
                  const active = sheet.id === activeId;
                  const icon = TAB_ICONS[sheet.sheet_name] ?? "📄";
                  return (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => setActiveId(sheet.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold transition ${
                        active
                          ? "bg-gradient-to-r from-amber-500 to-rose-400 text-white shadow-[0_4px_14px_rgba(245,158,11,0.30)]"
                          : "border border-amber-100/80 bg-white/80 text-slate-600 hover:bg-amber-50 hover:text-amber-800"
                      }`}
                    >
                      <span className="text-base leading-none">{icon}</span>
                      <span>{sheet.display_title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── İÇERİK KARTI ────────────────────────────────────── */}
            {activeSheet ? (
              <div className="rounded-[20px] border border-amber-100/70 bg-white/92 px-5 py-6 shadow-[0_4px_24px_rgba(15,23,42,0.05)] sm:px-7 sm:py-7">

                {/* Sekme başlığı */}
                <div className="mb-5 flex items-center gap-3 border-b border-amber-100/60 pb-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50/60 text-lg leading-none shadow-sm">
                    {TAB_ICONS[activeSheet.sheet_name] ?? "📄"}
                  </span>
                  <h2 className="text-[18px] font-black tracking-tight text-slate-950">
                    {activeSheet.display_title}
                  </h2>
                </div>

                <DemoGate
                isProtected={isDemo}
                message="Bilgi bankası makaleleri demo hesabında korunur. Tam sürümde tüm içerikler açık olarak kullanılabilir."
              >
                <SheetContent sheet={activeSheet} />
              </DemoGate>
              </div>
            ) : null}
          </>
        )}

      </div>
    </main>
  );
}
