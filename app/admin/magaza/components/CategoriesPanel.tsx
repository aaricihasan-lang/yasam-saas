"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { categoriesApi, storePhotoPublicUrl } from "@/app/admin/magaza/magazaAdminApi";
import { slugifyStore } from "@/lib/store/slug";
import type { StoreCategory } from "@/lib/store/types";

type Draft = {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  sort_order: string;
  image_path: string | null;
};

const emptyDraft: Draft = {
  id: null, name: "", slug: "", description: "", is_active: true, sort_order: "0", image_path: null,
};

const IMG_ACCEPT = "image/jpeg,image/png,image/webp";
const IMG_MAX_BYTES = 5 * 1024 * 1024;

export default function CategoriesPanel() {
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const [rows, setRows] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
      // Yeni kategori: görseli hemen ekleyebilsin diye formu düzenleme moduna geçir.
      if (draft.id) {
        setDraft(null);
      } else {
        setDraft({
          id: res.data.id,
          name: res.data.name,
          slug: res.data.slug,
          description: res.data.description,
          is_active: res.data.is_active,
          sort_order: String(res.data.sort_order),
          image_path: res.data.image_path,
        });
      }
      void load();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  async function onPickImage(files: FileList | null) {
    if (!draft?.id || !files || files.length === 0) return;
    const file = files[0];
    if (!IMG_ACCEPT.split(",").includes(file.type)) {
      showToast({ type: "warning", message: "Yalnız JPEG/PNG/WEBP görseli yüklenebilir." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > IMG_MAX_BYTES) {
      showToast({ type: "warning", message: "Görsel 5 MB sınırını aşıyor." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImgBusy(true);
    const res = await categoriesApi.uploadImage(draft.id, file);
    setImgBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      setDraft((d) => (d ? { ...d, image_path: res.data.row.image_path } : d));
      setRows((prev) => prev.map((r) => (r.id === res.data.row.id ? res.data.row : r)));
      showToast({ type: "success", message: "Kategori görseli güncellendi." });
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  async function removeImage() {
    if (!draft?.id) return;
    const ok = await deleteConfirm({
      message: "Kategori görseli kaldırılsın mı?",
      confirmText: "Kaldır",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setImgBusy(true);
    const res = await categoriesApi.removeImage(draft.id);
    setImgBusy(false);
    if (res.ok) {
      setDraft((d) => (d ? { ...d, image_path: null } : d));
      setRows((prev) => prev.map((r) => (r.id === res.data.id ? res.data : r)));
      showToast({ type: "success", message: "Kategori görseli kaldırıldı." });
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

  const draftImageUrl = storePhotoPublicUrl(draft?.image_path ?? null);

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

          {/* Kategori görseli — yalnız kayıtlı kategoride (id gerekir). */}
          <div className="mt-5 border-t border-emerald-200/60 pt-4">
            <span className="text-[12px] font-semibold text-stone-600">Kategori Görseli</span>
            {draft.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-stone-200/80 bg-stone-100">
                  {draftImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draftImageUrl} alt={draft.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-stone-400">
                      Görsel yok
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-soft"
                    disabled={imgBusy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {imgBusy ? "Yükleniyor…" : draft.image_path ? "Görseli Değiştir" : "Görsel Yükle"}
                  </button>
                  {draft.image_path ? (
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-[13px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                      disabled={imgBusy}
                      onClick={removeImage}
                    >
                      Görseli Kaldır
                    </button>
                  ) : null}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={IMG_ACCEPT}
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files)}
                  />
                  <span className="text-[11px] text-stone-400">JPEG / PNG / WEBP · en fazla 5 MB</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-stone-500">
                Görseli kategori kaydedildikten sonra ekleyebilirsiniz.
              </p>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button type="button" className="btn-soft" disabled={saving} onClick={() => setDraft(null)}>
              {draft.id ? "Kapat" : "Vazgeç"}
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
                <th className="px-4 py-3 font-semibold">Görsel</th>
                <th className="px-4 py-3 font-semibold">Ad</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Durum</th>
                <th className="px-4 py-3 font-semibold">Sıra</th>
                <th className="px-4 py-3 text-right font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((c) => {
                const thumb = storePhotoPublicUrl(c.image_path);
                return (
                  <tr key={c.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <div className="h-10 w-14 overflow-hidden rounded-lg border border-stone-200/70 bg-stone-100">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-stone-300">—</div>
                        )}
                      </div>
                    </td>
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
                              image_path: c.image_path,
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
                );
              })}
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
