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
    <header className="h-16 bg-white border-b border-borderline px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 select-none z-10 shadow-2xs">
      {/* Title & Active Location Context */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base sm:text-lg font-bold text-ink truncate flex items-center gap-2">
          <span>{title}</span>
          <span className="text-slate-300 font-light">/</span>
          <span className="text-purple font-semibold text-xs sm:text-sm truncate">
            {displayLoc}
          </span>
        </h1>
      </div>

      {/* Controls & Selectors on uniform baseline */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Interactive Location Selector Pill */}
        <button
          type="button"
          onClick={onChangeLocation}
          className="hidden sm:inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-borderline hover:border-purple/40 text-xs font-semibold text-ink bg-white shadow-2xs hover:bg-slate-50 transition-all cursor-pointer"
          title={t("app.change_location")}
        >
          <MapPin className="w-3.5 h-3.5 text-purple shrink-0" />
          <span className="max-w-[180px] truncate">{displayLoc}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
        </button>

        {/* Period Selector */}
        <div className="hidden xl:inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-borderline text-xs font-semibold text-ink bg-slate-50/70 shadow-2xs cursor-default">
          <span className="tabular-nums">{periodText}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
        </div>

        {/* Live Language Selector (EN | हिन्दी | छत्तीसगढ़ी) */}
        <LanguageSelector compact />

        {/* User Account Logout / Portal Switcher */}
        {currentUser ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-purple-light text-purple hover:bg-purple hover:text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {t("app.sign_out")} ({currentUser.username})
            </span>
            <span className="sm:hidden">{t("app.sign_out")}</span>
          </button>
        ) : (
          onOpenPortalLanding && (
            <button
              type="button"
              onClick={onOpenPortalLanding}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-purple text-white hover:bg-purple/90 text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>{t("nav.switch_portal_btn")}</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}
