import React from "react";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/types";
import { useI18n } from "../i18n/I18nContext";

interface LanguageSelectorProps {
  value?: SupportedLanguage;
  onChange?: (lang: SupportedLanguage) => void;
  compact?: boolean;
  label?: string;
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  value,
  onChange,
  compact = false,
  label,
  className = "",
}) => {
  const { language, setLanguage, t } = useI18n();
  const activeLang = value || language;
  const handleSelect = onChange || setLanguage;

  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg p-1 ${className}`}
      role="group"
      aria-label={label || t("app.language_label", "Language Selector")}
      data-testid="language-selector"
    >
      <span className="flex items-center gap-1 pl-1.5 pr-1 text-slate-600 text-xs font-medium">
        <Globe className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
        {!compact && <span className="hidden sm:inline">{label || t("app.language_label")}:</span>}
      </span>
      {SUPPORTED_LANGUAGES.map((opt) => {
        const isSelected = activeLang === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleSelect(opt.code)}
            aria-pressed={isSelected}
            aria-label={`Select language ${opt.name} (${opt.nativeName})`}
            data-testid={`lang-btn-${opt.code}`}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              isSelected
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-700 hover:bg-white hover:text-teal-800"
            }`}
          >
            {opt.nativeName}
          </button>
        );
      })}
    </div>
  );
};
