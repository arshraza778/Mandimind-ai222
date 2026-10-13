import { useState } from "react";
import {
  Radio,
  ShieldCheck,
  Users,
  Globe,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  UserCheck,
  KeyRound,
} from "lucide-react";
import { LanguageSelector } from "../components/LanguageSelector";
import { useI18n } from "../i18n/I18nContext";

interface PortalLandingProps {
  initialView?: "landing" | "public-login" | "employee-login";
  onEnterPublicPortal: (citizenName?: string) => void;
  onEmployeeAuthenticated: (authPayload: {
    token: string;
    user: any;
    portal_role: "field_employee" | "supervisor";
    assigned_location: any;
    authorized_block_ids: string[];
  }) => void;
}

const DEMO_ACCOUNTS = [
  {
    username: "asha",
    password: "password123",
    label: "Mitanin Asha [SAMPLE]",
    roleBadge: "Field Employee / Mitanin",
    scope: "Sample Block A · Sector 4 Hamlet",
  },
  {
    username: "anita",
    password: "password123",
    label: "Mitanin Anita [SAMPLE]",
    roleBadge: "Field Employee / Mitanin",
    scope: "Sample Block A · Keslur Hamlet",
  },
  {
    username: "sunita",
    password: "password123",
    label: "Mitanin Sunita [SAMPLE]",
    roleBadge: "Field Employee / Mitanin",
    scope: "Sample Block B · Kanger Hamlet",
  },
  {
    username: "verma",
    password: "password123",
    label: "Supervisor K. Verma [SAMPLE]",
    roleBadge: "Block Supervisor",
    scope: "Sample Block A (All Hamlets)",
  },
  {
    username: "patel",
    password: "password123",
    label: "Supervisor P. Patel [SAMPLE]",
    roleBadge: "Block Supervisor",
    scope: "Sample Block B (All Hamlets)",
  },
  {
    username: "sharma",
    password: "password123",
    label: "Officer R. Sharma [SAMPLE]",
    roleBadge: "District Supervisor",
    scope: "Sample District (Blocks A–F)",
  },
];

export function PortalLanding({
  initialView = "landing",
  onEnterPublicPortal,
  onEmployeeAuthenticated,
}: PortalLandingProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"landing" | "public-login" | "employee-login">(initialView);

  // Public portal optional name
  const [citizenName, setCitizenName] = useState<string>("");

  // Employee login state
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both your employee username and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Invalid credentials. Roles and accounts are assigned by an administrator.");
        return;
      }

      const data = await res.json();
      onEmployeeAuthenticated(data);
    } catch {
      setError("Unable to reach authentication server at http://127.0.0.1:8000.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-36px)] bg-canvas text-ink flex flex-col justify-between">
      {/* Top Brand Header */}
      <header className="bg-[#1C1846] text-white px-6 py-4 border-b border-[#2C2760] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple flex items-center justify-center shadow-sm">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight flex items-center gap-2">
              <span>{t("app.title")}</span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#383177] text-[#EEEDFE]">
                Chhattisgarh Prototype
              </span>
            </div>
            <p className="text-xs text-[#B6B2D8]">
              {t("app.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSelector />
          {view !== "landing" && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setView("landing");
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#2A2464] hover:bg-[#383177] text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t("app.switch_portal")}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        {/* ============================================================ */}
        {/* VIEW 1: MAIN LANDING PAGE WITH TWO PORTALS */}
        {/* ============================================================ */}
        {view === "landing" && (
          <div className="max-w-5xl w-full space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-light text-purple text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t("landing.badge")}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                {t("landing.hero_title")}
              </h1>
              <p className="text-sm text-muted">
                {t("landing.hero_subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PORTAL A: PUBLIC PORTAL */}
              <div className="bg-white rounded-card-lg border-2 border-borderline hover:border-teal/60 p-6 sm:p-7 shadow-sm flex flex-col justify-between transition-all">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-teal-light text-teal flex items-center justify-center">
                      <Globe className="w-6 h-6" />
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-light text-teal">
                      A. Public Portal
                    </span>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-ink">
                      {t("landing.public_card_title")}
                    </h2>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      {t("landing.public_card_desc")}
                    </p>
                  </div>

                  <ul className="space-y-2 text-xs text-ink/90 pt-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
                      <span>No account required — immediate public health access</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
                      <span>4 climate-sensitive risk cards (Malaria, Dengue, Diarrhoea, Heat)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
                      <span>Latest temperature, rainfall, heat index, forecast & local health facilities</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6 mt-6 border-t border-borderline flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => onEnterPublicPortal()}
                    className="flex-1 py-3 px-4 rounded-xl bg-teal hover:bg-teal/90 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t("landing.enter_public_btn")}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("public-login")}
                    className="py-3 px-4 rounded-xl border border-borderline hover:bg-canvas text-ink text-xs font-semibold transition-colors"
                  >
                    Public Sign-In Page
                  </button>
                </div>
              </div>

              {/* PORTAL B: EMPLOYEE PORTAL */}
              <div className="bg-white rounded-card-lg border-2 border-borderline hover:border-purple/60 p-6 sm:p-7 shadow-sm flex flex-col justify-between transition-all">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-purple-light text-purple flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-light text-purple">
                      B. Employee Portal
                    </span>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-ink">
                      Frontline & Supervisor Portal
                    </h2>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      Authenticated portal for Field Employees (Mitanins) and Block/District Supervisors. Automatically detects your administrator-assigned role and jurisdiction upon login.
                    </p>
                  </div>

                  <ul className="space-y-2 text-xs text-ink/90 pt-1">
                    <li className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-purple shrink-0" />
                      <span>
                        <strong>Field Employee / Mitanin:</strong> My Tasks, status updates & field report submission
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-purple shrink-0" />
                      <span>
                        <strong>Supervisor:</strong> Jurisdiction overview, Team Tasks, dispatch & report review
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-purple shrink-0" />
                      <span>Strict backend role & jurisdiction access control</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6 mt-6 border-t border-borderline">
                  <button
                    type="button"
                    onClick={() => setView("employee-login")}
                    className="w-full py-3 px-4 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Open Employee Login Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: PUBLIC PORTAL LOGIN / DIRECT ACCESS PAGE */}
        {/* ============================================================ */}
        {view === "public-login" && (
          <div className="bg-white rounded-card-lg border border-borderline shadow-lg max-w-md w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-teal-light text-teal flex items-center justify-center">
                <HeartPulse className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal bg-teal-light px-2 py-0.5 rounded-full">
                  Public Portal
                </span>
                <h2 className="text-xl font-bold text-ink mt-0.5">
                  Citizen Health Information Access
                </h2>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Citizens can view verified block/village malaria risk alerts, climate telemetry, and prevention guidelines without a password. Optionally enter your name below or continue directly as a guest.
            </p>

            <div className="space-y-3">
              <div>
                <label htmlFor="citizen-name" className="block text-xs font-bold text-ink mb-1">
                  Citizen / Community Member Name (Optional)
                </label>
                <input
                  id="citizen-name"
                  type="text"
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  placeholder="e.g., Gram Panchayat Member or Guest"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-borderline text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>

              <button
                type="button"
                onClick={() => onEnterPublicPortal(citizenName.trim() || "Public Citizen")}
                className="w-full py-3 px-4 rounded-xl bg-teal hover:bg-teal/90 text-white text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2"
              >
                <span>Select Location & View Public Risk Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 3: EMPLOYEE PORTAL LOGIN PAGE */}
        {/* ============================================================ */}
        {view === "employee-login" && (
          <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Login Form Card (col-span-7) */}
            <div className="lg:col-span-7 bg-white rounded-card-lg border border-borderline shadow-lg p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-3 border-b border-borderline pb-4">
                <div className="w-11 h-11 rounded-2xl bg-purple-light text-purple flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple bg-purple-light px-2 py-0.5 rounded-full">
                    Employee Portal Login
                  </span>
                  <h2 className="text-xl font-bold text-ink mt-0.5">
                    Sign In to Mitanin Signal
                  </h2>
                  <p className="text-xs text-muted">
                    Your assigned role (Field Employee / Mitanin or Supervisor) and jurisdiction are automatically detected after login.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-coral-light border border-coral/30 flex items-center gap-2 text-xs font-semibold text-coral">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleEmployeeLogin} className="space-y-4">
                <div>
                  <label htmlFor="emp-username" className="block text-xs font-bold text-ink mb-1">
                    Employee Username
                  </label>
                  <input
                    id="emp-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username (e.g., asha, anita, verma)"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-borderline text-sm text-ink focus:outline-none focus:ring-2 focus:ring-purple"
                  />
                </div>

                <div>
                  <label htmlFor="emp-password" className="block text-xs font-bold text-ink mb-1">
                    Password
                  </label>
                  <input
                    id="emp-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-borderline text-sm text-ink focus:outline-none focus:ring-2 focus:ring-purple"
                  />
                </div>

                <div className="p-3 rounded-xl bg-canvas border border-borderline text-[11px] text-muted">
                  <strong>Security Notice:</strong> Role selection on login is disabled. Roles and geographic jurisdictions are strictly assigned by an authorized administrator in the backend database.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-purple hover:bg-purple/90 text-white text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{loading ? "Verifying Credentials..." : "Sign In & Detect Assigned Role"}</span>
                </button>
              </form>
            </div>

            {/* Prototype Demo Accounts Helper Card (col-span-5) */}
            <div className="lg:col-span-5 bg-white rounded-card-lg border border-borderline shadow-sm p-5 space-y-3.5">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  Authorized Prototype Accounts
                </h3>
                <p className="text-[11px] text-muted mt-0.5">
                  Click any seeded employee account below to auto-fill credentials (all passwords: <code className="font-mono bg-canvas px-1 py-0.5 rounded text-ink">password123</code>):
                </p>
              </div>

              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isSup = acc.roleBadge.includes("Supervisor");
                  return (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => {
                        setUsername(acc.username);
                        setPassword(acc.password);
                        setError(null);
                      }}
                      className="w-full text-left p-2.5 rounded-xl border border-borderline hover:border-purple/50 hover:bg-canvas/60 transition-all flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-ink truncate">
                            {acc.label}
                          </span>
                          <span
                            className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                              isSup
                                ? "bg-purple-light text-purple"
                                : "bg-teal-light text-teal"
                            }`}
                          >
                            {acc.roleBadge}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted truncate mt-0.5">
                          username: <span className="font-mono font-semibold text-ink">{acc.username}</span> · {acc.scope}
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-3 px-6 text-center text-xs text-muted border-t border-borderline bg-white">
        Mitanin Signal Prototype · Simulated Surveillance & Weather Data · Chhattisgarh Early Warning System
      </footer>
    </div>
  );
}
