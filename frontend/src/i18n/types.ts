export type SupportedLanguage = "en" | "hi" | "hne";

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  shortLabel: string;
  speechLang: string;
  sttSupported: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    shortLabel: "EN",
    speechLang: "en-IN",
    sttSupported: true,
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    shortLabel: "हिन्दी",
    speechLang: "hi-IN",
    sttSupported: true,
  },
  {
    code: "hne",
    name: "Chhattisgarhi",
    nativeName: "छत्तीसगढ़ी",
    shortLabel: "छत्तीसगढ़ी",
    speechLang: "hne-IN",
    sttSupported: false,
  },
];

export interface TranslatedTaskTemplateItem {
  id: number;
  template_key: string;
  disease_type: string;
  translations: {
    en: { title: string; instructions: string; safety: string };
    hi: { title: string; instructions: string; safety: string };
    hne: { title: string; instructions: string; safety: string };
  };
  review_status: string;
  updated_by?: string;
  updated_at?: string;
}

export type TranslationDictionary = Record<string, string>;
