import { ChevronDown, MapPin, LogIn, LogOut } from "lucide-react";
import { LanguageSelector } from "./LanguageSelector";
import { useI18n } from "../i18n/I18nContext";

interface TopBarProps {
  title: string;
  districtName: string;
  periodText: string;
  locationBreadcrumb?: string;
  currentUser?: any | null;
  onChangeLocation?: () => void;
  onOpenPortalLanding?: () => void;
  onLogout?: () => void;
}

export function TopBar({
  title,
  districtName,
  periodText,
  locationBreadcrumb,
  currentUser,
  onChangeLocation,
  onOpenPortalLanding,
  onLogout,
}: TopBarProps) {
  const { t } = useI18n();
  const displayLoc = locationBreadcrumb || districtName;

  return (
    <header className="h-14 bg-white border-b border-borderline px-4 sm:px-6 flex items-center justify-between gap-2 shrink-0 select-none">
      {/* Title & Active Location Context */}
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-base sm:text-lg font-bold text-ink truncate">
          {title} <span className="text-muted font-normal">·</span>{" "}
          <span className="text-purple font-semibold text-sm sm:text-base">{displayLoc}</span>
        </h1>
      </div>

      {/* Controls & Selectors */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Interactive Location Selector Pill */}
        <button
          type="button"
          onClick={onChangeLocation}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-borderline hover:border-purple/50 text-xs font-semibold text-ink bg-white shadow-2xs transition-colors cursor-pointer"
          title={t("app.change_location")}
        >
          <MapPin className="w-3.5 h-3.5 text-purple" />
          <span className="max-w-[180px] truncate">{displayLoc}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted" />
        </button>

        {/* Period Selector */}
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-borderline text-xs font-semibold text-ink bg-white shadow-2xs cursor-default">
          <span>{periodText}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted" />
        </div>

        {/* Live Language Selector (EN | हिन्दी | छत्तीसगढ़ी) */}
        <LanguageSelector compact />

        {/* Portal Switcher / Login / Logout */}
        {currentUser ? (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-light text-purple hover:bg-purple hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>
              {t("app.sign_out")} ({currentUser.username})
            </span>
          </button>
        ) : (
          onOpenPortalLanding && (
            <button
              type="button"
              onClick={onOpenPortalLanding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple text-white hover:bg-purple/90 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t("nav.switch_portal_btn")}</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}

