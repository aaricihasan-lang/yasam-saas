"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

// ─── Tipler ────────────────────────────────────────────────────────────────────

type KutuphaneRecord = {
  id: string;
  baslik: string;
  icerik: string;
  kategori: string;
  alt_kategori: string;
  etiketler: string[];
  ilgili_taslar: string[];
  ilgili_mineraller: string[];
  kaynak: string;
  kaynak_bolum: string;
  anahtar_kelime: string;
  notlar: string;
};

// ─── Kategori renkleri ─────────────────────────────────────────────────────────

const KAT_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  "Şifa":       { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: "💚" },
  "Araştırma":  { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "🔬" },
  "Mineroloji": { color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", icon: "💎" },
  "Uygulamalar":{ color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "🖐️" },
  "Genel":      { color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "📖" },
};

function katConfig(kat: string) {
  return KAT_CONFIG[kat] ?? { color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "📄" };
}

// ─── İçerik renderer (markdown-ish) ──────────────────────────────────────────

function renderInlineText(text: string): ReactNode {
  // ^^bold^^ işaretlerini render et
  const parts = text.split("^^");
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <strong key={i} className="font-black text-slate-950">
          {part}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function renderContent(icerik: string): ReactNode {
  if (!icerik) return null;

  const lines = icerik.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let buffer: string[] = [];
  let key = 0;

  function flushBuffer() {
    if (buffer.length === 0) return;
    const text = buffer.join("\n").trim();
    if (text) {
      nodes.push(
        <p key={key++} className="leading-relaxed text-slate-700">
          {renderInlineText(text)}
        </p>
      );
    }
    buffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // H2 başlık
    if (line.startsWith("## ")) {
      flushBuffer();
      nodes.push(
        <h3 key={key++} className="mt-5 mb-2 text-sm font-black uppercase tracking-wide text-slate-950 first:mt-0">
          {line.slice(3)}
        </h3>
      );
      continue;
    }

    // H3 başlık
    if (line.startsWith("### ")) {
      flushBuffer();
      nodes.push(
        <h4 key={key++} className="mt-4 mb-1.5 text-sm font-black text-slate-800 first:mt-0">
          {line.slice(4)}
        </h4>
      );
      continue;
    }

    // Boş satır → paragraf ayırıcı
    if (line.trim() === "") {
      flushBuffer();
      continue;
    }

    buffer.push(line);
  }
  flushBuffer();

  return <div className="space-y-3">{nodes}</div>;
}

// ─── Türkçe normalizasyon + arama ─────────────────────────────────────────────

function trSort(a: string, b: string) {
  return normalizeTr(a).localeCompare(normalizeTr(b), "tr");
}

function matchesSearch(rec: KutuphaneRecord, q: string): boolean {
  if (!q) return true;
  const norm = normalizeTr(q);
  return (
    normalizeTr(rec.baslik).includes(norm) ||
    normalizeTr(rec.icerik).includes(norm) ||
    normalizeTr(rec.kaynak_bolum).includes(norm)
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function TasBilgiKutuphanesiPage() {
  const [records, setRecords] = useState<KutuphaneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeKat, setActiveKat] = useState("Tümü");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/data/tas_bilgi_kutuphanesi.json")
      .then((r) => r.json())
      .then((data: KutuphaneRecord[]) => {
        const sorted = [...data].sort((a, b) => trSort(a.baslik, b.baslik));
        setRecords(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ─── Türetilmiş veriler ───────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = [...new Set(records.map((r) => r.kategori))].sort((a, b) =>
      trSort(a, b)
    );
    return ["Tümü", ...cats];
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (activeKat !== "Tümü" && r.kategori !== activeKat) return false;
      if (!matchesSearch(r, search)) return false;
      return true;
    });
  }, [records, activeKat, search]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  );

  function selectRecord(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    contentRef.current?.scrollTo({ top: 0 });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-[#f0f9f4] via-[#f7f5ff] to-[#fff5fb] text-slate-950">

      {/* Header */}
      <header className="shrink-0 border-b border-white/70 bg-white/85 px-4 py-3 shadow-sm backdrop-blur-md sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-0.5 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-emerald-700">
              Doğaltaş
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Taş Bilgi Kütüphanesi
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {loading
                ? "Kütüphane yükleniyor..."
                : `${records.length} makale — mineroloji, şifa, araştırma, uygulamalar`}
            </p>
          </div>

          {/* Kategori istatistik pills (desktop) */}
          <div className="hidden flex-wrap gap-1.5 lg:flex">
            {Object.entries(KAT_CONFIG).map(([kat, cfg]) => {
              const count = records.filter((r) => r.kategori === kat).length;
              return (
                <span
                  key={kat}
                  className="rounded-full border px-2.5 py-1 text-xs font-bold"
                  style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}
                >
                  {cfg.icon} {kat} ({count})
                </span>
              );
            })}
          </div>
        </div>
      </header>

      {/* İki panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── Sol panel: Liste ──────────────────────────────────────────────── */}
        <aside
          className={`flex w-full shrink-0 flex-col border-r border-slate-200/70 bg-white/65 backdrop-blur-sm
            md:w-72 lg:w-80
            ${mobileView === "detail" ? "hidden md:flex" : "flex"}`}
        >
          {/* Arama */}
          <div className="p-2.5">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Makale ara..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* Kategori filtreleri */}
          <div className="flex shrink-0 flex-wrap gap-1 px-2.5 pb-2">
            {categories.map((kat) => {
              const isActive = activeKat === kat;
              const cfg = kat === "Tümü" ? null : katConfig(kat);
              return (
                <button
                  key={kat}
                  type="button"
                  onClick={() => setActiveKat(kat)}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-bold transition-all"
                  style={
                    isActive
                      ? {
                          background: cfg?.color ?? "#334155",
                          borderColor: cfg?.color ?? "#334155",
                          color: "white",
                        }
                      : {
                          background: cfg?.bg ?? "#f8fafc",
                          borderColor: cfg?.border ?? "#e2e8f0",
                          color: cfg?.color ?? "#475569",
                        }
                  }
                >
                  {cfg?.icon} {kat}
                  {kat !== "Tümü" && (
                    <span className="ml-1 opacity-70">
                      ({records.filter((r) => r.kategori === kat).length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sonuç sayısı */}
          <div className="shrink-0 border-b border-slate-100 px-3 pb-1.5 text-xs font-semibold text-slate-400">
            {filtered.length} kayıt{search ? ` — "${search}" için` : ""}
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Kütüphane yükleniyor...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Kayıt bulunamadı.
              </div>
            ) : (
              filtered.map((rec) => {
                const isSelected = rec.id === selectedId;
                const cfg = katConfig(rec.kategori);
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => selectRecord(rec.id)}
                    className={`mx-1.5 mb-0.5 flex w-[calc(100%-12px)] items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all
                      ${isSelected
                        ? "shadow-md text-white"
                        : "hover:bg-slate-50 text-slate-800"}`}
                    style={isSelected ? { background: cfg.color } : undefined}
                  >
                    {/* Kategori ikonu */}
                    <span className={`mt-0.5 shrink-0 text-sm ${isSelected ? "opacity-90" : ""}`}>
                      {cfg.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-bold leading-snug ${
                          isSelected ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {rec.baslik}
                      </div>
                      <div
                        className={`mt-0.5 text-[11px] font-semibold ${
                          isSelected ? "text-white/75" : "text-slate-400"
                        }`}
                      >
                        {rec.kategori}
                        {rec.kaynak && ` · ${rec.kaynak.replace(".docx", "").replace(".pdf", "")}`}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Sağ panel: Detay ──────────────────────────────────────────────── */}
        <div
          className={`flex min-w-0 flex-1 flex-col overflow-hidden
            ${mobileView === "list" ? "hidden md:flex" : "flex"}`}
        >
          {!selectedRecord ? (
            /* Boş durum */
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-sm rounded-3xl border border-emerald-100 bg-white px-8 py-10 text-center shadow-sm">
                <div className="mb-4 text-5xl">📚</div>
                <h2 className="text-xl font-black text-slate-900">Taş Bilgi Kütüphanesi</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Sol panelden bir makale seçerek mineroloji, şifa, araştırma ve
                  uygulama bilgilerini okuyabilirsin.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {Object.entries(KAT_CONFIG).map(([kat, cfg]) => (
                    <span
                      key={kat}
                      className="rounded-full border px-2.5 py-1 text-xs font-bold"
                      style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}
                    >
                      {cfg.icon} {kat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Detay başlık */}
              <div className="shrink-0 border-b border-slate-100 bg-white/75 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  {/* Mobil geri butonu */}
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 md:hidden"
                  >
                    ← Listeye Dön
                  </button>

                  <div className="min-w-0 flex-1">
                    {/* Kategori badge */}
                    {(() => {
                      const cfg = katConfig(selectedRecord.kategori);
                      return (
                        <span
                          className="mb-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-black"
                          style={{ borderColor: cfg.border, background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.icon} {selectedRecord.kategori}
                        </span>
                      );
                    })()}
                    <h2 className="text-lg font-black leading-snug text-slate-950 sm:text-xl">
                      {selectedRecord.baslik}
                    </h2>
                  </div>
                </div>

                {/* Meta bilgiler */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedRecord.kaynak && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      📄 {selectedRecord.kaynak.replace(".docx","").replace(".pdf","")}
                    </span>
                  )}
                  {selectedRecord.kaynak_bolum && selectedRecord.kaynak_bolum !== selectedRecord.baslik && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      § {selectedRecord.kaynak_bolum}
                    </span>
                  )}
                  {selectedRecord.etiketler.length > 0 &&
                    selectedRecord.etiketler.map((tag, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700"
                      >
                        #{tag}
                      </span>
                    ))}
                  {selectedRecord.ilgili_taslar.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      💎 {selectedRecord.ilgili_taslar.join(", ")}
                    </span>
                  )}
                  {selectedRecord.ilgili_mineraller.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      ⚗️ {selectedRecord.ilgili_mineraller.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              {/* İçerik */}
              <div ref={contentRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 text-[14px]">
                  {renderContent(selectedRecord.icerik)}

                  {/* Alt notlar */}
                  {selectedRecord.notlar && (
                    <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                      <span className="font-black">Not: </span>{selectedRecord.notlar}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
