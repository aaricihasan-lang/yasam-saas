"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { categoriesApi } from "@/app/admin/magaza/magazaAdminApi";
import { slugifyStore } from "@/lib/store/slug";
import type { StoreCategory } from "@/lib/store/types";

type Draft = {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  sort_order: string;
};

const emptyDraft: Draft = { id: null, name: "", slug: "", description: "", is_active: true, sort_order: "0" };

export default function CategoriesPanel() {
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const [rows, setRows] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await categoriesApi.list();
    if (res.ok) setRows(res.data);
    else showToast({ type: "error", message: res.error });
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      showToast({ type: "warning", message: "Kategori adı gerekli." });
      return;
    }
    const body: Record<string, unknown> = {
      name,
      description: draft.description,
      is_active: draft.is_active,
      sort_order: Number(draft.sort_order) || 0,
    };
    if (draft.slug.trim()) body.slug = draft.slug.trim();

    setSaving(true);
    const res = draft.id
      ? await categoriesApi.update(draft.id, body)
      : await categoriesApi.create(body);
    setSaving(false);

    if (res.ok) {
      showToast({ type: "success", message: draft.id ? "Kategori güncellendi." : "Kategori eklendi." });
      setDraft(null);
      void load();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  async function remove(cat: StoreCategory) {
    const ok = await deleteConfirm({
      message: `"${cat.name}" kategorisi silinsin mi?`,
      secondMessage: "Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const res = await categoriesApi.remove(cat.id);
    if (res.ok) {
      showToast({ type: "success", message: "Kategori silindi." });
      void load();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-500">{rows.length} kategori</p>
        {!draft ? (
          <button type="button" className="btn-primary" onClick={() => setDraft({ ...emptyDraft })}>
            + Yeni Kategori
          </button>
        ) : null}
      </div>

      {draft ? (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-5">
          <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-emerald-900">
            {draft.id ? "Kategoriyi Düzenle" : "Yeni Kategori"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ad *">
              <input
                className="store-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Doğal Taşlar"
              />
            </Field>
            <Field label="Slug (boş bırakılırsa addan üretilir)">
              <input
                className="store-input"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder={draft.name ? slugifyStore(draft.name) : "dogal-taslar"}
              />
            </Field>
            <Field label="Açıklama" full>
              <textarea
                className="store-input min-h-[70px]"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="Sıralama">
              <input
                type="number"
                className="store-input"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
              />
            </Field>
            <Field label="Durum">
              <label className="inline-flex cursor-pointer items-center gap-2 py-2 text-sm font-semibold text-stone-700">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                  className="h-4 w-4 accent-emerald-600"
                />
                Aktif (mağazada görünür)
              </label>
            </Field>
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button type="button" className="btn-soft" disabled={saving} onClick={() => setDraft(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-stone-400">Yükleniyor…</p>
      ) : rows.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed border-stone-300/80 bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-semibold text-stone-700">Henüz kategori yok</p>
          <p className="mt-1 text-[13px] text-stone-500">
            Ürünlerinizi düzenlemek için önce kategori oluşturun.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200/70 bg-stone-50/70 text-[12px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Ad</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Durum</th>
                <th className="px-4 py-3 font-semibold">Sıra</th>
                <th className="px-4 py-3 text-right font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 font-semibold text-stone-800">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-stone-500">{c.slug}</td>
                  <td className="px-4 py-3">
                    {c.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                        Aktif
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[12px] font-semibold text-stone-500 ring-1 ring-stone-200/70">
                        Pasif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-500">{c.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] font-semibold text-stone-600 hover:bg-stone-50"
                        onClick={() =>
                          setDraft({
                            id: c.id,
                            name: c.name,
                            slug: c.slug,
                            description: c.description,
                            is_active: c.is_active,
                            sort_order: String(c.sort_order),
                          })
                        }
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
                        onClick={() => remove(c)}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[12px] font-semibold text-stone-600">{label}</span>
      {children}
    </label>
  );
}
