// Astroloji — API YANIT GÖRÜNÜMÜ (SAF). İstemciye giden natal sonucu YALNIZ burada kurulur.
//
//   • Teknik katman: kayıtlı beyaz liste projeksiyon (sağlayıcı serbest metni içermez).
//   • Yorum katmanı: YALNIZ görünürlük "visible" ise ve ayrı tablodan okunduysa eklenir.
//     Görünmezse yanıtta yalnız { visible:false, reason } bulunur — içerik, boyut, sayı YOK.
//   • Saat bilinmiyorsa saat-bağımlı teknik değerler (evler, yükselen/MC, ev yerleşimleri, Şans
//     Noktası, Vertex) çıkarılır; yorumda ev içeren gezegen yorumları da çıkarılır.
//   • Ham yanıt, input gövdesi, input_hash, unmapped alan listesi istemciye GİTMEZ.

import type { InterpretationVisibility } from "../access/entitlements";
import type { NatalInterpretation, NatalTechnical } from "../model/western";
import { TIME_ACCURACY_LABELS, type TimeAccuracy } from "../birth/profileInput";

export type RevisionLike = {
  revision: number;
  birth_date: string;
  birth_time: string | null;
  time_known: boolean;
  time_accuracy: string;
  location_id?: string | null;
  location_label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  dst_choice: string;
  utc_offset_seconds: number;
  birth_utc: string;
  change_note?: string | null;
  created_at?: string;
};

export type ResultLike = {
  id: string;
  technique: string;
  provider: string;
  provider_api_version: string;
  adapter_version: string;
  projection_version: string;
  technical: Record<string, unknown>;
  created_at: string;
};

export function publicRevision(r: RevisionLike) {
  return {
    revision: r.revision,
    birthDate: r.birth_date,
    birthTime: r.time_known && r.birth_time ? r.birth_time.slice(0, 8) : null,
    timeKnown: r.time_known,
    timeAccuracy: r.time_accuracy,
    timeAccuracyLabel: TIME_ACCURACY_LABELS[r.time_accuracy as TimeAccuracy] ?? r.time_accuracy,
    locationId: r.location_id ?? null,
    locationLabel: r.location_label,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    dstChoice: r.dst_choice,
    utcOffsetSeconds: r.utc_offset_seconds,
    birthUtc: r.birth_utc,
    changeNote: r.change_note ?? null,
    createdAt: r.created_at ?? null,
  };
}

export function maskTimeDependent(t: NatalTechnical): NatalTechnical {
  return {
    ...t,
    bodies: t.bodies.map((b) => ({ ...b, house: null })),
    houses: [],
    angles: null,
    points: { partOfFortune: null, vertex: null },
  };
}

function maskInterpretationForUnknownTime(i: NatalInterpretation): NatalInterpretation {
  // Gezegen yorumları ev yerleşimini içerir (saat bilinmeden yanlış olur) → çıkarılır.
  return { ...i, bodies: [] };
}

export type NatalView = {
  id: string;
  technique: string;
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  computedAt: string;
  method: { zodiac: "tropical"; houseSystem: string; nodeType: string };
  timeUnknownMasked: boolean;
  technical: NatalTechnical;
  interpretation:
    | { visible: true; provider: string; lang: string; content: NatalInterpretation; notice: string }
    | { visible: false; reason: "not_entitled" | "owner_preview_hidden" | "unavailable" };
};

export const PROVIDER_INTERP_NOTICE =
  "Bu bölüm hesaplama sağlayıcısının (Roxy) otomatik ürettiği genel metindir; uzman yorumu değildir.";

export function buildNatalView(
  result: ResultLike,
  revision: Pick<RevisionLike, "time_known">,
  visibility: InterpretationVisibility,
  interpretation: { provider: string; lang: string; content: Record<string, unknown> } | null,
): NatalView {
  const tech = result.technical as unknown as NatalTechnical;
  const timeUnknown = revision.time_known !== true;
  const technical = timeUnknown ? maskTimeDependent(tech) : tech;

  let interp: NatalView["interpretation"];
  if (!visibility.visible) {
    interp = { visible: false, reason: visibility.reason };
  } else if (!interpretation) {
    interp = { visible: false, reason: "unavailable" };
  } else {
    const content = interpretation.content as unknown as NatalInterpretation;
    interp = {
      visible: true,
      provider: interpretation.provider,
      lang: interpretation.lang,
      content: timeUnknown ? maskInterpretationForUnknownTime(content) : content,
      notice: PROVIDER_INTERP_NOTICE,
    };
  }

  return {
    id: result.id,
    technique: result.technique,
    provider: result.provider,
    providerApiVersion: result.provider_api_version,
    adapterVersion: result.adapter_version,
    computedAt: result.created_at,
    method: { zodiac: "tropical", houseSystem: technical.houseSystem, nodeType: technical.nodeType },
    timeUnknownMasked: timeUnknown,
    technical,
    interpretation: interp,
  };
}
