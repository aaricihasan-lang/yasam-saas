"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { imagesApi, storePhotoPublicUrl } from "@/app/admin/magaza/magazaAdminApi";
import type { StoreProductImage } from "@/lib/store/types";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

export default function ImageManager({
  productId,
  initialImages,
}: {
  productId: string;
  initialImages: StoreProductImage[];
}) {
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const [images, setImages] = useState<StoreProductImage[]>(initialImages);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      if (!ACCEPT.split(",").includes(file.type)) {
        showToast({ type: "warning", message: `${file.name}: yalnız JPEG/PNG/WEBP.` });
        continue;
      }
      if (file.size > MAX_BYTES) {
        showToast({ type: "warning", message: `${file.name}: 5 MB sınırını aşıyor.` });
        continue;
      }
      const res = await imagesApi.upload(productId, file);
      if (res.ok) {
        setImages((prev) => [...prev, res.data.row]);
      } else {
        showToast({ type: "error", message: `${file.name}: ${res.error}` });
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function makePrimary(img: StoreProductImage) {
    if (img.is_primary) return;
    const res = await imagesApi.setPrimary(productId, img.id);
    if (res.ok) {
      setImages((prev) => prev.map((x) => ({ ...x, is_primary: x.id === img.id })));
      showToast({ type: "success", message: "Ana görsel güncellendi." });
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  async function remove(img: StoreProductImage) {
    const ok = await deleteConfirm({
      message: "Bu görsel silinsin mi?",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const res = await imagesApi.remove(productId, img.id);
    if (res.ok) {
      setImages((prev) => {
        const next = prev.filter((x) => x.id !== img.id);
        // Silinen ana görselse ve başka görsel varsa ilkini ana yap (server de yapar).
        if (img.is_primary && next.length > 0 && !next.some((x) => x.is_primary)) {
          next[0] = { ...next[0], is_primary: true };
        }
        return next;
      });
      showToast({ type: "success", message: "Görsel silindi." });
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="space-y-4">
      {/* Yükleme alanı */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300/70 bg-emerald-50/40 px-6 py-8 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/70 disabled:opacity-60"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
        <span className="text-sm font-semibold text-emerald-900">
          {busy ? "Yükleniyor…" : "Görsel yükle"}
        </span>
        <span className="text-[12px] text-stone-500">JPEG / PNG / WEBP · en fazla 5 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {/* Galeri */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img) => {
            const url = storePhotoPublicUrl(img.file_path);
            return (
              <div
                key={img.id}
                className={
                  "group relative overflow-hidden rounded-2xl border bg-stone-100 " +
                  (img.is_primary ? "border-emerald-500 ring-2 ring-emerald-200" : "border-stone-200/70")
                }
              >
                <div className="aspect-square w-full">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={img.alt_text} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                {img.is_primary ? (
                  <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Ana görsel
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {!img.is_primary ? (
                    <button
                      type="button"
                      onClick={() => makePrimary(img)}
                      className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-white"
                    >
                      Ana yap
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => remove(img)}
                    className="rounded-md bg-rose-600/90 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-600"
                  >
                    Sil
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-stone-200/70 bg-stone-50/60 px-4 py-6 text-center text-[13px] text-stone-500">
          Henüz görsel yok. İlk yüklenen görsel otomatik olarak ana görsel olur.
        </p>
      )}
    </div>
  );
}
