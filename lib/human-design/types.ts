import type {
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_PROFILES,
  HUMAN_DESIGN_TYPES,
} from "./constants";

// -------------------------------------------------------
// Dar tipler — sabit listelerden türetilir
// -------------------------------------------------------

export type HdTypeCode       = (typeof HUMAN_DESIGN_TYPES)[number]["code"];
export type HdAuthorityCode  = (typeof HUMAN_DESIGN_AUTHORITIES)[number]["code"];
export type HdProfileCode    = (typeof HUMAN_DESIGN_PROFILES)[number]["code"];
export type HdDefinitionCode = (typeof HUMAN_DESIGN_DEFINITIONS)[number]["code"];
export type HdCenterCode     = (typeof HUMAN_DESIGN_CENTERS)[number]["code"];
export type HdChannelCode    = (typeof HUMAN_DESIGN_CHANNELS)[number]["code"];

// -------------------------------------------------------
// Tablo satır tipleri — Supabase'deki şemayı yansıtır
// -------------------------------------------------------

export type HumanDesignKnowledgeRecord = {
  id:               string;
  tenant_id:        string | null;
  user_id:          string | null;
  category:         string;
  title:            string;
  code:             string;
  content:          string;
  keywords:         string[];
  related_gates:    number[];
  related_channels: string[];
  related_centers:  string[];
  tags:             string[];
  sort_order:       number;
  is_active:        boolean;
  // "Hasan Notlarım" — kaynaklandırılmış ana metin (content) ile karışmayan ayrı uzman notu.
  expert_notes:     string | null;
  created_at:       string;
  updated_at:       string;
};

// -------------------------------------------------------
// Bilgi kaydına bağlı dinamik KAYNAK satırı (human_design_knowledge_sources)
// Künye + özgün metin + sadık TR çeviri + hak/kullanım katmanları AYRI tutulur.
// -------------------------------------------------------
export type HdSourceRightsStatus =
  | "public_domain"
  | "licensed"
  | "permission_granted"
  | "permission_pending"
  | "restricted"
  | "unknown";

export type HdSourceType =
  | "book"
  | "article"
  | "website"
  | "video"
  | "teaching_note"
  | "regulatory_document"
  | "oral_source"
  | "other";

export type HumanDesignKnowledgeSource = {
  id:                          string;
  tenant_id:                   string | null;
  user_id:                     string | null;
  record_id:                   string;
  source_name:                 string;
  source_type:                 HdSourceType;
  author_or_organization:      string | null;
  title:                       string | null;
  page_or_section:             string | null;
  source_url:                  string | null;
  accessed_on:                 string | null;
  original_language_tag:       string | null;
  original_text:               string | null;
  faithful_translation_tr:     string | null;
  source_specific_note:        string | null;
  rights_status:               HdSourceRightsStatus;
  permission_reference:        string | null;
  private_use_allowed:         boolean;
  client_report_allowed:       boolean;
  expert_distribution_allowed: boolean;
  commercial_use_allowed:      boolean;
  sort_order:                  number;
  created_at:                  string;
  updated_at:                  string;
};

export type HumanDesignKnowledgeSourceInsert = Omit<
  HumanDesignKnowledgeSource,
  "id" | "created_at" | "updated_at"
>;

export type HumanDesignChart = {
  id:                 string;
  tenant_id:          string | null;
  user_id:            string | null;
  client_id:          string | null;
  client_name:        string | null;
  birth_date:         string | null;
  birth_time:         string | null;
  birth_place:        string | null;
  external_chart_url: string | null;
  chart_image_url:    string | null;
  type_code:          HdTypeCode | null;
  authority_code:     HdAuthorityCode | null;
  profile_code:       HdProfileCode | null;
  definition_code:    HdDefinitionCode | null;
  active_centers:     HdCenterCode[];
  open_centers:       HdCenterCode[];
  gates:              number[];
  channels:           HdChannelCode[];
  notes:              string | null;
  created_at:         string;
  updated_at:         string;
};

export type HumanDesignReport = {
  id:                string;
  tenant_id:         string | null;
  user_id:           string | null;
  client_id:         string | null;
  chart_id:          string | null;
  title:             string;
  selected_codes:    string[];
  generated_content: string | null;
  edited_content:    string | null;
  report_file_url:   string | null;
  created_at:        string;
  updated_at:        string;
};

export type HumanDesignClient = {
  id:                 string;
  tenant_id:          string | null;
  user_id:            string | null;
  name:               string;
  birth_date:         string | null;
  birth_time:         string | null;
  birth_place:        string | null;
  chart_image_url:    string | null;
  external_chart_url: string | null;
  notes:              string | null;
  created_at:         string;
  updated_at:         string;
};

// -------------------------------------------------------
// Insert payload tipleri (id + tarihler otomatik)
// -------------------------------------------------------

export type HumanDesignKnowledgeRecordInsert = Omit<
  HumanDesignKnowledgeRecord,
  "id" | "created_at" | "updated_at"
>;

export type HumanDesignChartInsert = Omit<
  HumanDesignChart,
  "id" | "created_at" | "updated_at"
>;

export type HumanDesignReportInsert = Omit<
  HumanDesignReport,
  "id" | "created_at" | "updated_at"
>;

export type HumanDesignClientInsert = Omit<
  HumanDesignClient,
  "id" | "created_at" | "updated_at"
>;
