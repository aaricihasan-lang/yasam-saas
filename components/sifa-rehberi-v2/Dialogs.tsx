"use client";

/** Taşıma, konu bağlama, kaynak ekleme ve Çöp Kutusu pencereleri (prototip). */
import { useMemo, useState } from "react";
import { foldTr } from "@/lib/sifa-rehberi/normalizeTr";
import { Modal, btnGhost, btnPrimary, inputBase } from "@/components/sifa-rehberi-v2/Modal";
import { childrenOf, pathOf, subtreeIds, trashEntries, type TrashEntry } from "@/lib/sifa-rehberi-v2/tree";
import { isSafeHref, normalizeDoi } from "@/lib/sifa-rehberi-v2/contentSafety";
import { TEMPLATE_ENTRIES } from "@/lib/sifa-rehberi-v2/template";
import { TRASH_RETENTION_DAYS, type SourceRef, type TopicNode, type Workspace } from "@/lib/sifa-rehberi-v2/types";

/** Ağacı düz listeye çevirir (girintili seçim listesi için). */
function flatten(ws: Workspace): { node: TopicNode; depth: number }[] {
  const out: { node: TopicNode; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of childrenOf(ws, parent)) {
      out.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function NodePickList({
  ws,
  exclude,
  onPick,
  rootOption,
}: {
  ws: Workspace;
  exclude: ReadonlySet<string>;
  onPick: (id: string | null) => void;
  rootOption?: string;
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => flatten(ws), [ws]);
  const fq = foldTr(q);
  const visible = rows.filter((r) => !fq || foldTr(r.node.title).includes(fq));
  return (
    <div>
      <input className={inputBase} placeholder="Başlık ara…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="pick-search" />
      <ul className="mt-3 max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {rootOption && !fq ? (
          <li>
            <button type="button" onClick={() => onPick(null)} className="flex min-h-[44px] w-full items-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 px-3 text-left text-[13px] font-black text-emerald-800" data-testid="pick-root">
              ⤒ {rootOption}
            </button>
          </li>
        ) : null}
        {visible.map(({ node, depth }) => {
          const disabled = exclude.has(node.id);
          return (
            <li key={node.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(node.id)}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 text-left text-[13px] font-bold text-slate-800 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                style={{ paddingLeft: 12 + Math.min(depth, 8) * 14 }}
                data-testid="pick-node"
                data-node-id={node.id}
              >
                <span className="min-w-0 flex-1 truncate">{node.title}</span>
                {fq ? <span className="truncate text-[11px] font-semibold text-slate-400">{pathOf(ws, node.id).slice(0, -1).map((p) => p.title).join(" › ")}</span> : null}
              </button>
            </li>
          );
        })}
        {!visible.length ? <li className="p-3 text-[13px] font-semibold text-slate-400">Sonuç yok.</li> : null}
      </ul>
    </div>
  );
}

/**
 * Yeni konu: iki kolay seçenek. Şablon ZORUNLU DEĞİL (varsayılan Boş Konu); sonradan da eklenebilir.
 * Şablon önizlemesi production başlıklarından (TEMPLATE_ENTRIES) üretilir.
 */
export function NewTopicDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (title: string, withTemplate: boolean) => string | null | void }) {
  const [title, setTitle] = useState("");
  const [withTemplate, setWithTemplate] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!title.trim()) return setError("Konu adı boş bırakılamaz.");
    const err = onSubmit(title, withTemplate);
    if (err) setError(err);
  };
  const card = (active: boolean) =>
    `flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
      active ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-200" : "border-slate-200 bg-white hover:border-emerald-200"
    }`;
  const groups = TEMPLATE_ENTRIES.filter((e) => !e.parentKey);
  return (
    <Modal
      title="Yeni konu"
      subtitle="Yalnız bir ad yeterli. Kategori, organ veya klasör seçmeniz gerekmez."
      onClose={onCancel}
      wide
      testId="new-topic-dialog"
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onCancel}>Vazgeç</button>
          <button type="button" className={btnPrimary} onClick={submit} data-testid="newtopic-submit">
            {withTemplate ? "Şablonla oluştur" : "Konuyu oluştur"}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">Konu adı</span>
        <input
          className={inputBase}
          value={title}
          maxLength={200}
          placeholder="Ör. Şiddetli Öksürük, Akciğer, Migren…"
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          data-testid="newtopic-input"
        />
      </label>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Başlangıç">
        <button type="button" role="radio" aria-checked={!withTemplate} className={card(!withTemplate)} onClick={() => setWithTemplate(false)} data-testid="mode-bos">
          <span className="text-xl" aria-hidden>📄</span>
          <span>
            <span className="block text-[14px] font-black text-slate-900">Boş Konu</span>
            <span className="block text-[12px] font-semibold leading-5 text-slate-500">Yalnız adla başlayın; not ve başlıkları siz ekleyin.</span>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={withTemplate} className={card(withTemplate)} onClick={() => setWithTemplate(true)} data-testid="mode-sablon">
          <span className="text-xl" aria-hidden>📋</span>
          <span>
            <span className="block text-[14px] font-black text-slate-900">Şifa Rehberi Şablonuyla Başla</span>
            <span className="block text-[12px] font-semibold leading-5 text-slate-500">
              Şifa Rehberi&apos;nin {TEMPLATE_ENTRIES.length} hazır başlığı eklenir; her birinin altına istediğiniz kadar başlık açabilirsiniz.
            </span>
          </span>
        </button>
      </div>
      <button type="button" className="mt-3 text-[12px] font-bold text-emerald-800 underline" onClick={() => setPreview((v) => !v)} data-testid="template-preview-toggle">
        {preview ? "Şablon önizlemesini gizle" : "Şablonda hangi başlıklar var?"}
      </button>
      {preview ? (
        <ul className="mt-2 max-h-[34vh] space-y-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-3 text-[12.5px]" data-testid="template-preview">
          {groups.map((g) => (
            <li key={g.key}>
              <span className="font-black text-slate-800">{g.icon} {g.label}</span>
              {TEMPLATE_ENTRIES.some((e) => e.parentKey === g.key) ? (
                <ul className="mb-1 ml-5 mt-0.5 space-y-0.5 text-slate-600">
                  {TEMPLATE_ENTRIES.filter((e) => e.parentKey === g.key).map((e) => (
                    <li key={e.key}>{e.icon} {e.label}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[11.5px] font-semibold text-slate-500">Şablonu sonradan da ekleyebilirsiniz (konu ekranında “Şifa Rehberi Şablonunu Ekle”).</p>
      {error ? <p className="mt-2 text-[13px] font-bold text-rose-600" role="alert">{error}</p> : null}
    </Modal>
  );
}

export function MoveDialog({ ws, node, onCancel, onMove }: { ws: Workspace; node: TopicNode; onCancel: () => void; onMove: (parentId: string | null) => void }) {
  const exclude = useMemo(() => {
    const s = new Set(subtreeIds(ws, node.id));
    if (node.parentId) s.add(node.parentId);
    return s;
  }, [ws, node]);
  return (
    <Modal
      title={`“${node.title}” başlığını taşı`}
      subtitle="Yeni üst başlığı seçin. Alt başlıkları ve içerik kutuları birlikte taşınır. Kendi alt başlıkları seçilemez (soluk görünür)."
      onClose={onCancel}
      wide
      testId="move-dialog"
      footer={<button type="button" className={btnGhost} onClick={onCancel}>Vazgeç</button>}
    >
      <NodePickList ws={ws} exclude={exclude} onPick={onMove} rootOption={node.parentId ? "En üst seviyeye taşı (ana konu yap)" : undefined} />
    </Modal>
  );
}

export function LinkDialog({
  ws,
  node,
  onCancel,
  onLink,
  title = "İlgili konu bağla",
  subtitle = "İçerik kopyalanmaz: bağlantı aynı kaydı açar. Yalnız kendi konularınız listelenir.",
  extraExclude,
}: {
  ws: Workspace;
  node: TopicNode;
  onCancel: () => void;
  onLink: (toId: string) => void;
  title?: string;
  subtitle?: string;
  /** Seçilemeyecek ek kayıtlar (ör. İlişkili Rahatsızlıklar'da aslı zaten bu bölümde olanlar). */
  extraExclude?: ReadonlySet<string>;
}) {
  const exclude = useMemo(() => {
    const s = new Set<string>([node.id, ...(extraExclude ?? [])]);
    for (const l of ws.links) if (l.fromNodeId === node.id) s.add(l.toNodeId);
    return s;
  }, [ws, node, extraExclude]);
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      wide
      testId="link-dialog"
      footer={<button type="button" className={btnGhost} onClick={onCancel}>Vazgeç</button>}
    >
      <NodePickList ws={ws} exclude={exclude} onPick={(id) => id && onLink(id)} />
    </Modal>
  );
}

const SOURCE_KINDS: { id: SourceRef["kind"]; label: string }[] = [
  { id: "makale", label: "Makale" },
  { id: "kitap", label: "Kitap" },
  { id: "web", label: "Web kaynağı" },
  { id: "geleneksel", label: "Geleneksel kaynak" },
  { id: "diger", label: "Diğer" },
];
export const sourceKindLabel = (k: SourceRef["kind"]) => SOURCE_KINDS.find((x) => x.id === k)?.label ?? "Kaynak";

export function SourceDialog({ onCancel, onAdd, newId }: { onCancel: () => void; onAdd: (s: SourceRef) => void; newId: () => string }) {
  const [f, setF] = useState({ kind: "makale" as SourceRef["kind"], title: "", authors: "", year: "", doi: "", url: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setError(null);
  };
  const submit = () => {
    if (!f.title.trim()) return setError("Kaynak başlığı gerekli.");
    let doi: string | undefined;
    if (f.doi.trim()) {
      const d = normalizeDoi(f.doi);
      if (!d) return setError("DOI biçimi geçersiz (ör. 10.1234/abcd.5678).");
      doi = d;
    }
    let url: string | undefined;
    if (f.url.trim()) {
      const u = /^[a-z]+:/i.test(f.url.trim()) ? f.url.trim() : `https://${f.url.trim()}`;
      if (!isSafeHref(u)) return setError("Bağlantı yalnız http/https olabilir.");
      url = u;
    }
    onAdd({
      id: newId(),
      kind: f.kind,
      title: f.title.trim(),
      authors: f.authors.trim() || undefined,
      year: f.year.trim() || undefined,
      doi,
      url,
    });
  };
  const lbl = "mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700";
  return (
    <Modal
      title="Kaynak ekle"
      subtitle="Akademik makale (DOI), kitap, web veya geleneksel kaynak. Başlık dışındaki alanlar isteğe bağlıdır."
      onClose={onCancel}
      wide
      testId="source-dialog"
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onCancel}>Vazgeç</button>
          <button type="button" className={btnPrimary} onClick={submit} data-testid="source-submit">Kaynağı ekle</button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={lbl}>Tür</span>
          <select className={inputBase} value={f.kind} onChange={set("kind")}>
            {SOURCE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>Başlık *</span>
          <input className={inputBase} value={f.title} onChange={set("title")} data-testid="source-title" />
        </label>
        <label className="block">
          <span className={lbl}>Yazar(lar)</span>
          <input className={inputBase} value={f.authors} onChange={set("authors")} />
        </label>
        <label className="block">
          <span className={lbl}>Yıl</span>
          <input className={inputBase} value={f.year} onChange={set("year")} inputMode="numeric" maxLength={9} />
        </label>
        <label className="block">
          <span className={lbl}>DOI</span>
          <input className={inputBase} value={f.doi} onChange={set("doi")} placeholder="10.xxxx/…" data-testid="source-doi" />
        </label>
        <label className="block">
          <span className={lbl}>Bağlantı</span>
          <input className={inputBase} value={f.url} onChange={set("url")} placeholder="https://…" />
        </label>
      </div>
      {error ? <p className="mt-3 text-[13px] font-bold text-rose-600" role="alert">{error}</p> : null}
    </Modal>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function TrashDialog({ ws, onCancel, onRestore }: { ws: Workspace; onCancel: () => void; onRestore: (e: TrashEntry) => void }) {
  const entries = trashEntries(ws);
  return (
    <Modal
      title="Çöp Kutusu"
      subtitle={`Silinen konular ve kutular burada ${TRASH_RETENTION_DAYS} gün saklanır (tasarım değeri; prototipte kalıcı temizlik yok). Geri yüklenen kayıt eski yerine döner; eski yer yoksa en üst seviyeye gelir.`}
      onClose={onCancel}
      wide
      testId="trash-dialog"
      footer={<button type="button" className={btnGhost} onClick={onCancel}>Kapat</button>}
    >
      {!entries.length ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-[13px] font-semibold text-slate-500">Çöp kutusu boş.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.batchId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm" data-testid="trash-entry">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-black text-slate-900">
                  {e.kind === "konu" ? "📁" : "🗒"} {e.title}
                </p>
                <p className="text-[12px] font-semibold text-slate-500">
                  {e.kind === "konu" ? `${e.nodeCount} başlık · ${e.blockCount} kutu` : "İçerik kutusu"}
                  {e.originPath ? ` · ${e.originPath}` : e.kind === "konu" ? " · ana konu" : ""} · {fmtDate(e.deletedAt)}
                </p>
              </div>
              <button type="button" className={btnPrimary} onClick={() => onRestore(e)} data-testid="trash-restore">
                Geri Yükle
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
