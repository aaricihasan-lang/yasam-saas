"use client";

/**
 * Gökyüzü Atlası — "Açık Analizler" sekme şeridi (Aşama D4).
 *
 * • Tek satır; çok sekmede yatay kaydırma (çok satıra yayılmaz). Etkin sekme belirgin.
 * • × YALNIZ çalışma sekmesini kapatır: kayıtlı analiz, danışan, doğum profili ve sağlayıcı sonucu SİLİNMEZ; istek
 *   oluşturmaz; onay sorulmaz (silme değildir). Kapatılan sonuç bu oturumda bellekte kalır; "+ Teknik Ekle" ile
 *   yeniden açılınca önbellekten (0 yeni istek) gelir.
 * • Hesaplama hataları sekme olarak değil, tek bir "N hesaplama hatası" göstergesinde toplanır.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, RefreshCw, RotateCcw, X } from "lucide-react";

export type OpenTab = { key: string; label: string; title?: string; partial?: boolean; /** Kaydedilmemiş not / KB taslağı var. */ dirty?: boolean };
export type FailedTab = { key: string; technique: string; label: string; error: string; code: string; attempts: number; lastAt: number; note: string | null; options: string; /** Kilidin kalktığı an (ms; sunucunun bildirdiği GERÇEK kalan süreden). */ retryAt?: number | null };

const IN_PROGRESS_NOTE =
  "Çift ücretli istek önleme kilidi: önceki istek sürüyor ya da başarısız olmuş olabilir. Kilit süresi dolmadan yeni istek gönderilmez. “Durumu kontrol et” ücretsizdir (yalnız kayıtlı sonuca bakar).";
const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function OpenTabs({
  tabs,
  active,
  onSelect,
  onClose,
  onAdd,
  fails,
  onRetry,
  onCheck,
  tone = "dark",
}: {
  tabs: OpenTab[];
  active: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onAdd: () => void;
  fails: FailedTab[];
  onRetry: (technique: string) => void;
  /** Ücretsiz durum kontrolü (yalnız önbellek; sağlayıcı çağrılmaz). */
  onCheck?: (failKey: string) => void;
  /** "light": sade aydınlık çalışma masası (Natal) için açık renkli sekmeler. */
  tone?: "dark" | "light";
}) {
  const L = tone === "light";
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [failOpen, setFailOpen] = useState(false);
  const failRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) refs.current[active]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  useEffect(() => {
    if (!failOpen) return;
    const onDown = (e: MouseEvent) => failRef.current && !failRef.current.contains(e.target as Node) && setFailOpen(false);
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setFailOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [failOpen]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Delete") {
      e.preventDefault();
      onClose(tabs[i].key);
      return;
    }
    if (n < 0) return;
    e.preventDefault();
    onSelect(tabs[n].key);
    refs.current[tabs[n].key]?.focus();
  };

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="astro-result-tabs">
      <span className={`hidden shrink-0 text-[10.5px] font-semibold tracking-[0.16em] sm:inline ${L ? "text-slate-500" : "text-[#E6CF9F]/80"}`}>AÇIK ANALİZLER</span>
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-color:rgba(217,181,111,0.35)_transparent] [scrollbar-width:thin]" role="tablist" aria-label="Açık analizler">
        {tabs.length === 0 && <span className={`py-1.5 text-xs ${L ? "text-slate-500" : "text-[#F6F2EA]/50"}`}>Açık analiz yok.</span>}
        {tabs.map((t, i) => {
          const on = t.key === active;
          return (
            <span
              key={t.key}
              className={`inline-flex shrink-0 items-center rounded-xl border text-[13px] transition ${
                L
                  ? on
                    ? "border-[#0B1430] bg-[#0B1430] text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  : on
                    ? "border-[#D9B56F]/60 bg-[linear-gradient(180deg,rgba(52,49,108,0.9),rgba(20,28,64,0.95))] text-[#F6F2EA] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                    : "border-white/10 bg-white/[0.04] text-[#F6F2EA]/75 hover:border-white/25"
              }`}
            >
              <button
                ref={(el) => {
                  refs.current[t.key] = el;
                }}
                type="button"
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                title={t.title}
                onClick={() => onSelect(t.key)}
                onKeyDown={(e) => onKey(e, i)}
                className="max-w-[220px] truncate py-1.5 pl-3 pr-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F]"
                data-tab-key={t.key}
                data-dirty={t.dirty ? "1" : undefined}
              >
                {on && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#D9B56F] align-middle shadow-[0_0_8px_rgba(217,181,111,0.8)]" aria-hidden="true" />}
                {t.label}
                {t.partial ? " · kısmi" : ""}
                {t.dirty && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle" title="Kaydedilmemiş not" aria-label="kaydedilmemiş not" />
                )}
              </button>
              <button type="button" onClick={() => onClose(t.key)} aria-label={`${t.label} sekmesini kapat (kayıt silinmez)`} title="Sekmeyi kapat (kayıt silinmez)" className={`mr-1 rounded-md p-1 ${L ? (on ? "text-white/60 hover:bg-white/15 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700") : "text-[#F6F2EA]/45 hover:bg-white/10 hover:text-[#F6F2EA]"}`} data-tab-close={t.key}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
      </div>
      <button type="button" onClick={onAdd} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] font-medium ${L ? "border-slate-300 bg-white text-slate-800 hover:border-slate-500" : "border-[#E6C887]/55 bg-[#D9B56F]/10 text-[#F6E7C3] hover:bg-[#D9B56F]/20"}`} data-testid="atlas-add-technique-btn">
        <Plus className="h-3.5 w-3.5" /> <span className="whitespace-nowrap">Teknik Ekle</span>
      </button>
      {fails.length > 0 && (
        <div ref={failRef} className="relative shrink-0">
          <button
            type="button"
            aria-expanded={failOpen}
            onClick={() => setFailOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] ${L ? "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300" : "border-white/12 bg-white/[0.04] text-[#F6F2EA]/70 hover:border-rose-300/40 hover:text-[#F6F2EA]"}`}
            data-testid="atlas-fail-indicator"
            title="Başarısız hesaplamalar — başarılı sekmeleri etkilemez"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/80" aria-hidden="true" />
            <span className="whitespace-nowrap">{new Set(fails.map((f) => f.technique)).size} teknikte hata</span>
          </button>
          {failOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-40 max-h-[60svh] w-[min(380px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-white/12 bg-[#120f2c] p-2 text-[#F6F2EA] shadow-[0_24px_48px_-20px_rgba(0,0,0,0.95)]" role="dialog" aria-label="Hesaplama hataları" data-testid="atlas-fail-list">
              <ul className="flex flex-col gap-1.5">
                {[...new Set(fails.map((f) => f.technique))].map((tech) => {
                  const group = fails.filter((f) => f.technique === tech).sort((a, b) => b.lastAt - a.lastAt);
                  const last = group[0];
                  const attempts = group.reduce((n, f) => n + f.attempts, 0);
                  const locked = group.some((f) => f.code === "IN_PROGRESS");
                  return (
                    <li key={tech} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2" data-fail-group={tech}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{last.label}</p>
                        <span className="shrink-0 text-[10.5px] text-[#F6F2EA]/45">
                          {attempts} deneme · son {new Date(last.lastAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {group.map((f) => (
                        <div key={f.key} className="mt-1">
                          {group.length > 1 && f.options && <p className="text-[10.5px] text-[#F6F2EA]/45">{f.options}</p>}
                          <p className="text-xs text-rose-200/90">{f.error}</p>
                          {f.code === "IN_PROGRESS" && (
                            <p className="mt-1 text-[11px] leading-snug text-[#F6F2EA]/60">
                              {IN_PROGRESS_NOTE}
                              {f.retryAt ? ` En erken yeniden deneme: ${hhmmss(f.retryAt)}.` : ""}
                            </p>
                          )}
                          {f.note && <p className="mt-1 text-[11px] text-[#CFF3EC]/80">{f.note}</p>}
                          {onCheck && (
                            <button type="button" onClick={() => onCheck(f.key)} className="mt-1.5 mr-1.5 inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11.5px] text-[#F6F2EA]/85 hover:border-[#86D6CA]/60" data-check={f.key}>
                              <RefreshCw className="h-3 w-3" /> Durumu kontrol et (ücretsiz)
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setFailOpen(false);
                          onRetry(tech);
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11.5px] text-[#F6F2EA]/85 hover:border-[#D9B56F]/60"
                        data-retry={tech}
                        title={locked ? "Kilit süresi dolmadan yeniden deneme yine 'sürüyor' yanıtı alabilir; önce durumu kontrol edin." : undefined}
                      >
                        <RotateCcw className="h-3 w-3" /> Yeniden dene (plan gösterilir)
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
