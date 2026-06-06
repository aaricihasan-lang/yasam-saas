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
  created_at:       string;
  updated_at:       string;
};

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
