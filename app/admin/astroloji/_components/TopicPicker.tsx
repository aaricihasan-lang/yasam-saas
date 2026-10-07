"use client";

/**
 * Kanonik konu seçici (Batı natal). Serbest metin anahtar GİRİLEMEZ: tür + kanonik kimlikler seçilir,
 * anahtar lib/astrology/topics/western ile üretilir (sunucu da aynı modülle doğrular).
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

const sel = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";

function initial(key: string | null): ParsedTopic {
  return (key && parseWesternTopicKey(key)) || { kind: "planet_in_house", body: "saturn", house: 7 };
}

export default function TopicPicker({ value, onChange }: { value: string | null; onChange: (key: string) => void }) {
  const [t, setT] = useState<ParsedTopic>(() => initial(value));
  const update = (next: ParsedTopic) => {
    setT(next);
    onChange(topicKey(next));
  };
  const changeKind = (kind: WesternTopicKind) => {
    const defaults: Record<WesternTopicKind, ParsedTopic> = {
      planet_in_sign: { kind: "planet_in_sign", body: "sun", sign: "aries" },
      planet_in_house: { kind: "planet_in_house", body: "sun", house: 1 },
      aspect: { kind: "aspect", a: "sun", type: "conjunction", b: "moon" },
      pattern: { kind: "pattern", pattern: "grand_trine" },
      angle_in_sign: { kind: "angle_in_sign", angle: "ascendant", sign: "aries" },
    };
    update(defaults[kind]);
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
  const signSelect = (v: SignId, on: (s: SignId) => void) => (
    <select className={sel} value={v} onChange={(e) => on(e.target.value as SignId)}>
      {SIGN_IDS.map((s) => (
        <option key={s} value={s}>
          {SIGN_LABELS[s]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={t.kind} onChange={(e) => changeKind(e.target.value as WesternTopicKind)} aria-label="Konu türü">
          {WESTERN_TOPIC_KINDS.map((k) => (
            <option key={k} value={k}>
              {WESTERN_TOPIC_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {t.kind === "planet_in_sign" && (
          <>
            {bodySelect(t.body, (body) => update({ ...t, body }))}
            {signSelect(t.sign, (sign) => update({ ...t, sign }))}
          </>
        )}
        {t.kind === "planet_in_house" && (
          <>
            {bodySelect(t.body, (body) => update({ ...t, body }))}
            <select className={sel} value={t.house} onChange={(e) => update({ ...t, house: Number(e.target.value) })}>
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
            {bodySelect(t.a, (a) => update({ ...t, a, b: a === t.b ? (BODY_IDS.find((x) => x !== a) as BodyId) : t.b }))}
            <select className={sel} value={t.type} onChange={(e) => update({ ...t, type: e.target.value as AspectType })}>
              {ASPECT_TYPES.map((a) => (
                <option key={a} value={a}>
                  {ASPECT_LABELS[a]}
                </option>
              ))}
            </select>
            {bodySelect(t.b, (b) => update({ ...t, b }), t.a)}
          </>
        )}
        {t.kind === "pattern" && (
          <select className={sel} value={t.pattern} onChange={(e) => update({ ...t, pattern: e.target.value as PatternKind })}>
            {PATTERN_KINDS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
        )}
        {t.kind === "angle_in_sign" && (
          <>
            <select className={sel} value={t.angle} onChange={(e) => update({ ...t, angle: e.target.value as AngleId })}>
              {ANGLE_IDS.map((a) => (
                <option key={a} value={a}>
                  {a === "ascendant" ? "Yükselen" : "MC"}
                </option>
              ))}
            </select>
            {signSelect(t.sign, (sign) => update({ ...t, sign }))}
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Konu: <span className="font-medium text-slate-700">{topicLabel(t)}</span> · <code className="text-[11px]">{topicKey(t)}</code>
      </p>
    </div>
  );
}
