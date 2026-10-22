"use client";

/**
 * Kanonik konu seçici — önce BAĞLAM (Natal, Transit, Progression, Solar arc, Solar/Lunar return,
 * Sinastri, Composite), sonra tür + kanonik kimlikler. Serbest metin anahtar GİRİLEMEZ; anahtar
 * lib/astrology/topics ile üretilir (sunucu da aynı modülle doğrular). Bağlamlar birbirine karışmaz:
 * "Satürn 7. ev" (natal) ile "Solar return: Satürn 7. ev" ayrı anahtarlardır.
 * Aşama 5: Vedik/Jyotish bağlamları (D1, Varga, Dasha) ayrı grupta; anahtarları Batı'dan ayrıdır
 * (graha_in_rashi ≠ planet_in_sign) ve KB kaydı "vedic" geleneğiyle saklanır.
 */

import { useState } from "react";
import { ASPECT_TYPES, BODY_IDS, PATTERN_KINDS, SIGN_IDS, type AspectType, type BodyId, type PatternKind, type SignId } from "@/lib/astrology/model/western";
import { ASPECT_LABELS, BODY_LABELS, PATTERN_LABELS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import {
  ANGLE_IDS,
  WESTERN_TOPIC_KIND_LABELS,
  WESTERN_TOPIC_KINDS,
  parseWesternTopicKey,
  topicKey,
  topicLabel,
  type AngleId,
  type ParsedTopic,
  type WesternTopicKind,
} from "@/lib/astrology/topics/western";
import { ANGLE4_IDS, ANGLE4_LABEL, COMPASS_LABEL, CONTEXT_SPECS, contextTopicKey, extraPointArgOptions, parseContextTopicKey, type ArgType } from "@/lib/astrology/topics/contextual";
import { FIXED_STAR_CATALOG } from "@/lib/astrology/labels/fixedStars";
import { ALL_TOPIC_KINDS, TOPIC_CONTEXT_LABELS, TOPIC_CONTEXTS, type TopicContext } from "@/lib/astrology/topics/index";
import {
  KP_CONTEXTS,
  KP_CONTEXT_LABELS,
  traditionOfSpec,
  VEDIC_CONTEXTS,
  VEDIC_CONTEXT_LABELS,
  VEDIC_SPECS,
  parseVedicTopicKey,
  vedicArgOptions,
  vedicDefaultParts,
  vedicTopicKey,
  type KpContext,
  type VedicContext,
} from "@/lib/astrology/topics/vedic";

const sel = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";
const ANGLE_LABEL: Record<string, string> = { ascendant: "Yükselen", midheaven: "MC" };

type State =
  | { context: "natal"; natal: ParsedTopic }
  | { context: Exclude<TopicContext, "natal">; kind: string; parts: string[] }
  | { context: VedicContext | KpContext; kind: string; parts: string[] };

// Vedik ve KP bağlamları aynı tür/argüman motorunu kullanır; GELENEK türün kendisinden okunur (KP anahtarı Vedik sayılmaz).
const isVedic = (c: string): c is VedicContext | KpContext => (VEDIC_CONTEXTS as readonly string[]).includes(c) || (KP_CONTEXTS as readonly string[]).includes(c);

function defaultParts(kind: string): string[] {
  return CONTEXT_SPECS[kind].args.map((a, i): string => {
    switch (a) {
      case "body":
        return i === 2 ? "moon" : "sun";
      case "point":
        return i === 2 ? "moon" : "sun";
      case "sign":
        return "aries";
      case "house":
        return "1";
      case "aspect":
        return "conjunction";
      case "angle":
        return "ascendant";
      case "station":
        return "retrograde";
      case "angle4":
        return "mc";
      case "compass":
        return "n";
      case "star":
        return "regulus";
      case "asteroid":
      case "lot":
      case "lilith":
        return extraPointArgOptions(a)[0][0];
    }
  });
}

function initial(key: string | null): State {
  const n = key ? parseWesternTopicKey(key) : null;
  if (n) return { context: "natal", natal: n };
  const c = key ? parseContextTopicKey(key) : null;
  if (c && c.context !== "natal") return { context: c.context, kind: c.kind, parts: c.parts };
  const v = key ? (parseVedicTopicKey(key) ?? parseVedicTopicKey(key, "kp")) : null;
  if (v) return { context: v.context, kind: v.kind, parts: v.parts };
  return { context: "natal", natal: { kind: "planet_in_house", body: "saturn", house: 7 } };
}

function keyOf(s: State): string {
  if (s.context === "natal") return topicKey(s.natal);
  return isVedic(s.context) ? vedicTopicKey(s.kind, s.parts) : contextTopicKey(s.kind, s.parts);
}

function ArgSelect({ type, value, onChange }: { type: ArgType; value: string; onChange: (v: string) => void }) {
  const opts: [string, string][] = (() => {
    switch (type) {
      case "body":
        return BODY_IDS.map((b): [string, string] => [b, BODY_LABELS[b]]);
      case "point":
        return [...BODY_IDS.map((b): [string, string] => [b, BODY_LABELS[b]]), ["ascendant", "Yükselen"], ["midheaven", "MC"]];
      case "sign":
        return SIGN_IDS.map((s): [string, string] => [s, SIGN_LABELS[s]]);
      case "house":
        return Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), `${i + 1}. ev`]);
      case "aspect":
        return ASPECT_TYPES.map((a): [string, string] => [a, ASPECT_LABELS[a]]);
      case "angle":
        return ANGLE_IDS.map((a): [string, string] => [a, ANGLE_LABEL[a]]);
      case "station":
        return [
          ["retrograde", "Retro istasyonu"],
          ["direct", "Direkt istasyonu"],
        ];
      case "angle4":
        return ANGLE4_IDS.map((a): [string, string] => [a, ANGLE4_LABEL[a]]);
      case "compass":
        return Object.entries(COMPASS_LABEL).map(([k, v]): [string, string] => [k, `${k.toUpperCase()} (${v})`]);
      case "star":
        return Object.entries(FIXED_STAR_CATALOG)
          .map(([k, v]): [string, string] => [k, `${v.name} (${v.bayer})`])
          .sort((a, b) => a[1].localeCompare(b[1], "tr"));
      case "asteroid":
      case "lot":
      case "lilith":
        return extraPointArgOptions(type);
    }
  })();
  return (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export default function TopicPicker({ value, onChange }: { value: string | null; onChange: (key: string) => void }) {
  const [s, setS] = useState<State>(() => initial(value));
  const update = (next: State) => {
    setS(next);
    onChange(keyOf(next));
  };

  const changeContext = (c: TopicContext | VedicContext | KpContext) => {
    if (isVedic(c)) {
      const kind = Object.keys(VEDIC_SPECS).find((k) => VEDIC_SPECS[k].context === c)!;
      update({ context: c, kind, parts: vedicDefaultParts(kind) });
    } else if (c === "natal") update({ context: "natal", natal: { kind: "planet_in_house", body: "saturn", house: 7 } });
    else {
      const kind = ALL_TOPIC_KINDS.find((k) => k.context === c)!.kind;
      update({ context: c, kind, parts: defaultParts(kind) });
    }
  };

  const natalEditor = (t: ParsedTopic) => {
    const upd = (n: ParsedTopic) => update({ context: "natal", natal: n });
    const changeKind = (kind: WesternTopicKind) => {
      const defaults: Record<WesternTopicKind, ParsedTopic> = {
        planet_in_sign: { kind: "planet_in_sign", body: "sun", sign: "aries" },
        planet_in_house: { kind: "planet_in_house", body: "sun", house: 1 },
        aspect: { kind: "aspect", a: "sun", type: "conjunction", b: "moon" },
        pattern: { kind: "pattern", pattern: "grand_trine" },
        angle_in_sign: { kind: "angle_in_sign", angle: "ascendant", sign: "aries" },
      };
      upd(defaults[kind]);
    };
    const bodySelect = (v: BodyId, on: (b: BodyId) => void, exclude?: BodyId) => (
      <select className={sel} value={v} onChange={(e) => on(e.target.value as BodyId)}>
        {BODY_IDS.filter((b) => b !== exclude).map((b) => (
          <option key={b} value={b}>
            {BODY_LABELS[b]}
          </option>
        ))}
      </select>
    );
    const signSelect = (v: SignId, on: (x: SignId) => void) => (
      <select className={sel} value={v} onChange={(e) => on(e.target.value as SignId)}>
        {SIGN_IDS.map((x) => (
          <option key={x} value={x}>
            {SIGN_LABELS[x]}
          </option>
        ))}
      </select>
    );
    return (
      <>
        <select className={sel} value={t.kind} onChange={(e) => changeKind(e.target.value as WesternTopicKind)} aria-label="Konu türü">
          {WESTERN_TOPIC_KINDS.map((k) => (
            <option key={k} value={k}>
              {WESTERN_TOPIC_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {t.kind === "planet_in_sign" && (
          <>
            {bodySelect(t.body, (body) => upd({ ...t, body }))}
            {signSelect(t.sign, (sign) => upd({ ...t, sign }))}
          </>
        )}
        {t.kind === "planet_in_house" && (
          <>
            {bodySelect(t.body, (body) => upd({ ...t, body }))}
            <select className={sel} value={t.house} onChange={(e) => upd({ ...t, house: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}. ev
                </option>
              ))}
            </select>
          </>
        )}
        {t.kind === "aspect" && (
          <>
            {bodySelect(t.a, (a) => upd({ ...t, a, b: a === t.b ? (BODY_IDS.find((x) => x !== a) as BodyId) : t.b }))}
            <select className={sel} value={t.type} onChange={(e) => upd({ ...t, type: e.target.value as AspectType })}>
              {ASPECT_TYPES.map((a) => (
                <option key={a} value={a}>
                  {ASPECT_LABELS[a]}
                </option>
              ))}
            </select>
            {bodySelect(t.b, (b) => upd({ ...t, b }), t.a)}
          </>
        )}
        {t.kind === "pattern" && (
          <select className={sel} value={t.pattern} onChange={(e) => upd({ ...t, pattern: e.target.value as PatternKind })}>
            {PATTERN_KINDS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
        )}
        {t.kind === "angle_in_sign" && (
          <>
            <select className={sel} value={t.angle} onChange={(e) => upd({ ...t, angle: e.target.value as AngleId })}>
              {ANGLE_IDS.map((a) => (
                <option key={a} value={a}>
                  {ANGLE_LABEL[a]}
                </option>
              ))}
            </select>
            {signSelect(t.sign, (sign) => upd({ ...t, sign }))}
          </>
        )}
      </>
    );
  };

  const key = keyOf(s);
  const label =
    s.context === "natal" ? topicLabel(s.natal) : isVedic(s.context) ? (parseVedicTopicKey(key, traditionOfSpec(s.kind))?.label ?? null) : (parseContextTopicKey(key)?.label ?? null);
  const plain = (opts: [string, string][], value: string, on: (v: string) => void, aria?: string) => (
    <select className={sel} value={value} aria-label={aria} onChange={(e) => on(e.target.value)}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={s.context} onChange={(e) => changeContext(e.target.value as TopicContext | VedicContext | KpContext)} aria-label="Konu bağlamı">
          <optgroup label="Batı (tropikal)">
            {TOPIC_CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {TOPIC_CONTEXT_LABELS[c]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Vedik / Jyotish (sidereal)">
            {VEDIC_CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {VEDIC_CONTEXT_LABELS[c]}
              </option>
            ))}
          </optgroup>
          <optgroup label="KP (Krishnamurti Paddhati)">
            {KP_CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {KP_CONTEXT_LABELS[c]}
              </option>
            ))}
          </optgroup>
        </select>
        {s.context === "natal" ? (
          natalEditor(s.natal)
        ) : isVedic(s.context) ? (
          <>
            {plain(
              ALL_TOPIC_KINDS.filter((k) => k.context === s.context).map((k): [string, string] => [k.kind, k.label]),
              s.kind,
              (kind) => update({ context: s.context, kind, parts: vedicDefaultParts(kind) } as State),
              "Konu türü",
            )}
            {VEDIC_SPECS[s.kind].args.map((a, i) => (
              <span key={`${s.kind}-${i}`}>
                {plain(vedicArgOptions(a), s.parts[i], (v) => {
                  const parts = [...s.parts];
                  parts[i] = v;
                  update({ ...s, parts });
                })}
              </span>
            ))}
          </>
        ) : (
          <>
            <select
              className={sel}
              value={s.kind}
              aria-label="Konu türü"
              onChange={(e) => update({ context: s.context, kind: e.target.value, parts: defaultParts(e.target.value) } as State)}
            >
              {ALL_TOPIC_KINDS.filter((k) => k.context === s.context).map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
            {CONTEXT_SPECS[s.kind].args.map((a, i) => (
              <ArgSelect
                key={`${s.kind}-${i}`}
                type={a}
                value={s.parts[i]}
                onChange={(v) => {
                  const parts = [...s.parts];
                  parts[i] = v;
                  update({ ...s, parts });
                }}
              />
            ))}
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {label ? (
          <>
            Konu: <span className="font-medium text-slate-700">{label}</span> · <code className="text-[11px]">{key}</code>
          </>
        ) : (
          <span className="text-rose-700">Geçersiz konu (ör. aynı gök cismi iki tarafta).</span>
        )}
      </p>
    </div>
  );
}
