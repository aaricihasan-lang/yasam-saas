import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
import {
  arraySection,
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

export const runtime = "nodejs";

const C_KNOWLEDGE = "4c1d95"; // derin mor

type ExportMode = "all" | "filtered";

type KnowledgeRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  source: string | null;
  description: string | null;
  updated_at: string;
};

type StoneRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  reason: string | null;
  stones: unknown;
  updated_at: string;
};

const ANALIZ_LABELS: Record<string, string> = {
  "ana-kulvar":    "Ana Kulvar",
  "yan-kulvar":    "Yan Kulvar",
  "ifade-sayisi":  "İfade Sayısı",
  "hayat-yolu":    "Hayat Yolu",
  "cakra-omurga":  "Çakra Omurga",
  element:         "Element",
  diger:           "Diğer",
};

function analizLabel(key: string): string {
  return ANALIZ_LABELS[key] ?? key;
}

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "all", knowledgeIds, stoneIds } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    knowledgeIds?: string[];
    stoneIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

  let knowledgeQ = db.from("numerology_knowledge_records").select("*").eq("tenant_id", tenantId);
  let stoneQ = db.from("numerology_stone_assignments").select("*").eq("tenant_id", tenantId);

  if (exportMode === "filtered") {
    if (Array.isArray(knowledgeIds) && knowledgeIds.length > 0)
      knowledgeQ = knowledgeQ.in("id", knowledgeIds);
    else if (exportMode === "filtered") {
      // If filtered mode but no knowledge IDs, fetch nothing
      knowledgeQ = knowledgeQ.eq("id", "none");
    }
    if (Array.isArray(stoneIds) && stoneIds.length > 0)
      stoneQ = stoneQ.in("id", stoneIds);
    else if (exportMode === "filtered") {
      stoneQ = stoneQ.eq("id", "none");
    }
  }

  const [kRes, sRes] = await Promise.all([
    knowledgeQ.order("analysis_type").order("value"),
    stoneQ.order("analysis_type").order("value"),
  ]);

  if (kRes.error)
    return Response.json({ ok: false, error: `Açıklama kayıtları okunamadı: ${kRes.error.message}` }, { status: 500 });
  if (sRes.error)
    return Response.json({ ok: false, error: `Taş atamaları okunamadı: ${sRes.error.message}` }, { status: 500 });

  const knowledgeRows = (kRes.data || []) as KnowledgeRow[];
  const stoneRows = (sRes.data || []) as StoneRow[];

  if (!knowledgeRows.length && !stoneRows.length)
    return Response.json({ ok: false, error: "Bu seçim için kayıt bulunamadı." }, { status: 404 });

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const totalCount = knowledgeRows.length + stoneRows.length;
  const exportLabel = exportMode === "filtered"
    ? `Filtrelenmiş Kayıtlar (${totalCount})`
    : `Tüm Bilgi Bankası (${totalCount})`;

  // Analiz türlerine göre grupla
  const groupKeys = new Set<string>();
  for (const r of knowledgeRows) groupKeys.add(r.analysis_type);
  for (const r of stoneRows) groupKeys.add(r.analysis_type);

  const sortedKeys = Array.from(groupKeys).sort((a, b) =>
    analizLabel(a).localeCompare(analizLabel(b), "tr-TR")
  );

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "NUMEROLOJİ BİLGİ BANKASI",
    subtitle: "Yorum ve Doğaltaş Atama Referans Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Açıklama Kaydı",  value: String(knowledgeRows.length) },
      { label: "Doğaltaş Atama",  value: String(stoneRows.length) },
      { label: "Analiz Türü",     value: String(groupKeys.size) },
      { label: "Kapsam",          value: exportLabel },
    ],
  }));

  // Sistem özeti
  all.push(...buildStatsPage([
    ["Açıklama Kaydı",  String(knowledgeRows.length)],
    ["Doğaltaş Atama",  String(stoneRows.length)],
    ["Toplam Kayıt",    String(totalCount)],
    ["Analiz Türü",     String(groupKeys.size)],
  ]));

  all.push(...buildTOCPage());

  // Genel özet
  all.push(h1Colored("1. Genel Özet", C_KNOWLEDGE, true));
  all.push(twoColTable([
    ["Açıklama Kaydı",  `${knowledgeRows.length} kayıt`],
    ["Doğaltaş Atama",  `${stoneRows.length} kayıt`],
    ["Toplam",          `${totalCount} kayıt`],
    ["Kapsam",          exportLabel],
  ]));

  // Gruplu içerik
  let sectionN = 2;
  for (const key of sortedKeys) {
    const label = analizLabel(key);
    const kRows = knowledgeRows.filter((r) => r.analysis_type === key);
    const sRows = stoneRows.filter((r) => r.analysis_type === key);

    all.push(h1Colored(`${sectionN}. ${label}`, C_KNOWLEDGE, true));
    all.push(muted(`${kRows.length} açıklama · ${sRows.length} taş atama`));
    all.push(spacer());

    let itemN = 0;

    // Açıklama kayıtları
    if (kRows.length > 0) {
      all.push(h2("Açıklama Kayıtları"));
      for (const k of kRows) {
        itemN++;
        all.push(profileLabel(`KAYIT #${String(itemN).padStart(3, "0")}`, C_KNOWLEDGE));
        all.push(h3(k.value || "—"));
        if (k.source?.trim()) all.push(fieldInline("Kaynak", k.source.trim()));
        if (k.description?.trim()) {
          all.push(bodyText(k.description.trim()));
        }
        all.push(fieldInline("Güncelleme",
          new Date(k.updated_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
        ));
        if (itemN < kRows.length) all.push(divider());
      }
    }

    // Doğaltaş atamaları
    if (sRows.length > 0) {
      if (kRows.length > 0) all.push(spacer());
      all.push(h2("Doğaltaş Atamaları"));
      let sItemN = 0;
      for (const s of sRows) {
        sItemN++;
        const stones = parseStones(s.stones);
        all.push(profileLabel(`ATAMA #${String(sItemN).padStart(3, "0")}`, C_KNOWLEDGE));
        all.push(h3(s.value || "—"));
        if (s.reason?.trim()) all.push(bodyText(s.reason.trim()));
        all.push(...arraySection("Taşlar", stones));
        all.push(fieldInline("Güncelleme",
          new Date(s.updated_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
        ));
        if (sItemN < sRows.length) all.push(divider());
      }
    }

    sectionN++;
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Numeroloji Bilgi Bankası · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "filtered" ? "filtreli" : "tumu";
  const filename = `numeroloji-bilgi-bankasi-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
