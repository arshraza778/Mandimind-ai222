import {
  LayoutDashboard,
  AlertTriangle,
  CheckSquare,
  Clock,
  BarChart3,
  Settings,
  Radio,
  Smartphone,
  Globe,
  ShieldCheck,
  Users,
  ClipboardList,
  LogOut,
  MapPin,
  Volume2,
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  alertCount: number;
  taskCount: number;
  districtName: string;
  portalMode?: "public" | "field_employee" | "supervisor";
  currentUser?: any | null;
  locationBreadcrumb?: string;
  onOpenPortalSwitcher?: () => void;
  onLogout?: () => void;
  onChangeLocation?: () => void;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  alertCount,
  taskCount,
  districtName,
  portalMode = "supervisor",
  currentUser,
  locationBreadcrumb,
  onOpenPortalSwitcher,
  onLogout,
  onChangeLocation,
}: SidebarProps) {
  const { t } = useI18n();

  const getNavItems = () => {
    if (portalMode === "public") {
      return [
        { id: "public-dashboard", label: t("nav.public_dashboard"), icon: Globe },
      ];
    }

    if (portalMode === "field_employee") {
      return [
        { id: "emp-dashboard", label: t("nav.employee_dashboard"), icon: LayoutDashboard },
        { id: "voice-tasks", label: t("nav.voice_tasks"), icon: Volume2, badge: taskCount },
        { id: "my-tasks", label: t("employee.my_tasks_title"), icon: ClipboardList, badge: taskCount },
        { id: "mitanin", label: t("nav.mitanin_mobile"), icon: Smartphone },
        { id: "public-dashboard", label: t("nav.public_dashboard"), icon: Globe },
        { id: "settings", label: t("nav.settings"), icon: Settings },
      ];
    }

    // Supervisor / District Officer mode
    return [
      { id: "sup-dashboard", label: t("nav.supervisor_dashboard"), icon: ShieldCheck },
      { id: "team-tasks", label: t("supervisor.team_tasks_title"), icon: Users, badge: taskCount },
      { id: "voice-tasks", label: t("nav.voice_tasks"), icon: Volume2 },
      { id: "dashboard", label: t("nav.block_overview"), icon: LayoutDashboard },
      { id: "alerts", label: t("nav.alert_detail"), icon: AlertTriangle, badge: alertCount },
      { id: "tasks", label: t("nav.assign_task"), icon: CheckSquare },
      { id: "ledger", label: t("nav.task_ledger"), icon: Clock },
      { id: "mitanin", label: t("nav.mitanin_mobile"), icon: Smartphone },
      { id: "evidence", label: t("nav.model_evidence"), icon: BarChart3 },
      { id: "settings", label: t("nav.settings"), icon: Settings },
    ];
  };

  const navItems = getNavItems();

  const userInitials = currentUser?.name
    ? currentUser.name
        .replace(/\[.*?\]/g, "")
        .trim()
        .split(" ")
        .slice(0, 2)
        .map((s: string) => s[0])
        .join("")
        .toUpperCase()
    : portalMode === "public"
    ? "PU"
    : "DO";

  const userDisplayTitle = currentUser?.name
    ? currentUser.name.replace("[SAMPLE]", "").trim()
    : portalMode === "public"
    ? "Public Citizen"
    : "District officer";

  const userRoleSubtitle = currentUser?.role_label
    ? currentUser.role_label
    : portalMode === "public"
    ? "Public Portal"
    : districtName;

  return (
    <aside className="w-60 bg-[#1C1846] text-white flex flex-col justify-between shrink-0 select-none border-r border-[#2C2760]">
      <div className="overflow-y-auto">
        {/* Brand Logo */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-[#2C2760]/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple flex items-center justify-center text-white shadow-sm">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white truncate">
              {t("app.title")}
            </span>
          </div>
        </div>

        {/* Active Portal Pill */}
        <div className="px-3 pt-3">
          <div className="px-3 py-2 rounded-xl bg-[#27215E] border border-[#3A3378]/60 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#B6B2D8]">
              {portalMode === "public"
                ? "Public Portal"
                : portalMode === "field_employee"
                ? "Employee Portal"
                : "Supervisor Portal"}
            </span>
            {onOpenPortalSwitcher && (
              <button
                type="button"
                onClick={onOpenPortalSwitcher}
                className="text-[11px] font-bold text-[#EEEDFE] hover:underline cursor-pointer"
              >
                {t("app.switch_portal")}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                data-testid={`nav-${item.id}`}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#383177] text-white shadow-sm font-semibold"
                    : "text-[#B6B2D8] hover:text-white hover:bg-[#2A2464]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[#B6B2D8]"}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#C8472A] text-white leading-none">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Location & User Profile Footer */}
      <div className="p-3 space-y-2 border-t border-[#2C2760]/60">
        {onChangeLocation && (
          <button
            type="button"
            onClick={onChangeLocation}
            className="w-full px-3 py-2 rounded-xl bg-[#2A2464] hover:bg-[#383177] text-left flex items-center gap-2 transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-[#B6B2D8] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase font-bold text-[#A5A0CE]">
                {t("app.change_location")}
              </div>
              <div className="text-xs font-semibold text-white truncate">
                {locationBreadcrumb || districtName}
              </div>
            </div>
          </button>
        )}

        <div className="p-3 rounded-2xl bg-[#27215E] border border-[#3A3378]/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#534AB7] flex items-center justify-center text-white font-bold text-xs tracking-wider shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{userDisplayTitle}</div>
              <div className="text-[11px] text-[#A5A0CE] truncate">{userRoleSubtitle}</div>
            </div>
          </div>

          {onLogout && currentUser && (
            <button
              type="button"
              onClick={onLogout}
              title={t("app.sign_out")}
              className="p-1.5 rounded-lg hover:bg-[#383177] text-[#B6B2D8] hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

