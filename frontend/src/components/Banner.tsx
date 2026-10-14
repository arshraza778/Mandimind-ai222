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
      className="bg-[#FFF8E7] text-[#8C5302] border-b border-[#F0D99B]/80 px-4 py-2 text-center text-xs font-medium tracking-wide flex items-center justify-center gap-2.5 shrink-0 z-10"
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#A8650A] text-white text-[11px] font-bold uppercase tracking-wider shadow-2xs shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        Prototype Notice
      </span>
      <span className="text-xs text-[#7A4B06] font-medium leading-relaxed truncate sm:text-clip">
        {displayBanner}
      </span>
    </aside>
  );
}
