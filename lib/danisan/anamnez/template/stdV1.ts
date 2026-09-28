import type { AnamnezTemplate } from "../types";

/**
 * STANDART ANAMNEZ ŞABLONU — std-v1 (KANONİK, DONDURULMUŞ).
 *
 * ⚠️ BU DOSYA YAYIMLANDIKTAN SONRA DEĞİŞTİRİLMEZ. Geçmiş anamnezler bu yapıyla render edilir.
 *    Değişiklik gerekiyorsa yeni sürüm (std-v2) EKLENİR; std-v1 aynen korunur. Yapı + TR/EN
 *    metinlerinin kanonik hash'i `scripts/anamnez/pure.harness.ts` tarafından kilitlidir.
 *
 * Dil ilkesi: tanı/teşhis dili YOK; "yakınma / fark edilen / bilinen" wellness dili.
 * Zorunlu alan YOK (veri minimizasyonu). Metinler: template/stdV1.i18n.ts.
 */

const MED_COLUMNS = [
  { key: "name", type: "text" },
  { key: "purpose", type: "text" },
  { key: "dose", type: "text" },
  { key: "frequency", type: "text" },
] as const;

export const STD_V1: AnamnezTemplate = {
  key: "standard",
  version: "std-v1",
  optionSets: {
    duration: ["lt_1m", "m1_6", "m6_12", "y1_5", "gt_5y", "unknown"],
    onset: ["sudden", "gradual", "unknown"],
    course: ["improving", "stable", "worsening", "fluctuating"],
    bloodType: ["a_pos", "a_neg", "b_pos", "b_neg", "ab_pos", "ab_neg", "o_pos", "o_neg", "unknown"],
    allergyCategory: ["drug", "food", "herbal", "scent", "skin", "latex", "other"],
    familyConditions: [
      "diabetes", "cardiovascular", "hypertension", "cancer", "thyroid",
      "autoimmune", "neurological", "respiratory_allergy", "other",
    ],
    ease: ["easy", "sometimes_hard", "often_hard"],
    freq4: ["never", "rarely", "sometimes", "often"],
    yesSometimesNo: ["yes", "sometimes", "no"],
    severity4: ["none", "mild", "moderate", "marked"],
    yesNoUnknown: ["yes", "no", "unknown"],
    mealPattern: ["regular", "irregular"],
    skipping: ["never", "sometimes", "often"],
    appetite: ["low", "normal", "high", "variable"],
    activityLevel: ["sedentary", "light", "moderate", "active", "very_active"],
    useStatus: ["never", "former", "current"],
    workPattern: ["office", "field", "hybrid", "remote", "not_working", "retired", "student", "other"],
    selfTime: ["rarely", "sometimes", "regularly"],
    support: ["low", "moderate", "strong"],
    pregnancy: ["no", "yes", "unknown"],
    cycle: ["regular", "irregular", "not_applicable"],
    menopause: ["pre", "peri", "post", "not_applicable"],
    painPattern: ["continuous", "intermittent"],
    skinSensitivity: ["none", "mild", "marked"],
    practices: [
      "reflexology", "aromatherapy", "cupping", "bioenergy", "massage",
      "acupuncture", "meditation_breath", "yoga", "other",
    ],
    focusAreas: [
      "sleep", "stress", "digestion", "energy", "pain", "nutrition",
      "movement", "emotional", "skin", "other",
    ],
  },
  sections: [
    {
      key: "A",
      fields: [
        { key: "A.reason", type: "textarea" },
        { key: "A.expectation", type: "textarea" },
        { key: "A.duration", type: "single", options: "duration" },
        { key: "A.onset", type: "single", options: "onset" },
        { key: "A.course", type: "single", options: "course" },
        { key: "A.aggravating", type: "textarea" },
        { key: "A.relieving", type: "textarea" },
        { key: "A.previous_support", type: "textarea" },
        { key: "A.priorities", type: "textarea" },
      ],
    },
    {
      key: "B",
      fields: [
        { key: "B.blood_type", type: "single", options: "bloodType", source: "clients.kan" },
        { key: "B.height_cm", type: "number", min: 30, max: 260, step: 0.1, unit: "cm", source: "nutrition.height_cm" },
        { key: "B.weight_kg", type: "number", min: 1, max: 500, step: 0.1, unit: "kg", source: "nutrition.weight_kg" },
        { key: "B.conditions", type: "ynd" },
        { key: "B.past_illnesses", type: "textarea" },
        { key: "B.surgeries", type: "rows", columns: [{ key: "what", type: "text" }, { key: "year", type: "text" }] },
        { key: "B.hospitalizations", type: "rows", columns: [{ key: "reason", type: "text" }, { key: "year", type: "text" }] },
        { key: "B.injuries", type: "ynd" },
        { key: "B.medical_followup", type: "ynd" },
        { key: "B.recent_tests", type: "textarea" },
        { key: "B.followup_notes", type: "textarea" },
      ],
    },
    {
      key: "C",
      fields: [
        { key: "C.any", type: "yn" },
        { key: "C.prescription", type: "rows", columns: MED_COLUMNS },
        { key: "C.otc", type: "rows", columns: MED_COLUMNS },
        { key: "C.vitamins", type: "rows", columns: MED_COLUMNS },
        { key: "C.herbal", type: "rows", columns: MED_COLUMNS },
        { key: "C.other", type: "rows", columns: MED_COLUMNS },
      ],
    },
    {
      key: "D",
      fields: [
        { key: "D.any", type: "yn" },
        {
          key: "D.items",
          type: "rows",
          source: "nutrition.allergens",
          columns: [
            { key: "category", type: "single", options: "allergyCategory" },
            { key: "trigger", type: "text" },
            { key: "reaction", type: "text" },
            { key: "note", type: "text" },
          ],
        },
        { key: "D.notes", type: "textarea" },
      ],
    },
    {
      key: "E",
      fields: [
        { key: "E.conditions", type: "multi", options: "familyConditions" },
        { key: "E.mother", type: "textarea" },
        { key: "E.father", type: "textarea" },
        { key: "E.siblings", type: "textarea" },
        { key: "E.maternal", type: "textarea" },
        { key: "E.paternal", type: "textarea" },
        { key: "E.other", type: "textarea" },
      ],
    },
    {
      key: "F",
      fields: [
        { key: "F.duration", type: "number", min: 0, max: 24, step: 0.5, unit: "hours" },
        { key: "F.bedtime", type: "time" },
        { key: "F.waketime", type: "time" },
        { key: "F.falling_asleep", type: "single", options: "ease" },
        { key: "F.night_waking", type: "single", options: "freq4" },
        { key: "F.rested", type: "single", options: "yesSometimesNo" },
        { key: "F.daytime_sleepiness", type: "single", options: "severity4" },
        { key: "F.snoring", type: "single", options: "yesNoUnknown" },
        { key: "F.quality", type: "scale10" },
        { key: "F.aids", type: "ynd" },
      ],
    },
    {
      key: "G",
      fields: [
        { key: "G.meal_count", type: "number", min: 0, max: 12, step: 1, unit: "meals", source: "nutrition.daily_meal_count" },
        { key: "G.meal_pattern", type: "single", options: "mealPattern" },
        { key: "G.skipping", type: "single", options: "skipping" },
        { key: "G.water", type: "text", source: "nutrition.water_note" },
        { key: "G.caffeine", type: "text" },
        { key: "G.diet_style", type: "text", source: "nutrition.dietary_pattern" },
        { key: "G.intolerances", type: "textarea" },
        { key: "G.appetite", type: "single", options: "appetite" },
        { key: "G.cravings", type: "textarea" },
        { key: "G.post_meal", type: "textarea" },
        { key: "G.perceived_issues", type: "textarea" },
      ],
    },
    {
      key: "H",
      fields: [
        { key: "H.satisfaction", type: "scale10" },
        { key: "H.bloating", type: "single", options: "freq4" },
        { key: "H.gas", type: "single", options: "freq4" },
        { key: "H.reflux", type: "single", options: "freq4" },
        { key: "H.constipation", type: "single", options: "freq4" },
        { key: "H.diarrhea", type: "single", options: "freq4" },
        { key: "H.bowel_change", type: "ynd" },
        { key: "H.food_related", type: "textarea" },
      ],
    },
    {
      key: "I",
      fields: [
        { key: "I.activity_level", type: "single", options: "activityLevel", source: "nutrition.activity_level" },
        { key: "I.exercise", type: "yn" },
        { key: "I.exercise_type", type: "text" },
        { key: "I.weekly_frequency", type: "number", min: 0, max: 7, step: 1, unit: "daysPerWeek" },
        { key: "I.session_minutes", type: "number", min: 0, max: 600, step: 5, unit: "minutes" },
        { key: "I.limitations", type: "ynd" },
        { key: "I.sitting_hours", type: "number", min: 0, max: 24, step: 0.5, unit: "hoursPerDay" },
        { key: "I.energy", type: "scale10" },
      ],
    },
    {
      key: "J",
      fields: [
        { key: "J.tobacco", type: "single", options: "useStatus" },
        { key: "J.tobacco_detail", type: "text" },
        { key: "J.alcohol", type: "single", options: "useStatus" },
        { key: "J.alcohol_detail", type: "text" },
        { key: "J.other_habits", type: "textarea" },
        { key: "J.occupation", type: "text" },
        { key: "J.work_pattern", type: "single", options: "workPattern" },
        { key: "J.desk_hours", type: "number", min: 0, max: 24, step: 0.5, unit: "hoursPerDay" },
        { key: "J.shift", type: "yn" },
        { key: "J.routine", type: "textarea" },
        { key: "J.lifestyle_note", type: "textarea", source: "nutrition.lifestyle_note" },
      ],
    },
    {
      key: "K",
      fields: [
        { key: "K.stress", type: "scale10" },
        { key: "K.stress_sources", type: "textarea" },
        { key: "K.coping", type: "textarea" },
        { key: "K.life_changes", type: "textarea" },
        { key: "K.self_time", type: "single", options: "selfTime" },
        { key: "K.social_support", type: "single", options: "support" },
        { key: "K.family_support", type: "textarea" },
        { key: "K.life_satisfaction", type: "scale10" },
        { key: "K.general_feeling", type: "textarea" },
      ],
    },
    {
      key: "L",
      optional: true,
      fields: [
        { key: "L.pregnancy", type: "single", options: "pregnancy" },
        { key: "L.breastfeeding", type: "yn" },
        { key: "L.cycle", type: "single", options: "cycle" },
        { key: "L.last_period", type: "date" },
        { key: "L.menopause", type: "single", options: "menopause" },
        { key: "L.notes", type: "textarea" },
      ],
    },
    {
      key: "M",
      fields: [
        { key: "M.any", type: "yn" },
        {
          key: "M.items",
          type: "rows",
          columns: [
            { key: "region", type: "text" },
            { key: "duration", type: "text" },
            { key: "intensity", type: "number", min: 0, max: 10 },
            { key: "pattern", type: "single", options: "painPattern" },
          ],
        },
        { key: "M.aggravating", type: "textarea" },
        { key: "M.relieving", type: "textarea" },
        { key: "M.daily_impact", type: "scale10" },
      ],
    },
    {
      key: "N",
      fields: [
        { key: "N.skin_sensitivity", type: "single", options: "skinSensitivity" },
        { key: "N.skin_condition", type: "ynd" },
        { key: "N.open_wound", type: "ynd" },
        { key: "N.bruising", type: "yn" },
        { key: "N.topicals", type: "textarea" },
        { key: "N.other", type: "textarea" },
      ],
    },
    {
      key: "O",
      fields: [
        { key: "O.practices", type: "multi", options: "practices" },
        {
          key: "O.details",
          type: "rows",
          columns: [
            { key: "practice", type: "text" },
            { key: "when", type: "text" },
            { key: "experience", type: "text" },
            { key: "adverse", type: "text" },
          ],
        },
        { key: "O.adverse", type: "ynd" },
      ],
    },
    {
      key: "P",
      fields: [
        { key: "P.expectation", type: "textarea" },
        { key: "P.focus_areas", type: "multi", options: "focusAreas" },
        { key: "P.goal_1", type: "text" },
        { key: "P.goal_2", type: "text" },
        { key: "P.goal_3", type: "text" },
        { key: "P.most_important", type: "textarea" },
      ],
    },
    {
      key: "Q",
      fields: [
        { key: "Q.observations", type: "textarea" },
        { key: "Q.follow_up", type: "textarea" },
        { key: "Q.client_priorities", type: "textarea" },
        { key: "Q.general_note", type: "textarea" },
        { key: "Q.next_session", type: "textarea" },
      ],
    },
  ],
};
