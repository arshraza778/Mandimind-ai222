import { useState, useEffect } from "react";
import { 
  BarChart3, 
  AlertCircle, 
  TrendingUp, 
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Loader2,
  Calendar
} from "lucide-react";

interface UnitEvidence {
  unit_id: string;
  unit_name: string;
  baseline_mae: number | null;
  baseline_rmse: number | null;
  weather_mae: number | null;
  weather_rmse: number | null;
  win_share: number;
  win_share_pct: string;
  median_improvement: number;
  median_improvement_pct: string;
  skill_score?: number | null;
  skill_score_pct?: string;
  zero_baseline_mae_handled?: boolean;
  skill_gate_status?: "Pass" | "Fail" | "Insufficient evidence" | string;
  decision: string;
  verdict_chip: "Use weather" | "Use baseline" | "Not enough data" | "No weather data" | string;
  reason: string;
  n_evaluations: number;
}

interface ClaimRow {
  id: string;
  original_claim: string;
  verification_finding: string;
  corrected_positioning: string;
}

interface EvidenceData {
  data_source: string;
  granularity: string;
  unit_label: string;
  geography_level: string;
  forecast_horizon_target?: string;
  skill_score_formula?: string;
  evaluation_years: number;
  exclude_disruptions: boolean;
  skill_gate_thresholds: {
    min_win_share: number;
    min_win_share_pct: string;
    min_median_improvement: number;
    min_median_improvement_pct: string;
    require_positive_skill?: boolean;
    note?: string;
  };
  method_note: string;
  plain_language_summary: string;
  notice: string | null;
  synthetic_evaluation_notice?: string;
  claims_verification_table?: ClaimRow[];
  units: UnitEvidence[];
  malaria_archive_model?: any;
}

export function ModelEvidence() {
  const [excludeDisruptions, setExcludeDisruptions] = useState<boolean>(false);
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  const fetchEvidence = (exclude: boolean) => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/evidence?exclude_disruptions=${exclude}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load model evidence from API");
        return res.json();
      })
      .then((evData: EvidenceData) => {
        setData(evData);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || "Failed to load evidence");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEvidence(excludeDisruptions);
  }, [excludeDisruptions]);

  const handleToggle = () => {
    const nextVal = !excludeDisruptions;
    setExcludeDisruptions(nextVal);
  };

  if (loading && !data) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-purple animate-spin mb-3" />
        <div className="text-sm font-medium text-muted">Running rolling-origin model evaluation...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="p-6 bg-coral-light/50 border border-coral/30 rounded-card flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-coral shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-coral">Failed to load model evidence</div>
            <div className="text-xs text-ink/80 mt-1">{error}</div>
            <button
              onClick={() => fetchEvidence(excludeDisruptions)}
              className="mt-3 px-3 py-1.5 bg-coral text-white text-xs font-semibold rounded-lg hover:bg-coral/90 transition-all"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const units = data?.units || [];
  const maxMae = Math.max(
    ...units.flatMap((u) => [u.baseline_mae || 0, u.weather_mae || 0]),
    12
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header and Toggle Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-borderline/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-ink">Model evidence & skill gate</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-purple/10 text-purple rounded-full">
              {data?.evaluation_years || 2}-year rolling origin
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Evaluating whether weather inputs meaningfully improve forecasting accuracy over a seasonal baseline.
          </p>
        </div>

        {/* Toggle Exclude reporting-disruption periods */}
        <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-card border border-borderline shadow-sm">
          <div className="text-left">
            <div className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>Exclude reporting disruptions</span>
              <span className="text-[10px] font-normal text-muted">(2020-21)</span>
            </div>
            <div className="text-[11px] text-muted">
              {excludeDisruptions ? "Excluding disruption data" : "Including all surveillance periods"}
            </div>
          </div>
          <button
            onClick={handleToggle}
            className="flex items-center text-purple transition-all hover:scale-105 active:scale-95"
            title="Toggle to recompute evaluation metrics without reporting disruption periods"
          >
            {excludeDisruptions ? (
              <ToggleRight className="w-8 h-8 text-purple fill-purple" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-muted/60" />
            )}
          </button>
        </div>
      </div>

      {/* Method Note Callout */}
      <div className="bg-white rounded-card p-4 border border-borderline shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple/10 text-purple flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">Evaluation Methodology</div>
            <div className="text-sm font-medium text-ink mt-0.5">
              "{data?.method_note}"
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto bg-canvas px-3 py-1.5 rounded-lg border border-borderline/60">
          <span className="text-xs text-muted">Skill gate rule:</span>
          <span className="text-xs font-bold text-ink">
            Win share ≥ {data?.skill_gate_thresholds.min_win_share_pct} & Med. imp. ≥ {data?.skill_gate_thresholds.min_median_improvement_pct}
          </span>
        </div>
      </div>

      {/* Plain Language Summary Box & Simulated Data Notice */}
      <div className="space-y-3">
        {/* Plain Language Summary Box */}
        <div className="bg-gradient-to-r from-purple/5 to-teal/5 rounded-card p-5 border border-purple/20 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple text-white flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider">Evaluation Summary & Decision Analysis</h2>
              <p className="text-sm text-ink leading-relaxed font-normal">
                {data?.plain_language_summary}
              </p>
            </div>
          </div>
        </div>

        {/* Notice when data_source is simulated */}
        {data?.notice && (
          <div className="bg-amber-light/60 border border-amber/30 rounded-card p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber uppercase tracking-wider">Simulated Prototype Environment</div>
              <div className="text-sm font-semibold text-ink mt-0.5">
                {data.notice}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grouped Bar Chart: Comparing Baseline vs Weather Errors */}
      <div className="bg-white rounded-card p-6 border border-borderline shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple" />
              Forecast Error Comparison (MAE)
            </h3>
            <p className="text-xs text-muted">
              Lower Mean Absolute Error indicates superior model accuracy on unseen test origins.
            </p>
          </div>
          {/* Chart Legend */}
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-[#8A85B8]"></div>
              <span className="text-ink">Seasonal baseline MAE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-purple"></div>
              <span className="text-ink">Weather model MAE</span>
            </div>
          </div>
        </div>

        {/* SVG Grouped Bar Chart */}
        <div className="w-full h-64">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 700 220">
            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac, i) => {
              const y = 180 - frac * 160;
              const val = Math.round(frac * maxMae);
              return (
                <g key={i}>
                  <line x1="50" y1={y} x2="680" y2={y} stroke="#E3E1EC" strokeDasharray="3 3" />
                  <text x="40" y={y + 4} textAnchor="end" fontSize="10" fill="#6B6880">
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Units Grouped Bars */}
            {units.map((u, idx) => {
              const groupWidth = 630 / units.length;
              const xCenter = 50 + idx * groupWidth + groupWidth / 2;
              const barWidth = 22;

              const bMae = u.baseline_mae || 0;
              const wMae = u.weather_mae || 0;

              const bHeight = (bMae / maxMae) * 160;
              const wHeight = (wMae / maxMae) * 160;

              const bX = xCenter - barWidth - 3;
              const wX = xCenter + 3;

              return (
                <g key={u.unit_id} className="cursor-pointer group" onClick={() => setSelectedUnit(u.unit_id)}>
                  {/* Baseline bar */}
                  <rect
                    x={bX}
                    y={180 - bHeight}
                    width={barWidth}
                    height={Math.max(bHeight, 2)}
                    rx="4"
                    fill="#8A85B8"
                    className="transition-all hover:opacity-80"
                  />
                  <text
                    x={bX + barWidth / 2}
                    y={172 - bHeight}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill="#433F6E"
                  >
                    {bMae.toFixed(1)}
                  </text>

                  {/* Weather model bar */}
                  <rect
                    x={wX}
                    y={180 - wHeight}
                    width={barWidth}
                    height={Math.max(wHeight, 2)}
                    rx="4"
                    fill={u.decision === "weather_model" ? "#534AB7" : "#0F6E56"}
                    className="transition-all hover:opacity-80"
                  />
                  <text
                    x={wX + barWidth / 2}
                    y={172 - wHeight}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill="#1C1846"
                  >
                    {wMae > 0 ? wMae.toFixed(1) : "-"}
                  </text>

                  {/* X Axis Unit Label */}
                  <text
                    x={xCenter}
                    y="200"
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="#26215C"
                  >
                    {u.unit_name.replace("Sample Block ", "Block ")}
                  </text>

                  {/* Status Indicator */}
                  <text
                    x={xCenter}
                    y="214"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="500"
                    fill={u.decision === "weather_model" ? "#534AB7" : "#6B6880"}
                  >
                    {u.decision === "weather_model" ? "Weather Wins" : "Baseline"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Table Per Unit */}
      <div className="bg-white rounded-card border border-borderline shadow-sm overflow-hidden">
        <div className="p-4 border-b border-borderline/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Skill Gate Evaluation Results</h3>
            <span className="text-xs text-muted font-normal">
              ({units.length} active {data?.geography_level || "block"}s · Target forecast horizon: 2–4 weeks, subject to local validation)
            </span>
          </div>
          <div className="text-xs font-semibold text-purple bg-purple/10 px-2.5 py-1 rounded-md">
            Skill = 1 − MAE_candidate / MAE_baseline (prototype criteria, not public-health validation standards)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas/80 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-borderline">
                <th className="py-3 px-4">Unit / Block</th>
                <th className="py-3 px-4 text-right">Baseline MAE</th>
                <th className="py-3 px-4 text-right">Weather MAE</th>
                <th className="py-3 px-4 text-right">Skill (1 − MAE_c / MAE_b)</th>
                <th className="py-3 px-4 text-right">Win Share</th>
                <th className="py-3 px-4 text-right">Sample Size (N)</th>
                <th className="py-3 px-4 text-center">Skill Gate</th>
                <th className="py-3 px-4 text-center">Operational Mode</th>
                <th className="py-3 px-4">Evidence Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline/60 text-xs">
              {units.map((u) => {
                const isSelected = selectedUnit === u.unit_id;
                const isWeather = u.verdict_chip === "Use weather";
                const isBaseline = u.verdict_chip === "Use baseline";
                const isNoData = u.verdict_chip === "Not enough data";
                const isNoWeather = u.verdict_chip === "No weather data";
                const gateStatus =
                  u.skill_gate_status ||
                  (isWeather ? "Pass" : isNoData || isNoWeather ? "Insufficient evidence" : "Fail");
                const computedSkillPct =
                  u.skill_score_pct ||
                  (u.baseline_mae && u.weather_mae !== null
                    ? `${((1 - u.weather_mae / u.baseline_mae) * 100).toFixed(1)}%`
                    : "N/A");

                return (
                  <tr 
                    key={u.unit_id} 
                    className={`hover:bg-canvas/50 transition-colors ${isSelected ? "bg-purple-light/20" : ""}`}
                  >
                    {/* Unit Name */}
                    <td className="py-3.5 px-4 font-semibold text-ink">
                      {u.unit_name}
                      <span className="ml-2 text-[10px] text-muted font-normal">({u.unit_id})</span>
                    </td>

                    {/* Baseline MAE */}
                    <td className="py-3.5 px-4 text-right font-medium text-ink">
                      {u.baseline_mae !== null ? u.baseline_mae.toFixed(2) : "-"}
                    </td>

                    {/* Weather MAE */}
                    <td className="py-3.5 px-4 text-right font-medium text-ink">
                      {u.weather_mae !== null ? u.weather_mae.toFixed(2) : "-"}
                    </td>

                    {/* Skill Score */}
                    <td className="py-3.5 px-4 text-right font-bold">
                      <span className={u.skill_score && u.skill_score > 0 ? "text-purple" : "text-coral"}>
                        {computedSkillPct}
                      </span>
                    </td>

                    {/* Win Share */}
                    <td className="py-3.5 px-4 text-right font-semibold">
                      <span className={u.win_share >= (data?.skill_gate_thresholds.min_win_share || 0.6) ? "text-purple font-bold" : "text-muted"}>
                        {u.win_share_pct}
                      </span>
                    </td>

                    {/* Sample Size */}
                    <td className="py-3.5 px-4 text-right text-muted font-medium">
                      {u.n_evaluations} origins
                    </td>

                    {/* Skill Gate Pass / Fail / Insufficient evidence */}
                    <td className="py-3.5 px-4 text-center">
                      {gateStatus === "Pass" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-forest-light text-forest border border-forest/20">
                          Pass
                        </span>
                      )}
                      {gateStatus === "Fail" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-coral-light text-coral border border-coral/20">
                          Fail
                        </span>
                      )}
                      {gateStatus === "Insufficient evidence" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-light text-amber border border-amber/30">
                          Insufficient evidence
                        </span>
                      )}
                    </td>

                    {/* Verdict Chip */}
                    <td className="py-3.5 px-4 text-center">
                      {isWeather && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple/10 text-purple border border-purple/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Use weather
                        </span>
                      )}
                      {isBaseline && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#EEEDFE] text-[#534AB7] border border-[#534AB7]/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Use baseline
                        </span>
                      )}
                      {isNoData && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-light text-amber border border-amber/30">
                          <AlertCircle className="w-3 h-3" />
                          Not enough data
                        </span>
                      )}
                      {isNoWeather && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-coral-light text-coral border border-coral/30">
                          <XCircle className="w-3 h-3" />
                          No weather data
                        </span>
                      )}
                    </td>

                    {/* Reason / Decision note */}
                    <td className="py-3.5 px-4 text-muted text-[11px] max-w-xs truncate" title={u.reason}>
                      {u.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION F: ABOUT / EVIDENCE & LIMITATIONS + CLAIM-BY-CLAIM VERIFICATION TABLE */}
      <section
        aria-label="About, Evidence, and Limitations"
        className="bg-white rounded-card border border-borderline p-6 shadow-sm space-y-5"
      >
        <div className="border-b border-borderline/80 pb-3">
          <div className="text-xs font-bold text-purple uppercase tracking-wider">
            About / Evidence & Limitations
          </div>
          <h2 className="text-lg font-bold text-ink mt-0.5">
            Existing Approaches vs. Proposed Approach — Claim-by-Claim Verification
          </h2>
          <p className="text-xs text-muted mt-1">
            Illustrative evaluation on synthetic data; not evidence of real-world forecasting performance. Weather-informed forecasts are eligible for operational use only when they outperform a seasonal baseline under a defined evaluation protocol.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-canvas/80 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-borderline">
                <th className="py-3 px-4">Original Claim</th>
                <th className="py-3 px-4">Verification Finding</th>
                <th className="py-3 px-4">Enforced Product Positioning & Safeguard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline/60">
              {(data?.claims_verification_table && data.claims_verification_table.length > 0
                ? data.claims_verification_table
                : [
                    {
                      id: "surveillance_timing",
                      original_claim: "Existing systems cases rise hone ke baad recognize karte hain",
                      verification_finding:
                        "Overstated if presented as an absolute rule. Routine surveillance is often laggy or reactive, but early-warning and weather-informed research/pilots already exist.",
                      corrected_positioning:
                        "Routine surveillance may identify some surges only after cases rise; earlier warning remains a challenge.",
                    },
                    {
                      id: "warning_horizon",
                      original_claim: "Weather-based forecasting se 2–4 weeks pehle warning",
                      verification_finding:
                        "Scientifically plausible, not guaranteed. Indian research has demonstrated a 2–3 week prediction horizon for malaria in Maharashtra; 2–4 weeks is a target to test, not a proven outcome.",
                      corrected_positioning:
                        "Target forecast horizon: 2–4 weeks, subject to local validation.",
                    },
                    {
                      id: "block_granularity",
                      original_claim: "District-to-block localized risk",
                      verification_finding:
                        "Valid design goal, not a new invention. WHO guidance already describes district-level meteorological early warnings and sub-district outbreak detection.",
                      corrected_positioning:
                        "Locally validated risk estimates for Chhattisgarh blocks, conditional on sufficient local data and validation.",
                    },
                    {
                      id: "task_ledger_workflow",
                      original_claim: "Alert → task → owner → deadline → completion ledger",
                      verification_finding:
                        "Strong product workflow, not proven unique. Existing platforms such as FeverTracker already support surveillance, digital reporting, alerts, and advisories.",
                      corrected_positioning:
                        "Focus on the integration of forecast evaluation with an accountable Mitanin-facing task workflow; verify against comparable products.",
                    },
                    {
                      id: "skill_gate_protocol",
                      original_claim: "Forecast skill compared against a seasonal baseline",
                      verification_finding:
                        "Methodologically strong. Testing whether weather features actually beat a simple seasonal baseline is good forecasting practice.",
                      corrected_positioning:
                        "Weather-informed forecasts are eligible for operational use only when they outperform a seasonal baseline under a defined evaluation protocol.",
                    },
                  ]
              ).map((row) => (
                <tr key={row.id} className="hover:bg-canvas/40">
                  <td className="py-3.5 px-4 font-semibold text-ink align-top">{row.original_claim}</td>
                  <td className="py-3.5 px-4 text-muted align-top leading-relaxed">{row.verification_finding}</td>
                  <td className="py-3.5 px-4 font-semibold text-purple align-top leading-relaxed">
                    “{row.corrected_positioning}”
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-canvas/60 border border-borderline space-y-1.5">
            <h4 className="text-xs font-bold text-ink uppercase">1. What the Prototype Implements</h4>
            <p className="text-xs text-muted leading-relaxed">
              End-to-end software workflow connecting surveillance & weather ingestion, rolling-origin zero-leakage evaluation (`Skill = 1 − MAE_candidate / MAE_baseline`), skill-gated alerts, human review, Mitanin field task assignment, and an exportable append-only completion ledger.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-canvas/60 border border-borderline space-y-1.5">
            <h4 className="text-xs font-bold text-ink uppercase">2. What Remains Unvalidated</h4>
            <p className="text-xs text-muted leading-relaxed">
              Real-world predictive lead time in Chhattisgarh blocks, prospective field sensitivity/specificity, and operational impact on vector-control turnaround times. All current demo figures are illustrative on synthetic data.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-canvas/60 border border-borderline space-y-1.5">
            <h4 className="text-xs font-bold text-ink uppercase">3. Data & Human Oversight Requirements</h4>
            <p className="text-xs text-muted leading-relaxed">
              Real deployment requires multi-year weekly block-level surveillance, verified population denominators, forecast-time meteorological feeds, and mandatory supervisor review before operational task dispatch.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION G: WHO MALARIA ARCHIVE ML FORECASTING EVALUATION (`docs/archive/*.csv`) */}
      {data?.malaria_archive_model?.model_loaded && (
        <section
          aria-label="WHO Malaria Archive Model Evaluation"
          className="bg-white rounded-card border border-borderline p-6 shadow-sm space-y-5"
        >
          <div className="border-b border-borderline/80 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-purple uppercase tracking-wider">
                Real Uploaded Dataset Evaluation (`docs/archive/*.csv`)
              </div>
              <h2 className="text-lg font-bold text-ink mt-0.5">
                WHO Historical Malaria Incidence & Case Trend Forecasting Model
              </h2>
              <p className="text-xs text-muted mt-1">
                {data.malaria_archive_model.selection_rationale}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-forest-light text-forest text-xs font-bold shrink-0">
              Test Skill: {data.malaria_archive_model.selected_model_metrics?.test_2017_2018?.skill_score_pct} vs Persistence
            </span>
          </div>

          {/* Candidate Model Comparison Table */}
          <div>
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
              Chronological Split Comparison (Train 2003–2014 · Validation 2015–2016 · Held-Out Test 2017–2018)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-canvas/80 text-[11px] font-bold text-muted uppercase border-b border-borderline">
                    <th className="py-2.5 px-3">Algorithm / Baseline</th>
                    <th className="py-2.5 px-3 text-right">Val MAE (2015–16)</th>
                    <th className="py-2.5 px-3 text-right">Val RMSE</th>
                    <th className="py-2.5 px-3 text-right">Test MAE (2017–18)</th>
                    <th className="py-2.5 px-3 text-right">Test RMSE</th>
                    <th className="py-2.5 px-3 text-right">Test R²</th>
                    <th className="py-2.5 px-3 text-right">Skill vs Persistence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderline/60">
                  {Object.entries(data.malaria_archive_model.baseline_comparison || {}).map(
                    ([bName, bObj]: [string, any]) => (
                      <tr key={bName} className="bg-canvas/30">
                        <td className="py-2 px-3 font-semibold text-muted">{bName}</td>
                        <td className="py-2 px-3 text-right font-mono">{bObj.validation_2015_2016?.mae}</td>
                        <td className="py-2 px-3 text-right font-mono">{bObj.validation_2015_2016?.rmse}</td>
                        <td className="py-2 px-3 text-right font-mono">{bObj.test_2017_2018?.mae}</td>
                        <td className="py-2 px-3 text-right font-mono">{bObj.test_2017_2018?.rmse}</td>
                        <td className="py-2 px-3 text-right font-mono">{bObj.test_2017_2018?.r2}</td>
                        <td className="py-2 px-3 text-right font-mono text-muted">
                          {bObj.test_2017_2018?.skill_score_pct}
                        </td>
                      </tr>
                    )
                  )}
                  {(data.malaria_archive_model.candidate_models || []).map((m: any) => {
                    const isSelected = m.model_name === data.malaria_archive_model.selected_model;
                    return (
                      <tr
                        key={m.model_name}
                        className={isSelected ? "bg-purple-light/30 font-semibold" : "hover:bg-canvas/40"}
                      >
                        <td className="py-2 px-3 text-ink">
                          {m.model_name}{" "}
                          {isSelected && (
                            <span className="ml-1.5 px-2 py-0.5 rounded-full bg-purple text-white text-[10px] font-bold">
                              Selected
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{m.validation_2015_2016?.mae}</td>
                        <td className="py-2 px-3 text-right font-mono">{m.validation_2015_2016?.rmse}</td>
                        <td className="py-2 px-3 text-right font-mono text-purple font-bold">
                          {m.test_2017_2018?.mae}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{m.test_2017_2018?.rmse}</td>
                        <td className="py-2 px-3 text-right font-mono">{m.test_2017_2018?.r2}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          <span
                            className={
                              m.beats_persistence_on_test_mae
                                ? "text-forest font-bold"
                                : "text-coral font-semibold"
                            }
                          >
                            {m.test_2017_2018?.skill_score_pct}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Regional Test Performance Table */}
          <div>
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
              Held-Out Test Performance by WHO Region (2017–2018)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-canvas/80 text-[11px] font-bold text-muted uppercase border-b border-borderline">
                    <th className="py-2 px-3">WHO Region</th>
                    <th className="py-2 px-3 text-right">Countries</th>
                    <th className="py-2 px-3 text-right">Test Records</th>
                    <th className="py-2 px-3 text-right">Persistence MAE</th>
                    <th className="py-2 px-3 text-right">Model MAE</th>
                    <th className="py-2 px-3 text-right">Model RMSE</th>
                    <th className="py-2 px-3 text-right">Regional Skill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderline/60">
                  {(data.malaria_archive_model.regional_test_performance_2017_2018 || []).map(
                    (reg: any) => (
                      <tr key={reg.who_region}>
                        <td className="py-2 px-3 font-semibold text-ink">{reg.who_region}</td>
                        <td className="py-2 px-3 text-right font-mono">{reg.countries_count}</td>
                        <td className="py-2 px-3 text-right font-mono">{reg.test_records}</td>
                        <td className="py-2 px-3 text-right font-mono">{reg.baseline_persistence_mae}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-purple">
                          {reg.model_mae}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{reg.model_rmse}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-forest">
                          {reg.skill_score_pct}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
