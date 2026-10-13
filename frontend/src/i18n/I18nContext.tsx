import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  type SupportedLanguage,
  SUPPORTED_LANGUAGES,
  type TranslatedTaskTemplateItem,
  type TranslationDictionary,
} from "./types";
import { enDictionary } from "./locales/en";
import { hiDictionary } from "./locales/hi";
import { hneDictionary } from "./locales/hne";

const API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "ms_language";

const DICTIONARIES: Record<SupportedLanguage, TranslationDictionary> = {
  en: enDictionary,
  hi: hiDictionary,
  hne: hneDictionary,
};

export interface LocalizedTaskContent {
  title: string;
  instructions: string;
  safety: string;
  locationLabel: string;
  priorityLabel: string;
  statusLabel: string;
  deadlineFormatted: string;
  diseaseLabel: string;
  fullSpeechScript: string;
  matchedTemplateKey: string | null;
}

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
  taskTemplates: TranslatedTaskTemplateItem[];
  refreshTaskTemplates: () => Promise<void>;
  localizeTask: (task: any, langOverride?: SupportedLanguage) => LocalizedTaskContent;
  localizeRisk: (risk?: string, langOverride?: SupportedLanguage) => string;
  localizeDisease: (diseaseType?: string, langOverride?: SupportedLanguage) => string;
  localizeStatus: (status?: string, langOverride?: SupportedLanguage) => string;
  localizePriority: (priority?: string, langOverride?: SupportedLanguage) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const DEFAULT_SAFETY_BY_DISEASE: Record<string, Record<SupportedLanguage, string>> = {
  malaria: {
    en: "Carry rapid diagnostic test (RDT) kits in a cool dry pouch, dispose of used lancets safely, and refer severe fever signs to CHC immediately.",
    hi: "आरडीटी (RDT) किट को ठंडे व सूखे बैग में रखें, उपयोग की गई सुई को सुरक्षित डिब्बे में डालें और गंभीर बुखार को तुरंत सीएचसी (CHC) रेफर करें।",
    hne: "आरडीटी (RDT) जांच किट ला सुक्खा अउ छांव वाला झोला मं रखव, जांच के सुई ला सुरक्षित डिब्बा मं डालव अउ तेज जर दिखय त तुरते सीएचसी (CHC) अस्पताल पठोवव।",
  },
  dengue: {
    en: "Do not advise aspirin or ibuprofen for fever; refer patients with bleeding or severe abdominal pain to CHC immediately.",
    hi: "बुखार में एस्पिरिन या दर्द की दवा की सलाह न दें; पेट में तेज दर्द या रक्तस्राव होने पर तुरंत अस्पताल भेजें।",
    hne: "डेंगू के संका मं अपने मन ले दरद के गोली झन दव; पेट मं अब्बड़ पीरा या खून निकले के चिन्हा दिखय त तुरते सरकारी अस्पताल ले जावव।",
  },
  diarrhoea: {
    en: "Advise boiling drinking water or using chlorine tablets properly; refer severe dehydration signs to the nearest health centre immediately.",
    hi: "पीने का पानी उबालने या क्लोरीन गोली के सही उपयोग की सलाह दें; गंभीर निर्जलीकरण दिखने पर तुरंत स्वास्थ्य केंद्र भेजें।",
    hne: "पीये के पानी ला उबाल के पीये के सलाह दव; लइका या सियान सुस्त पर जाय या आंखी धंस जाय त तुरते अस्पताल पठोवव।",
  },
  heat: {
    en: "Conduct field visits in morning hours, carry drinking water, and treat heatstroke (hot dry skin, confusion) as an emergency.",
    hi: "फील्ड भ्रमण सुबह के समय करें, साथ में पानी रखें; लू लगने (तेज बुखार, चक्कर) पर तुरंत शरीर ठंडा करें और अस्पताल भेजें।",
    hne: "खुद घलो बिहनिया बेरा भ्रमण करव, संग मं पानी अउ छतरी रखव; काकरो देह अब्बड़ तपत हे अउ चक्कर आवत हे त तुरते छांव मं लिटाके अस्पताल ले जावव।",
  },
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
      if (saved && (saved === "en" || saved === "hi" || saved === "hne")) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return "en";
  });

  const [taskTemplates, setTaskTemplates] = useState<TranslatedTaskTemplateItem[]>([]);

  const refreshTaskTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/i18n/task-templates`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.templates)) {
          setTaskTemplates(data.templates);
        }
      }
    } catch {
      // fallback to built-in translations if offline
    }
  }, []);

  useEffect(() => {
    refreshTaskTemplates();
  }, [refreshTaskTemplates]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    if (!SUPPORTED_LANGUAGES.some((l) => l.code === lang)) return;
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    // If authenticated, persist preference in backend asynchronously
    try {
      const token = localStorage.getItem("ms_auth_token");
      if (token) {
        fetch(`${API_BASE}/auth/language`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ language: lang }),
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const activeDict = DICTIONARIES[language] || enDictionary;
      if (activeDict[key] !== undefined) {
        return activeDict[key];
      }
      if (enDictionary[key] !== undefined) {
        return enDictionary[key];
      }
      return fallback !== undefined ? fallback : key;
    },
    [language]
  );

  const localizeDisease = useCallback(
    (diseaseType?: string, langOverride?: SupportedLanguage): string => {
      const lang = langOverride || language;
      const d = (diseaseType || "malaria").toLowerCase();
      const dict = DICTIONARIES[lang] || enDictionary;
      return dict[`disease.${d}`] || enDictionary[`disease.${d}`] || d;
    },
    [language]
  );

  const localizeRisk = useCallback(
    (risk?: string, langOverride?: SupportedLanguage): string => {
      const lang = langOverride || language;
      const r = (risk || "Low").toLowerCase();
      const dict = DICTIONARIES[lang] || enDictionary;
      if (r.includes("high")) return dict["risk.high"] || "High Risk";
      if (r.includes("med")) return dict["risk.medium"] || "Medium Risk";
      if (r.includes("insuff") || r.includes("unavail")) return dict["risk.insufficient_data"] || "Insufficient Data";
      return dict["risk.low"] || "Low Risk";
    },
    [language]
  );

  const localizeStatus = useCallback(
    (status?: string, langOverride?: SupportedLanguage): string => {
      const lang = langOverride || language;
      const s = (status || "sent").toLowerCase();
      const dict = DICTIONARIES[lang] || enDictionary;
      return dict[`status.${s}`] || enDictionary[`status.${s}`] || status || "sent";
    },
    [language]
  );

  const localizePriority = useCallback(
    (priority?: string, langOverride?: SupportedLanguage): string => {
      const lang = langOverride || language;
      const p = priority || "High";
      const dict = DICTIONARIES[lang] || enDictionary;
      return dict[`priority.${p}`] || enDictionary[`priority.${p}`] || p;
    },
    [language]
  );

  const localizeTask = useCallback(
    (task: any, langOverride?: SupportedLanguage): LocalizedTaskContent => {
      const lang = langOverride || language;
      const dType = (task?.disease_type || "malaria").toLowerCase();
      const rawTitle = (task?.title || "").trim();
      const rawInstructions =
        task?.instructions ||
        (Array.isArray(task?.steps) ? task.steps.join(". ") : task?.description || "");

      // Match against backend-reviewed templates first
      let matchedTpl: TranslatedTaskTemplateItem | undefined = taskTemplates.find(
        (tpl) =>
          tpl.translations.en.title.toLowerCase() === rawTitle.toLowerCase() ||
          rawTitle.toLowerCase().includes(tpl.translations.en.title.toLowerCase().slice(0, 24))
      );

      if (!matchedTpl && rawTitle.toLowerCase().includes("awareness")) {
        matchedTpl = taskTemplates.find((tpl) => tpl.template_key === "malaria_village_awareness_visit");
      }

      let title = rawTitle;
      let instructions = rawInstructions;
      let safety =
        DEFAULT_SAFETY_BY_DISEASE[dType]?.[lang] || DEFAULT_SAFETY_BY_DISEASE.malaria[lang];

      if (matchedTpl) {
        const trans = matchedTpl.translations[lang] || matchedTpl.translations.en;
        title = trans.title || rawTitle;
        instructions = trans.instructions || rawInstructions;
        if (trans.safety) {
          safety = trans.safety;
        }
      } else if (lang === "hi") {
        if (rawTitle.toLowerCase().includes("larval source") || rawTitle.toLowerCase().includes("stream")) {
          title = "नाला तटबंध लार्वा नियंत्रण एवं बुखार जांच — सेक्टर 4 पारा";
          instructions = "नाले के पास रुके पानी के गड्ढों की जांच करें, लार्वानाशक का छिड़काव करें और बुखार वाले परिवारों की आरडीटी (RDT) जांच करें।";
        } else if (rawTitle.toLowerCase().includes("camp") || rawTitle.toLowerCase().includes("rdt")) {
          title = "त्वरित आरडीटी (RDT) बुखार जांच शिविर — पंचायत भवन";
          instructions = "पंचायत भवन में बुखार जांच शिविर लगाएं, सभी बुखार पीड़ितों की RDT जांच करें और शाम 4 बजे से पहले फील्ड रिपोर्ट जमा करें।";
        }
      } else if (lang === "hne") {
        if (rawTitle.toLowerCase().includes("larval source") || rawTitle.toLowerCase().includes("stream")) {
          title = "नरवा तीर के डबरा मं लार्वा दवई छिड़काव अउ बुखार जांच — सेक्टर 4 पारा";
          instructions = "नरवा तीर के थमगे पानी अउ डबरा ला जांचव, मच्छर के लार्वा मारे के दवई डारव अउ जर-बुखार वाला मनखे मन के आरडीटी (RDT) जांच करव।";
        } else if (rawTitle.toLowerCase().includes("camp") || rawTitle.toLowerCase().includes("rdt")) {
          title = "तुरते आरडीटी (RDT) जर-बुखार जांच शिविर — पंचायत भवन";
          instructions = "पंचायत भवन मं जर-बुखार जांच शिविर लगावव, जम्मो बुखार पीड़ित मन के RDT जांच करव अउ संझा 4 बजे ले पहिली फील्ड रिपोर्ट जमा कर दव।";
        }
      }

      const locationLabel =
        task?.location_name ||
        [task?.district_id, task?.block_id, task?.village_id].filter(Boolean).join(" · ") ||
        "DIST_SAMPLE · BLK_A · VIL_A1";

      const priorityLabel = localizePriority(task?.priority || "High", lang);
      const statusLabel = localizeStatus(task?.status || "sent", lang);
      const diseaseLabel = localizeDisease(dType, lang);

      let deadlineFormatted = "4:00 PM";
      if (task?.deadline) {
        try {
          const dt = new Date(task.deadline);
          deadlineFormatted = dt.toLocaleString(lang === "en" ? "en-IN" : "hi-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch {
          deadlineFormatted = String(task.deadline).slice(0, 16);
        }
      }

      let fullSpeechScript = "";
      if (lang === "hi") {
        fullSpeechScript =
          `कार्य शीर्षक: ${title}। ` +
          `रोग श्रेणी: ${diseaseLabel}। ` +
          `प्राथमिकता: ${priorityLabel}। ` +
          `आवंटित गाँव और स्थान: ${locationLabel}। ` +
          `अंतिम समय-सीमा: ${deadlineFormatted}। ` +
          `कार्य निर्देश: ${instructions} ` +
          `सुरक्षा निर्देश: ${safety}`;
      } else if (lang === "hne") {
        fullSpeechScript =
          `बूता के नाम: ${title}। ` +
          `बीमारी के प्रकार: ${diseaseLabel}। ` +
          `जरूरी स्तर: ${priorityLabel}। ` +
          `तय करे गाँव अउ पारा: ${locationLabel}। ` +
          `पूरा करे के मियाद: ${deadlineFormatted}। ` +
          `बूता के निर्देश: ${instructions} ` +
          `फील्ड सावधानी: ${safety}`;
      } else {
        fullSpeechScript =
          `Task Title: ${title}. ` +
          `Category: ${diseaseLabel}. ` +
          `Priority: ${priorityLabel}. ` +
          `Assigned Village and Location: ${locationLabel}. ` +
          `Due Date and Time: ${deadlineFormatted}. ` +
          `Instructions: ${instructions} ` +
          `Safety Instructions: ${safety}`;
      }

      return {
        title,
        instructions,
        safety,
        locationLabel,
        priorityLabel,
        statusLabel,
        deadlineFormatted,
        diseaseLabel,
        fullSpeechScript,
        matchedTemplateKey: matchedTpl?.template_key || null,
      };
    },
    [language, taskTemplates, localizePriority, localizeStatus, localizeDisease]
  );

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        taskTemplates,
        refreshTaskTemplates,
        localizeTask,
        localizeRisk,
        localizeDisease,
        localizeStatus,
        localizePriority,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
