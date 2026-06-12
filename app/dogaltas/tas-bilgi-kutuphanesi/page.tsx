"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

const KAT_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: string }
> = {
  Şifa: { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: "💚" },
  Araştırma: { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "🔬" },
  Mineroloji: { color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", icon: "💎" },
  Uygulamalar: { color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "🖐️" },
  Genel: { color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "📖" },
};

function katConfig(kat: string) {
  return (
    KAT_CONFIG[kat] ?? {
      color: "#475569",
      bg: "#f8fafc",
      border: "#e2e8f0",
      icon: "📄",
    }
  );
}

// ─── Arama motoru ──────────────────────────────────────────────────────────────

/** Arama sorgusunu boşluğa göre böl, normalize et, boşları çıkar */
function getSearchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((t) => normalizeTr(t))
    .filter(Boolean);
}

/**
 * Normalize edilmiş metin pozisyonunu orijinal metne eşleyen harita.
 * NFD + combining-mark kaldırma nedeniyle 1:1 karakter eşleşmesi sağlar.
 */
function buildNormMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const charNorm = normalizeTr(text[i] ?? "");
    for (let j = 0; j < charNorm.length; j++) {
      norm += charNorm[j];
      map.push(i);
    }
  }
  return { norm, map };
}

/** Tek bir metin içinde tüm terimlerin toplam eşleşme sayısı */
function countInText(text: string, terms: string[]): number {
  if (!text || !terms.length) return 0;
  const { norm } = buildNormMap(text);
  let total = 0;
  for (const term of terms) {
    let pos = 0;
    while (pos <= norm.length - term.length) {
      const idx = norm.indexOf(term, pos);
      if (idx < 0) break;
      total++;
      pos = idx + term.length;
    }
  }
  return total;
}

/** Kayıttaki TÜM alanlarda toplam eşleşme sayısı */
function countRecordMatches(rec: KutuphaneRecord, terms: string[]): number {
  if (!terms.length) return 0;
  const allFields = [
    rec.baslik,
    rec.icerik,
    rec.kategori,
    rec.alt_kategori,
    rec.kaynak,
    rec.kaynak_bolum,
    rec.anahtar_kelime,
    rec.notlar,
    ...rec.etiketler,
    ...rec.ilgili_taslar,
    ...rec.ilgili_mineraller,
  ];
  return allFields.reduce((sum, field) => sum + countInText(field, terms), 0);
}

/** Kayıt tüm terimleri içeriyor mu? (AND mantığı) */
function recordMatchesAll(rec: KutuphaneRecord, terms: string[]): boolean {
  if (!terms.length) return true;
  const allText = normalizeTr(
    [
      rec.baslik,
      rec.icerik,
      rec.kategori,
      rec.alt_kategori,
      rec.kaynak,
      rec.kaynak_bolum,
      rec.anahtar_kelime,
      rec.notlar,
      ...rec.etiketler,
      ...rec.ilgili_taslar,
      ...rec.ilgili_mineraller,
    ].join(" ")
  );
  return terms.every((t) => allText.includes(t));
}

// ─── Highlight renderer ───────────────────────────────────────────────────────

/** Verilen metin içinde eşleşen kısımları sarı <mark> ile sarar (XSS güvenli) */
function highlightSegment(text: string, terms: string[]): ReactNode {
  if (!terms.length || !text) return text;

  const { norm, map } = buildNormMap(text);

  type Range = { s: number; e: number };
  const ranges: Range[] = [];

  for (const term of terms) {
    let pos = 0;
    while (pos <= norm.length - term.length) {
      const idx = norm.indexOf(term, pos);
      if (idx < 0) break;
      const s = map[idx] ?? 0;
      const eNormIdx = idx + term.length - 1;
      const e = eNormIdx < map.length ? (map[eNormIdx] ?? s) + 1 : s + 1;
      ranges.push({ s, e });
      pos = idx + term.length;
    }
  }

  if (!ranges.length) return text;

  // Çakışan aralıkları birleştir
  ranges.sort((a, b) => a.s - b.s);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.s <= last.e) {
      last.e = Math.max(last.e, r.e);
    } else {
      merged.push({ ...r });
    }
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < merged.length; i++) {
    const { s, e } = merged[i]!;
    if (s > cursor) nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, s)}</Fragment>);
    nodes.push(
      <mark
        key={`m${i}`}
        className="rounded bg-yellow-200 px-0.5 font-bold text-slate-900"
      >
        {text.slice(s, e)}
      </mark>
    );
    cursor = e;
  }
  if (cursor < text.length)
    nodes.push(<Fragment key="tend">{text.slice(cursor)}</Fragment>);

  return <>{nodes}</>;
}

/** ^^bold^^ işareti + highlight kombinasyonu */
function renderInline(text: string, terms: string[]): ReactNode {
  const parts = text.split("^^");
  return parts.map((part, i) => {
    const content = terms.length ? highlightSegment(part, terms) : part;
    if (i % 2 === 1) {
      return (
        <strong key={i} className="font-black text-slate-950">
          {content}
        </strong>
      );
    }
    return <Fragment key={i}>{content}</Fragment>;
  });
}

// ─── İçerik renderer ──────────────────────────────────────────────────────────

function renderContent(icerik: string, terms: string[]): ReactNode {
  if (!icerik) return null;

  const lines = icerik.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let buffer: string[] = [];
  let key = 0;

  function flushBuffer() {
    if (!buffer.length) return;
    const text = buffer.join(" ").trim();
    if (!text) { buffer = []; return; }
    nodes.push(
      <p key={key++} className="leading-8 text-slate-700">
        {renderInline(text, terms)}
      </p>
    );
    buffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("## ")) {
      flushBuffer();
      nodes.push(
        <h3
          key={key++}
          className="mb-3 mt-8 border-b border-slate-100 pb-2 text-lg font-black tracking-tight text-slate-900 first:mt-0"
        >
          {renderInline(line.slice(3), terms)}
        </h3>
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushBuffer();
      nodes.push(
        <h4
          key={key++}
          className="mb-2 mt-6 text-base font-black text-slate-800 first:mt-0"
        >
          {renderInline(line.slice(4), terms)}
        </h4>
      );
      continue;
    }

    if (line.trim() === "") {
      flushBuffer();
      continue;
    }

    buffer.push(line);
  }
  flushBuffer();

  return <div className="space-y-5">{nodes}</div>;
}

// ─── Sıralama ─────────────────────────────────────────────────────────────────

function trSort(a: string, b: string) {
  return normalizeTr(a).localeCompare(normalizeTr(b), "tr");
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function TasBilgiKutuphanesiPage() {
  const [records, setRecords] = useState<KutuphaneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawSearch, setRawSearch] = useState("");
  const [activeKat, setActiveKat] = useState("Tümü");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const contentRef = useRef<HTMLDivElement>(null);

  // Hafif debounce — 120ms
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch), 120);
    return () => clearTimeout(t);
  }, [rawSearch]);

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

  const searchTerms = useMemo(() => getSearchTerms(search), [search]);

  const categories = useMemo(() => {
    const cats = [...new Set(records.map((r) => r.kategori))].sort(trSort);
    return ["Tümü", ...cats];
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (activeKat !== "Tümü" && r.kategori !== activeKat) return false;
      if (!recordMatchesAll(r, searchTerms)) return false;
      return true;
    });
  }, [records, activeKat, searchTerms]);

  // Eşleşme sayıları (yalnızca arama aktifken hesapla)
  const matchCounts = useMemo(() => {
    if (!searchTerms.length) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const rec of filtered) {
      m.set(rec.id, countRecordMatches(rec, searchTerms));
    }
    return m;
  }, [filtered, searchTerms]);

  // Seçili kayıt içeriğinde kaç eşleşme var
  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  );

  const selectedIcerikMatchCount = useMemo(() => {
    if (!selectedRecord || !searchTerms.length) return 0;
    return countInText(selectedRecord.icerik, searchTerms);
  }, [selectedRecord, searchTerms]);

  // Arama aktifken seçili kayıt filtrede yoksa ilkini seç
  useEffect(() => {
    if (!searchTerms.length) return;
    if (filtered.length > 0 && !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectRecord(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    contentRef.current?.scrollTo({ top: 0 });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-950">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-0.5 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-emerald-700">
              Doğaltaş
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Taş Bilgi Kütüphanesi
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {loading
                ? "Kütüphane yükleniyor..."
                : `${records.length} makale · Mineroloji, Şifa, Araştırma, Uygulamalar`}
            </p>
          </div>

          {/* Kategori stats */}
          <div className="hidden flex-wrap gap-1.5 xl:flex">
            {Object.entries(KAT_CONFIG).map(([kat, cfg]) => {
              const count = records.filter((r) => r.kategori === kat).length;
              return (
                <span
                  key={kat}
                  className="rounded-full border px-3 py-1 text-xs font-bold"
                  style={{
                    borderColor: cfg.border,
                    background: cfg.bg,
                    color: cfg.color,
                  }}
                >
                  {cfg.icon} {kat} ({count})
                </span>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── İki panel ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── Sol panel ─────────────────────────────────────────────────── */}
        <aside
          className={`flex w-full shrink-0 flex-col bg-white border-r border-slate-200
            md:w-80 lg:w-[340px] xl:w-96
            ${mobileView === "detail" ? "hidden md:flex" : "flex"}`}
        >
          {/* Arama kutusu */}
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Tam metin ara — şifa, mineral, çakra..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm font-medium outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              {rawSearch && (
                <button
                  type="button"
                  onClick={() => { setRawSearch(""); setSearch(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sonuç bilgisi */}
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {searchTerms.length > 0 ? (
                <>
                  <span className="font-black text-emerald-700">{filtered.length} sonuç</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-500">
                    "{search}" araması
                  </span>
                </>
              ) : (
                <span className="text-slate-400">{filtered.length} kayıt</span>
              )}
            </div>
          </div>

          {/* Kategori filtreleri */}
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
            {categories.map((kat) => {
              const isActive = activeKat === kat;
              const cfg = kat === "Tümü" ? null : katConfig(kat);
              return (
                <button
                  key={kat}
                  type="button"
                  onClick={() => setActiveKat(kat)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all"
                  style={
                    isActive
                      ? {
                          background: cfg?.color ?? "#334155",
                          borderColor: cfg?.color ?? "#334155",
                          color: "white",
                        }
                      : {
                          background: cfg?.bg ?? "white",
                          borderColor: cfg?.border ?? "#e2e8f0",
                          color: cfg?.color ?? "#475569",
                        }
                  }
                >
                  {cfg?.icon} {kat}
                  {kat !== "Tümü" && (
                    <span className="ml-1 opacity-60">
                      ({records.filter((r) => r.kategori === kat).length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Makale listesi */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                Yükleniyor...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-1 text-sm text-slate-400">
                <span className="text-xl">🔍</span>
                Kayıt bulunamadı
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((rec) => {
                  const isSelected = rec.id === selectedId;
                  const cfg = katConfig(rec.kategori);
                  const matchCount = matchCounts.get(rec.id) ?? 0;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => selectRecord(rec.id)}
                      className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-start gap-3 rounded-xl px-3 py-3 text-left transition-all
                        ${isSelected
                          ? "shadow-md"
                          : "hover:bg-slate-50"}`}
                      style={isSelected ? { background: cfg.color } : undefined}
                    >
                      {/* İkon */}
                      <span className="mt-0.5 shrink-0 text-base leading-none">
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
                          className={`mt-0.5 flex items-center gap-2 text-[11px] font-semibold ${
                            isSelected ? "text-white/70" : "text-slate-400"
                          }`}
                        >
                          <span>{rec.kategori}</span>
                          {rec.kaynak && (
                            <>
                              <span>·</span>
                              <span>{rec.kaynak.replace(/\.(docx|pdf)$/i, "")}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Eşleşme rozeti */}
                      {matchCount > 0 && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                            isSelected
                              ? "bg-white/25 text-white"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {matchCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── Sağ panel: İçerik ─────────────────────────────────────────── */}
        <div
          className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100
            ${mobileView === "list" ? "hidden md:flex" : "flex"}`}
        >
          {!selectedRecord ? (
            /* Boş durum */
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md rounded-3xl border border-white bg-white px-10 py-12 text-center shadow-md">
                <div className="mb-4 text-5xl">📚</div>
                <h2 className="text-2xl font-black text-slate-900">
                  Taş Bilgi Kütüphanesi
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Sol panelden bir makale seçerek mineroloji, şifa,
                  araştırma ve uygulama bilgilerini okuyabilirsin.
                  Arama motoruyla tam metin içinde arama yapabilirsin.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {Object.entries(KAT_CONFIG).map(([kat, cfg]) => (
                    <span
                      key={kat}
                      className="rounded-full border px-3 py-1 text-xs font-bold"
                      style={{
                        borderColor: cfg.border,
                        background: cfg.bg,
                        color: cfg.color,
                      }}
                    >
                      {cfg.icon} {kat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Detay başlık barı ──────────────────────────────────── */}
              <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Mobil geri */}
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className="mt-0.5 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 md:hidden"
                  >
                    ← Geri
                  </button>

                  <div className="min-w-0 flex-1">
                    {/* Kategori + arama bilgisi */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {(() => {
                        const cfg = katConfig(selectedRecord.kategori);
                        return (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-black"
                            style={{
                              borderColor: cfg.border,
                              background: cfg.bg,
                              color: cfg.color,
                            }}
                          >
                            {cfg.icon} {selectedRecord.kategori}
                          </span>
                        );
                      })()}

                      {searchTerms.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-300 bg-yellow-50 px-2.5 py-0.5 text-xs font-bold text-yellow-800">
                          🔍 Arama: {search}
                          {selectedIcerikMatchCount > 0 && (
                            <span className="rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-black">
                              {selectedIcerikMatchCount} eşleşme
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <h2 className="text-xl font-black leading-snug text-slate-950 sm:text-2xl">
                      {selectedRecord.baslik}
                    </h2>

                    {/* Meta */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedRecord.kaynak && (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          📄 {selectedRecord.kaynak.replace(/\.(docx|pdf)$/i, "")}
                        </span>
                      )}
                      {selectedRecord.kaynak_bolum &&
                        selectedRecord.kaynak_bolum !== selectedRecord.baslik && (
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            § {selectedRecord.kaynak_bolum}
                          </span>
                        )}
                      {selectedRecord.etiketler.map((tag, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700"
                        >
                          #{tag}
                        </span>
                      ))}
                      {selectedRecord.ilgili_taslar.length > 0 && (
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          💎 {selectedRecord.ilgili_taslar.join(", ")}
                        </span>
                      )}
                      {selectedRecord.ilgili_mineraller.length > 0 && (
                        <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          ⚗️ {selectedRecord.ilgili_mineraller.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── İçerik alanı ──────────────────────────────────────── */}
              <div ref={contentRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-12">
                  <article className="rounded-2xl border border-white bg-white px-8 py-9 shadow-sm sm:px-10 lg:px-14">
                    <div
                      className="text-base lg:text-[17px]"
                      style={{ color: "#374151" }}
                    >
                      {renderContent(selectedRecord.icerik, searchTerms)}
                    </div>

                    {/* Alt not */}
                    {selectedRecord.notlar && (
                      <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
                        <span className="font-black">📌 Not: </span>
                        {selectedRecord.notlar}
                      </div>
                    )}
                  </article>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
