// Human Design — Hazır Eğitim Haritaları · FAZ 19 · SAF yardımcılar (IO yok): doğum saati kaynak düzeyi + saat standardı metni.
// Eğitmen ve owner ekranlarındaki "doğum saati" etiketi SABİT değildir; yalnız kayıtlı kaynak alanlarının
// (hd_education_sources: primary_secondary, seen_how, time_explicit) DESTEKLEDİĞİ kadarını söyler. "Belge görüldü"
// bilgisi kayıtlı değilse etiket bunu iddia etmez.

export type EduBirthTimeEvidence = "birincil_goruldu" | "ayna_goruldu" | "birincil_kaynak" | "aktarim" | "kaynakli";

export const EDU_BIRTH_EVIDENCE_LABEL: Readonly<Record<EduBirthTimeEvidence, string>> = Object.freeze({
  birincil_goruldu: "Birincil belge görüldü",
  ayna_goruldu: "Ayna kopyadan görüldü",
  birincil_kaynak: "Birincil kaynaklı doğum saati",
  aktarim: "Aktarıma dayanır (belge görülmedi)",
  kaynakli: "Kaynaklı doğum saati",
});

/** Ekran ipucu (title): etiketin hangi kayıtlı bilgiye dayandığı. */
export const EDU_BIRTH_EVIDENCE_HINT: Readonly<Record<EduBirthTimeEvidence, string>> = Object.freeze({
  birincil_goruldu: "Doğum saati kaynağı birincil belge; belgenin görüldüğü kayıtlı.",
  ayna_goruldu: "Doğum saati belgesi bir ayna / kopya arşivden görüldü (özgün kurum sitesi değil).",
  birincil_kaynak: "Doğum saati kaynağı birincil olarak sınıflandı; belgenin nasıl görüldüğü kayıtlı değil.",
  aktarim: "Doğum saati bir aktarıma dayanır; belge görüntüsünün görülmediği kayıtlı.",
  kaynakli: "Doğum saati kaynaklıdır; birincil belge görüldüğüne dair kayıt yok.",
});

export type EduBirthTimeSourceLite = {
  role: string;
  primarySecondary: string | null;
  seenHow: string | null;
  timeExplicit: boolean | null;
};

type Seen = "seen" | "mirror" | "not_seen" | null;

// Sıra önemlidir: "görülmedi" ifadesi, aynı metindeki "görüntü" / "okundu" sözcüklerinden ÖNCE değerlendirilir.
const NOT_SEEN_RE = /görülmedi|görülemedi|görülmemiş|görmedi|görüntüsü yok|not seen/;
const MIRROR_RE = /ayna|opengauquelin|mirror/;
const SEEN_RE = /görüldü|görüntü|okundu|incelendi/;

/** seen_how serbest metni → görülme sınıfı (tanınmayan metin → null: hiçbir şey iddia edilmez). */
export function classifySeenHow(seenHow: string | null | undefined): Seen {
  if (typeof seenHow !== "string" || !seenHow.trim()) return null;
  const t = seenHow.toLocaleLowerCase("tr-TR");
  if (NOT_SEEN_RE.test(t)) return "not_seen";
  if (MIRROR_RE.test(t) && SEEN_RE.test(t)) return "mirror";
  if (SEEN_RE.test(t)) return "seen";
  return null;
}

function sourceLevel(s: EduBirthTimeSourceLite): EduBirthTimeEvidence {
  if (s.timeExplicit === false) return "kaynakli"; // saat belgede açık değil → belge düzeyi iddia edilmez
  const primary = s.primarySecondary === "birincil";
  const seen = classifySeenHow(s.seenHow);
  if (seen === "not_seen") return "aktarim";
  if (seen === "mirror") return "ayna_goruldu";
  if (seen === "seen") return primary ? "birincil_goruldu" : "kaynakli";
  return primary ? "birincil_kaynak" : "kaynakli";
}

const RANK: Readonly<Record<EduBirthTimeEvidence, number>> = { birincil_goruldu: 5, ayna_goruldu: 4, birincil_kaynak: 3, aktarim: 2, kaynakli: 1 };

/** Güncel revizyonun kaynakları → doğum saati kanıt düzeyi (birden çok birth_time kaynağında en güçlüsü). */
export function deriveBirthTimeEvidence(sources: readonly EduBirthTimeSourceLite[]): EduBirthTimeEvidence {
  let best: EduBirthTimeEvidence = "kaynakli";
  for (const s of sources) {
    if (s.role !== "birth_time") continue;
    const l = sourceLevel(s);
    if (RANK[l] > RANK[best]) best = l;
  }
  return best;
}

/** Eğitmen / owner ayrıntısı için doğum saati kaynağının "nasıl görüldü" özeti (kayıt yoksa null). */
export function birthTimeSeenHow(sources: readonly EduBirthTimeSourceLite[]): string | null {
  const s = sources.find((x) => x.role === "birth_time" && typeof x.seenHow === "string" && x.seenHow.trim());
  return s?.seenHow?.trim() ?? null;
}

// time_standard metninde harita duyarlılığı notu çoğunlukla " | FAZ16 duyarlılık: …" ya da ". FAZ15 duyarlılık: …" ile eklenmiştir.
const SENS_MARK_RE = /FAZ\s?\d{1,2}\s+duyarlılık/u;

/**
 * Saat standardı ↔ harita duyarlılığı notunu GÜVENLİ ayırır (yalnız gösterim; veri değişmez). İşaret yoksa, metnin başındaysa
 * ya da önünde ayırıcı ("|", ".", ";", ")") yoksa metin TEK alan olarak kalır (sensitivity = null).
 */
export function splitTimeStandard(ts: string | null | undefined): { standard: string | null; sensitivity: string | null } {
  if (typeof ts !== "string" || !ts.trim()) return { standard: ts ?? null, sensitivity: null };
  const at = ts.search(SENS_MARK_RE);
  if (at <= 0) return { standard: ts, sensitivity: null };
  const before = ts.slice(0, at).trimEnd();
  if (!/[|.;)]$/.test(before)) return { standard: ts, sensitivity: null };
  const head = before.replace(/\s*\|$/, "").trim();
  const tail = ts.slice(at).replace(/^FAZ\s?\d{1,2}\s+/u, "").trim();
  if (!head || !tail) return { standard: ts, sensitivity: null };
  return { standard: head, sensitivity: tail.charAt(0).toLocaleUpperCase("tr-TR") + tail.slice(1) };
}
