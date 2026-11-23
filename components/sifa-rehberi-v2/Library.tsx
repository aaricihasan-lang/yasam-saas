"use client";

/**
 * Şifa Rehberi ana ekranı — Owner kararı (23.11): girişte YALNIZ iki modül.
 *  📚 Araştırma Kütüphanem: bütün ana konular, Türkçe alfabetik, yalnız başlık (özet yok).
 *     Arama: başlık + alt başlık + kutu adı/içeriği + görsel açıklaması + kaynak; sonuçta YALNIZ konu başlığı.
 *     "İncelendi" işareti yalnız BU arama süresince bellekte (DB/localStorage/Yaşam Hafızası'na yazılmaz).
 *  ✍️ Yeni Konu Girişi: başlık yaz → konu oluşur → doğrudan düzenleme ekranı.
 */
import { memo, useMemo, useRef, type ReactNode } from "react";
import { Hl } from "@/components/sifa-rehberi-v2/highlight";
import { SharedBadge } from "@/components/sifa-rehberi-v2/scopeUi";
import { foldSearch, initialOf, MIN_QUERY, normalizeQuery } from "@/lib/sifa-rehberi-v2/search";
import type { TopicNode } from "@/lib/sifa-rehberi-v2/types";

export type HomeModule = "kutuphane" | "yeni";

const card = "rounded-[26px] border border-white/80 bg-white/90 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90";

export function ModuleSwitch({ module, onChange, topicCount }: { module: HomeModule; onChange: (m: HomeModule) => void; topicCount: number }) {
  const opts: { id: HomeModule; icon: string; label: string; hint: string }[] = [
    { id: "kutuphane", icon: "📚", label: "Araştırma Kütüphanem", hint: `${topicCount} konu · A'dan Z'ye` },
    { id: "yeni", icon: "✍️", label: "Yeni Konu Girişi", hint: "Yeni bir araştırma başlatın" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Şifa Rehberi" data-testid="module-switch">
      {opts.map((o) => {
        const active = o.id === module;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`modul-${o.id}`}
            aria-selected={active}
            aria-controls={`panel-${o.id}`}
            onClick={() => onChange(o.id)}
            data-testid={`module-${o.id}`}
            className={`flex min-h-[72px] items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition [forced-color-adjust:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              active
                ? "border-transparent bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_14px_32px_rgba(16,185,129,0.28)]"
                : "border-emerald-100 bg-white text-slate-800 hover:border-emerald-200 hover:bg-emerald-50/60"
            }`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px] ${active ? "bg-white/20" : "bg-emerald-50"}`} aria-hidden>
              {o.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-black leading-5 sm:text-[17px]">{o.label}</span>
              <span className={`mt-0.5 block text-[12px] font-semibold ${active ? "text-white/85" : "text-slate-500"}`}>{o.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

type LibraryProps = {
  roots: TopicNode[];
  /** Etkin aramanın sonuçları (null = arama yok). */
  results: TopicNode[] | null;
  input: string;
  onInput: (v: string) => void;
  onClear: () => void;
  /** Etkin (katlanmamış) sorgu metni — durum satırında gösterilir. */
  activeQuery: string;
  reviewed: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onGoNew: () => void;
  trashCount: number;
  onOpenTrash: () => void;
  extra?: ReactNode;
};

export function LibraryPanel(p: LibraryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = normalizeQuery(p.input);
  const searching = p.results !== null;
  const list = p.results ?? p.roots;
  const reviewedCount = searching ? list.filter((n) => p.reviewed.has(n.id)).length : 0;
  const groups = useMemo(() => {
    const out: { letter: string; items: TopicNode[] }[] = [];
    for (const n of list) {
      const l = initialOf(n.title);
      const last = out[out.length - 1];
      if (last && last.letter === l) last.items.push(n);
      else out.push({ letter: l, items: [n] });
    }
    return out;
  }, [list]);
  const showLetters = !searching && p.roots.length > 40;

  return (
    <section id="panel-kutuphane" role="tabpanel" aria-labelledby="modul-kutuphane" className={`${card} mt-3 p-4 sm:p-6 max-md:rounded-2xl max-md:p-3`} data-testid="library">
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
      >
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" aria-hidden>
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={p.input}
          onChange={(e) => p.onInput(e.target.value)}
          placeholder="Başlıklarda ve notlarda ara…"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          className="h-[52px] w-full rounded-2xl border border-emerald-100 bg-white pl-11 pr-12 text-[16px] font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
          aria-label="Araştırma kütüphanesinde ara"
          aria-describedby="kutuphane-durum"
          data-testid="library-search"
        />
        {p.input ? (
          <button
            type="button"
            onClick={() => {
              p.onClear();
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[16px] font-black text-slate-500 hover:bg-slate-100"
            aria-label="Aramayı temizle"
            data-testid="library-search-clear"
          >
            ✕
          </button>
        ) : null}
      </form>

      <div id="kutuphane-durum" className="mt-3 flex min-h-[28px] flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-slate-600" role="status" aria-live="polite" data-testid="library-status">
        {searching ? (
          <>
            <span data-testid="library-result-count">
              “<b className="text-slate-900">{p.activeQuery.trim()}</b>” için <b className="text-slate-900">{list.length}</b> konu bulundu
            </span>
            {list.length ? (
              <span className="text-emerald-700" data-testid="library-reviewed-count">
                · {reviewedCount} incelendi · {list.length - reviewedCount} incelenmedi
              </span>
            ) : null}
          </>
        ) : typed.length > 0 && typed.length < MIN_QUERY ? (
          <span>Aramak için en az {MIN_QUERY} harf yazın.</span>
        ) : (
          <span>
            <b className="text-slate-900">{p.roots.length}</b> konu · A&apos;dan Z&apos;ye
          </span>
        )}
      </div>

      {showLetters ? (
        <nav aria-label="Harfe git" className="mt-2 flex flex-wrap gap-1" data-testid="letter-jump">
          {groups.map((g) => (
            <a
              key={g.letter}
              href={`#harf-${encodeURIComponent(g.letter)}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`harf-${encodeURIComponent(g.letter)}`)?.scrollIntoView({ block: "start" });
              }}
              className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-100 bg-white px-2 text-[12.5px] font-black text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"
            >
              {g.letter}
            </a>
          ))}
        </nav>
      ) : null}

      {!p.roots.length ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-emerald-200 bg-white/70 p-6 text-center" data-testid="library-empty">
          <p className="text-[16px] font-black text-slate-800">Kütüphaneniz henüz boş.</p>
          <p className="mt-1 text-[13.5px] font-medium text-slate-500">İlk araştırma konunuzu oluşturduğunuzda burada alfabetik olarak listelenir.</p>
          <button type="button" onClick={p.onGoNew} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 text-[14px] font-black text-white shadow-sm" data-testid="library-empty-new">
            ✍️ Yeni Konu Girişi
          </button>
        </div>
      ) : searching && !list.length ? (
        <p className="mt-4 rounded-[22px] border border-dashed border-slate-200 bg-white/70 p-5 text-[14px] font-semibold text-slate-500" data-testid="library-no-results">
          “{p.activeQuery.trim()}” için sonuç bulunamadı. Farklı bir kelime deneyin.
        </p>
      ) : (
        <div className="mt-3" data-testid="library-list" data-searching={searching ? "1" : "0"}>
          {groups.map((g) => (
            <LetterGroup key={g.letter} letter={g.letter} items={g.items} searching={searching} reviewed={p.reviewed} onOpen={p.onOpen} />
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={p.onOpenTrash}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-bold text-slate-600 hover:bg-slate-100"
          data-testid="open-trash"
        >
          🗑 Çöp Kutusu{p.trashCount ? ` (${p.trashCount})` : ""}
        </button>
      </div>
      {p.extra}
    </section>
  );
}

const LetterGroup = memo(function LetterGroup({
  letter,
  items,
  searching,
  reviewed,
  onOpen,
}: {
  letter: string;
  items: TopicNode[];
  searching: boolean;
  reviewed: ReadonlySet<string>;
  onOpen: (id: string) => void;
}) {
  return (
    <section id={`harf-${encodeURIComponent(letter)}`} className="scroll-mt-28 [content-visibility:auto] [contain-intrinsic-size:auto_320px]" aria-label={`${letter} harfi`}>
      <h3 className="sticky top-0 z-[1] -mx-1 bg-white/95 px-1 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 backdrop-blur">{letter}</h3>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
        {items.map((n) => {
          const seen = searching && reviewed.has(n.id);
          return (
            <li key={n.id} data-testid="root-card" data-node-id={n.id} data-scope={n.scope ?? "kisisel"}>
              <button
                type="button"
                onClick={() => onOpen(n.id)}
                className={`group flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-emerald-50/70 focus-visible:bg-emerald-50 focus-visible:outline-none ${seen ? "bg-slate-50/70" : ""}`}
                data-testid="library-item"
                data-node-id={n.id}
                data-reviewed={searching ? (seen ? "1" : "0") : undefined}
                aria-label={searching ? `${n.title}${seen ? " — incelendi" : " — incelenmedi"}` : undefined}
              >
                {searching ? (
                  seen ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[12px] font-black text-white [forced-color-adjust:none]" aria-hidden>
                      ✓
                    </span>
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400 ring-4 ring-amber-100" />
                    </span>
                  )
                ) : null}
                <span className={`min-w-0 flex-1 break-words text-[15.5px] font-black leading-6 ${seen ? "text-slate-500" : "text-slate-900"}`} data-testid="library-item-title">
                  <Hl text={n.title} />
                </span>
                {n.scope === "kurum" ? <SharedBadge compact /> : null}
                {searching ? (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${seen ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`} data-testid="library-item-state">
                    {seen ? "İncelendi" : "İncelenmedi"}
                  </span>
                ) : null}
                <span className="shrink-0 text-slate-300 group-hover:text-emerald-600" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export function NewTopicPanel({
  title,
  setTitle,
  withTemplate,
  setWithTemplate,
  roots,
  onCreate,
  onOpenExisting,
}: {
  title: string;
  setTitle: (v: string) => void;
  withTemplate: boolean;
  setWithTemplate: (v: boolean) => void;
  roots: TopicNode[];
  onCreate: () => void;
  onOpenExisting: (id: string) => void;
}) {
  const f = foldSearch(title).trim();
  const same = f ? roots.find((r) => foldSearch(r.title).trim() === f) : undefined;
  return (
    <section id="panel-yeni" role="tabpanel" aria-labelledby="modul-yeni" className={`${card} mt-3 p-4 sm:p-6 max-md:rounded-2xl max-md:p-3`} data-testid="new-topic-panel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onCreate();
        }}
        className="mx-auto max-w-[720px]"
      >
        <label htmlFor="yeni-konu-basligi" className="block text-[13px] font-black uppercase tracking-[0.12em] text-emerald-800">
          Konu başlığı
        </label>
        <input
          id="yeni-konu-basligi"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ör. Şiddetli Öksürük"
          maxLength={200}
          autoComplete="off"
          enterKeyHint="go"
          className="mt-2 h-[56px] w-full rounded-2xl border border-emerald-200 bg-white px-4 text-[18px] font-bold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
          aria-describedby="yeni-konu-ipucu"
          data-testid="new-topic-title"
        />
        <p id="yeni-konu-ipucu" className="mt-2 text-[13px] font-medium text-slate-500">
          Konu oluşturulunca düzenleme ekranı açılır; alt başlık, not kutusu, görsel ve kaynak ekleyebilirsiniz.
        </p>
        {same ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-900 ring-1 ring-amber-200" role="status" data-testid="new-topic-duplicate">
            Kütüphanenizde bu adla bir konu zaten var.{" "}
            <button type="button" className="underline" onClick={() => onOpenExisting(same.id)}>
              Mevcut konuyu aç
            </button>
          </p>
        ) : null}
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-[14px] font-semibold text-slate-700">
          <input type="checkbox" checked={withTemplate} onChange={(e) => setWithTemplate(e.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-600" data-testid="new-topic-template" />
          <span>
            Şifa Rehberi hazır başlıklarıyla başlat <span className="font-medium text-slate-500">(isteğe bağlı)</span>
          </span>
        </label>
        <button
          type="submit"
          disabled={!title.trim()}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 text-[16px] font-black text-white shadow-[0_12px_28px_rgba(16,185,129,0.28)] transition hover:brightness-105 disabled:opacity-40 [forced-color-adjust:none] sm:w-auto"
          data-testid="new-topic-create"
        >
          Konuyu oluştur ve yazmaya başla →
        </button>
      </form>
    </section>
  );
}
