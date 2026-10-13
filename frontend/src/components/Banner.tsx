import { AlertTriangle } from "lucide-react";
import { useMeta } from "../hooks/useMeta";
import { useI18n } from "../i18n/I18nContext";

export function Banner() {
  const { meta } = useMeta();
  const { language, t } = useI18n();

  if (!meta.banner_text) {
    return null;
  }

  const displayBanner =
    language === "en"
      ? meta.banner_text
      : `${t("banner.simulated_title")} ${t("banner.simulated_body")}`;

  return (
    <aside
      aria-label="Prototype Notice"
      className="bg-amber-light text-amber border-b border-amber/20 px-4 py-2 text-center text-xs sm:text-sm font-semibold tracking-wide flex flex-wrap items-center justify-center gap-2"
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber text-white text-[11px] font-bold uppercase tracking-wider shadow-2xs">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        Prototype — synthetic demo data
      </span>
      <span>{displayBanner}</span>
    </aside>
  );
}

