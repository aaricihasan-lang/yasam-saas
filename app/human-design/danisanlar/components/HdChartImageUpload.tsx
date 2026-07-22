"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { runInEffect } from "@/lib/runInEffect";

/**
 * HD harita görseli yükleme/gösterme (HD-0 güvenlik).
 *
 * - Görsel durumu YALNIZ clientId üzerinden çözülür: mount'ta /api/hd/chart-image-url
 *   çağrılır; istemci storage path'e HİÇ dokunmaz (yükleme yanıtı da path döndürmez).
 * - Upload/delete istekleri x-user-id + x-session-token header'ları taşır.
 * - tenantId GÖNDERİLMEZ (sunucuda guard'dan alınır).
 * - Keyfi storage path GÖNDERİLMEZ; silme yalnız clientId ile yapılır.
 * - Görsel yalnız kısa ömürlü SIGNED URL ile gösterilir.
 * - Legacy (dış/public) URL doğrudan img src olarak YÜKLENMEZ — güvenli
 *   "eski format" durumu gösterilir ve yalnız yeniden yükleme önerilir.
 *
 * NOT: currentImageUrl / onUrlChange prop'ları geriye-uyumluluk için opsiyonel tutulur
 * (dondurulmuş HdClientDetayModal'ı düzenlememek için); bu bileşenin mantığında
 * KULLANILMAZ — görsel durumu server'dan clientId ile alınır.
 */

type ImageStatus = "loading" | "ready" | "empty" | "legacy";

type Props = {
  clientId: string;
  currentImageUrl?: string | null;
  onUrlChange?: (path: string | null) => void;
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

export function HdChartImageUpload({ clientId }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  // Görsel durumunu YALNIZ clientId ile server'dan çöz (path istemciye gelmez).
  const resolveState = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/hd/chart-image-url?clientId=${encodeURIComponent(clientId)}`,
        { method: "GET", headers: authHeaders(), cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        hasImage?: boolean;
        signedUrl?: string | null;
        legacy?: boolean;
      };
      if (res.ok && json.ok && json.hasImage && json.signedUrl) {
        setDisplayUrl(json.signedUrl);
        setStatus("ready");
      } else if (res.ok && json.ok && json.legacy) {
        setDisplayUrl(null);
        setStatus("legacy");
      } else {
        setDisplayUrl(null);
        setStatus("empty");
      }
    } catch {
      setDisplayUrl(null);
      setStatus("empty");
    }
  }, [clientId]);

  useEffect(() => {
    runInEffect(resolveState);
  }, [resolveState]);

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
        hasImage?: boolean;
        signedUrl?: string | null;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.hasImage) {
        showToast({ message: json.error ?? "Yükleme başarısız.", type: "error" });
        return;
      }

      setDisplayUrl(json.signedUrl ?? null);
      setStatus(json.signedUrl ? "ready" : "empty");
      showToast({ message: "Harita görseli yüklendi.", type: "success" });
    } catch {
      showToast({ message: "Yükleme sırasında hata oluştu.", type: "error" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (status !== "ready") return;

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

      setDisplayUrl(null);
      setStatus("empty");
      showToast({ message: "Harita görseli silindi.", type: "success" });
    } catch {
      showToast({ message: "Silme sırasında hata oluştu.", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const busy = uploading || deleting;
  const pickFile = () => inputRef.current?.click();

  return (
    <div className="space-y-2">
      {status === "loading" ? (
        <div className="flex h-20 w-full items-center justify-center rounded-xl border border-indigo-100/80 bg-indigo-50/20 text-sm text-slate-500">
          Görsel yükleniyor...
        </div>
      ) : status === "ready" && displayUrl ? (
        <div className="overflow-hidden rounded-xl border border-violet-200/80 bg-violet-50/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Human Design Harita Görseli"
            className="w-full object-contain"
            style={{ maxHeight: 320 }}
          />
          <div className="flex items-center justify-end gap-2 border-t border-violet-100/80 bg-white/70 px-3 py-2">
            <button
              type="button"
              onClick={pickFile}
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
      ) : status === "legacy" ? (
        <div className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            Eski görsel formatı algılandı; yeniden yükleyin.
          </p>
          <p className="text-xs text-amber-700/90">
            Bu danışanın görseli eski bir bağlantı biçiminde kayıtlı ve güvenli
            biçimde görüntülenemiyor. Görseli yeniden yükleyerek güncelleyin.
          </p>
          <button
            type="button"
            onClick={pickFile}
            disabled={busy}
            className="h-9 rounded-lg border border-amber-300 bg-white px-4 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Yükleniyor..." : "Yeniden Yükle"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
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
