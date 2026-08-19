import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  reportRateLimit,
  capSelectedIds,
  MAX_EXPORT_RECORDS,
  EXPORT_TRUNCATED_NOTE,
} from "@/lib/biyoenerji/reportSecurity";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
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
  deriveChakraBibliography,
  SOURCE_EVIDENCE_BLOCK_TYPE,
  type ChakraContentBlock,
} from "@/lib/bioenergy/chakraWorkspace";

export const runtime = "nodejs";

const C_CAKRA = "9333ea"; // çakra mor

/** 8 canonical section — Word bölüm başlıkları. */
const WORD_SECTION_ORDER: readonly [string, string][] = [
  ["genel-bakis", "Genel Bakış"],
  ["enerji-anatomisi", "Enerji Anatomisi & Denge"],
  ["nedenler-blokajlar", "Nedenler & Blokajlar"],
  ["beden-sistem", "Beden & Sistem"],
  ["duygusal-zihinsel", "Duygusal & Zihinsel"],
  ["uygulamalar", "Uygulamalar"],
  ["taslar-destekleyiciler", "Taşlar & Destekleyiciler"],
  ["notlar-kaynaklar", "Notlar & Kaynaklar"],
];

/** editorial_explanation'ı Word gövdesine güvenli düz metne indir (raw ### sızıntısı yok). */
function blockBodyToPlain(text: string): string {
  return text
    .split(/\r?\n/)
    .map((ln) => ln.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[-*]\s+/, "• "))
    .join("\n")
    .replace(/^\s*---\s*$/gm, "")
    .trim();
}

type ExportMode = "all" | "selected" | "single";

type ChakraRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  name: string | null;
  organs: string | null;
  glands: string | null;
  color: string | null;
  stones: string | null;
  causes: string | null;
  physical: string | null;
  mental: string | null;
  notes: string | null;
  created_at: string;
};

function formatDateTR(d: string): string {
  try {
    return new Date(d).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return d; }
}

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnızca sunucu tarafında x-user-id + x-session-token
  // (requireModuleAccess) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  const guard = await requireModuleAccess(request, "energy_body");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // FAZ1: best-effort rate-limit (asıl koruma aşağıdaki HARD CAP'tir).
  const rl = reportRateLimit("chakra", tenantId);
  if (rl) return rl;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", chakraIds, chakraId } = body as {
    exportMode?: ExportMode;
    chakraIds?: string[];
    chakraId?: string;
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // All bioenergy_chakras columns
  const SELECT = "id,tenant_id,source_uid,name,organs,glands,color,stones,causes,physical,mental,notes,created_at";
  let query = db.from("bioenergy_chakras").select(SELECT).eq("tenant_id", tenantId);

  if (exportMode === "single" && chakraId) {
    query = query.eq("id", chakraId);
  } else if (exportMode === "selected" && Array.isArray(chakraIds) && chakraIds.length > 0) {
    query = query.in("id", capSelectedIds(chakraIds));
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_EXPORT_RECORDS);
  if (error) {
    console.error("[chakra-report] read failed:", error);
    return Response.json({ ok: false, error: "Çakra kayıtları okunamadı." }, { status: 500 });
  }

  const chakras = (data || []) as ChakraRow[];
  if (!chakras.length)
    return Response.json({ ok: false, error: "Bu seçim için çakra kaydı bulunamadı." }, { status: 404 });

  // FAZ 2 — rich content blokları (tenant+chakra scoped, tek sorgu). Visible block'lu
  // çakralar canonical block modelinden export edilir; yoksa legacy alanlara düşülür.
  const blocksByChakra = new Map<string, ChakraContentBlock[]>();
  {
    const ids = chakras.map((c) => c.id);
    const blkRes = await db
      .from("bioenergy_chakra_blocks")
      .select("id, chakra_id, section_key, block_type, block_title, sort_order, editorial_explanation, source_title, source_author, created_at")
      .eq("tenant_id", tenantId)
      .in("chakra_id", ids);
    if (!blkRes.error && Array.isArray(blkRes.data)) {
      for (const raw of blkRes.data as (ChakraContentBlock & { chakra_id: string })[]) {
        const arr = blocksByChakra.get(raw.chakra_id) ?? [];
        arr.push(raw);
        blocksByChakra.set(raw.chakra_id, arr);
      }
    }
    // Tablo yoksa/hata: blocksByChakra boş → tüm çakralar legacy fallback (mevcut davranış).
  }

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = exportMode === "single" || (exportMode === "selected" && chakras.length === 1);

  const exportLabel =
    isSingle ? `Tek Çakra — ${chakras[0]!.name || ""}` :
    exportMode === "selected" ? `Seçili Çakralar (${chakras.length})` :
    `Tüm Çakra Kütüphanesi (${chakras.length})`;

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "ÇAKRA KÜTÜPHANESİ",
    subtitle: isSingle && chakras[0]
      ? `${chakras[0].name || "Çakra"} · Çakra Raporu`
      : "Biyoenerji Çakra Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Çakra Kayıt Sayısı", value: String(chakras.length) },
      { label: "Kapsam",             value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Çakra Kayıt Sayısı", String(chakras.length)],
    ["Kapsam",             exportLabel],
  ]));

  all.push(...buildTOCPage());

  if (chakras.length >= MAX_EXPORT_RECORDS) {
    all.push(muted(EXPORT_TRUNCATED_NOTE(MAX_EXPORT_RECORDS)));
  }

  all.push(h1Colored("1. Çakra Kütüphanesi", C_CAKRA, true));
  all.push(muted(`${chakras.length} kayıt`));
  all.push(spacer());

  chakras.forEach((chakra, i) => {
    const name = chakra.name?.trim() || "İsimsiz Çakra";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`ÇAKRA #${String(i + 1).padStart(3, "0")}`, C_CAKRA));
    all.push(h2(name));

    // Quick-fact tablosu (canonical block modeliyle uyumlu; legacy Renk fallback korunur)
    all.push(twoColTable([
      ["Renk",         chakra.color?.trim() || "Belirtilmemiş"],
      ["Kayıt Tarihi", formatDateTR(chakra.created_at)],
      ...(chakra.source_uid?.trim() ? [["Kaynak UID", chakra.source_uid.trim()] as [string, string]] : []),
    ]));

    const blocks = blocksByChakra.get(chakra.id) ?? [];
    const visible = blocks
      .filter((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE && (b.editorial_explanation ?? "").trim().length > 0)
      .sort((a, b) =>
        a.sort_order !== b.sort_order ? a.sort_order - b.sort_order
          : (a.created_at ?? "") < (b.created_at ?? "") ? -1 : a.id < b.id ? -1 : 1);

    if (visible.length > 0) {
      // ── Canonical block modeli: 8 section sırasında görünür bloklar ──
      for (const [key, label] of WORD_SECTION_ORDER) {
        const secBlocks = visible.filter((b) => b.section_key === key);
        if (secBlocks.length === 0) continue; // boş section gösterme
        all.push(h3(label));
        for (const b of secBlocks) {
          if (b.block_title?.trim()) all.push(bodyText(b.block_title.trim()));
          all.push(bodyText(blockBodyToPlain(b.editorial_explanation ?? "")));
        }
      }
      // Tek Kaynakça (source-evidence'tan distinct eser; ana gövdede kaynak adı YOK)
      const bib = deriveChakraBibliography(blocks);
      if (bib.length > 0) {
        all.push(h3("Kaynakça"));
        bib.forEach((e, idx) => all.push(bodyText(`${idx + 1}. ${e.author ? `${e.author} — ` : ""}${e.title}`)));
      }
    } else {
      // ── Legacy fallback: rich-block'suz eski kayıtlar (mevcut davranış korunur) ──
      if (chakra.organs?.trim())  { all.push(h3("Organlar"));  all.push(bodyText(chakra.organs.trim())); }
      if (chakra.glands?.trim())  { all.push(h3("Bezler"));    all.push(bodyText(chakra.glands.trim())); }
      if (chakra.stones?.trim())  { all.push(h3("Taşlar"));    all.push(bodyText(chakra.stones.trim())); }
      if (chakra.causes?.trim())  { all.push(h3("Nedenler"));  all.push(bodyText(chakra.causes.trim())); }
      if (chakra.physical?.trim()){ all.push(h3("Fiziksel"));  all.push(bodyText(chakra.physical.trim())); }
      if (chakra.mental?.trim())  { all.push(h3("Zihinsel"));  all.push(bodyText(chakra.mental.trim())); }
      if (chakra.notes?.trim())   { all.push(h3("Notlar"));    all.push(bodyText(chakra.notes.trim())); }
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Çakra Kütüphanesi Raporu · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug =
    isSingle && chakras[0]?.name ? slugify(chakras[0].name) :
    exportMode === "selected" ? "secili" : "tumu";
  const filename = `biyoenerji-cakra-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
