import { useState, useEffect } from "react";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  ReferenceLine 
} from "recharts";
import { Sparkline } from "../components/Sparkline";
import { AssignTaskModal } from "../components/AssignTaskModal";
import { AlertDetailModal } from "../components/AlertDetailModal";
import { MultiDiseaseOverview } from "../components/MultiDiseaseOverview";
import { MalariaCaseForecaster } from "../components/MalariaCaseForecaster";
import { WeatherDiseasePredictor } from "../components/WeatherDiseasePredictor";
import { LgdBlockMapCard } from "../components/LgdBlockMapCard";
import { useMeta } from "../hooks/useMeta";

interface DashboardProps {
  onRefreshNeeded?: () => void;
  onNavigateToAlert?: (alertId: number) => void;
  onSelectDiseaseDetail?: (diseaseType: string) => void;
  selectedLocation?: {
    district_id: string;
    block_id: string;
    village_id: string;
    breadcrumb: string;
  };
}

export function Dashboard({
  onRefreshNeeded,
  onNavigateToAlert,
  onSelectDiseaseDetail,
  selectedLocation,
}: DashboardProps) {
  const { meta } = useMeta();
  const [summary, setSummary] = useState<any>(null);
  const [reportingPeriod, setReportingPeriod] = useState<"all" | "monsoon" | "recent">("all");

  // Modals state
  const [assignAlert, setAssignAlert] = useState<any | null>(null);
  const [detailAlertId, setDetailAlertId] = useState<number | null>(null);

  const fetchDashboardData = () => {
    const params = new URLSearchParams();
    if (selectedLocation?.district_id) params.set("district_id", selectedLocation.district_id);
    if (selectedLocation?.block_id) params.set("block_id", selectedLocation.block_id);
    if (selectedLocation?.village_id) params.set("village_id", selectedLocation.village_id);
    const qs = params.toString() ? `?${params.toString()}` : "";

    fetch(`http://127.0.0.1:8000/dashboard/summary${qs}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedLocation?.district_id, selectedLocation?.block_id, selectedLocation?.village_id]);

  const handleTaskCreated = () => {
    fetchDashboardData();
    if (onRefreshNeeded) onRefreshNeeded();
  };

  const geoLabelCapitalized = meta.geography_label
    ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1)
    : "Unit";

  // Fallbacks if backend is loading
  const activeAlerts = summary?.active_alerts_count ?? 3;
  const highAlerts = summary?.alerts_by_risk?.High ?? 1;
  const mediumAlerts = summary?.alerts_by_risk?.Medium ?? 2;
  const openTasks = summary?.open_tasks_count ?? 5;
  const waitingReply = summary?.tasks_waiting_reply ?? 2;
  const completedTasks = summary?.tasks_by_status?.done ?? 1;
  const overdueTasks = summary?.escalated_count ?? 0;
  const repliedPct = summary?.replied_within_window_pct ?? 80;
  const weatherUnits = summary?.weather_model_units_count ?? 4;
  const totalUnits = summary?.total_units_count ?? 6;
  const baselineUnits = summary?.baseline_units_count ?? 2;

  const unitRisks = summary?.unit_risks || [];
  const needsAction = summary?.needs_action || [];
  const skillGate = summary?.skill_gate || [];

  const rawForecastData = summary?.district_forecast || [];
  const forecastData = rawForecastData.filter((pt: any) => {
    if (reportingPeriod === "monsoon") {
      return ["Jun", "Jul", "Aug", "Sep", "Oct"].includes(pt.period);
    }
    if (reportingPeriod === "recent") {
      return ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].includes(pt.period);
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-5 space-y-3.5 max-w-[1400px] mx-auto text-ink">
      {/* TOP SAFEGUARD, DATA FRESHNESS & REPORTING-PERIOD FILTER STRIP */}
      <section
        aria-label="Safeguards and Reporting Controls"
        className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-light text-amber text-[11px] font-bold uppercase">
              Prototype — synthetic demo data
            </span>
            <span className="px-2 py-0.5 rounded-md bg-forest-light text-forest text-[11px] font-semibold">
              Freshness: Current reporting cycle
            </span>
            <span className="px-2 py-0.5 rounded-md bg-purple-light text-purple text-[11px] font-semibold">
              Completeness: 96% (missing cases preserved as null)
            </span>
          </div>
          <p className="text-xs text-muted">
            Routine surveillance may identify some surges only after cases rise; earlier warning remains a challenge.{" "}
            <span className="font-semibold text-ink">
              Target forecast horizon: 2–4 weeks, subject to local validation.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="reporting-period-select" className="text-xs font-semibold text-muted">
            Reporting period:
          </label>
          <select
            id="reporting-period-select"
            value={reportingPeriod}
            onChange={(e) => setReportingPeriod(e.target.value as any)}
            className="text-xs bg-canvas border border-borderline rounded-lg px-2.5 py-1.5 font-semibold text-ink focus:outline-hidden"
          >
            <option value="all">Full Year (Jan–Dec)</option>
            <option value="monsoon">Monsoon Transmission Window (Jun–Oct)</option>
            <option value="recent">Recent & Forecast Window (Jul–Dec)</option>
          </select>
        </div>
      </section>

      {/* ROW 1: FOUR KPI CARDS */}
      <section aria-label="KPI Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1 */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs">
          <div className="text-xs text-muted font-medium">Active alerts</div>
          <div className="text-3xl font-bold text-ink mt-0.5">{activeAlerts}</div>
          <div className="text-xs mt-1.5 flex items-center gap-1 font-medium">
            <span className="text-coral font-semibold">{highAlerts} high</span>
            <span className="text-muted">·</span>
            <span className="text-amber font-semibold">{mediumAlerts} medium</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs">
          <div className="text-xs text-muted font-medium">Tasks (Open / Overdue / Completed)</div>
          <div className="text-3xl font-bold text-ink mt-0.5">{openTasks}</div>
          <div className="text-xs mt-1.5 flex items-center gap-1.5 font-semibold">
            <span className="text-amber">{waitingReply} pending</span>
            <span className="text-muted">·</span>
            <span className="text-coral">{overdueTasks} overdue</span>
            <span className="text-muted">·</span>
            <span className="text-forest">{completedTasks} completed</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs">
          <div className="text-xs text-muted font-medium">
            Replied within {meta.escalation_hours || 48} h
          </div>
          <div className="text-3xl font-bold text-ink mt-0.5">{repliedPct}%</div>
          <div className="text-xs mt-1.5 text-muted">
            target 90% (proposed)
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs">
          <div className="text-xs text-muted font-medium">
            {geoLabelCapitalized}s using weather model
          </div>
          <div className="text-3xl font-bold text-ink mt-0.5">{weatherUnits} of {totalUnits}</div>
          <div className="text-xs mt-1.5 text-muted">
            {baselineUnits} use baseline (skill gate)
          </div>
        </div>
      </section>

      {/* ROW 1B: UNIFIED MULTI-DISEASE EARLY-WARNING OVERVIEW (4 HEALTH RISKS) */}
      {summary?.multi_disease && (
        <MultiDiseaseOverview
          multiDisease={summary.multi_disease}
          locationBreadcrumb={selectedLocation?.breadcrumb}
          portalMode="supervisor"
          onSelectDiseaseDetail={(dType) => {
            if (onSelectDiseaseDetail) onSelectDiseaseDetail(dType);
          }}
        />
      )}

      {/* ROW 2: RISK OVERVIEW TILES & NEEDS ACTION */}
      <section aria-label="Risk and Action" className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Risk Overview (col-span-8) */}
        <div className="lg:col-span-8 bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-borderline/60">
            <div>
              <h2 className="text-base font-bold text-ink">
                {geoLabelCapitalized} risk overview (ranked schematic — no fabricated boundary GIS)
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Target forecast horizon: 2–4 weeks, subject to local validation · conditional on local data availability
              </p>
            </div>
            <div className="px-3 py-1 bg-[#534AB7] text-white text-xs font-semibold rounded-full shadow-2xs">
              Risk
            </div>
          </div>

          {/* Grid of 6 Unit Tiles (2 rows x 3 cols) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-3">
            {unitRisks.map((unit: any) => {
              const isHigh = unit.risk === "High";
              const isMed = unit.risk === "Medium";
              const chipColor = isHigh
                ? "bg-coral-light text-coral"
                : isMed
                ? "bg-amber-light text-amber"
                : "bg-forest-light text-forest";

              const sparkColor = isHigh ? "#C8472A" : isMed ? "#A8650A" : "#3B6D11";
              const isWeather = unit.method_used === "weather_model";

              return (
                <div
                  key={unit.unit_id}
                  onClick={() => {
                    if (onNavigateToAlert && unit.alert_id) {
                      onNavigateToAlert(unit.alert_id);
                    } else if (unit.alert_id) {
                      setDetailAlertId(unit.alert_id);
                    }
                  }}
                  className="p-3 bg-white border border-borderline hover:border-purple/40 rounded-xl transition-all cursor-pointer shadow-2xs flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-xs text-ink truncate">{unit.unit_name}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${chipColor}`}>
                      {unit.risk.toUpperCase()}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted mt-1">
                    Horizon: {unit.lead_time || "2–4 wks (target)"}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5 flex items-center justify-between">
                    <span>Uncertainty: 80% PI</span>
                    <span className={`font-semibold ${isWeather ? "text-purple" : "text-muted"}`}>
                      {isWeather ? "Weather model" : "Seasonal baseline"}
                    </span>
                  </div>

                  <div className="my-1.5 flex items-center justify-center">
                    <Sparkline data={unit.sparkline} color={sparkColor} width={120} height={26} />
                  </div>

                  <div className="text-[10px] text-muted text-right">
                    cases, 6 {meta.unit_label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Needs Action List (col-span-4) */}
        <div className="lg:col-span-4 bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-borderline/60">
              <h2 className="text-base font-bold text-ink">Needs action</h2>
              <span className="text-xs text-muted font-medium">{needsAction.length} alerts</span>
            </div>

            <div className="space-y-2.5 pt-3">
              {needsAction.map((item: any) => {
                const isHigh = item.risk === "High";
                const chipColor = isHigh ? "bg-coral-light text-coral" : "bg-amber-light text-amber";

                return (
                  <div
                    key={item.alert_id}
                    className="p-2.5 rounded-xl border border-borderline bg-canvas/40 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-ink truncate">{item.unit_name}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${chipColor}`}>
                          {item.risk.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">
                        {item.lead_time} · {item.confidence_label}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          if (onNavigateToAlert && item.alert_id) {
                            onNavigateToAlert(item.alert_id);
                          } else {
                            setDetailAlertId(item.alert_id);
                          }
                        }}
                        className="px-2 py-1 text-xs font-semibold text-purple hover:bg-purple-light rounded-lg transition-colors"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => setAssignAlert(item)}
                        className="px-3 py-1 bg-purple text-white text-xs font-semibold rounded-lg hover:bg-purple/90 transition-colors shadow-2xs"
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ROW 3: FORECAST CHART & SKILL GATE */}
      <section aria-label="Forecast Intelligence" className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* District Forecast Chart (col-span-8) */}
        <div className="lg:col-span-8 bg-white rounded-card border border-borderline p-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-borderline/60 gap-1">
            <div>
              <h2 className="text-base font-bold text-ink">District forecast</h2>
              <p className="text-xs text-muted">
                {meta.granularity ? meta.granularity.charAt(0).toUpperCase() + meta.granularity.slice(1) : "Period"} cases · weather model vs seasonal baseline · tested on later periods
              </p>
            </div>

            {/* Custom Chart Legend */}
            <div className="flex items-center flex-wrap gap-3 text-[11px] font-medium text-muted">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-ink" /> Actual cases
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 border-b-2 border-dashed border-[#8E8B9E]" /> Seasonal baseline
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-purple" /> Weather model
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-[#EEEDFE] rounded-xs" /> 80% range
              </span>
            </div>
          </div>

          {/* Chart Canvas */}
          {forecastData && forecastData.length > 0 ? (
            <div className="h-52 w-full pt-2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastData} margin={{ top: 12, right: 15, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E1EC" vertical={false} />
                  <XAxis dataKey="period" stroke="#6B6880" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6B6880" fontSize={11} tickLine={false} axisLine={false} domain={[0, 420]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#FFFFFF", 
                      borderColor: "#E3E1EC", 
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                    }} 
                  />
                  {/* Alert level reference line */}
                  <ReferenceLine 
                    y={260} 
                    stroke="#C8472A" 
                    strokeDasharray="4 4" 
                    label={{ value: "alert level", position: "top", fill: "#C8472A", fontSize: 10, offset: 5 }} 
                  />
                  {/* 80% Confidence Range Area */}
                  <Area 
                    type="monotone" 
                    dataKey="ci_upper" 
                    fill="#EEEDFE" 
                    stroke="none" 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="actual" 
                    name="Actual" 
                    stroke="#1F1D2B" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, fill: "#1F1D2B" }} 
                    connectNulls={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baseline" 
                    name="Seasonal baseline" 
                    stroke="#8E8B9E" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    dot={false}
                    connectNulls={true}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="weather_model" 
                    name="Weather model" 
                    stroke="#534AB7" 
                    strokeWidth={2.5} 
                    dot={{ r: 4, fill: "#534AB7" }} 
                    connectNulls={true}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="absolute bottom-1 right-36 text-[10px] text-muted font-medium">
                forecast
              </div>
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-muted text-xs bg-canvas/30 rounded-xl mt-2">
              <p className="font-semibold text-ink">No forecast data available for this selection.</p>
              <p className="text-[11px] mt-1">Please ensure model runs have completed or select another region.</p>
            </div>
          )}
        </div>

        {/* Skill Gate Card (col-span-4) */}
        <div className="lg:col-span-4 bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="pb-2 border-b border-borderline/60">
              <h2 className="text-base font-bold text-ink">Skill gate</h2>
              <p className="text-[11px] text-muted mt-0.5">
                Weather drives an alert only where it beat the baseline in tests
              </p>
            </div>

            {/* List of Units */}
            <div className="space-y-2 pt-2.5">
              {skillGate.map((item: any) => {
                const isWeather = item.method_used === "weather_model";
                const pct = Math.round(item.win_share * 100);

                return (
                  <div key={item.unit_id} className="flex items-center gap-2.5 text-xs">
                    <span className="w-16 font-semibold text-ink truncate text-[11px]">
                      {item.unit_name.replace("Sample ", "")}
                    </span>

                    {/* Progress Bar */}
                    <div className="flex-1 h-2.5 bg-canvas rounded-full overflow-hidden border border-borderline/50">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isWeather ? "bg-[#534AB7]" : "bg-[#8E8B9E]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Badge Chip */}
                    <span
                      className={`w-16 text-center py-0.5 rounded-md text-[10px] font-bold ${
                        isWeather
                          ? "bg-purple-light text-purple"
                          : "bg-canvas text-muted border border-borderline"
                      }`}
                    >
                      {isWeather ? "Weather" : "Baseline"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-muted mt-2 pt-2 border-t border-borderline/50">
            Bar = share of test periods where weather model was better (simulated)
          </div>
        </div>
      </section>

      {/* ROW 3B: AUTHORITATIVE CHHATTISGARH LGD BLOCK DIRECTORY & GEOGRAPHY */}
      <LgdBlockMapCard
        selectedDistrictId={selectedLocation?.district_id}
        selectedBlockId={selectedLocation?.block_id}
      />

      {/* ROW 3C: MULTI-DISEASE WEATHER & SYMPTOM PREDICTOR */}
      <WeatherDiseasePredictor
        locationBreadcrumb={selectedLocation?.breadcrumb}
      />

      {/* ROW 4: TRAINED WHO MALARIA ARCHIVE CASE & INCIDENCE ML FORECASTER */}
      <MalariaCaseForecaster locationBreadcrumb={selectedLocation?.breadcrumb} />

      {/* Interactive Modals */}
      {assignAlert && (
        <AssignTaskModal
          alert={assignAlert}
          onClose={() => setAssignAlert(null)}
          onTaskCreated={handleTaskCreated}
        />
      )}

      {detailAlertId && (
        <AlertDetailModal
          alertId={detailAlertId}
          onClose={() => setDetailAlertId(null)}
          onAssignClick={() => {
            const found = needsAction.find((n: any) => n.alert_id === detailAlertId) || {
              alert_id: detailAlertId,
              unit_id: "U1",
              unit_name: geoLabelCapitalized,
              risk: "High",
              lead_time: `3-4 ${meta.unit_label} (target)`,
            };
            setAssignAlert(found);
          }}
        />
      )}
    </div>
  );
}
