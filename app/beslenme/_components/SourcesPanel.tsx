"use client";
/**
 * Beslenme — [Kaynaklar] sekmesi. Besin ve konu (topic) için ORTAK.
 * Bağlı kaynakları listeler; mevcut kaynaktan seçerek veya yeni kaynak
 * oluşturarak bağlar; bağlantıyı kaldırır. Kaynaklar OPSİYONELDİR — kaydı
 * kaydetmek asla kaynak gerektirmez.
 *
 * link/unlink işlemleri parent'tan gelir (besin vs konu API'si farklı).
 * "Oluştur ve Bağla" TEK istek (new_source): bağ başarısızsa sunucu yeni kaynağı geri siler →
 * boşta (orphan) kaynak kalmaz. Katalogdaki kaynak "Sil" ile kalıcı silinir (arşiv YOK); bir
 * kayda bağlıysa sunucu reddeder ve kullanıcıya nerede kullanıldığı söylenir.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBeslenmeLabels } from "./useBeslenmeLabels";
import { BookOpen, ExternalLink, Link2, Plus, Search, Trash2, X } from "lucide-react";
import type { Source, SourceLinkBody } from "@/lib/beslenme/beslenmeClient";
import { deleteSource, listSources } from "@/lib/beslenme/beslenmeClient";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import {
  Card,
  EmptyState,
  Field,
  GhostButton,
  InlineSpinner,
  PrimaryButton,
  SelectInput,
  StatusMessage,
  TextInput,
} from "./primitives";

export type LinkedSource = { id: string; source: Source | null; locator: string | null };

type Props = {
  links: LinkedSource[];
  /** Kaydedilmemiş yeni kayıt: kaynak eklenemez (önce kaydet). */
  disabledReason?: string;
  onLink: (body: SourceLinkBody) => Promise<boolean>;
  onUnlink: (linkId: string) => Promise<boolean>;
};

type Mode = "idle" | "pick" | "create";

export function SourcesPanel({ links, disabledReason, onLink, onUnlink }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [err, setErr] = useState("");
  const deleteConfirm = useDeleteConfirm();
  const tsr = useTranslations("beslenme.sources");
  const bl = useBeslenmeLabels();

  // Picker durumu
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Source[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkErr, setUnlinkErr] = useState("");

  // Ortak
  const [locator, setLocator] = useState("");
  const [busy, setBusy] = useState(false);

  // Yeni kaynak formu
  const [nTitle, setNTitle] = useState("");
  const [nType, setNType] = useState<string>("book");
  const [nAuthors, setNAuthors] = useState("");
  const [nOrg, setNOrg] = useState("");
  const [nYear, setNYear] = useState("");
  const [nUrl, setNUrl] = useState("");

  function resetAll() {
    setMode("idle");
    setErr("");
    setQ("");
    setResults(null);
    setLocator("");
    setNTitle("");
    setNType("book");
    setNAuthors("");
    setNOrg("");
    setNYear("");
    setNUrl("");
  }

  async function runSearch() {
    setSearching(true);
    setErr("");
    const r = await listSources(q.trim() || undefined);
    setSearching(false);
    if (!r.ok || !r.data) {
      setErr(bl.error(r.code, r.status));
      setResults([]);
      return;
    }
    setResults(r.data.sources ?? []);
  }

  async function linkExisting(sourceId: string) {
    setBusy(true);
    setErr("");
    const ok = await onLink({ source_id: sourceId, locator: locator.trim() || null });
    setBusy(false);
    if (ok) resetAll();
    else setErr(tsr("linkFailed"));
  }

  async function handleUnlink(l: LinkedSource) {
    if (unlinkingId) return;
    const ok = await deleteConfirm({
      title: tsr("unlinkTitle"),
      message: tsr("unlinkMessage"),
      names: [l.source?.title ?? tsr("sourceFallback")],
      confirmText: tsr("unlinkConfirm"),
    });
    if (!ok) return;
    setUnlinkingId(l.id);
    setUnlinkErr("");
    try {
      const done = await onUnlink(l.id);
      if (!done) setUnlinkErr(tsr("unlinkFailed"));
    } finally {
      setUnlinkingId(null);
    }
  }

  /** Katalog kaynağını KALICI sil (onaylı). Bağlı kayıt varsa sunucu 409 + kullanım sayıları. */
  async function removeSource(s: Source) {
    if (deletingId) return;
    const ok = await deleteConfirm({
      title: tsr("deleteTitle"),
      message: tsr("deleteMessage"),
      names: [s.title],
      confirmText: tsr("deleteConfirm"),
    });
    if (!ok) return;
    setDeletingId(s.id);
    setErr("");
    const r = await deleteSource(s.id);
    setDeletingId(null);
    if (r.ok) {
      setResults((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
      return;
    }
    if (r.code === "IN_USE") {
      const u = r.data?.usage;
      const parts: string[] = [];
      if (u?.topics) parts.push(tsr("usageTopics", { count: u.topics }));
      if (u?.foods) parts.push(tsr("usageFoods", { count: u.foods }));
      if (u?.foodValues) parts.push(tsr("usageValues", { count: u.foodValues }));
      setErr(tsr("inUse", { parts: parts.length ? parts.join(", ") : tsr("usageOther") }));
      return;
    }
    setErr(bl.error(r.code, r.status));
  }

  async function createAndLink() {
    if (!nTitle.trim()) {
      setErr(tsr("titleRequired"));
      return;
    }
    setBusy(true);
    setErr("");
    const yearNum = nYear.trim() ? Number(nYear.trim()) : null;
    const ok = await onLink({
      new_source: {
        title: nTitle.trim(),
        source_type: nType,
        authors: nAuthors.trim() || null,
        organization: nOrg.trim() || null,
        publication_year: yearNum && Number.isFinite(yearNum) ? yearNum : null,
        url: nUrl.trim() || null,
      },
      locator: locator.trim() || null,
    });
    setBusy(false);
    if (ok) resetAll();
    else setErr(tsr("createFailed"));
  }

  const disabled = Boolean(disabledReason);

  return (
    <div className="flex flex-col gap-3">
      {disabled ? <StatusMessage type="info">{disabledReason}</StatusMessage> : null}
      {unlinkErr ? <StatusMessage type="error">{unlinkErr}</StatusMessage> : null}

      {/* Bağlı kaynaklar */}
      {links.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title={tsr("emptyTitle")}
          description={tsr("emptyDesc")}
          action={
            !disabled ? (
              <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setMode("pick")}>
                {tsr("addSource")}
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-black text-slate-800">
                  {l.source?.title ?? tsr("sourceFallback")}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400">
                  {l.source?.source_type ? (
                    <span>{bl.sourceType(l.source.source_type)}</span>
                  ) : null}
                  {l.source?.authors ? <span>· {l.source.authors}</span> : null}
                  {l.source?.publication_year ? <span>· {l.source.publication_year}</span> : null}
                  {l.locator ? <span>· {l.locator}</span> : null}
                  {l.source?.url ? (
                    <a
                      href={l.source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden /> {tsr("link")}
                    </a>
                  ) : null}
                </p>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => void handleUnlink(l)}
                  disabled={unlinkingId !== null}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  title={tsr("unlinkBtnTitle")}
                  aria-label={tsr("unlinkTitle")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!disabled && links.length > 0 && mode === "idle" ? (
        <div>
          <GhostButton icon={<Plus className="h-4 w-4" />} onClick={() => setMode("pick")}>
            {tsr("addSource")}
          </GhostButton>
        </div>
      ) : null}

      {/* Ekleme paneli */}
      {!disabled && mode !== "idle" ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode("pick")}
                className={`rounded-md px-3 py-1 text-[12px] font-black transition ${
                  mode === "pick" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                }`}
              >
                {tsr("existingTab")}
              </button>
              <button
                type="button"
                onClick={() => setMode("create")}
                className={`rounded-md px-3 py-1 text-[12px] font-black transition ${
                  mode === "create" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                }`}
              >
                {tsr("newTab")}
              </button>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label={tsr("close")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {err ? (
            <div className="mb-3">
              <StatusMessage type="error">{err}</StatusMessage>
            </div>
          ) : null}

          <div className="mb-3">
            <Field label={tsr("locatorLabel")} hint={tsr("locatorHint")}>
              <TextInput
                value={locator}
                onChange={(e) => setLocator(e.target.value)}
                placeholder={tsr("locatorPlaceholder")}
              />
            </Field>
          </div>

          {mode === "pick" ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <TextInput
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                  placeholder={tsr("searchPlaceholder")}
                />
                <GhostButton icon={<Search className="h-4 w-4" />} loading={searching} onClick={() => void runSearch()}>
                  {tsr("search")}
                </GhostButton>
              </div>

              {results === null ? (
                <p className="text-[12px] font-medium text-slate-400">
                  {tsr("searchHint")}
                </p>
              ) : results.length === 0 ? (
                <p className="text-[12px] font-medium text-slate-400">
                  {tsr("noResults")}
                </p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                  {results.map((s) => (
                    <li key={s.id} className="rounded-xl border border-slate-100 bg-white">
                      <div className="flex items-center gap-1 px-1.5 py-1">
                        <button
                          type="button"
                          disabled={busy || deletingId === s.id}
                          onClick={() => void linkExisting(s.id)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-emerald-50 disabled:opacity-60"
                          title={tsr("linkThis")}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-bold text-slate-800">{s.title}</span>
                            <span className="block truncate text-[11px] font-medium text-slate-400">
                              {s.source_type ? bl.sourceType(s.source_type) : ""}
                              {s.authors ? ` · ${s.authors}` : ""}
                            </span>
                          </span>
                          <Link2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={busy || deletingId === s.id}
                          onClick={() => void removeSource(s)}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
                          title={tsr("deleteFromCatalog")}
                          aria-label={tsr("deleteFromCatalog")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={tsr("titleLabel")} required>
                  <TextInput value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder={tsr("titlePlaceholder")} />
                </Field>
              </div>
              <Field label={tsr("typeLabel")}>
                <SelectInput value={nType} onChange={(e) => setNType(e.target.value)}>
                  {bl.sourceTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label={tsr("yearLabel")}>
                <TextInput
                  inputMode="numeric"
                  value={nYear}
                  onChange={(e) => setNYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder={tsr("yearPlaceholder")}
                />
              </Field>
              <Field label={tsr("authorsLabel")}>
                <TextInput value={nAuthors} onChange={(e) => setNAuthors(e.target.value)} placeholder={tsr("authorsPlaceholder")} />
              </Field>
              <Field label={tsr("orgLabel")}>
                <TextInput value={nOrg} onChange={(e) => setNOrg(e.target.value)} placeholder={tsr("orgPlaceholder")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={tsr("urlLabel")}>
                  <TextInput value={nUrl} onChange={(e) => setNUrl(e.target.value)} placeholder="https://…" />
                </Field>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <PrimaryButton icon={<Plus className="h-4 w-4" />} loading={busy} onClick={() => void createAndLink()}>
                  {tsr("createAndLink")}
                </PrimaryButton>
              </div>
            </div>
          )}

          {mode === "pick" && busy ? <InlineSpinner label={tsr("linking")} /> : null}
        </Card>
      ) : null}
    </div>
  );
}
