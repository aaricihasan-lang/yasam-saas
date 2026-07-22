"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { runInEffect } from "@/lib/runInEffect";

/**
 * HD harita görseli yükleme/gösterme (HD-0 güvenlik).
 *
 * - Upload/delete istekleri x-user-id + x-session-token header'ları taşır.
 * - tenantId GÖNDERİLMEZ (sunucuda guard'dan alınır).
 * - Keyfi storage path GÖNDERİLMEZ; silme yalnız clientId ile yapılır.
 * - Görsel, DB'deki path'ten değil, kısa ömürlü SIGNED URL ile gösterilir.
 * - DB'deki storage path doğrudan <img src> olarak KULLANILMAZ.
 *
 * NOT: prop adları (currentImageUrl / onUrlChange) korunmuştur — değer artık
 * kalıcı storage PATH'idir (veya legacy tam URL / boş). Adlar, dondurulmuş
 * HdClientDetayModal'ı düzenlememek için değiştirilmemiştir.
 */

type Props = {
  clientId: string;
  /** DB'de saklanan kalıcı storage path (veya legacy URL / boş). Doğrudan img src DEĞİLDİR. */
  currentImageUrl: string | null;
  /** Yükleme/silme sonrası yeni path (veya null) üst forma bildirilir. */
  onUrlChange: (path: string | null) => void;
};

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

function hasSession(): boolean {
  return !!readYasamUser()?.id && !!readSessionToken();
}

export function HdChartImageUpload({ clientId, currentImageUrl, onUrlChange }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // DB path → gösterilebilir signed URL. Legacy tam URL (http...) doğrudan gösterilir
  // (otomatik dönüştürme/silme YAPILMAZ). Path yoksa boş durum korunur.
  const resolveDisplay = useCallback(async () => {
    const path = currentImageUrl?.trim() ?? "";
    if (!path) {
      setDisplayUrl(null);
      return;
    }
    if (/^https?:\/\//i.test(path)) {
      // Geriye uyumluluk: eski public URL — dokunmadan göster.
      setDisplayUrl(path);
      return;
    }
    setResolving(true);
    try {
      const res = await fetch(
        `/api/hd/chart-image-url?clientId=${encodeURIComponent(clientId)}`,
        { method: "GET", headers: authHeaders(), cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        signedUrl?: string | null;
      };
      setDisplayUrl(res.ok && json.ok ? (json.signedUrl ?? null) : null);
    } catch {
      setDisplayUrl(null);
    } finally {
      setResolving(false);
    }
  }, [clientId, currentImageUrl]);

  useEffect(() => {
    runInEffect(resolveDisplay);
  }, [resolveDisplay]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!hasSession()) {
      showToast({ message: "Oturum bulunamadı, tekrar giriş yapın.", type: "error" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      // NOT: tenantId gönderilmez; Content-Type manuel set edilmez (FormData boundary'si korunur).

      const res = await fetch("/api/hd/upload-chart-image", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        storagePath?: string;
        signedUrl?: string | null;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.storagePath) {
        showToast({ message: json.error ?? "Yükleme başarısız.", type: "error" });
        return;
      }

      onUrlChange(json.storagePath);
      setDisplayUrl(json.signedUrl ?? null);
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

    if (!hasSession()) {
      showToast({ message: "Oturum bulunamadı, tekrar giriş yapın.", type: "error" });
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/hd/delete-chart-image", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        showToast({ message: json.error ?? "Silme başarısız.", type: "error" });
        return;
      }

      onUrlChange(null);
      setDisplayUrl(null);
      showToast({ message: "Harita görseli silindi.", type: "success" });
    } catch {
      showToast({ message: "Silme sırasında hata oluştu.", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const busy = uploading || deleting;
  const hasImage = !!currentImageUrl;

  return (
    <div className="space-y-2">
      {hasImage ? (
        <div className="overflow-hidden rounded-xl border border-violet-200/80 bg-violet-50/30">
          {displayUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={displayUrl}
              alt="Human Design Harita Görseli"
              className="w-full object-contain"
              style={{ maxHeight: 320 }}
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              {resolving ? "Görsel yükleniyor..." : "Görsel önizlemesi hazırlanamadı."}
            </div>
          )}
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
