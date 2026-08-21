"use client";

import { useEffect, useState } from "react";
import { kupaBtnDanger, kupaBtnGhost, kupaBtnPrimary, kupaCard, kupaInput } from "./KupaShell";

/**
 * KUPA & HACAMAT — generic içerik CRUD yöneticisi (liste + form). Nokta/teknik/bilgi/
 * güvenlik sayfaları bunu kullanır (tek tasarım dili, tekrar yok). Tüm yazma server
 * route'larına gider (service-role + tenant-forced); demo hesapta persist=0.
 */

export type FieldType = "text" | "textarea" | "number" | "select" | "tags" | "boolean";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  full?: boolean;
};

type Rec = { id: string } & Record<string, unknown>;

type CrudManagerProps<T extends Rec> = {
  titleKey: keyof T & string;
  subtitleKey?: keyof T & string;
  fields: FieldDef[];
  load: () => Promise<T[]>;
  create: (body: Partial<T>) => Promise<T>;
  update: (id: string, body: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<number>;
  emptyLabel: string;
  addLabel: string;
};

function toFormValue(v: unknown, type: FieldType): string | boolean {
  if (type === "boolean") return v === true;
  if (type === "tags") return Array.isArray(v) ? (v as string[]).join(", ") : "";
  if (v == null) return "";
  return String(v);
}

function fromFormValue(raw: string | boolean, type: FieldType): unknown {
  if (type === "boolean") return raw === true;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === "tags") {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return String(raw);
}

export function CrudManager<T extends Rec>({
  titleKey,
  subtitleKey,
  fields,
  load,
  create,
  update,
  remove,
  emptyLabel,
  addLabel,
}: CrudManagerProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await load();
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yükleme hatası.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const openNew = () => {
    setCreating(true);
    setSelectedId(null);
    const blank: Record<string, string | boolean> = {};
    for (const f of fields) blank[f.key] = f.type === "boolean" ? true : "";
    setForm(blank);
  };

  const openEdit = (item: T) => {
    setCreating(false);
    setSelectedId(item.id);
    const next: Record<string, string | boolean> = {};
    for (const f of fields) next[f.key] = toFormValue(item[f.key], f.type);
    setForm(next);
  };

  const setField = (key: string, value: string | boolean) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const handleSave = async () => {
    setError(null);
    const body: Record<string, unknown> = {};
    for (const f of fields) body[f.key] = fromFormValue(form[f.key] ?? (f.type === "boolean" ? false : ""), f.type);
    const req = fields.find((f) => f.required);
    if (req && !String(body[req.key] ?? "").trim()) {
      setError(`${req.label} gerekli.`);
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        const created = await create(body as Partial<T>);
        setItems((cur) => [...cur, created]);
        setSelectedId(created.id);
        setCreating(false);
      } else if (selectedId) {
        const updated = await update(selectedId, body as Partial<T>);
        setItems((cur) => cur.map((i) => (i.id === selectedId ? updated : i)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const id = selectedId;
    setBusy(true);
    try {
      await remove(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
      setSelectedId(null);
      setForm({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const editing = creating || selectedId != null;

  return (
    <>
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
        {/* LİSTE */}
        <div className={kupaCard}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kayıtlar</h3>
            <button type="button" onClick={openNew} className={kupaBtnPrimary}>
              + {addLabel}
            </button>
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-slate-500">Yükleniyor…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-500">{emptyLabel}</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openEdit(item)}
                  className={`block w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                    selectedId === item.id
                      ? "border-amber-400/50 bg-amber-500/20"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="block truncate text-xs font-medium text-slate-100">
                    {String(item[titleKey] ?? "—")}
                  </span>
                  {subtitleKey && item[subtitleKey] ? (
                    <span className="block truncate text-[10px] text-slate-500">
                      {String(item[subtitleKey])}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        {/* FORM */}
        <div className={kupaCard}>
          {!editing ? (
            <p className="text-sm text-slate-500">Düzenlemek için soldan bir kayıt seçin veya yeni ekleyin.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.key} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
                    <label className="mb-1 block text-[11px] font-medium text-slate-400">
                      {f.label}
                      {f.required ? <span className="text-rose-300"> *</span> : null}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        value={String(form[f.key] ?? "")}
                        onChange={(e) => setField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        rows={4}
                        className={kupaInput}
                      />
                    ) : f.type === "boolean" ? (
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={form[f.key] === true}
                          onChange={(e) => setField(f.key, e.target.checked)}
                          className="h-4 w-4 accent-amber-500"
                        />
                        Aktif
                      </label>
                    ) : f.type === "select" ? (
                      <select
                        value={String(form[f.key] ?? "")}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className={kupaInput}
                      >
                        <option value="">—</option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={String(form[f.key] ?? "")}
                        onChange={(e) => setField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className={kupaInput}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleSave} disabled={busy} className={kupaBtnPrimary}>
                  {creating ? "Ekle" : "Kaydet"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(null);
                    setForm({});
                  }}
                  className={kupaBtnGhost}
                >
                  Vazgeç
                </button>
                {!creating && selectedId ? (
                  <button type="button" onClick={handleDelete} disabled={busy} className={`${kupaBtnDanger} ml-auto`}>
                    Sil
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
