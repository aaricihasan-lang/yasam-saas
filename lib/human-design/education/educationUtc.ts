// Human Design — Hazır Eğitim Haritaları · TARİHSEL UTC KATMANI (FAZ 2-B2) · SAF (IO yok).
//
// Mevcut natal zaman çözümü (birthTimeResolution) DEĞİŞMEZ ve burada karar için KULLANILMAZ: tarihsel kayıtlarda
// modern IANA kuralı (Node/ICU tzdata, backzone yok) yanlış an verebilir (LMT, demiryolu/şehir saati, işaret hataları).
// Eğitim kaydının doğum anı BELGEYE dayanır:
//   belgedeki yerel saat (documented_local_time) + kayıtlı saat standardı (time_standard) + kayıtlı ofset
//   (utc_offset_seconds, saniye hassasiyetli) → bağımsız yeniden hesaplanan UTC, kayıtlı birth_utc ile EŞİT olmalı.
// Yalnız utc_status = VERIFIED kayıtlar hesaplanır; PENDING_VERIFICATION hiçbir koşulda hesaplamaya alınmaz.
// Sağlayıcıya UTC tarih + UTC saat (HH:mm:ss) + timezone "UTC" gönderilir; ofset/IANA gönderilmez.
// IANA karşılaştırması YALNIZ bilgi amaçlıdır ("modern kural X sn farklı derdi") — kararı etkilemez.

import { resolveBirthLocalTime } from "../api/birthTimeResolution";

export type EduUtcInput = {
  birthDate: string;                 // YYYY-MM-DD (belgedeki yerel takvim tarihi)
  documentedLocalTime: string;       // belge ifadesi; baştaki HH:MM veya "(= HH:MM)" okunur
  timeStandard: string | null;
  utcOffsetSeconds: number | null;   // yerel = UTC + ofset
  birthUtc: string | null;           // ISO (Z)
  utcStatus: string;
  ianaZone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type EduUtcFailCode =
  | "UTC_NOT_VERIFIED"
  | "UTC_MISSING"
  | "COORDINATES_MISSING"
  | "LOCAL_TIME_UNPARSED"
  | "OFFSET_MISSING"
  | "UTC_INCONSISTENT";

export type EduUtcOk = {
  ok: true;
  utcIso: string;                                  // saniyeli, Z
  request: { date: string; time: string; timezone: "UTC" };
  localWall: string;                               // YYYY-MM-DDTHH:mm:ss (belgedeki yerel duvar saati)
  offsetSeconds: number;
  secondsNonZero: boolean;                         // UTC saniyesi 0 değil → sağlayıcının saniyeyi işlediği doğrulanmadı
  ianaModern: { zone: string; utcIso: string; deltaSeconds: number } | null;
  methodology: string;                             // kullanıcıya gösterilecek Türkçe açıklama (kişi adı yok)
};
export type EduUtcResult = EduUtcOk | { ok: false; code: EduUtcFailCode; reason: string };

export const EDU_UTC_FAIL_TEXT: Readonly<Record<EduUtcFailCode, string>> = Object.freeze({
  UTC_NOT_VERIFIED: "UTC anı doğrulanmadı (teyit bekliyor) — hesaplama yapılmaz.",
  UTC_MISSING: "Kayıtlı UTC anı yok.",
  COORDINATES_MISSING: "Doğum yeri koordinatı yok.",
  LOCAL_TIME_UNPARSED: "Belgedeki yerel saat okunamadı.",
  OFFSET_MISSING: "Kayıtlı saat standardı ofseti yok — UTC anı bağımsız doğrulanamaz.",
  UTC_INCONSISTENT: "Belgedeki yerel saat ve kayıtlı ofset, kayıtlı UTC anını vermiyor.",
});

/** Belgedeki saat ifadesinden HH:mm[:ss]. Önce açık "(= HH:MM)" karşılığı, yoksa baştaki saat. */
export function parseDocumentedLocalTime(text: string): { h: number; m: number; s: number } | null {
  const t = String(text ?? "");
  const explicit = /\(=\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\)?/.exec(t);
  const lead = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\s*[AaPp]\.?\s*[Mm]\.?)/.exec(t);
  const m = explicit ?? lead;
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59)) return null;
  return { h, m: mi, s };
}

/** "+00:39:58" / "-04:00" / "+02:00" → saniye (yerel = UTC + ofset). */
export function parseUtcOffsetText(text: string): number | null {
  const m = /^\s*([+-])(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(text ?? ""));
  if (!m) return null;
  const sec = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] === "-" ? -sec : sec;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function fmtOffset(sec: number): string {
  const sign = sec < 0 ? "−" : "+";
  const a = Math.abs(sec);
  return `${sign}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}:${pad(a % 60)}`;
}
function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function resolveEducationBirthUtc(i: EduUtcInput): EduUtcResult {
  const fail = (code: EduUtcFailCode): EduUtcResult => ({ ok: false, code, reason: EDU_UTC_FAIL_TEXT[code] });
  if (i.utcStatus !== "VERIFIED") return fail("UTC_NOT_VERIFIED");
  if (!i.birthUtc) return fail("UTC_MISSING");
  const utcMs = Date.parse(i.birthUtc);
  if (!Number.isFinite(utcMs)) return fail("UTC_MISSING");
  if (typeof i.latitude !== "number" || typeof i.longitude !== "number" || !Number.isFinite(i.latitude) || !Number.isFinite(i.longitude)) {
    return fail("COORDINATES_MISSING");
  }
  const lt = parseDocumentedLocalTime(i.documentedLocalTime);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(i.birthDate ?? "").slice(0, 10));
  if (!lt || !dm) return fail("LOCAL_TIME_UNPARSED");
  if (typeof i.utcOffsetSeconds !== "number" || !Number.isInteger(i.utcOffsetSeconds)) return fail("OFFSET_MISSING");

  // Bağımsız yeniden hesap: yerel duvar saati − ofset = UTC (Gregoryen proleptik; takvim notu ayrı belgelenir).
  const wallMs = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), lt.h, lt.m, lt.s);
  const recomputed = wallMs - i.utcOffsetSeconds * 1000;
  if (Math.abs(recomputed - utcMs) > 1000) return fail("UTC_INCONSISTENT");

  const utcIso = isoSeconds(utcMs);
  const d = new Date(utcMs);
  const request = {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    timezone: "UTC" as const,
  };
  const localWall = `${dm[1]}-${dm[2]}-${dm[3]}T${pad(lt.h)}:${pad(lt.m)}:${pad(lt.s)}`;

  let ianaModern: EduUtcOk["ianaModern"] = null;
  if (i.ianaZone) {
    const zone = String(i.ianaZone).split(/\s|\(/)[0];
    const r = resolveBirthLocalTime(`${dm[1]}-${dm[2]}-${dm[3]}`, `${pad(lt.h)}:${pad(lt.m)}:${pad(lt.s)}`, zone);
    if (r.kind === "ok") ianaModern = { zone, utcIso: isoSeconds(Date.parse(r.utcIso)), deltaSeconds: Math.round((Date.parse(r.utcIso) - utcMs) / 1000) };
  }

  const parts = [
    `Belgedeki yerel saat ${pad(lt.h)}:${pad(lt.m)}${lt.s ? `:${pad(lt.s)}` : ""}`,
    i.timeStandard ? `kayıtlı saat standardı (${String(i.timeStandard).slice(0, 160)}${String(i.timeStandard).length > 160 ? "…" : ""})` : "kayıtlı saat standardı",
    `ofset ${fmtOffset(i.utcOffsetSeconds)}`,
  ];
  let methodology = `${parts.join(", ")} ile UTC'ye çevrildi: ${utcIso}. Hesaplama sağlayıcısına UTC tarih/saat ve "UTC" saat dilimi gönderilir; modern saat dilimi kuralı kullanılmaz.`;
  if (ianaModern && ianaModern.deltaSeconds !== 0) {
    methodology += ` Bilgi: modern kural (${ianaModern.zone}) bu doğumu ${Math.abs(ianaModern.deltaSeconds)} sn ${ianaModern.deltaSeconds > 0 ? "daha geç" : "daha erken"} hesaplardı; tarihsel düzeltme belgeye dayanır.`;
  }
  return { ok: true, utcIso, request, localWall, offsetSeconds: i.utcOffsetSeconds, secondsNonZero: d.getUTCSeconds() !== 0, ianaModern, methodology };
}
