"use client";
/**
 * Beslenme — [Kaynaklar] sekmesi. Besin ve konu (topic) için ORTAK.
 * Bağlı kaynakları listeler; mevcut kaynaktan seçerek veya yeni kaynak
 * oluşturarak bağlar; bağlantıyı kaldırır. Kaynaklar OPSİYONELDİR — kaydı
 * kaydetmek asla kaynak gerektirmez.
 *
 * link/unlink işlemleri parent'tan gelir (besin vs konu API'si farklı).
 * listSources/createSource generic olduğu için panel içinde çağrılır.
 */
import { useState } from "react";
import { BookOpen, ExternalLink, Link2, Plus, Search, Trash2, X } from "lucide-react";
import type { Source } from "@/lib/beslenme/beslenmeClient";
import { createSource, listSources } from "@/lib/beslenme/beslenmeClient";
import { SOURCE_TYPE_LABELS, SOURCE_TYPE_OPTIONS, friendlyError } from "./constants";
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
  onLink: (sourceId: string, locator: string | null) => Promise<boolean>;
  onUnlink: (linkId: string) => Promise<boolean>;
};

type Mode = "idle" | "pick" | "create";

export function SourcesPanel({ links, disabledReason, onLink, onUnlink }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [err, setErr] = useState("");

  // Picker durumu
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Source[] | null>(null);
  const [searching, setSearching] = useState(false);

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
      setErr(friendlyError(r.code, r.status));
      setResults([]);
      return;
    }
    setResults(r.data.sources ?? []);
  }

  async function linkExisting(sourceId: string) {
    setBusy(true);
    setErr("");
    const ok = await onLink(sourceId, locator.trim() || null);
    setBusy(false);
    if (ok) resetAll();
    else setErr("Kaynak bağlanamadı. Lütfen tekrar deneyin.");
  }

  async function createAndLink() {
    if (!nTitle.trim()) {
      setErr("Kaynak başlığı zorunludur.");
      return;
    }
    setBusy(true);
    setErr("");
    const yearNum = nYear.trim() ? Number(nYear.trim()) : null;
    const created = await createSource({
      title: nTitle.trim(),
      source_type: nType,
      authors: nAuthors.trim() || null,
      organization: nOrg.trim() || null,
      publication_year: yearNum && Number.isFinite(yearNum) ? yearNum : null,
      url: nUrl.trim() || null,
    });
    if (!created.ok || !created.data?.source?.id) {
      setBusy(false);
      setErr(friendlyError(created.code, created.status));
      return;
    }
    const ok = await onLink(created.data.source.id, locator.trim() || null);
    setBusy(false);
    if (ok) resetAll();
    else setErr("Kaynak oluşturuldu ancak bağlanamadı. Kaynaklardan tekrar deneyin.");
  }

  const disabled = Boolean(disabledReason);

  return (
    <div className="flex flex-col gap-3">
      {disabled ? <StatusMessage type="info">{disabledReason}</StatusMessage> : null}

      {/* Bağlı kaynaklar */}
      {links.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="Bu kayıt için henüz kaynak eklenmemiş."
          description="Bilimsel/geleneksel dayanak eklemek isterseniz kaynak bağlayabilirsiniz. Kaynak eklemek zorunlu değildir."
          action={
            !disabled ? (
              <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setMode("pick")}>
                Kaynak Ekle
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
                  {l.source?.title ?? "Kaynak"}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400">
                  {l.source?.source_type ? (
                    <span>{SOURCE_TYPE_LABELS[l.source.source_type] ?? l.source.source_type}</span>
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
                      <ExternalLink className="h-3 w-3" aria-hidden /> Bağlantı
                    </a>
                  ) : null}
                </p>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => void onUnlink(l.id)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  title="Bağlantıyı kaldır"
                  aria-label="Kaynak bağlantısını kaldır"
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
            Kaynak Ekle
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
                Mevcut Kaynak
              </button>
              <button
                type="button"
                onClick={() => setMode("create")}
                className={`rounded-md px-3 py-1 text-[12px] font-black transition ${
                  mode === "create" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                }`}
              >
                Yeni Kaynak
              </button>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Kapat"
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
            <Field label="Konum / Sayfa (opsiyonel)" hint="Örn: s. 45–48, Bölüm 3">
              <TextInput
                value={locator}
                onChange={(e) => setLocator(e.target.value)}
                placeholder="Sayfa, bölüm veya not"
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
                  placeholder="Kaynak ara (başlık, yazar…)"
                />
                <GhostButton icon={<Search className="h-4 w-4" />} loading={searching} onClick={() => void runSearch()}>
                  Ara
                </GhostButton>
              </div>

              {results === null ? (
                <p className="text-[12px] font-medium text-slate-400">
                  Bağlamak istediğiniz kaynağı bulmak için arama yapın.
                </p>
              ) : results.length === 0 ? (
                <p className="text-[12px] font-medium text-slate-400">
                  Kaynak bulunamadı. &quot;Yeni Kaynak&quot; sekmesinden ekleyebilirsiniz.
                </p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                  {results.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void linkExisting(s.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold text-slate-800">{s.title}</span>
                          <span className="block truncate text-[11px] font-medium text-slate-400">
                            {s.source_type ? SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type : ""}
                            {s.authors ? ` · ${s.authors}` : ""}
                          </span>
                        </span>
                        <Link2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Başlık" required>
                  <TextInput value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="Kaynak başlığı" />
                </Field>
              </div>
              <Field label="Tür">
                <SelectInput value={nType} onChange={(e) => setNType(e.target.value)}>
                  {SOURCE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Yıl">
                <TextInput
                  inputMode="numeric"
                  value={nYear}
                  onChange={(e) => setNYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder="Örn: 2021"
                />
              </Field>
              <Field label="Yazar(lar)">
                <TextInput value={nAuthors} onChange={(e) => setNAuthors(e.target.value)} placeholder="Ad Soyad" />
              </Field>
              <Field label="Kurum">
                <TextInput value={nOrg} onChange={(e) => setNOrg(e.target.value)} placeholder="Yayınevi / kurum" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Bağlantı (URL)">
                  <TextInput value={nUrl} onChange={(e) => setNUrl(e.target.value)} placeholder="https://…" />
                </Field>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <PrimaryButton icon={<Plus className="h-4 w-4" />} loading={busy} onClick={() => void createAndLink()}>
                  Oluştur ve Bağla
                </PrimaryButton>
              </div>
            </div>
          )}

          {mode === "pick" && busy ? <InlineSpinner label="Bağlanıyor…" /> : null}
        </Card>
      ) : null}
    </div>
  );
}
