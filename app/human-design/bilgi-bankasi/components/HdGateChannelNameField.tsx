"use client";

// Kapılar / Kanallar için kimlik + GÖRÜNEN AD alanı (yeni kayıt formu ve tam sayfa editör ortak).
//   • Kapı numarası / kanal kapı çifti hazır listeden seçilir → kod (kapi_21, kanal_29_46) bundan
//     üretilir ve eşleşme YALNIZ bu koddan yapılır.
//   • "Görünen Ad" serbesttir; yalnız bu hesabın ekranlarında ve yeni Word raporlarında görünür.
//     Hazır sözlük değişmez; boş bırakılırsa hazır ada dönülür.

import { HUMAN_DESIGN_CHANNELS, HUMAN_DESIGN_GATES } from "@/lib/human-design/constants";
import {
  composeHdChannelTitle,
  composeHdGateTitle,
  hdChannelDefaultName,
  hdGateDefaultName,
  HD_CHANNEL_CATEGORY,
  HD_GATE_CATEGORY,
} from "@/lib/human-design/knowledge/hdNames";

export function isHdGateChannelCategory(category: string): boolean {
  return category === HD_GATE_CATEGORY || category === HD_CHANNEL_CATEGORY;
}

/** structuredValue: kapı → "21", kanal → "29_46" (getStructuredCategoryOptions ile aynı). */
export function hdDefaultNameFor(category: string, structuredValue: string): string {
  if (!structuredValue) return "";
  if (category === HD_GATE_CATEGORY) return hdGateDefaultName(Number(structuredValue)) ?? "";
  if (category === HD_CHANNEL_CATEGORY) return hdChannelDefaultName(structuredValue.replace(/_/g, "-")) ?? "";
  return "";
}

/** Kayda yazılacak başlık ("21 — Ad" / "29-46 Ad"); seçim yoksa "". */
export function hdComposeTitleFor(category: string, structuredValue: string, name: string): string {
  if (!structuredValue) return "";
  if (category === HD_GATE_CATEGORY) return composeHdGateTitle(Number(structuredValue), name);
  if (category === HD_CHANNEL_CATEGORY) return composeHdChannelTitle(structuredValue.replace(/_/g, "-"), name);
  return "";
}

type Props = {
  category: string;
  structuredValue: string;
  name: string;
  onPick: (structuredValue: string) => void;
  onName: (name: string) => void;
  fieldBase: string;
  labelCls: string;
  /** Mevcut kayıtta numara/çift kilitli (kimlik değişmez; yalnız ad düzenlenir). */
  lockIdentity?: boolean;
};

export function HdGateChannelNameField({ category, structuredValue, name, onPick, onName, fieldBase, labelCls, lockIdentity }: Props) {
  const isGate = category === HD_GATE_CATEGORY;
  const options = isGate
    ? HUMAN_DESIGN_GATES.map((g) => ({ value: String(g.code), label: g.label }))
    : HUMAN_DESIGN_CHANNELS.map((c) => ({ value: (c.code as string).replace(/-/g, "_"), label: c.label as string }));
  const defaultName = hdDefaultNameFor(category, structuredValue);
  const isCustom = !!structuredValue && name.trim() !== "" && name.trim() !== defaultName;
  const idLabel = isGate ? "Kapı numarası" : "Kanal (kapı çifti)";
  const prefix = structuredValue ? (isGate ? `${structuredValue}.` : structuredValue.replace(/_/g, "–")) : "";

  return (
    <>
      <div>
        <label className={labelCls}>{idLabel} *</label>
        <select
          value={structuredValue}
          disabled={lockIdentity}
          onChange={(e) => onPick(e.target.value)}
          className={`h-9 ${fieldBase} ${lockIdentity ? "cursor-not-allowed bg-slate-50/80 text-slate-500" : ""}`}
          data-hd-kb-identity
        >
          <option value="">— Seçin —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Görünen Ad</label>
        <div className="flex items-stretch gap-2">
          {prefix ? (
            <span className="inline-flex h-9 shrink-0 items-center rounded-xl bg-slate-100 px-2.5 text-sm font-black tabular-nums text-slate-600 ring-1 ring-slate-200">
              {prefix}
            </span>
          ) : null}
          <input
            type="text"
            value={name}
            disabled={!structuredValue}
            onChange={(e) => onName(e.target.value)}
            placeholder={defaultName || "Önce seçim yapın"}
            maxLength={120}
            className={`h-9 min-w-0 flex-1 ${fieldBase}`}
            data-hd-kb-display-name
          />
          {isCustom ? (
            <button
              type="button"
              onClick={() => onName(defaultName)}
              className="h-9 shrink-0 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
              data-hd-kb-name-reset
            >
              Varsayılana dön
            </button>
          ) : null}
        </div>
      </div>
      <div className="sm:col-span-2 rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-xs leading-relaxed text-sky-800">
        <span className="font-bold">{isGate ? "Kapı numarası" : "Kanalın kapı çifti"} sabittir</span> ve rapor eşleşmesi bu numaradan yapılır.
        Görünen adı kendi eğitiminize göre değiştirebilirsiniz; değişiklik yalnız sizin hesabınızda ve yeni Word raporlarında görünür.
        Yalnız adı değiştirmek için açıklama yazmanız gerekmez.
        {lockIdentity ? " Numara değiştirilemez; farklı bir kapı/kanal için yeni kayıt ekleyin." : ""}
      </div>
    </>
  );
}
