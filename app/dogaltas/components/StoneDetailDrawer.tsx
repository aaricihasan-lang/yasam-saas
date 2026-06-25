"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getStoneImageUrls,
  type StoneListItemExtended,
} from "@/lib/dogaltas/stonesListFetch";

type StoneDetailDrawerProps = {
  open: boolean;
  stone: StoneListItemExtended | null;
  inStock: boolean;
  inCart: boolean;
  onToggleCart: () => void;
  onClose: () => void;
};

/** assignments JSON'unu güvenli {başlık → satırlar[]} yapısına çevirir. */
function normalizeAssignments(raw: unknown): Record<string, string[][]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string[][]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!Array.isArray(value)) {
      if (typeof value === "string" && value.trim()) result[key] = [[value.trim()]];
      return;
    }
    const rows = value
      .map((row) => {
        if (Array.isArray(row)) {
          return row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
        }
        if (typeof row === "string" && row.trim()) return [row.trim()];
        return [];
      })
      .filter((row) => row.length > 0);
    if (rows.length > 0) result[key] = rows;
  });
  return result;
}

const badgeBase =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black tracking-wide";

function Section({
  title,
  badge,
  tone = "cyan",
  children,
}: {
  title: string;
  badge?: string;
  tone?: "cyan" | "violet" | "emerald" | "rose" | "amber" | "slate";
  children: ReactNode;
}) {
  const toneMap: Record<string, string> = {
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-red-200 bg-red-50 text-red-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {badge && <span className={`${badgeBase} ${toneMap[tone]}`}>{badge}</span>}
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/** Salt-okunur metin bloğu; boşsa render etmez. */
function TextSection({
  title,
  badge,
  tone,
  text,
}: {
  title: string;
  badge: string;
  tone: "cyan" | "violet" | "emerald" | "rose" | "amber" | "slate";
  text: string | null | undefined;
}) {
  if (!text || !text.trim()) return null;
  return (
    <Section title={title} badge={badge} tone={tone}>
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{text}</p>
    </Section>
  );
}

export function StoneDetailDrawer({
  open,
  stone,
  inStock,
  inCart,
  onToggleCart,
  onClose,
}: StoneDetailDrawerProps) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  // ESC kapatma + body scroll kilidi.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (preview) setPreview(null);
      else onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, preview, onClose]);

  // Taş değişince görsel önizlemeyi sıfırla.
  useEffect(() => {
    setPreview(null);
  }, [stone?.id]);

  const images = useMemo(() => getStoneImageUrls(stone?.images), [stone?.images]);
  const assignments = useMemo(
    () => normalizeAssignments(stone?.assignments),
    [stone?.assignments],
  );
  const chakras = useMemo(
    () => (Array.isArray(stone?.chakras) ? stone!.chakras!.filter(Boolean) : []),
    [stone?.chakras],
  );
  const warningTags = useMemo(
    () => (Array.isArray(stone?.warning_tags) ? stone!.warning_tags!.filter(Boolean) : []),
    [stone?.warning_tags],
  );

  if (!open || !stone) return null;

  const usage = [
    ["Feng Shui", stone.feng_shui],
    ["Meditasyon", stone.meditation],
    ["Bakım", stone.care],
    ["Uygulama", stone.application],
  ].filter(([, text]) => Boolean(text && String(text).trim())) as [string, string][];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`${stone.stone_name || "Taş"} detayı`}
    >
      {/* Arka plan */}
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel: mobil tam ekran (bottom sheet hissi), tablet/desktop sağ drawer */}
      <div className="animate-drawer-in relative flex h-full w-full flex-col bg-white shadow-2xl sm:w-[440px] md:w-[480px] lg:w-[520px]">
        {/* Başlık */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[9px] font-black tracking-[0.14em] text-cyan-700">
                💎 TAŞ DETAYI
              </span>
              {inStock ? (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                  Stokta
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Stok yok
                </span>
              )}
            </div>
            <h2 className="truncate text-lg font-black tracking-tight text-slate-950">
              {stone.stone_name || "İsimsiz taş"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-600 transition hover:bg-slate-200"
          >
            ×
          </button>
        </header>

        {/* İçerik */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* Görseller */}
          {images.length > 0 ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPreview(images[0])}
                className="flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-cyan-200 bg-white/70 p-2 shadow-inner"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[0].url}
                  alt={images[0].name}
                  className="max-h-[200px] w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </button>
              {images.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {images.slice(1).map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => setPreview(img)}
                      className="h-14 w-14 overflow-hidden rounded-lg border border-cyan-200 shadow-sm transition hover:scale-[1.04]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-cyan-200 bg-white/70 text-center shadow-inner">
              <div className="px-3 py-2">
                <div className="text-[34px]">💎</div>
                <p className="mt-1 text-[10px] font-bold text-slate-400">
                  Görsel eklenmemiş
                </p>
              </div>
            </div>
          )}

          {/* Kombinasyona Ekle (drawer içi) */}
          <button
            type="button"
            onClick={onToggleCart}
            className={`w-full rounded-xl border-2 px-3 py-2.5 text-sm font-black shadow-sm transition ${
              inCart
                ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                : "border-violet-300 bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            {inCart ? "Sepetten Çıkar" : "+ Kombinasyona Ekle"}
          </button>

          {/* Metin alanları */}
          <TextSection
            title="Kısa Açıklama"
            badge="GENEL BİLGİ"
            tone="cyan"
            text={stone.short_description}
          />
          <TextSection
            title="Genel Taş Açıklaması"
            badge="DETAYLI BİLGİ"
            tone="cyan"
            text={stone.general_info}
          />

          {/* Mineral içeriği + atamalar (Mineraller / Burçlar / Etkili Organlar ...) */}
          {Object.entries(assignments).length > 0 && (
            <Section title="Mineral İçeriği & Atamalar" badge="ATAMA" tone="violet">
              <div className="space-y-1.5">
                {Object.entries(assignments).map(([title, rows]) => (
                  <div key={title} className="rounded-lg bg-slate-50/80 px-2 py-1.5">
                    <p className="text-[11px] font-black text-slate-600">{title}</p>
                    <div className="mt-0.5 space-y-0.5">
                      {rows.map((row, index) => (
                        <p
                          key={`${title}-${index}`}
                          className="text-[11px] leading-4 text-slate-500"
                        >
                          • {row.filter(Boolean).join(" / ")}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Çakralar */}
          {chakras.length > 0 && (
            <Section title="Çakralar" badge="ÇAKRA" tone="violet">
              <div className="flex flex-wrap gap-1.5">
                {chakras.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-black text-violet-700"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Etkiler */}
          <TextSection
            title="Fiziksel Etkiler"
            badge="BEDENSEL ETKİ"
            tone="emerald"
            text={stone.physical_effects}
          />
          <TextSection
            title="Ruhsal Etkiler"
            badge="RUHSAL ETKİ"
            tone="violet"
            text={stone.spiritual_effects}
          />
          <TextSection
            title="Diğer Etkiler"
            badge="TAMAMLAYICI NOT"
            tone="amber"
            text={stone.other_effects}
          />
          <TextSection
            title="Kaynak Notu"
            badge="KAYNAK"
            tone="slate"
            text={stone.source_note}
          />

          {/* Kullanım */}
          {usage.length > 0 && (
            <Section title="Kullanım / Uygulama" badge="KULLANIM ALANI" tone="cyan">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {usage.map(([title, text]) => (
                  <div
                    key={title}
                    className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 shadow-inner"
                  >
                    <p className="text-xs font-black text-slate-950">{title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Uyarılar */}
          {(stone.warning_text?.trim() || warningTags.length > 0) && (
            <Section title="Uyarılar ve Hassasiyetler" badge="KLİNİK NOT" tone="rose">
              {stone.warning_text?.trim() && (
                <p className="whitespace-pre-wrap text-sm leading-6 text-amber-700">
                  ⚠️ {stone.warning_text}
                </p>
              )}
              {warningTags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {warningTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-black text-red-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Stok bilgisi */}
          <Section title="Stok Bilgisi" badge="STOK" tone={inStock ? "emerald" : "slate"}>
            <p className="text-sm font-bold text-slate-700">
              {inStock ? (
                <span className="text-emerald-600">✓ Bu taş stokta mevcut.</span>
              ) : (
                <span className="text-slate-500">Bu taş şu an stokta görünmüyor.</span>
              )}
            </p>
          </Section>
        </div>
      </div>

      {/* Görsel lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-6"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Kapat"
            className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl font-black text-white transition hover:bg-white/20"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={preview.name}
            className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain shadow-[0_35px_90px_rgba(0,0,0,0.55)]"
            loading="lazy"
            decoding="async"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
