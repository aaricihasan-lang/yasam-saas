"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useIsMobileOrPwa } from "@/hooks/useIsMobileOrPwa";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { runInEffect } from "@/lib/runInEffect";
import { HdChartImageViewer } from "./HdChartImageViewer";

/**
 * HD harita görseli yükleme/gösterme (HD-0 güvenlik + görsel UX).
 *
 * - Görsel durumu YALNIZ clientId üzerinden çözülür: mount'ta /api/hd/chart-image-url
 *   çağrılır; istemci storage path'e HİÇ dokunmaz (yükleme yanıtı da path döndürmez).
 * - Görsel yalnız kısa ömürlü SIGNED URL ile gösterilir; tıklama/klavye ile tam ekran
 *   görüntüleyici (HdChartImageViewer) açılır.
 * - Silme onaylıdır: masaüstü tek adım, mobil/PWA iki adım (useIsMobileOrPwa + useConfirm;
 *   paylaşımlı useDeleteConfirm DEĞİŞTİRİLMEDEN, HD-kapsamlı akış).
 * - Mobil/PWA'da yükleme/değiştirme kontrolleri ve file input RENDER AĞACINDA OLUŞMAZ
 *   (hydration-safe: tespit kesinleşmeden upload UI çizilmez → cihaz izin akışı tetiklenmez).
 *
 * NOT: currentImageUrl / onUrlChange prop'ları geriye-uyumluluk için opsiyonel tutulur
 * (dondurulmuş HdClientDetayModal'ı düzenlememek için); mantıkta KULLANILMAZ.
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
  const { confirm } = useConfirm();
  const isMobile = useIsMobileOrPwa();
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteGuard = useRef(false); // çift silme/onay akışı engeli
  const [mounted, setMounted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Hydration-safe: tespit kesinleşene kadar upload UI render edilmez.
  useEffect(() => {
    runInEffect(() => setMounted(true));
  }, []);

  // Masaüstünde ve tespit tamamlandıktan sonra yükleme kontrolleri gösterilir.
  const showUpload = mounted && !isMobile;

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

  // Silme onayı — masaüstü tek adım, mobil/PWA iki adım. Delete API yalnız
  // son olumlu onaydan SONRA çağrılır.
  async function confirmDeletion(): Promise<boolean> {
    if (isMobile) {
      // Aşama 1
      const ok1 = await confirm({
        title: "Harita görselini silmek istiyor musunuz?",
        message: "Bir sonraki adımda kalıcı silme onayı istenecektir.",
        tone: "warning",
        confirmText: "Devam Et",
        cancelText: "Vazgeç",
      });
      if (!ok1) return false;
      // İlk modal tamamen kapansın; dokunuşun ikinci modalın destructive butonuna
      // taşmasını önlemek için kısa boşluk.
      await new Promise((r) => setTimeout(r, 220));
      // Aşama 2
      const ok2 = await confirm({
        title: "Son silme onayı",
        message: "Bu harita görseli kalıcı olarak silinecektir. Bu işlem geri alınamaz.",
        tone: "danger",
        confirmText: "Evet, Kalıcı Olarak Sil",
        cancelText: "Geri Dön",
      });
      return ok2;
    }
    // Masaüstü tek adım
    return confirm({
      title: "Harita görselini silmek istiyor musunuz?",
      message: "Bu görsel kalıcı olarak silinecektir. Bu işlem geri alınamaz.",
      tone: "danger",
      confirmText: "Görseli Sil",
      cancelText: "Vazgeç",
    });
  }

  async function handleDelete() {
    if (status !== "ready") return;
    if (deleteGuard.current || deleting) return; // çift onay/çağrı engeli
    if (!hasSession()) {
      showToast({ message: "Oturum bulunamadı, tekrar giriş yapın.", type: "error" });
      return;
    }

    deleteGuard.current = true;
    try {
      const confirmed = await confirmDeletion();
      if (!confirmed) return;

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
          return; // başarısız → görsel korunur (status değişmez)
        }

        setDisplayUrl(null);
        setStatus("empty");
        setViewerOpen(false);
        showToast({ message: "Harita görseli silindi.", type: "success" });
      } catch {
        showToast({ message: "Silme sırasında hata oluştu.", type: "error" });
      } finally {
        setDeleting(false);
      }
    } finally {
      deleteGuard.current = false;
    }
  }

  const busy = uploading || deleting;
  const pickFile = () => inputRef.current?.click();
  const openViewer = () => {
    if (status === "ready" && displayUrl) setViewerOpen(true);
  };

  return (
    <div className="space-y-2">
      {status === "loading" || (!mounted && status !== "ready") ? (
        <div className="flex h-20 w-full items-center justify-center rounded-xl border border-indigo-100/80 bg-indigo-50/20 text-sm text-slate-500">
          Görsel yükleniyor...
        </div>
      ) : status === "ready" && displayUrl ? (
        <div className="overflow-hidden rounded-xl border border-violet-200/80 bg-violet-50/30">
          <button
            type="button"
            onClick={openViewer}
            aria-label="Harita görselini büyüt"
            className="block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt="Human Design harita görseli"
              className="w-full object-contain"
              style={{ maxHeight: 320 }}
            />
          </button>
          <div className="flex items-center justify-between gap-2 border-t border-violet-100/80 bg-white/70 px-3 py-2">
            <span className="text-[11px] font-medium text-slate-500">
              {isMobile ? "Büyütmek için görsele dokunun" : "Büyütmek için görsele tıklayın"}
            </span>
            <div className="flex items-center gap-2">
              {showUpload && (
                <button
                  type="button"
                  onClick={pickFile}
                  disabled={busy}
                  className="h-7 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? "Yükleniyor..." : "Değiştir"}
                </button>
              )}
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
        </div>
      ) : status === "legacy" ? (
        showUpload ? (
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
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-sm font-semibold text-amber-800">
            Bu görsel eski formattadır. Yeniden yüklemek için masaüstü sürümünü kullanın.
          </div>
        )
      ) : showUpload ? (
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200/80 bg-indigo-50/30 text-sm font-semibold text-indigo-500 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Yükleniyor..." : "PNG / JPG seç — Harita Görseli"}
        </button>
      ) : (
        <div className="flex h-20 w-full items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/40 text-sm text-slate-500">
          Harita görseli bulunmuyor.
        </div>
      )}

      {/* file input YALNIZ masaüstü + mount sonrası render edilir (mobilde DOM'da yok) */}
      {showUpload && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {viewerOpen && displayUrl && (
        <HdChartImageViewer signedUrl={displayUrl} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}
