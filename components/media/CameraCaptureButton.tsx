"use client";

import { useRef, type ReactNode } from "react";
import { useCameraCapture } from "@/hooks/useCameraCapture";

type Props = {
  /** Çekilen fotoğraf(lar). Galeri akışıyla AYNI işleyiciye bağlanmalı (optimizasyon + yükleme). */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  /** Görünen etiket (varsayılan "📷 Fotoğraf Çek"). */
  children?: ReactNode;
  testId?: string;
};

/**
 * Kamera ile çekip yükleme butonu (galeriden bağımsız ayrı giriş).
 * Kamera akışı olmayan ortamlarda (masaüstü, native kamera desteği bildirmeyen Android uygulaması)
 * HİÇ render edilmez → galeri butonu tek başına kalır. İptal edilirse hiçbir şey olmaz.
 */
export function CameraCaptureButton({ onFiles, disabled, className, children, testId }: Props) {
  const supported = useCameraCapture();
  const inputRef = useRef<HTMLInputElement>(null);
  if (!supported) return null;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={className}
        data-testid={testId}
      >
        {children ?? "📷 Fotoğraf Çek"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
