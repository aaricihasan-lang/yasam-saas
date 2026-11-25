/**
 * OTOMATİK ÜRETİLDİ — elle düzenleme. Üretici: scripts/i18n/gen-catalog.mjs (npm run i18n:catalog).
 * Kaynak: messages/<locale>/*.json. Sıra alfabetiktir; dosyalar arası anahtar çakışması
 * scripts/i18n/catalog-check.mjs tarafından FAIL edilir (birleştirme sırası anlam taşımaz).
 */
import tr_authClient from "@/messages/tr/auth.client.json";
import tr_authEmail from "@/messages/tr/auth.email.json";
import tr_authServer from "@/messages/tr/auth.server.json";
import tr_authUi from "@/messages/tr/auth.ui.json";
import tr_beslenme from "@/messages/tr/beslenme.json";
import tr_bioenergy from "@/messages/tr/bioenergy.json";
import tr_bodyEnergyHub from "@/messages/tr/bodyEnergyHub.json";
import tr_clientsAnalizler from "@/messages/tr/clients.analizler.json";
import tr_clientsAnamnez from "@/messages/tr/clients.anamnez.json";
import tr_clientsCharges from "@/messages/tr/clients.charges.json";
import tr_clientsCombinations from "@/messages/tr/clients.combinations.json";
import tr_clientsConsent from "@/messages/tr/clients.consent.json";
import tr_clientsDetail from "@/messages/tr/clients.detail.json";
import tr_clientsHomework from "@/messages/tr/clients.homework.json";
import tr_clients from "@/messages/tr/clients.json";
import tr_clientsList from "@/messages/tr/clients.list.json";
import tr_clientsMemory from "@/messages/tr/clients.memory.json";
import tr_clientsNotes from "@/messages/tr/clients.notes.json";
import tr_clientsSessions from "@/messages/tr/clients.sessions.json";
import tr_clientsStones from "@/messages/tr/clients.stones.json";
import tr_clientsYolculuk from "@/messages/tr/clients.yolculuk.json";
import tr_commonApiErrors from "@/messages/tr/common.apiErrors.json";
import tr_commonDeleteConfirm from "@/messages/tr/common.deleteConfirm.json";
import tr_commonDemo from "@/messages/tr/common.demo.json";
import tr_common from "@/messages/tr/common.json";
import tr_commonLanguagePreference from "@/messages/tr/common.languagePreference.json";
import tr_commonReader from "@/messages/tr/common.reader.json";
import tr_commonSubmitLock from "@/messages/tr/common.submitLock.json";
import tr_cuppingCalendar from "@/messages/tr/cupping.calendar.json";
import tr_cupping from "@/messages/tr/cupping.json";
import tr_cuppingLibrary from "@/messages/tr/cupping.library.json";
import tr_cuppingProtocols from "@/messages/tr/cupping.protocols.json";
import tr_cuppingTechniques from "@/messages/tr/cupping.techniques.json";
import tr_home from "@/messages/tr/home.json";
import tr_homeYhStatus from "@/messages/tr/home.yhStatus.json";
import tr_memoryPicker from "@/messages/tr/memoryPicker.json";
import tr_navigation from "@/messages/tr/navigation.json";
import tr_stonesCombinations from "@/messages/tr/stones.combinations.json";
import tr_stonesHub from "@/messages/tr/stones.hub.json";
import tr_stones from "@/messages/tr/stones.json";
import tr_stonesKnowledge from "@/messages/tr/stones.knowledge.json";
import tr_stonesList from "@/messages/tr/stones.list.json";
import tr_stonesMinerals from "@/messages/tr/stones.minerals.json";
import tr_stonesRecords from "@/messages/tr/stones.records.json";
import tr_terms from "@/messages/tr/terms.json";
import en_authClient from "@/messages/en/auth.client.json";
import en_authEmail from "@/messages/en/auth.email.json";
import en_authServer from "@/messages/en/auth.server.json";
import en_authUi from "@/messages/en/auth.ui.json";
import en_beslenme from "@/messages/en/beslenme.json";
import en_bioenergy from "@/messages/en/bioenergy.json";
import en_bodyEnergyHub from "@/messages/en/bodyEnergyHub.json";
import en_clientsAnalizler from "@/messages/en/clients.analizler.json";
import en_clientsAnamnez from "@/messages/en/clients.anamnez.json";
import en_clientsCharges from "@/messages/en/clients.charges.json";
import en_clientsCombinations from "@/messages/en/clients.combinations.json";
import en_clientsConsent from "@/messages/en/clients.consent.json";
import en_clientsDetail from "@/messages/en/clients.detail.json";
import en_clientsHomework from "@/messages/en/clients.homework.json";
import en_clients from "@/messages/en/clients.json";
import en_clientsList from "@/messages/en/clients.list.json";
import en_clientsMemory from "@/messages/en/clients.memory.json";
import en_clientsNotes from "@/messages/en/clients.notes.json";
import en_clientsSessions from "@/messages/en/clients.sessions.json";
import en_clientsStones from "@/messages/en/clients.stones.json";
import en_clientsYolculuk from "@/messages/en/clients.yolculuk.json";
import en_commonApiErrors from "@/messages/en/common.apiErrors.json";
import en_commonDeleteConfirm from "@/messages/en/common.deleteConfirm.json";
import en_commonDemo from "@/messages/en/common.demo.json";
import en_common from "@/messages/en/common.json";
import en_commonLanguagePreference from "@/messages/en/common.languagePreference.json";
import en_commonReader from "@/messages/en/common.reader.json";
import en_commonSubmitLock from "@/messages/en/common.submitLock.json";
import en_cuppingCalendar from "@/messages/en/cupping.calendar.json";
import en_cupping from "@/messages/en/cupping.json";
import en_cuppingLibrary from "@/messages/en/cupping.library.json";
import en_cuppingProtocols from "@/messages/en/cupping.protocols.json";
import en_cuppingTechniques from "@/messages/en/cupping.techniques.json";
import en_home from "@/messages/en/home.json";
import en_homeYhStatus from "@/messages/en/home.yhStatus.json";
import en_memoryPicker from "@/messages/en/memoryPicker.json";
import en_navigation from "@/messages/en/navigation.json";
import en_stonesCombinations from "@/messages/en/stones.combinations.json";
import en_stonesHub from "@/messages/en/stones.hub.json";
import en_stones from "@/messages/en/stones.json";
import en_stonesKnowledge from "@/messages/en/stones.knowledge.json";
import en_stonesList from "@/messages/en/stones.list.json";
import en_stonesMinerals from "@/messages/en/stones.minerals.json";
import en_stonesRecords from "@/messages/en/stones.records.json";
import en_terms from "@/messages/en/terms.json";

export const CATALOG_FILES = {
  tr: ["auth.client.json", "auth.email.json", "auth.server.json", "auth.ui.json", "beslenme.json", "bioenergy.json", "bodyEnergyHub.json", "clients.analizler.json", "clients.anamnez.json", "clients.charges.json", "clients.combinations.json", "clients.consent.json", "clients.detail.json", "clients.homework.json", "clients.json", "clients.list.json", "clients.memory.json", "clients.notes.json", "clients.sessions.json", "clients.stones.json", "clients.yolculuk.json", "common.apiErrors.json", "common.deleteConfirm.json", "common.demo.json", "common.json", "common.languagePreference.json", "common.reader.json", "common.submitLock.json", "cupping.calendar.json", "cupping.json", "cupping.library.json", "cupping.protocols.json", "cupping.techniques.json", "home.json", "home.yhStatus.json", "memoryPicker.json", "navigation.json", "stones.combinations.json", "stones.hub.json", "stones.json", "stones.knowledge.json", "stones.list.json", "stones.minerals.json", "stones.records.json", "terms.json"],
  en: ["auth.client.json", "auth.email.json", "auth.server.json", "auth.ui.json", "beslenme.json", "bioenergy.json", "bodyEnergyHub.json", "clients.analizler.json", "clients.anamnez.json", "clients.charges.json", "clients.combinations.json", "clients.consent.json", "clients.detail.json", "clients.homework.json", "clients.json", "clients.list.json", "clients.memory.json", "clients.notes.json", "clients.sessions.json", "clients.stones.json", "clients.yolculuk.json", "common.apiErrors.json", "common.deleteConfirm.json", "common.demo.json", "common.json", "common.languagePreference.json", "common.reader.json", "common.submitLock.json", "cupping.calendar.json", "cupping.json", "cupping.library.json", "cupping.protocols.json", "cupping.techniques.json", "home.json", "home.yhStatus.json", "memoryPicker.json", "navigation.json", "stones.combinations.json", "stones.hub.json", "stones.json", "stones.knowledge.json", "stones.list.json", "stones.minerals.json", "stones.records.json", "terms.json"],
} as const;

export const CATALOG_PARTS: Record<"tr" | "en", Record<string, unknown>[]> = {
  tr: [
    tr_authClient,
    tr_authEmail,
    tr_authServer,
    tr_authUi,
    tr_beslenme,
    tr_bioenergy,
    tr_bodyEnergyHub,
    tr_clientsAnalizler,
    tr_clientsAnamnez,
    tr_clientsCharges,
    tr_clientsCombinations,
    tr_clientsConsent,
    tr_clientsDetail,
    tr_clientsHomework,
    tr_clients,
    tr_clientsList,
    tr_clientsMemory,
    tr_clientsNotes,
    tr_clientsSessions,
    tr_clientsStones,
    tr_clientsYolculuk,
    tr_commonApiErrors,
    tr_commonDeleteConfirm,
    tr_commonDemo,
    tr_common,
    tr_commonLanguagePreference,
    tr_commonReader,
    tr_commonSubmitLock,
    tr_cuppingCalendar,
    tr_cupping,
    tr_cuppingLibrary,
    tr_cuppingProtocols,
    tr_cuppingTechniques,
    tr_home,
    tr_homeYhStatus,
    tr_memoryPicker,
    tr_navigation,
    tr_stonesCombinations,
    tr_stonesHub,
    tr_stones,
    tr_stonesKnowledge,
    tr_stonesList,
    tr_stonesMinerals,
    tr_stonesRecords,
    tr_terms,
  ],
  en: [
    en_authClient,
    en_authEmail,
    en_authServer,
    en_authUi,
    en_beslenme,
    en_bioenergy,
    en_bodyEnergyHub,
    en_clientsAnalizler,
    en_clientsAnamnez,
    en_clientsCharges,
    en_clientsCombinations,
    en_clientsConsent,
    en_clientsDetail,
    en_clientsHomework,
    en_clients,
    en_clientsList,
    en_clientsMemory,
    en_clientsNotes,
    en_clientsSessions,
    en_clientsStones,
    en_clientsYolculuk,
    en_commonApiErrors,
    en_commonDeleteConfirm,
    en_commonDemo,
    en_common,
    en_commonLanguagePreference,
    en_commonReader,
    en_commonSubmitLock,
    en_cuppingCalendar,
    en_cupping,
    en_cuppingLibrary,
    en_cuppingProtocols,
    en_cuppingTechniques,
    en_home,
    en_homeYhStatus,
    en_memoryPicker,
    en_navigation,
    en_stonesCombinations,
    en_stonesHub,
    en_stones,
    en_stonesKnowledge,
    en_stonesList,
    en_stonesMinerals,
    en_stonesRecords,
    en_terms,
  ],
};
