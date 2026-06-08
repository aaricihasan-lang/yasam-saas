"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getSessionTenantId } from "@/lib/auth/sessionTenant";

const BUCKET = "hd-chart-images";

function extractStoragePath(publicUrl: string): string {
  const marker = `/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? publicUrl.slice(idx + marker.length) : "";
}

type Props = {
  clientId: string;
  currentImageUrl: string | null;
  onUrlChange: (url: string | null) => void;
};

export function HdChartImageUpload({ clientId, currentImageUrl, onUrlChange }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const tenantId = getSessionTenantId();
    if (!tenantId) {
      showToast({ message: "Oturum bulunamadı, tekrar giriş yapın.", type: "error" });
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("tenantId", tenantId);

      const res = await fetch("/api/hd/upload-chart-image", { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; publicUrl?: string; error?: string };

      if (!json.ok) {
        showToast({ message: json.error ?? "Yükleme başarısız.", type: "error" });
        return;
      }

      onUrlChange(json.publicUrl ?? null);
      showToast({ message: "Harita görseli yüklendi.", type: "success" });
    } catch {
      showToast({ message: "Yükleme sırasında hata oluştu.", type: "error" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!currentImageUrl) return;

    const tenantId = getSessionTenantId();
    if (!tenantId) {
      showToast({ message: "Oturum bulunamadı, tekrar giriş yapın.", type: "error" });
      return;
    }

    const storagePath = extractStoragePath(currentImageUrl);

    setDeleting(true);
    try {
      const res = await fetch("/api/hd/delete-chart-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, tenantId, storagePath }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!json.ok) {
        showToast({ message: json.error ?? "Silme başarısız.", type: "error" });
        return;
      }

      onUrlChange(null);
      showToast({ message: "Harita görseli silindi.", type: "success" });
    } catch {
      showToast({ message: "Silme sırasında hata oluştu.", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const busy = uploading || deleting;

  return (
    <div className="space-y-2">
      {currentImageUrl ? (
        <div className="overflow-hidden rounded-xl border border-violet-200/80 bg-violet-50/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImageUrl}
            alt="Human Design Harita Görseli"
            className="w-full object-contain"
            style={{ maxHeight: 320 }}
          />
          <div className="flex items-center justify-end gap-2 border-t border-violet-100/80 bg-white/70 px-3 py-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="h-7 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Yükleniyor..." : "Değiştir"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="h-7 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200/80 bg-indigo-50/30 text-sm font-semibold text-indigo-500 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Yükleniyor..." : "PNG / JPG seç — Harita Görseli"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
