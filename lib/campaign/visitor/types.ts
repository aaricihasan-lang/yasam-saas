// KAMPANYA MERKEZİ KM-3 — ziyaretçi akışı ortak tipleri (SAF; istemci + sunucu). Sır / DB yok.
import type { CampaignModule } from "../catalog";

/** Ziyaretçi formu alanı (istemci formu çizer; sunucu aynı tanımla doğrular). */
export type VisitorField = {
  k: string;
  label: string;
  type: "text" | "date" | "time" | "datetime-local" | "month" | "number" | "select" | "location" | "textarea";
  required?: boolean;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  hint?: string;
  /** true → değer sunucuya GÖNDERİLMEZ (ör. horary soru metni yalnız cihazda kalır). */
  localOnly?: boolean;
};

/** Sonuç ekranı blokları — tüm modüller aynı güvenli görünümle çizilir (HTML yok, yalnız metin). */
export type ResultBlock =
  | { type: "kv"; title: string; rows: readonly (readonly [string, string])[] }
  | { type: "text"; title: string; text: string; kind: "veri" | "yorum" }
  | { type: "list"; title: string; items: readonly string[]; kind?: "veri" | "yorum" }
  | { type: "table"; title: string; head: readonly string[]; rows: readonly (readonly string[])[] };

export type VisitorResult = {
  title: string;
  subtitle?: string;
  blocks: ResultBlock[];
  /** Ziyaretçiye gösterilen kısa notlar (ör. "Yorumlar bu kampanyada kapalı"). */
  notes: string[];
  commentsShown: boolean;
  report?: { kind: "docx"; filename: string; base64: string } | null;
};

/** Ziyaretçiye açık teknik (sunucu durum yükleyicisinin çıktısı). */
export type VisitorTechnique = {
  key: string;
  module: CampaignModule;
  title: string;
  visitorName: string;
  formLabel: string;
  fields: VisitorField[];
  kind: "local" | "provider" | "client";
  remaining: number;
  total: number;
  ipDaily: number;
  commentsEnabled: boolean;
  hasReport: boolean;
};

export type VisitorCampaignState =
  | { state: "kapali" }
  | {
      state: "yakinda" | "aktif";
      campaignId: string;
      slogan: string;
      altSlogan: string;
      description: string;
      affirmation: string;
      ctaText: string;
      ctaTarget: string;
      imageSrc: string | null;
      startsAt: string | null;
      modules: { module: CampaignModule; title: string; visitorShort: string; img: string; techniques: VisitorTechnique[] }[];
      dayTr: string;
    };

export type VisitorDenial = { code: string; message: string; retryable: boolean };
