import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
  fieldInline,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import {
  normalizeWordPersonSections,
  personSourceNotesForRecords,
  type MatchedNoteRef,
  type PersonSourceNoteGroup,
  type WordPersonSections,
} from "@/app/numeroloji/bilgi-bankasi/helpers/wordPersonSections";
import { buildKnowledgeLookupPlan, pickNotesForType } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";
import type { SourceEntryRow } from "@/app/numeroloji/bilgi-bankasi/helpers/sourceEntryUiLogic";
import type { KnowledgeRecordRow } from "@/app/numeroloji/bilgi-bankasi/helpers/bilgiBankaKayit";
import { extractMotorFromAnalysisJson } from "@/app/numeroloji/utils/analysisJson";

export const runtime = "nodejs";

const C_NR = "4c1d95"; // derin mor — numeroloji rengi

const ANALIZ_LABELS: Record<string, string> = {
  "ana-kulvar": "Ana Kulvar",
  "yan-kulvar": "Yan Kulvar",
  "ifade-sayisi": "İfade Sayısı",
  "hayat-yolu": "Hayat Yolu",
  "cakra-omurga": "Çakra Omurga",
  element: "Element",
  diger: "Diğer",
};
const analizLabel = (k: string): string => ANALIZ_LABELS[k] ?? k;

type ExportMode = "all" | "selected" | "single";

type RecordRow = {
  id: string;
  tenant_id: string;
  name: string;
  surname: string;
  birth_date: string;
  analysis_data: unknown;
  created_at: string;
};

// analysis_data.motor içinden güvenli okuma
function safeMotor(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if (!o.motor || typeof o.motor !== "object" || Array.isArray(o.motor)) return null;
  return o.motor as Record<string, unknown>;
}

function safeDisplay(val: unknown): string {
  if (!val || typeof val !== "object") return "—";
  const v = (val as Record<string, unknown>).display;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function safeSummary(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const s = (data as Record<string, unknown>).summary;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function safePin(motor: Record<string, unknown> | null): string {
  if (!motor) return "—";
  const pin = motor.pinKodu as Record<string, unknown> | undefined;
  if (!pin) return "—";
  const row1 = [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5].map((k) => String(k ?? "—")).join("  ");
  const row2 = [pin.k6, pin.k7, pin.k8, pin.k9].map((k) => String(k ?? "—")).join("  ");
  return `${row1}   |   ${row2}`;
}

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

function buildSingleRecord(
  row: RecordRow,
  n: number,
  sections: WordPersonSections,
  sourceGroups: PersonSourceNoteGroup[] | undefined,
): ReportChild[] {
  const motor = safeMotor(row.analysis_data);
  const summary = safeSummary(row.analysis_data);
  const adSoyad = `${row.name} ${row.surname}`.trim();

  const out: ReportChild[] = [];

  out.push(profileLabel(`KAYIT #${String(n).padStart(3, "0")}`, C_NR));
  out.push(h1Colored(`${n}. ${adSoyad}`, C_NR, n > 1));

  // Kimlik tablosu — yalnız seçiliyse
  if (sections.identity) {
    out.push(h2("Kimlik Bilgileri"));
    out.push(twoColTable([
      ["Ad",            row.name || "—"],
      ["Soyad",         row.surname || "—"],
      ["Doğum Tarihi",  row.birth_date || "—"],
      ["Analiz Tarihi", new Date(row.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })],
    ]));
  }

  // Temel değerler — yalnız seçiliyse ve motor varsa
  if (sections.values && motor) {
    out.push(h2("Temel Numeroloji Değerleri"));
    out.push(twoColTable([
      ["Ana Kulvar",   safeDisplay(motor.anaKulvar)],
      ["Yan Kulvar",   safeDisplay(motor.yanKulvar)],
      ["İfade Sayısı", safeDisplay(motor.ifadeSayisi)],
      ["Hayat Yolu",   safeDisplay(motor.hayatYolu)],
    ]));
  }

  // PIN — yalnız seçiliyse ve motor varsa
  if (sections.pin && motor) {
    out.push(h3("PIN Kodu"));
    out.push(fieldInline("PIN", safePin(motor)));
  }

  // Özet — yalnız seçiliyse ve varsa
  if (sections.summary && summary) {
    out.push(h2("Analiz Özeti"));
    out.push(bodyText(summary.slice(0, 600)));
  }

  // Kaynak Notları — yalnız seçiliyse; kişinin değerlerine eşleşen include_in_analysis notları
  if (sections.sourceNotes && sourceGroups && sourceGroups.length > 0) {
    out.push(h2("Kaynak Notları"));
    for (const g of sourceGroups) {
      out.push(h3(`${analizLabel(g.ref.analysisType)} — ${g.ref.value}`));
      for (const nt of g.notes) out.push(bodyText(`[${nt.label}] ${nt.body.trim()}`, 20));
    }
  }

  return out;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "all", ids, recordId, sections: sectionsRaw } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    ids?: string[];
    recordId?: string;
    sections?: unknown;
  };

  // Bölüm seçimi (verilmezse tüm bölümler — eski istemci uyumu).
  const sections = normalizeWordPersonSections(sectionsRaw);

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // Kullanıcının bu tenant'a ait olduğunu doğrula (IDOR koruması) — service_role
  const { data: userRow } = await db
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!userRow)
    return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  // Demo hesap: export sunucu seviyesinde engellenir
  if (await isDemoAccountId(userId, db))
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let query = db.from("numerology_records").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && recordId) {
    query = query.eq("id", recordId);
  } else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("name");
  if (error)
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as RecordRow[];
  if (!rows.length)
    return Response.json({ ok: false, error: "Bu seçim için kayıt bulunamadı." }, { status: 404 });

  // NKB-V2: Kaynak Notları — yalnız seçiliyse. Kişinin hesaplanan değerlerini tenant'ın kanonik
  // kayıtlarına eşleştirip (analiz ekranıyla AYNI pure lookup) include_in_analysis=true notları
  // ekler. Bulk fetch (3 sorgu, kişi başına DEĞİL → N+1 yok); eşleştirme bellek içi.
  const sourceGroupsByRecord = new Map<string, PersonSourceNoteGroup[]>();
  if (sections.sourceNotes) {
    const [kRes, seRes, srcRes] = await Promise.all([
      db.from("numerology_knowledge_records").select("id, analysis_type, value").eq("tenant_id", tenantId),
      db.from("numerology_knowledge_source_entries").select("*").eq("tenant_id", tenantId).eq("include_in_analysis", true),
      db.from("numerology_sources").select("id, display_label").eq("tenant_id", tenantId),
    ]);
    if (!kRes.error && !seRes.error && !srcRes.error) {
      const kRows = (kRes.data || []) as KnowledgeRecordRow[];
      const entries = (seRes.data || []) as SourceEntryRow[];
      const labelMap = new Map<string, string>();
      for (const s of (srcRes.data || []) as { id: string; display_label: string }[]) labelMap.set(s.id, s.display_label);
      if (entries.length > 0 && kRows.length > 0) {
        for (const person of rows) {
          const motor = extractMotorFromAnalysisJson(person.analysis_data);
          if (!motor) continue;
          const seen = new Set<string>();
          const matched: MatchedNoteRef[] = [];
          for (const p of buildKnowledgeLookupPlan(motor)) {
            for (const nt of pickNotesForType(kRows, p.analysisType, p.values, seen)) {
              matched.push({ id: nt.id, analysisType: nt.analysisType, value: nt.value });
            }
          }
          const groups = personSourceNotesForRecords(matched, entries, labelMap);
          if (groups.length > 0) sourceGroupsByRecord.set(person.id, groups);
        }
      }
    }
  }

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (rows.length === 1 && exportMode !== "all");

  const exportLabel =
    exportMode === "single" ? `Tek Kayıt — ${rows[0]!.name} ${rows[0]!.surname}` :
    exportMode === "selected" ? `Seçili Kayıtlar (${rows.length})` :
    `Tüm Kayıtlar (${rows.length})`;

  const all: ReportChild[] = [];

  // Premium kapak
  const subTitle = isSingle && rows[0]
    ? `${rows[0].name} ${rows[0].surname} · Doğum: ${rows[0].birth_date}`
    : "Toplu Numeroloji Kayıt Raporu";

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "NUMEROLOJİ RAPORU",
    subtitle: subTitle,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Kayıt Sayısı", value: String(rows.length) },
      { label: "Kapsam",       value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Kayıt Sayısı", String(rows.length)],
    ["Rapor Kapsamı", exportLabel],
  ]));

  all.push(...buildTOCPage());

  // İçerik
  all.push(h1Colored("1. Numeroloji Kayıtları", C_NR, true));
  all.push(muted(`${rows.length} kayıt`));
  all.push(spacer());

  rows.forEach((row, i) => {
    if (i > 0) all.push(divider());
    all.push(...buildSingleRecord(row, i + 1, sections, sourceGroupsByRecord.get(row.id)));
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Numeroloji Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && rows[0] ? slugify(`${rows[0].name} ${rows[0].surname}`) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `numeroloji-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
