/**
 * Gece operasyonu — Bütüncül Numeroloji ek ziyaretçi çalıştırıcıları (YEREL motor, sağlayıcı kredisi 0; motorlar DEĞİŞMEZ).
 *   numb:relation → analyzeRelationship (iki kişi; ikinci kişi YALNIZ bellekte). Sayılar her zaman; kitap metinleri yalnız yorum açıksa.
 *   numb:place    → calcPlaceNumber (bina + daire no). Sayı + adımlar her zaman; kitap metni yalnız yorum açıksa.
 * İşyeri uyumu (Motor B) ve eş uyumu ürün kapsamı dışıdır; burada da kullanılmaz (ekol karıştırılmaz). Tek genel uyum puanı yoktur.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { analyzeRelationship } from "@/lib/numeroloji/relationship/index";
import { calcPlaceNumber } from "@/lib/numeroloji/place/placeNumber";
import type { ResultBlock } from "../types";
import { F, done, istanbulToday, notFuture, onlyKeys, parseDate, parseName, trDate, type FieldErrors, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/numbExtra");

const BIRTH_RANGE = { min: 1900, max: 2100 };
const NOTE_ON = "Yorumlar kitap kataloğundaki genel metinlerdir; kişiye özel uzman değerlendirmesi değildir.";
const NOTE_OFF = "Yorumlar bu kampanyada kapalı. Yorumlu çalışma profesyonel üyelikte.";

type Person = { firstName: string; lastName: string; birth: { year: number; month: number; day: number } };
type RelationIn = { a: Person; b: Person };

export const numbRelation: VisitorRunner<RelationIn> = {
  key: "numb:relation",
  kind: "local",
  formLabel: "İki kişinin adı, soyadı ve doğum tarihi",
  fields: [
    { ...F.firstName, label: "1. kişi — ad" },
    { ...F.lastName, label: "1. kişi — soyad" },
    { ...F.birthDate, label: "1. kişi — doğum tarihi" },
    { ...F.firstName, k: "firstName2", label: "2. kişi — ad" },
    { ...F.lastName, k: "lastName2", label: "2. kişi — soyad" },
    { ...F.birthDate, k: "birthDate2", label: "2. kişi — doğum tarihi" },
  ],
  parse(input, now) {
    const bad = onlyKeys(input, ["firstName", "lastName", "birthDate", "firstName2", "lastName2", "birthDate2"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const today = istanbulToday(now).iso;
    const person = (sfx: string): Person => {
      const firstName = parseName(input, `firstName${sfx}`, errors);
      const lastName = parseName(input, `lastName${sfx}`, errors);
      const birth = parseDate(input, `birthDate${sfx}`, errors, BIRTH_RANGE);
      notFuture(birth, `birthDate${sfx}`, errors, today);
      return { firstName, lastName, birth: birth! };
    };
    const a = person("");
    const b = person("2");
    return done(errors, { a, b });
  },
  async run(ctx, v) {
    let r: ReturnType<typeof analyzeRelationship>;
    try {
      r = analyzeRelationship({
        person1: { name: v.a.firstName, surname: v.a.lastName, birthDate: trDate(v.a.birth) },
        person2: { name: v.b.firstName, surname: v.b.lastName, birthDate: trDate(v.b.birth) },
      });
    } catch {
      r = null;
    }
    if (!r) return { ok: false, code: "hesap", message: "Bu bilgilerle hesap yapılamadı. Ad ve tarihleri kontrol edin." };
    const [a, b] = r.persons;
    const blocks: ResultBlock[] = [
      {
        type: "table",
        title: "Kişi sayıları",
        head: ["Kişi", "Yaşam Kodu", "İsim Sayısı", "Edinim", "Doğum Günü", "PİN"],
        rows: [a, b].map((x, i) => [`${i + 1}. kişi`, String(x.lifeCodeDigit), String(x.nameNumber), String(x.acquisitionDigit), String(x.birthdayDigit), x.pin8.join("")]),
      },
      {
        type: "kv",
        title: "Sinerji",
        rows: [
          ["Sinerji PİN", r.synergyPin.pin.join(" ")],
          ["Neden bir aradayız", `${r.whyTogether.digit}${r.whyTogether.sum !== undefined ? ` (toplam ${r.whyTogether.sum})` : ""}`],
          ["İlişkinin ruh duygusu", String(r.relationshipSoulFeeling.digit)],
          ["Ortak rakam", String(r.commonTopics.commonDigit)],
          ["Baskın / edilgen", `${r.dominance.baskin} / ${r.dominance.edilgen}`],
        ],
      },
      { type: "table", title: "Sinerji haneleri", head: ["Hane", "Alan", "Değer"], rows: r.synergyPin.haneInterpretations.map((h) => [String(h.position), h.field, String(h.value)]) },
      { type: "table", title: "Enerji dağılımı", head: ["Element", "Adet", "Düzey"], rows: r.elementBalance.levels.map((l) => [l.element, String(l.count), l.level ?? "—"]) },
      { type: "list", title: "İlişki üçgeni", items: r.relationshipTriangle.nodes.map((n) => `${n.position}. hane (${n.field}): ${n.value}`), kind: "veri" },
    ];
    let shown = false;
    if (ctx.commentsEnabled) {
      const add = (title: string, text: string | null | undefined) => {
        if (!text || !text.trim()) return;
        blocks.push({ type: "text", title, text: text.trim(), kind: "yorum" });
        shown = true;
      };
      add("Neden bir aradayız", r.whyTogether.text);
      add("İlişkinin ruh duygusu", r.relationshipSoulFeeling.text);
      add("Ortak konular", r.commonTopics.text);
      add("1. kişiden 2. kişiye", r.relationshipType.aToB);
      add("2. kişiden 1. kişiye", r.relationshipType.bToA);
      add("Yaşam Kodu — 1. kişi", r.lifeCodeCompatibility.aText);
      add("Yaşam Kodu — 2. kişi", r.lifeCodeCompatibility.bText);
      for (const n of r.relationshipTriangle.nodes) add(`Üçgen — ${n.field}`, n.text);
    }
    return {
      ok: true,
      result: {
        title: "Bütüncül Numeroloji — İlişki Analizi",
        subtitle: `${v.a.firstName} ${v.a.lastName} & ${v.b.firstName} ${v.b.lastName}`,
        blocks,
        notes: [shown ? NOTE_ON : NOTE_OFF, "Tek bir genel uyum puanı yoktur; katmanlar ayrı ayrı okunur.", "İkinci kişinin bilgileri yalnız bu hesap için kullanıldı; kaydedilmedi."],
        commentsShown: shown,
      },
    };
  },
};

type PlaceIn = { building: number; unit: number };

export const numbPlace: VisitorRunner<PlaceIn> = {
  key: "numb:place",
  kind: "local",
  formLabel: "Bina ve daire / kapı numarası",
  fields: [
    { k: "building", label: "Bina / apartman no", type: "number", required: true, min: 1, max: 99999 },
    { k: "unit", label: "Daire / kapı no", type: "number", required: true, min: 1, max: 99999 },
  ],
  parse(input) {
    const bad = onlyKeys(input, ["building", "unit"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const num = (k: string) => {
      const raw = input[k];
      const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,5}$/.test(raw.trim()) ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 99999) {
        errors[k] = "1–99999 arası bir tam sayı girin.";
        return 0;
      }
      return n;
    };
    const building = num("building");
    const unit = num("unit");
    return done(errors, { building, unit });
  },
  async run(ctx, v) {
    const r = calcPlaceNumber(v.building, v.unit);
    if (!r) return { ok: false, code: "hesap", message: "Bu numaralarla hesap yapılamadı." };
    const blocks: ResultBlock[] = [
      { type: "kv", title: "Mekân sayısı", rows: [["Bina no", String(r.buildingNumber)], ["Daire / kapı no", String(r.unitNumber)], ["Ham toplam", String(r.rawTotal)], ["Mekân sayısı", String(r.reducedNumber)]] },
    ];
    if (r.steps.length) blocks.push({ type: "list", title: "Sadeleştirme adımları", items: r.steps, kind: "veri" });
    const shown = ctx.commentsEnabled && !!r.interpretation?.trim();
    if (shown) blocks.push({ type: "text", title: `${r.reducedNumber} sayılı mekân`, text: r.interpretation!.trim(), kind: "yorum" });
    return {
      ok: true,
      result: {
        title: "Bütüncül Numeroloji — Ev / İşyeri Sayısı",
        subtitle: `${r.buildingNumber} / ${r.unitNumber}`,
        blocks,
        notes: [shown ? NOTE_ON : NOTE_OFF],
        commentsShown: shown,
      },
    };
  },
};
