// İlişki ve Grup Analizleri — görünen etiketler (SAF). Türkçe + yerleşik İngilizce terim.
// Açıklamalar YALNIZ RoxyAPI OpenAPI tanımlarının sadık Türkçe karşılığıdır; yeni psikolojik yorum,
// başarı/uyum tahmini veya puan ÜRETİLMEZ.

import { hdChannelLabelFromCode, hdDefinitionLabelFromCode } from "../codeHelpers";
import { toAppDefinitionCode } from "../normalize/hdAppCodes";
import type { ConnectionDynamic } from "./connection";
import type { RelationKind, RelationType } from "./relationService";

export const RELATION_KIND_LABEL: Readonly<Record<RelationKind, string>> = {
  connection: "İlişki Analizi (Connection)",
  penta: "Grup Analizi (Penta)",
};

export const RELATION_TYPE_LABEL: Readonly<Record<RelationType, string>> = {
  partner: "Sevgili / Partner",
  spouse: "Eş",
  mother_child: "Anne – Çocuk",
  father_child: "Baba – Çocuk",
  friends: "Arkadaşlar",
  business: "İş Ortakları",
  family: "Aile",
  team: "Ekip / Grup",
  other: "Diğer",
};
/** İlişki türü YALNIZ bağlamdır; hesaplamayı ve sonucu DEĞİŞTİRMEZ. */
export const CONNECTION_RELATION_TYPES: ReadonlyArray<RelationType> = ["partner", "spouse", "mother_child", "father_child", "friends", "business", "other"];
export const PENTA_RELATION_TYPES: ReadonlyArray<RelationType> = ["family", "team", "business", "friends", "other"];

export const DYNAMIC_LABEL: Readonly<Record<ConnectionDynamic, string>> = {
  Electromagnetic: "Elektromanyetik (Electromagnetic)",
  Dominance: "Baskınlık (Dominance)",
  Compromise: "Uzlaşma (Compromise)",
  Companionship: "Arkadaşlık / Eşlik (Companionship)",
};

/** RoxyAPI OpenAPI `dynamic` tanımlarının Türkçe karşılığı (kaynak tanım; yorum değil). */
export const DYNAMIC_DEFINITION: Readonly<Record<ConnectionDynamic, string>> = {
  Electromagnetic: "Her kişi kanalın bir kapısını taşır; kanal yalnız iki kişi birlikteyken tamamlanır.",
  Dominance: "Bir kişi kanalın iki kapısını da taşır, diğeri hiçbirini taşımaz; tek yönlü koşullanma.",
  Compromise: "Bir kişi kanalın iki kapısını da taşır, diğeri yalnız tek (asılı) bir kapısını taşır.",
  Companionship: "İki kişi de kanalın iki kapısını kendi haritasında ayrı ayrı taşır; ortak, tanıdık frekans.",
};

export const DYNAMIC_ORDER: ReadonlyArray<ConnectionDynamic> = ["Electromagnetic", "Dominance", "Compromise", "Companionship"];

const CIRCUIT_TR: Readonly<Record<string, string>> = {
  Individual: "Bireysel (Individual)",
  Collective: "Kolektif (Collective)",
  Tribal: "Kabile (Tribal)",
};
export function circuitLabel(circuit: string): string {
  return CIRCUIT_TR[circuit] ?? circuit;
}

export function relationChannelLabel(id: string, fallbackName: string): string {
  const l = hdChannelLabelFromCode(id);
  return l && l !== id ? l : `${id} ${fallbackName}`;
}

export function combinedDefinitionLabel(kind: string): string {
  const code = toAppDefinitionCode(kind);
  return code ? hdDefinitionLabelFromCode(code) : kind;
}

export const PENTA_POSITION_LABEL = {
  upper: "Üst Penta (G → Boğaz)",
  lower: "Alt Penta (G → Sakral)",
} as const;
/** OpenAPI `position` tanımı. */
export const PENTA_POSITION_DEFINITION = {
  upper: "G Merkezi'nden Boğaz'a uzanır; liderlik ve grubun kendini dışa sunma rolleri.",
  lower: "G Merkezi'nden Sakral'a uzanır; yönetilen, üretken ve kaynak rolleri.",
} as const;
export const PENTA_CORE_NOTE = "2/14 Ritim (The Beat) kanalı Penta'nın maddi çekirdeğidir: 2. kapı kaynakların yönü, 14. kapı kaynakların kendisi.";
export const PENTA_GAP_NOTE = "Hiçbir üyenin taşımadığı kapı, grubun telafi etmeye çalıştığı eksik bir işlevi (rol boşluğu) gösterir.";

export const RELATION_DISCLAIMER =
  "Bu analiz Human Design sisteminin mekaniklerini gösterir; bilimsel olarak doğrulanmış bir ilişki tahmini, uyum puanı veya başarı garantisi değildir.";

/** Katılımcı harfi: Connection'da A/B, Penta'da 1–5. */
export function participantTag(kind: RelationKind, position: number): string {
  return kind === "connection" ? (position === 0 ? "A" : "B") : String(position + 1);
}
