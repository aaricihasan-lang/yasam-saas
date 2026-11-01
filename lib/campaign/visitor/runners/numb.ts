/**
 * KM-3 — Bütüncül Numeroloji ziyaretçi çalıştırıcıları (YEREL motor, sağlayıcı kredisi 0).
 *   numb:analysis → hesaplaNumeroloji (yalnız sayılar + hesap adımları; uzman Bilgi Bankası / taş KULLANILMAZ).
 *   numb:timing   → evrensel / kişisel zamanlama + evre-döngü. Kitap kataloğu metinleri YALNIZ yorumlar açıksa eklenir.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { computeCycleTiming, computePersonalTiming, computeUniversalTiming } from "@/lib/numeroloji/timing/index";
import type { ResultBlock } from "../types";
import { F, done, istanbulToday, notFuture, onlyKeys, parseDate, parseName, trDate, type FieldErrors, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/numb");

const BIRTH_RANGE = { min: 1900, max: 2100 };

type AnalysisIn = { firstName: string; lastName: string; birth: { year: number; month: number; day: number } };

export const numbAnalysis: VisitorRunner<AnalysisIn> = {
  key: "numb:analysis",
  kind: "local",
  formLabel: "Ad, soyad ve doğum tarihi",
  fields: [F.firstName, F.lastName, F.birthDate],
  parse(input, now) {
    const bad = onlyKeys(input, ["firstName", "lastName", "birthDate"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const firstName = parseName(input, "firstName", errors);
    const lastName = parseName(input, "lastName", errors);
    const birth = parseDate(input, "birthDate", errors, BIRTH_RANGE);
    notFuture(birth, "birthDate", errors, istanbulToday(now).iso);
    return done(errors, { firstName, lastName, birth: birth! });
  },
  async run(_ctx, v) {
    let r: ReturnType<typeof hesaplaNumeroloji>;
    try {
      r = hesaplaNumeroloji({ firstName: v.firstName, lastName: v.lastName, birthDate: trDate(v.birth) });
    } catch {
      return { ok: false, code: "hesap", message: "Bu bilgilerle hesap yapılamadı. Ad ve tarihi kontrol edin." };
    }
    const blocks: ResultBlock[] = [
      {
        type: "kv",
        title: "Temel sayılar",
        rows: [
          ["Ana Kulvar", r.anaKulvar.display],
          ["Yan Kulvar", r.yanKulvar.display],
          ["İfade Sayısı", r.ifadeSayisi.display],
          ["Hayat Yolu", r.hayatYolu.display],
          ["Elementler", r.elementler.display],
        ],
      },
      { type: "text", title: "PİN kodu", text: r.pinKoduMetni, kind: "veri" },
      { type: "text", title: "Çakra omurgası", text: r.cakraOmurgasiMetni, kind: "veri" },
      { type: "text", title: "Zirve yılları", text: r.zirveYillariMetni, kind: "veri" },
      { type: "text", title: "Mücadele yılları", text: r.mucadeleYillariMetni, kind: "veri" },
      { type: "text", title: "Değişim-dönüşüm yılları", text: r.degisimDonusumMetni, kind: "veri" },
      { type: "text", title: "Harflerin yankılanışı", text: r.harflerinYankilanisiMetni, kind: "veri" },
    ];
    return {
      ok: true,
      result: {
        title: "Bütüncül Numeroloji Analizi",
        subtitle: `${v.firstName} ${v.lastName} · ${trDate(v.birth)}`,
        blocks,
        notes: ["Bu sonuç sayıları ve hesap adımlarını gösterir. Kişisel yorumlar profesyonel üyelikte uzmanınızın Bilgi Bankası ile hazırlanır."],
        commentsShown: false,
      },
    };
  },
};

type TimingIn = { birth: { year: number; month: number; day: number }; ref: { year: number; month: number; day: number } };

export const numbTiming: VisitorRunner<TimingIn> = {
  key: "numb:timing",
  kind: "local",
  formLabel: "Doğum tarihi ve bakılacak tarih",
  fields: [F.birthDate, { k: "refDate", label: "Bakılacak tarih", type: "date", hint: "Boş bırakılırsa bugün." }],
  parse(input, now) {
    const bad = onlyKeys(input, ["birthDate", "refDate"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const today = istanbulToday(now);
    const birth = parseDate(input, "birthDate", errors, BIRTH_RANGE);
    notFuture(birth, "birthDate", errors, today.iso);
    const ref = parseDate(input, "refDate", errors, { min: 1900, max: 2100 }, false) ?? today;
    if (birth && ref.iso < birth.iso) errors.refDate = "Bakılacak tarih doğum tarihinden önce olamaz.";
    return done(errors, { birth: birth!, ref: { year: ref.year, month: ref.month, day: ref.day } });
  },
  async run(ctx, v) {
    const bd = trDate(v.birth);
    const uni = computeUniversalTiming(v.ref);
    const per = computePersonalTiming(bd, v.ref);
    const cyc = computeCycleTiming(bd, v.ref);
    const blocks: ResultBlock[] = [
      {
        type: "kv",
        title: `Zamanlama — ${trDate(v.ref)}`,
        rows: [
          ["Evrensel Yıl", uni.universalYear.display],
          ["Evrensel Ay", uni.universalMonth.display],
          ["Evrensel Gün", uni.universalDay.display],
          ["Kişisel Yıl (takvim yılı)", per.personalYear.nominal.display],
          ["Kişisel Yıl (aktif dönem)", per.personalYear.active.display],
          ["Kişisel Ay", per.personalMonth.display],
          ["Kişisel Gün", per.personalDay.display],
          ["Yaş", String(cyc.age)],
          ["Evre", cyc.evre ? `${cyc.evre.index}. evre (enerji ${cyc.evre.energy})` : "—"],
          ["Döngü", cyc.dongu ? `${cyc.dongu.index}. döngü` : "—"],
        ],
      },
    ];
    if (ctx.commentsEnabled) {
      const add = (title: string, text: string | undefined) => {
        if (text && text.trim()) blocks.push({ type: "text", title, text: text.trim(), kind: "yorum" });
      };
      add("Evrensel Yıl", uni.universalYear.interpretation);
      add("Evrensel Ay", uni.universalMonth.interpretation);
      add("Kişisel Yıl", per.personalYear.nominal.interpretation);
      add("Kişisel Ay", per.personalMonth.interpretation);
      add("Kişisel Gün", per.personalDay.interpretation);
      add("Evre", cyc.evre?.interpretation);
      add("Döngü", cyc.dongu?.interpretation);
    }
    return {
      ok: true,
      result: {
        title: "Bütüncül Numeroloji — Zamanlama",
        subtitle: `Doğum ${bd}`,
        blocks,
        notes: ctx.commentsEnabled ? ["Yorumlar kitap kataloğundaki genel metinlerdir; kişiye özel uzman değerlendirmesi değildir."] : ["Yorumlar bu kampanyada kapalı. Yorumlu çalışma profesyonel üyelikte."],
        commentsShown: ctx.commentsEnabled,
      },
    };
  },
};
