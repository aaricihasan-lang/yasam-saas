"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_LIBRARY_TENANT_ID,
  getSyncedTenantId,
} from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

// ─── Section tanımları (masaüstü uygulamayla birebir) ─────────────────────────

const SECTIONS = [
  { key: "general_info",      label: "Genel Bilgiler",   icon: "📋", color: "#059669" },
  { key: "physical_effects",  label: "Fiziksel Etkiler",  icon: "💪", color: "#2563eb" },
  { key: "spiritual_effects", label: "Ruhsal Etkiler",    icon: "✨", color: "#7c3aed" },
  { key: "other_effects",     label: "Diğer Etkiler",     icon: "🔮", color: "#4f46e5" },
  { key: "assignments",       label: "Atamalar",           icon: "🎯", color: "#d97706" },
  { key: "warning_text",      label: "Uyarılar",           icon: "⚠️", color: "#dc2626" },
  { key: "application",       label: "Uygulama",           icon: "🖐️", color: "#0891b2" },
  { key: "feng_shui",         label: "Feng Shui",          icon: "☯️", color: "#0d9488" },
  { key: "meditation",        label: "Meditasyon",         icon: "🧘", color: "#9333ea" },
  { key: "care",              label: "Bakım",              icon: "🛁", color: "#475569" },
  { key: "images",            label: "Görseller",          icon: "🖼️", color: "#db2777" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

// ─── Tipler ────────────────────────────────────────────────────────────────────

type StoneListItem = {
  id: string;
  stone_name: string;
  chakras: string[] | null;
  short_description: string | null;
  images: unknown;
};

type StoneDetail = {
  id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  assignments: Record<string, string[][]> | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  chakras: string[] | null;
  source_note: string | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function trSort(a: string, b: string) {
  return normalizeTr(a).localeCompare(normalizeTr(b), "tr");
}

function firstLetter(name: string): string {
  const ch = normalizeTr(name).charAt(0).toUpperCase();
  return ch || "#";
}

function getFirstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (!first || typeof first !== "object") return null;
  const url = (first as Record<string, unknown>).url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function getImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const result: string[] = [];
  for (const img of images) {
    if (img && typeof img === "object") {
      const url = (img as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) result.push(url.trim());
    }
  }
  return result;
}

function sectionHasContent(stone: StoneDetail | null, key: SectionKey): boolean {
  if (!stone) return false;
  if (key === "images") {
    return Array.isArray(stone.images) && stone.images.length > 0;
  }
  if (key === "assignments") {
    return !!stone.assignments && Object.keys(stone.assignments).length > 0;
  }
  const val = (stone as Record<string, unknown>)[key];
  return typeof val === "string" && val.trim().length > 0;
}

function assignmentSectionColor(key: string): string {
  const k = normalizeTr(key);
  if (k.includes("cakra") || k.includes("chakra")) return "#7c3aed";
  if (k.includes("burc") || k.includes("astrol")) return "#d97706";
  if (k.includes("mineral")) return "#059669";
  if (k.includes("organ")) return "#dc2626";
  if (k.includes("element")) return "#0891b2";
  if (k.includes("mizac")) return "#9333ea";
  return "#475569";
}

// ─── Ana sayfa bileşeni ───────────────────────────────────────────────────────

export default function TasBilgiKutuphanesiPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [stones, setStones] = useState<StoneListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoneDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("general_info");
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void loadStonesList(tenantId);
  }, [tenantId]);

  async function loadStonesList(tid: string) {
    setListLoading(true);
    const ids = tid === ADMIN_LIBRARY_TENANT_ID ? [tid] : [tid, ADMIN_LIBRARY_TENANT_ID];
    const { data, error } = await supabase
      .from("stones")
      .select("id, stone_name, chakras, short_description, images")
      .in("tenant_id", ids)
      .order("stone_name", { ascending: true });

    if (!error && data) {
      const sorted = [...(data as StoneListItem[])].sort((a, b) =>
        trSort(a.stone_name, b.stone_name)
      );
      setStones(sorted);
    }
    setListLoading(false);
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    const { data, error } = await supabase
      .from("stones")
      .select(
        "id, stone_name, short_description, general_info, physical_effects, spiritual_effects, other_effects, feng_shui, meditation, care, application, assignments, warning_text, warning_tags, chakras, source_note, images"
      )
      .eq("id", id)
      .single();

    if (!error && data) {
      setDetail(data as StoneDetail);
      // İlk dolu sekmeyi seç
      const d = data as StoneDetail;
      const firstFilled = SECTIONS.find((s) => sectionHasContent(d, s.key));
      setActiveSection(firstFilled?.key ?? "general_info");
    }
    setDetailLoading(false);
  }

  function selectStone(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    void loadDetail(id);
    contentRef.current?.scrollTo({ top: 0 });
  }

  function handleBack() {
    setMobileView("list");
  }

  // ─── Filtrelenmiş ve gruplanmış liste ───────────────────────────────────────

  const filteredStones = useMemo(() => {
    if (!search.trim()) return stones;
    const q = normalizeTr(search);
    return stones.filter((s) => normalizeTr(s.stone_name).includes(q));
  }, [stones, search]);

  const groupedStones = useMemo(() => {
    const groups: Record<string, StoneListItem[]> = {};
    for (const stone of filteredStones) {
      const letter = firstLetter(stone.stone_name);
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(stone);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "tr"));
  }, [filteredStones]);

  const letters = useMemo(() => groupedStones.map(([l]) => l), [groupedStones]);

  // ─── Aktif sekme içeriği ─────────────────────────────────────────────────────

  const activeConfig = SECTIONS.find((s) => s.key === activeSection);

  function renderSectionContent() {
    if (!detail) return null;

    if (activeSection === "images") {
      const urls = getImageUrls(detail.images);
      if (urls.length === 0) {
        return <EmptySection label="Bu taş için görsel eklenmemiş." />;
      }
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <img src={url} alt={`${detail.stone_name} görsel ${i + 1}`}
                className="h-32 w-full object-cover transition group-hover:scale-105" />
            </a>
          ))}
        </div>
      );
    }

    if (activeSection === "assignments") {
      const asgn = detail.assignments;
      if (!asgn || Object.keys(asgn).length === 0) {
        return <EmptySection label="Bu taş için atama bilgisi girilmemiş." />;
      }
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(asgn).map(([title, rows]) => {
            const values = rows
              .map((r) => (Array.isArray(r) ? r.join(" — ") : String(r)).trim())
              .filter(Boolean);
            if (values.length === 0) return null;
            const color = assignmentSectionColor(title);
            return (
              <div key={title} className="rounded-2xl border bg-white p-4 shadow-sm"
                style={{ borderColor: `${color}30` }}>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs font-black uppercase tracking-wide" style={{ color }}>
                    {title}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((v, i) => (
                    <span key={i} className="rounded-full border px-2.5 py-1 text-xs font-semibold text-slate-700"
                      style={{ borderColor: `${color}40`, background: `${color}10` }}>
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (activeSection === "warning_text") {
      const text = detail.warning_text;
      const tags = detail.warning_tags ?? [];
      if (!text && tags.length === 0) {
        return (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            <span>✅</span> Bu taş için özel uyarı bilgisi girilmemiş.
          </div>
        );
      }
      return (
        <div className="space-y-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <span key={i} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
                  ⚠️ {tag}
                </span>
              ))}
            </div>
          )}
          {text && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm leading-relaxed text-rose-900">
              {formatStoneContent(text, { fontSizePx: 14 })}
            </div>
          )}
        </div>
      );
    }

    // Normal metin alanları
    const text = (detail as Record<string, unknown>)[activeSection];
    if (!text || typeof text !== "string" || !text.trim()) {
      return <EmptySection label="Bu bölüm için içerik girilmemiş." />;
    }

    return (
      <div className="leading-relaxed text-slate-800" style={{ fontSize: 14 }}>
        {formatStoneContent(text, { fontSizePx: 14 })}
      </div>
    );
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-[#f0f9f4] via-[#f5f0ff] to-[#fff0fb] text-slate-950">
      {/* Header */}
      <header className="border-b border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-0.5 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-emerald-700">
              Doğaltaş
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Taş Bilgi Kütüphanesi
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {listLoading ? "Taşlar yükleniyor..." : `${stones.length} taş — alfabetik kütüphane`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SECTIONS.slice(0, 4).map((s) => (
              <span key={s.key} className="hidden rounded-full border px-2.5 py-1 text-xs font-bold xl:inline-flex"
                style={{ borderColor: `${s.color}40`, background: `${s.color}12`, color: s.color }}>
                {s.icon} {s.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Ana içerik: 3 panel */}
      <div className="flex h-[calc(100vh-68px)] overflow-hidden">

        {/* ── Sol panel: Taş listesi ─────────────────────────────────────────── */}
        <aside className={`flex w-full flex-col border-r border-slate-200/70 bg-white/60 backdrop-blur-sm
          md:w-64 md:flex-shrink-0 lg:w-72
          ${mobileView === "detail" ? "hidden md:flex" : "flex"}`}>

          {/* Arama */}
          <div className="p-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Taş adı ara..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* Harf navigasyonu */}
          {!search && letters.length > 0 && (
            <div className="flex flex-wrap gap-0.5 px-3 pb-2">
              {letters.map((letter) => (
                <button key={letter} type="button"
                  onClick={() => {
                    document.getElementById(`letter-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="rounded-md px-1.5 py-0.5 text-xs font-black text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700">
                  {letter}
                </button>
              ))}
            </div>
          )}

          {/* Taş listesi */}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {listLoading ? (
              <div className="py-8 text-center text-sm font-medium text-slate-400">
                Kütüphane yükleniyor...
              </div>
            ) : groupedStones.length === 0 ? (
              <div className="py-8 text-center text-sm font-medium text-slate-400">
                Taş bulunamadı.
              </div>
            ) : (
              groupedStones.map(([letter, group]) => (
                <div key={letter} id={`letter-${letter}`}>
                  <div className="sticky top-0 z-10 mb-1 mt-3 bg-white/80 px-2 py-0.5 backdrop-blur-sm">
                    <span className="text-xs font-black uppercase text-emerald-700">{letter}</span>
                  </div>
                  {group.map((stone) => {
                    const isSelected = stone.id === selectedId;
                    const thumb = getFirstImageUrl(stone.images);
                    return (
                      <button
                        key={stone.id}
                        type="button"
                        onClick={() => selectStone(stone.id)}
                        className={`mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-all
                          ${isSelected
                            ? "bg-emerald-600 text-white shadow-md"
                            : "text-slate-800 hover:bg-emerald-50"}`}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base
                            ${isSelected ? "bg-white/20" : "bg-slate-100"}`}>
                            💎
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm font-bold ${isSelected ? "text-white" : "text-slate-900"}`}>
                            {stone.stone_name}
                          </div>
                          {stone.chakras && stone.chakras.length > 0 && (
                            <div className="mt-0.5 truncate text-[10px] font-semibold opacity-70">
                              {stone.chakras.slice(0, 2).join(" · ")}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Sağ taraf: Section nav + içerik ──────────────────────────────────── */}
        <div className={`flex flex-1 overflow-hidden
          ${mobileView === "list" ? "hidden md:flex" : "flex"}`}>

          {/* Seçim yapılmamışsa boş durum */}
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
                <div className="mb-4 text-5xl">💎</div>
                <h2 className="text-xl font-black text-slate-900">Taş Bilgi Kütüphanesi</h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Sol panelden bir taş seçerek o taşa ait genel bilgiler, fiziksel ve ruhsal etkiler,
                  atamalar ve bakım notlarını inceleyebilirsin.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SECTIONS.slice(0, 6).map((s) => (
                    <span key={s.key} className="rounded-full border px-2.5 py-1 text-xs font-bold"
                      style={{ borderColor: `${s.color}40`, background: `${s.color}12`, color: s.color }}>
                      {s.icon} {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Section nav (masaüstü sol nav gibi) ── */}
              <nav className="hidden w-44 shrink-0 flex-col border-r border-slate-200/70 bg-white/50 backdrop-blur-sm lg:flex xl:w-52">
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">Bölümler</span>
                </div>
                <div className="flex-1 overflow-y-auto py-1.5">
                  {SECTIONS.map((section) => {
                    const isActive = activeSection === section.key;
                    const hasContent = sectionHasContent(detail, section.key);
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setActiveSection(section.key)}
                        className={`mx-1.5 mb-0.5 flex w-[calc(100%-12px)] items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold transition-all
                          ${isActive
                            ? "shadow-sm text-white"
                            : hasContent
                              ? "text-slate-700 hover:bg-slate-50"
                              : "text-slate-400 opacity-60 hover:bg-slate-50"}`}
                        style={isActive ? { background: section.color } : undefined}
                      >
                        <span>{section.icon}</span>
                        <span className="truncate">{section.label}</span>
                        {!hasContent && !isActive && (
                          <span className="ml-auto text-[9px] opacity-50">—</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>

              {/* ── İçerik alanı ── */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* İçerik header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-white/70 px-4 py-2.5 backdrop-blur-sm">
                  {/* Mobile: geri butonu */}
                  <button type="button" onClick={handleBack}
                    className="mr-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 md:hidden">
                    ← Listeye Dön
                  </button>

                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {detail && (
                      <>
                        <div className="min-w-0">
                          <div className="truncate text-base font-black text-slate-950">
                            {detail.stone_name}
                          </div>
                          {detail.short_description && (
                            <div className="truncate text-xs text-slate-500">
                              {detail.short_description}
                            </div>
                          )}
                        </div>
                        {detail.chakras && detail.chakras.length > 0 && (
                          <div className="hidden flex-wrap gap-1 xl:flex">
                            {detail.chakras.slice(0, 3).map((c, i) => (
                              <span key={i} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Aktif bölüm göstergesi */}
                  {activeConfig && (
                    <div className="ml-3 flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
                      style={{ borderColor: `${activeConfig.color}40`, background: `${activeConfig.color}12`, color: activeConfig.color }}>
                      <span>{activeConfig.icon}</span>
                      <span className="hidden sm:inline">{activeConfig.label}</span>
                    </div>
                  )}
                </div>

                {/* Mobile section nav (yatay scroll) */}
                <div className="flex overflow-x-auto border-b border-slate-100 bg-white/60 px-2 py-1.5 lg:hidden">
                  {SECTIONS.map((section) => {
                    const isActive = activeSection === section.key;
                    const hasContent = sectionHasContent(detail, section.key);
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setActiveSection(section.key)}
                        className={`mr-1 flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap
                          ${isActive ? "text-white shadow-sm" : hasContent ? "text-slate-600 hover:bg-slate-50" : "text-slate-300"}`}
                        style={isActive ? { background: section.color } : undefined}
                      >
                        <span>{section.icon}</span>
                        <span>{section.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* İçerik */}
                <div ref={contentRef} className="flex-1 overflow-y-auto">
                  {detailLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <div className="mb-3 text-3xl">⏳</div>
                        <div className="text-sm font-semibold text-slate-500">Taş bilgileri yükleniyor...</div>
                      </div>
                    </div>
                  ) : detail ? (
                    <div className="p-4 sm:p-6">
                      {/* Kaynak notu */}
                      {detail.source_note && activeSection === "general_info" && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
                          <span className="mt-0.5 shrink-0">📚</span>
                          <span>{detail.source_note}</span>
                        </div>
                      )}

                      {renderSectionContent()}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────

function EmptySection({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
      <div className="mb-2 text-2xl opacity-40">📭</div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}
