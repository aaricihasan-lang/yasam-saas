"use client";

import { Component, type ReactNode } from "react";

/**
 * Tek bir kaydın render'ı hata verse bile TÜM sayfayı çökertmesini engeller.
 * Bozuk/eksik `analysis_data` gibi durumlarda satır bazında güvenli bir
 * "Bu kayıt okunamadı" düşüşü gösterir.
 */
export class RowErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[numeroloji] kayıt render hatası:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-[14px] border border-amber-300/60 bg-amber-50/90 px-4 py-3 text-sm font-semibold text-amber-900 shadow-sm">
            ⚠️ Bu kayıt okunamadı (veri eski veya bozuk olabilir).
          </div>
        )
      );
    }
    return this.props.children;
  }
}
