import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Droplets,
  Flame,
  Info,
  ShieldAlert,
  Sparkles,
  Table2,
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

interface MultiDiseaseOverviewProps {
  multiDisease: any;
  locationBreadcrumb?: string;
  portalMode?: "public" | "field_employee" | "supervisor";
  onSelectDiseaseDetail: (diseaseType: string) => void;
}

export function MultiDiseaseOverview({
  multiDisease,
  locationBreadcrumb,
  portalMode = "public",
  onSelectDiseaseDetail,
}: MultiDiseaseOverviewProps) {
  const { t, localizeDisease, localizeRisk } = useI18n();
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [showThresholds, setShowThresholds] = useState<boolean>(false);
  const [showComparison, setShowComparison] = useState<boolean>(false);

  if (!multiDisease || !multiDisease.cards) {
    return null;
  }

  const allCards: any[] = multiDisease.cards || [];
  const filteredCards =
    selectedFilter === "all"
      ? allCards
      : allCards.filter((c) => c.disease_type === selectedFilter);

  const thresholds = multiDisease.documented_thresholds || {};
  const comparisonRows: any[] = multiDisease.location_comparison || [];

  const getRiskStyle = (cat: string, predictionAvailable: boolean = true) => {
    if (!predictionAvailable) {
      return {
        border: "border-borderline",
        bg: "bg-canvas",
        badge: "bg-ink/80 text-white",
        accent: "text-muted",
      };
    }
    const c = (cat || "Low").trim();
    if (c === "Very High" || c === "High") {
      return {
        border: "border-coral/45",
        bg: "bg-coral-light/45",
        badge: "bg-coral text-white",
        accent: "text-coral",
      };
    }
    if (c === "Moderate" || c === "Medium") {
      return {
        border: "border-amber/45",
        bg: "bg-amber-light/45",
        badge: "bg-amber text-white",
        accent: "text-amber",
      };
    }
    return {
      border: "border-forest/40",
      bg: "bg-forest-light/45",
      badge: "bg-forest text-white",
      accent: "text-forest",
    };
  };

  const getDiseaseIcon = (dType: string) => {
    switch (dType) {
      case "malaria":
        return <Activity className="w-4 h-4 text-coral" />;
      case "dengue":
        return <Sparkles className="w-4 h-4 text-purple" />;
      case "diarrhoea":
        return <Droplets className="w-4 h-4 text-teal" />;
      case "heat":
        return <Flame className="w-4 h-4 text-amber" />;
      default:
        return <Activity className="w-4 h-4 text-purple" />;
    }
  };

  const filterButtons = [
    { id: "all", label: t("public.multi_disease_title") },
    { id: "malaria", label: `1. ${localizeDisease("malaria")}` },
    { id: "dengue", label: `2. ${localizeDisease("dengue")}` },
    { id: "diarrhoea", label: `3. ${localizeDisease("diarrhoea")}` },
    { id: "heat", label: `4. ${localizeDisease("heat")}` },
  ];

  return (
    <section className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-borderline pb-3.5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-light text-purple text-[11px] font-bold uppercase tracking-wider">
              {t("public.header_badge")}
            </span>
            <span className="text-xs text-muted">
              {t("app.subtitle")}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-ink mt-1">
            {t("public.multi_disease_title")}{" "}
            {locationBreadcrumb ? `— ${locationBreadcrumb}` : ""}
          </h2>
        </div>

        {/* Disease Filter Pills + Threshold / Comparison Toggles */}
        <div className="flex items-center flex-wrap gap-1.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setSelectedFilter(btn.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                selectedFilter === btn.id
                  ? "bg-purple text-white shadow-2xs"
                  : "bg-canvas hover:bg-borderline/50 text-ink"
              }`}
            >
              {btn.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowThresholds((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1 ${
              showThresholds
                ? "bg-ink text-white border-ink"
                : "bg-white hover:bg-canvas text-muted border-borderline"
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Thresholds</span>
          </button>

          {comparisonRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowComparison((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1 ${
                showComparison
                  ? "bg-teal text-white border-teal"
                  : "bg-white hover:bg-canvas text-muted border-borderline"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Compare Blocks</span>
            </button>
          )}
        </div>
      </div>

      {/* Forecast vs Confirmed Diagnosis Notice Banner */}
      {multiDisease.forecast_vs_diagnosis_notice && (
        <div className="py-2.5 px-3.5 rounded-xl bg-purple-light/40 border border-purple/20 flex items-start gap-2.5 text-xs text-ink/90 leading-relaxed shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-purple shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-purple uppercase tracking-wider text-[11px] mr-1.5">
              Important Distinction:
            </span>
            <span>
              {multiDisease.forecast_vs_diagnosis_notice.replace(/^IMPORTANT DISTINCTION:\s*/i, "")}
            </span>
          </div>
        </div>
      )}

      {/* Collapsible Documented Risk Thresholds Panel */}
      {showThresholds && (
        <div className="p-4 rounded-xl bg-canvas border border-borderline space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
              Documented Module-Specific Risk Classification Criteria
            </h3>
            <span className="text-[11px] text-muted">
              Each disease/risk uses distinct epidemiological or meteorological criteria
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(thresholds).map(([dKey, tObj]: [string, any]) => (
              <div
                key={dKey}
                className="p-3 rounded-xl bg-white border border-borderline space-y-1.5 text-xs"
              >
                <div className="font-bold text-ink uppercase">{dKey}</div>
                <p className="text-[11px] text-muted">{tObj.methodology}</p>
                <div className="space-y-1 pt-1">
                  {Object.entries(tObj.categories || {}).map(
                    ([catName, desc]: [string, any]) => (
                      <div key={catName} className="text-[11px]">
                        <strong className="text-ink">{catName}:</strong>{" "}
                        <span className="text-muted">{desc}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Cross-Location Multi-Disease Risk Comparison Matrix */}
      {showComparison && comparisonRows.length > 0 && (
        <div className="p-4 rounded-xl bg-canvas border border-borderline space-y-2.5 overflow-x-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
              Cross-Block Multi-Disease Risk Comparison (Simulated Sentinel Blocks)
            </h3>
            <span className="text-[11px] text-muted">
              Compare Malaria, Dengue, Diarrhoeal Disease & Heat Stress across blocks
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-borderline text-[11px] text-muted uppercase">
                <th className="py-2 pr-3">Block</th>
                <th className="py-2 px-3">Malaria</th>
                <th className="py-2 px-3">Dengue</th>
                <th className="py-2 px-3">Diarrhoeal Disease</th>
                <th className="py-2 px-3">Heat-Related Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline/60">
              {comparisonRows.map((row) => (
                <tr
                  key={row.unit_id}
                  className={
                    row.is_selected
                      ? "bg-purple-light/40 font-semibold"
                      : "bg-white/60"
                  }
                >
                  <td className="py-2 pr-3 font-bold text-ink">
                    {row.unit_name}{" "}
                    {row.is_selected && (
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-purple text-white text-[10px]">
                        Selected
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">{row.malaria}</td>
                  <td className="py-2 px-3">{row.dengue}</td>
                  <td className="py-2 px-3">{row.diarrhoea}</td>
                  <td className="py-2 px-3">{row.heat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4-Card Multi-Disease Grid */}
      <div
        className={`grid grid-cols-1 ${
          filteredCards.length === 1
            ? "lg:grid-cols-1"
            : "md:grid-cols-2 xl:grid-cols-4"
        } gap-4.5`}
      >
        {filteredCards.map((card) => {
          const style = getRiskStyle(
            card.risk_category,
            card.prediction_available
          );
          const actionsList: string[] =
            portalMode === "public"
              ? card.recommendations?.citizen_actions || []
              : card.recommendations?.health_worker_actions ||
                card.recommendations?.citizen_actions ||
                [];

          const recentPoints = (card.historical_trends || []).slice(-6);

          return (
            <div
              key={card.disease_type}
              className={`rounded-card-lg border-2 ${style.border} ${style.bg} p-4.5 flex flex-col justify-between space-y-3.5 transition-all hover:shadow-sm`}
            >
              {/* Card Header & Content Stack */}
              <div className="space-y-3">
                {/* 1. Header: Icon, Titles, Risk Badge */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white border border-borderline flex items-center justify-center shrink-0 shadow-2xs">
                      {getDiseaseIcon(card.disease_type)}
                    </div>
                    <div className="min-w-0 min-h-[42px] flex flex-col justify-center">
                      <h3 className="text-sm font-extrabold text-ink leading-tight line-clamp-2">
                        {localizeDisease(card.disease_type)}
                      </h3>
                      <div
                        className="text-[10px] font-semibold text-muted leading-tight truncate mt-0.5"
                        title={
                          card.is_infectious
                            ? "Infectious Climate-Sensitive"
                            : "Non-Infectious Meteorological"
                        }
                      >
                        {card.is_infectious
                          ? "Infectious Climate-Sensitive"
                          : "Non-Infectious Meteorological"}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 self-start shadow-2xs ${style.badge}`}
                  >
                    {card.prediction_available
                      ? localizeRisk(card.risk_category)
                      : localizeRisk("Insufficient Data")}
                  </span>
                </div>

                {/* 2. Lead Time & Model Confidence Metadata Box */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="px-2.5 py-1.5 rounded-lg bg-white/80 border border-borderline/70 flex flex-col justify-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
                      {t("risk.lead_time")}
                    </span>
                    <span
                      className="font-semibold text-ink text-xs truncate"
                      title={card.supported_horizon}
                    >
                      {card.supported_horizon}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 rounded-lg bg-white/80 border border-borderline/70 flex flex-col justify-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
                      {card.uncertainty?.calculable
                        ? t("risk.confidence")
                        : "Methodology"}
                    </span>
                    <span
                      className="font-semibold text-ink text-xs truncate"
                      title={
                        card.uncertainty?.calculable
                          ? `${card.uncertainty.confidence_pct} Confidence`
                          : card.uncertainty?.confidence_pct || "Rule-Based"
                      }
                    >
                      {card.uncertainty?.calculable
                        ? `${card.uncertainty.confidence_pct} Conf.`
                        : card.uncertainty?.confidence_pct || "Rule-Based"}
                    </span>
                  </div>
                </div>

                {/* 3. Forecast vs Threshold Panel */}
                <div className="p-3 rounded-xl bg-white/95 border border-borderline/80 space-y-1.5 shadow-2xs min-h-[98px] flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      {t("risk.forecast_vs_threshold")}
                    </div>
                    <div className="text-xs font-bold text-ink leading-snug mt-1">
                      {card.risk_estimate?.summary_text}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted leading-tight border-t border-borderline/50 pt-1 mt-1">
                    {card.climate_indicators?.primary_driver_summary}
                  </div>
                </div>

                {/* 4. Missing Data or Domain Honesty Warning (Diarrhoea & Heat) */}
                {(!card.prediction_available ||
                  card.disease_type === "diarrhoea" ||
                  card.disease_type === "heat") && (
                  <div className="p-2.5 rounded-xl bg-[#FEF3D6] border border-[#F0D99B] text-[11px] leading-relaxed text-[#6B4204] flex items-start gap-2 shadow-2xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#A8650A]" />
                    <span>
                      {!card.prediction_available
                        ? card.risk_status_note ||
                          "Insufficient historical disease observations; statistical prediction disabled."
                        : card.disease_type === "diarrhoea"
                        ? t("public.safe_water_notice")
                        : t("public.heat_notice")}
                    </span>
                  </div>
                )}

                {/* 5. Recent 6-Week Trend Section */}
                {recentPoints.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-white/80 border border-borderline/80 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted">
                      <span>Recent 6-Wk Trend</span>
                      <span className="text-[9px] font-medium text-muted/70">
                        W-5 → Latest
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 overflow-x-auto py-0.5">
                      {recentPoints.map((p: any, idx: number) => {
                        const isLatest = idx === recentPoints.length - 1;
                        const val =
                          p.value !== null && p.value !== undefined
                            ? p.value
                            : "–";
                        return (
                          <div key={idx} className="flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums font-bold ${
                                isLatest
                                  ? "bg-purple-light text-purple border border-purple/30 font-extrabold"
                                  : "bg-canvas text-ink"
                              }`}
                              title={`Week ${idx + 1}: ${val}`}
                            >
                              {val}
                            </span>
                            {idx < recentPoints.length - 1 && (
                              <span className="text-muted/40 text-[9px]">→</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 6. Recommended Citizen Actions */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal shrink-0" />
                    <span>
                      {portalMode === "public"
                        ? "Recommended Citizen Actions:"
                        : "Recommended Response Actions:"}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {actionsList.slice(0, 2).map((act: string, i: number) => (
                      <li
                        key={i}
                        className="text-[11px] text-ink/90 leading-relaxed pl-2.5 border-l-2 border-teal/60 bg-white/50 rounded-r-lg py-1 pr-2"
                      >
                        {act}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 7. Footer: Timestamp + View Detailed Analysis Button */}
              <div className="mt-auto pt-3 border-t border-borderline/80 space-y-2">
                <div className="flex items-center justify-between text-[10px] text-muted">
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="w-3 h-3 text-muted/70 shrink-0" />
                    Updated:{" "}
                    {card.last_updated
                      ? new Date(card.last_updated).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )
                      : "Latest run"}
                  </span>
                  <span
                    className="truncate max-w-[125px] font-mono text-[10px] text-muted bg-white/70 px-1.5 py-0.5 rounded border border-borderline/70"
                    title={card.model_version}
                  >
                    {card.model_version}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectDiseaseDetail(card.disease_type)}
                  className="w-full h-9 rounded-xl bg-white hover:bg-ink hover:text-white text-ink border border-borderline text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs group cursor-pointer"
                >
                  <span>View Detailed Analysis</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
