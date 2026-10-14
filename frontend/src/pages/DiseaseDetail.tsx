import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Droplets,
  Flame,
  Info,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { SelectedLocationState } from "../components/LocationSelectorModal";
import { MalariaCaseForecaster } from "../components/MalariaCaseForecaster";

interface DiseaseDetailProps {
  diseaseType: string;
  selectedLocation: SelectedLocationState;
  authToken?: string | null;
  portalMode?: "public" | "field_employee" | "supervisor";
  onChangeDisease: (diseaseType: string) => void;
  onChangeLocation: () => void;
  onBack: () => void;
}

const DISEASE_TABS = [
  { id: "malaria", label: "1. Malaria" },
  { id: "dengue", label: "2. Dengue" },
  { id: "diarrhoea", label: "3. Diarrhoeal Disease" },
  { id: "heat", label: "4. Heat-Related Health Risk" },
];

export function DiseaseDetail({
  diseaseType,
  selectedLocation,
  authToken,
  portalMode = "public",
  onChangeDisease,
  onChangeLocation,
  onBack,
}: DiseaseDetailProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      district_id: selectedLocation.district_id,
      block_id: selectedLocation.block_id,
    });
    if (selectedLocation.village_id) {
      params.set("village_id", selectedLocation.village_id);
    }

    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    fetch(
      `http://127.0.0.1:8000/diseases/${encodeURIComponent(diseaseType)}/detail?${params.toString()}`,
      { headers }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load disease detail analysis");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message || "Error loading disease detail"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDetail();
  }, [
    diseaseType,
    selectedLocation.district_id,
    selectedLocation.block_id,
    selectedLocation.village_id,
    authToken,
  ]);

  const getDiseaseIcon = (dType: string) => {
    switch (dType) {
      case "malaria":
        return <Activity className="w-5 h-5 text-coral" />;
      case "dengue":
        return <Sparkles className="w-5 h-5 text-purple" />;
      case "diarrhoea":
        return <Droplets className="w-5 h-5 text-teal" />;
      case "heat":
        return <Flame className="w-5 h-5 text-amber" />;
      default:
        return <Activity className="w-5 h-5 text-purple" />;
    }
  };

  const getRiskStyle = (cat: string, predictionAvailable: boolean = true) => {
    if (!predictionAvailable) {
      return {
        border: "border-borderline",
        bg: "bg-canvas",
        badge: "bg-ink text-white",
      };
    }
    if (cat === "Very High" || cat === "High") {
      return {
        border: "border-coral/45",
        bg: "bg-coral-light/50",
        badge: "bg-coral text-white",
      };
    }
    if (cat === "Moderate") {
      return {
        border: "border-amber/45",
        bg: "bg-amber-light/50",
        badge: "bg-amber text-white",
      };
    }
    return {
      border: "border-forest/40",
      bg: "bg-forest-light/50",
      badge: "bg-forest text-white",
    };
  };

  if (loading && !data) {
    return (
      <div className="p-8 max-w-6xl mx-auto text-center">
        <div className="p-12 bg-white rounded-card border border-borderline shadow-2xs text-sm text-muted">
          Loading detailed epidemiological & climate risk analysis for{" "}
          {selectedLocation.breadcrumb}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl border border-borderline bg-white text-xs font-bold text-ink flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
        <div className="p-6 bg-coral-light border border-coral/30 rounded-card text-coral text-sm font-semibold">
          {error}
        </div>
      </div>
    );
  }

  const detail = data?.detail || {};
  const locInfo = data?.location || {};
  const predictionAvailable = detail.prediction_available !== false;
  const riskCategory = detail.risk_category || "Low";
  const style = getRiskStyle(riskCategory, predictionAvailable);
  const uncertainty = detail.uncertainty || {};
  const coverage = detail.data_coverage || {};
  const rec = detail.recommendations || {};
  const thresholds = detail.documented_thresholds || {};
  const forecastChart: any[] = detail.forecast_chart || [];
  const historicalTrends: any[] = detail.historical_trends || [];
  const inputFeatures: any[] = detail.input_features || [];
  const supportingEvidence: string[] = detail.supporting_evidence || [];
  const isHeat = detail.disease_type === "heat";
  const isDiarrhoea = detail.disease_type === "diarrhoea";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-ink">
      {/* 1. NAVIGATION & DISEASE MODULE SWITCHER */}
      <section className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-2 rounded-xl border border-borderline bg-canvas hover:bg-purple-light/40 text-xs font-bold text-ink flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Multi-Disease Dashboard</span>
            </button>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-light text-teal text-xs font-bold">
              <MapPin className="w-3.5 h-3.5" />
              {locInfo.location_breadcrumb || selectedLocation.breadcrumb}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDetail}
              className="px-3 py-2 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onChangeLocation}
              className="px-3.5 py-2 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Change Location</span>
            </button>
          </div>
        </div>

        {/* Disease Switcher Tabs */}
        <div className="pt-3 border-t border-borderline flex items-center flex-wrap gap-2">
          <span className="text-xs font-bold text-muted mr-1">
            Select Health-Risk Module:
          </span>
          {DISEASE_TABS.map((tab) => {
            const active = tab.id === detail.disease_type;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeDisease(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? "bg-ink text-white shadow-xs"
                    : "bg-canvas text-ink hover:bg-purple-light/40 border border-borderline"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. SCIENTIFIC & DATA HONESTY BANNER */}
      <section className="p-3.5 rounded-xl bg-[#FEF3D6] border border-[#F0D99B] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#6B4204]">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 shrink-0 mt-0.5 text-[#A8650A]" />
          <div>
            <strong>
              {detail.prediction_nature || "Climate-Health Risk Module"} ·{" "}
              {coverage.status_badge || "SIMULATED DATA"}:
            </strong>{" "}
            {detail.scientific_honesty_note}
          </div>
        </div>
        <div className="text-[11px] font-bold shrink-0 bg-white/85 px-2.5 py-1 rounded-lg border border-[#F0D99B]">
          Model: {detail.model_version} · Obs: {detail.latest_observation_date}
        </div>
      </section>

      {/* 3. DIARRHOEA SAFE-WATER HONESTY NOTICE */}
      {isDiarrhoea && (
        <section className="p-3.5 rounded-xl bg-teal-light/65 border border-teal/30 flex items-start gap-2.5 text-xs text-ink">
          <Droplets className="w-4 h-4 text-teal shrink-0 mt-0.5" />
          <div>
            <strong>Water-Quality Non-Inference Rule:</strong> Drinking-water
            contamination or sanitation failure is <strong>never inferred from rainfall alone</strong>.{" "}
            {coverage.water_quality_telemetry_status} Always verify physical drinking-water
            sources using field H2S / OTs chlorine test kits.
          </div>
        </section>
      )}

      {/* 4. HEAT SEPARATION NOTICE */}
      {isHeat && (
        <section className="p-3.5 rounded-xl bg-amber-light/70 border border-amber/35 flex items-start gap-2.5 text-xs text-ink">
          <Flame className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div>
            <strong>Non-Infectious Meteorological Assessment:</strong> Heat-Related
            Health Risk is kept strictly separate from infectious-disease case models.
            It is calculated from maximum/minimum temperature, relative humidity, and the
            Rothfusz apparent-temperature Heat Index rather than a trained clinical ML forecast.
          </div>
        </section>
      )}

      {/* 5. HERO RISK SUMMARY, CONFIDENCE & DATA COVERAGE */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Risk Classification Card (col-span-5) */}
        <div
          className={`lg:col-span-5 rounded-card border-2 ${style.border} ${style.bg} p-5 flex flex-col justify-between space-y-4`}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-white border border-borderline flex items-center justify-center shadow-2xs">
                  {getDiseaseIcon(detail.disease_type)}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">
                    {detail.category_group === "meteorological_health_risk"
                      ? "Meteorological Health Risk"
                      : "Infectious Disease Early Warning"}
                  </span>
                  <h1 className="text-lg font-extrabold text-ink">
                    {detail.disease_label}
                  </h1>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${style.badge}`}>
                {predictionAvailable ? `${riskCategory} Risk` : "Unavailable"}
              </span>
            </div>

            {predictionAvailable ? (
              <div className="p-3.5 rounded-xl bg-white/90 border border-borderline grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted font-medium">
                    Latest Observation ({detail.latest_observation_date})
                  </div>
                  <div className="text-xl font-extrabold text-ink mt-0.5">
                    {detail.latest_observed_value}{" "}
                    <span className="text-xs font-semibold text-muted">
                      {detail.primary_metric_unit}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted font-medium">
                    Point Forecast / Peak
                  </div>
                  <div className="text-xl font-extrabold text-purple mt-0.5">
                    {detail.point_forecast_next_period}{" "}
                    <span className="text-xs font-semibold text-muted">
                      {detail.primary_metric_unit}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white border border-coral/35 text-xs text-ink space-y-1.5">
                <div className="font-bold text-coral flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Statistical Prediction Unavailable — Insufficient Historical Data</span>
                </div>
                <p className="text-muted leading-relaxed">
                  {detail.insufficient_data_reason}
                </p>
              </div>
            )}

            <p className="text-xs text-ink/90 leading-relaxed">
              {rec.summary}
            </p>
          </div>

          <div className="pt-3 border-t border-black/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink/80">
            <span>
              Horizon: <strong>{detail.supported_horizon}</strong>
            </span>
            <span>
              Pathogen/Driver: <strong>{detail.pathogen_or_driver}</strong>
            </span>
          </div>
        </div>

        {/* Confidence / Uncertainty & Data Coverage (col-span-7) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Model Confidence / Uncertainty */}
          <div className="bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple">
                  Model Confidence & Uncertainty
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-light text-purple text-[11px] font-bold">
                  {uncertainty.calculable ? uncertainty.confidence_band : "Not Applicable"}
                </span>
              </div>
              <div className="text-sm font-bold text-ink">
                {uncertainty.method || "Dispersion & Skill Assessment"}
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {uncertainty.note}
              </p>

              {uncertainty.calculable && uncertainty.ci_80_next_period && (
                <div className="p-3 rounded-xl bg-canvas border border-borderline text-xs space-y-1">
                  <div className="font-bold text-ink">
                    80% Negative-Binomial Prediction Interval (t+1):
                  </div>
                  <div className="text-purple font-extrabold text-sm">
                    {uncertainty.ci_80_next_period.lower} –{" "}
                    {uncertainty.ci_80_next_period.upper} {detail.primary_metric_unit}
                  </div>
                  {uncertainty.out_of_sample_mae !== undefined && (
                    <div className="text-[11px] text-muted">
                      Out-of-sample MAE: <strong>{uncertainty.out_of_sample_mae}</strong> ·
                      Baseline MAE: <strong>{uncertainty.seasonal_baseline_mae}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-[11px] text-muted pt-2 border-t border-borderline">
              Model ID: <strong>{detail.model_version}</strong>
            </div>
          </div>

          {/* Data Coverage & Missing-Data Warnings */}
          <div className="bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal">
                  Data Coverage & Warnings
                </span>
                <span className="px-2 py-0.5 rounded-md bg-teal-light text-teal text-[11px] font-bold">
                  {coverage.historical_weeks_available} / {coverage.minimum_weeks_required} wks min
                </span>
              </div>
              <div className="text-xs text-ink font-semibold">
                Source: {coverage.data_source}
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                {coverage.spatial_granularity_note}
              </p>

              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-bold text-ink">
                  Missing-Data & Telemetry Warnings:
                </div>
                {(coverage.missing_data_warnings || []).map((w: string, idx: number) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-[#FEF3D6]/70 border border-[#F0D99B] text-[11px] text-[#6B4204] flex items-start gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#A8650A]" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-muted pt-2 border-t border-borderline">
              Last updated:{" "}
              <strong>
                {detail.last_updated
                  ? new Date(detail.last_updated).toLocaleString()
                  : detail.latest_observation_date}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FORECAST & HISTORICAL OBSERVATION CHARTS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Forecast Results Chart (col-span-6) */}
        <div className="lg:col-span-6 bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs">
          <div className="pb-3 border-b border-borderline flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink">
                {detail.disease_label} — Forecast Horizon ({selectedLocation.block_name})
              </h2>
              <p className="text-xs text-muted">
                Supported horizon: {detail.supported_horizon} · Actual backend model output
              </p>
            </div>
          </div>

          {!predictionAvailable || forecastChart.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-canvas/60 rounded-xl mt-3 border border-dashed border-borderline">
              <AlertTriangle className="w-8 h-8 text-coral mb-2" />
              <div className="text-sm font-bold text-ink">
                Forecast Curve Not Generated — Insufficient Historical Observations
              </div>
              <p className="text-xs text-muted max-w-md mt-1 leading-relaxed">
                {detail.insufficient_data_reason ||
                  "Mitanin Signal never manufactures a synthetic forecast when historical block observations are below the required minimum window."}
              </p>
            </div>
          ) : (
            <div className="h-64 w-full pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={forecastChart}
                  margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E1EC" vertical={false} />
                  <XAxis dataKey="period" stroke="#6B6880" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6B6880" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip />
                  {detail.alert_threshold && (
                    <ReferenceLine
                      y={detail.alert_threshold}
                      stroke="#C8472A"
                      strokeDasharray="4 4"
                      label={{
                        value: `Threshold (${detail.alert_threshold})`,
                        position: "top",
                        fill: "#C8472A",
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="ci_upper"
                    name="80% Upper Bound"
                    fill="#EEEDFE"
                    stroke="none"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name={`Observed (${detail.primary_metric_unit})`}
                    stroke="#1F1D2B"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    name="Seasonal / Reference Baseline"
                    stroke="#8E8B9E"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="weather_model"
                    name={isHeat ? "Projected Heat Index (°C)" : "Climate-Model Forecast"}
                    stroke="#534AB7"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Historical Observations & Climate Variables Chart (col-span-6) */}
        <div className="lg:col-span-6 bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs">
          <div className="pb-3 border-b border-borderline flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink">
                Historical Observations & Climate Drivers (16 Weeks)
              </h2>
              <p className="text-xs text-muted">
                {isHeat
                  ? "Weekly Heat Index (°C), Max Temperature (°C), and Relative Humidity (%)"
                  : `Observed ${detail.disease_label} cases and weekly rainfall (mm)`}
              </p>
            </div>
          </div>

          <div className="h-64 w-full pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={historicalTrends}
                margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E1EC" vertical={false} />
                <XAxis dataKey="period" stroke="#6B6880" fontSize={10} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  stroke="#6B6880"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#0F6E56"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                {isHeat ? (
                  <>
                    <Bar
                      yAxisId="right"
                      dataKey="humidity_pct"
                      name="Relative Humidity (%)"
                      fill="#E1F5EE"
                      stroke="#0F6E56"
                      barSize={12}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="max_temp_c"
                      name="Max Temp (°C)"
                      stroke="#D97706"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="heat_index_c"
                      name="Heat Index (°C)"
                      stroke="#C8472A"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      yAxisId="right"
                      dataKey="rainfall_mm"
                      name="Rainfall (mm)"
                      fill="#E1F5EE"
                      stroke="#0F6E56"
                      barSize={12}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="primary_value"
                      name={`${detail.disease_label} cases`}
                      stroke="#C8472A"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 7. CLIMATE & EPIDEMIOLOGICAL INPUT FEATURES + SUPPORTING EVIDENCE */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Input Features (col-span-7) */}
        <div className="lg:col-span-7 bg-white rounded-card border border-borderline p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-borderline pb-3">
            <h2 className="text-base font-bold text-ink">
              Module Input Variables & Climate Features
            </h2>
            <span className="text-xs font-semibold text-muted">
              Latest Block Telemetry ({detail.latest_observation_date})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inputFeatures.map((feat: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-canvas/80 border border-borderline flex flex-col justify-between"
              >
                <div className="text-[11px] font-semibold text-muted">
                  {feat.label}
                </div>
                <div className="text-base font-extrabold text-ink mt-0.5">
                  {feat.value} <span className="text-xs font-normal text-muted">{feat.unit}</span>
                </div>
                <div className="text-[11px] text-purple font-medium mt-1">
                  Role: {feat.driver_role}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Supporting Evidence & Documented Thresholds (col-span-5) */}
        <div className="lg:col-span-5 bg-white rounded-card border border-borderline p-5 shadow-2xs space-y-4">
          <div className="space-y-2.5">
            <h2 className="text-base font-bold text-ink border-b border-borderline pb-2.5">
              Supporting Evidence & Classification Basis
            </h2>
            <ul className="space-y-2">
              {supportingEvidence.map((ev: string, i: number) => (
                <li
                  key={i}
                  className="text-xs text-ink flex items-start gap-2 bg-canvas/60 p-2.5 rounded-xl border border-borderline"
                >
                  <CheckCircle2 className="w-4 h-4 text-purple shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{ev}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-light/40 border border-purple/20 space-y-1.5 text-xs">
            <div className="font-bold text-purple flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              <span>Documented Module Thresholds ({detail.disease_label})</span>
            </div>
            <p className="text-[11px] text-muted">{thresholds.method}</p>
            <div className="grid grid-cols-1 gap-1 pt-1 text-[11px]">
              <div>
                <strong>Low:</strong> {thresholds.Low}
              </div>
              <div>
                <strong>Moderate:</strong> {thresholds.Moderate}
              </div>
              <div>
                <strong>High:</strong> {thresholds.High}
              </div>
              <div>
                <strong>Very High:</strong> {thresholds["Very High"]}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. RECOMMENDED ACTIONS (CITIZEN + HEALTH WORKER / MITANIN) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Citizen Preventive Recommendations */}
        <div className="lg:col-span-6 bg-white rounded-card border border-borderline p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-borderline pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal" />
              <h2 className="text-base font-bold text-ink">
                Public & Household Recommendations ({riskCategory})
              </h2>
            </div>
          </div>

          <ul className="space-y-2">
            {(rec.citizen_actions || []).map((act: string, idx: number) => (
              <li
                key={idx}
                className="p-3 rounded-xl bg-canvas/70 border border-borderline flex items-start gap-2.5 text-xs text-ink"
              >
                <span className="w-5 h-5 rounded-full bg-teal text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{act}</span>
              </li>
            ))}
          </ul>

          {rec.when_to_seek_care && (
            <div className="p-3 rounded-xl bg-coral-light/60 border border-coral/30 text-xs text-ink">
              <strong>When to seek medical care:</strong> {rec.when_to_seek_care}
            </div>
          )}
        </div>

        {/* Field Worker / Mitanin & Health System Actions */}
        <div className="lg:col-span-6 bg-white rounded-card border border-borderline p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-borderline pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-purple" />
              <h2 className="text-base font-bold text-ink">
                Mitanin & Health-System Field Actions
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-muted">
              {portalMode === "public" ? "Community Response Protocol" : "Field Operational Protocol"}
            </span>
          </div>

          <ul className="space-y-2">
            {(rec.health_worker_actions || []).map((act: string, idx: number) => (
              <li
                key={idx}
                className="p-3 rounded-xl bg-purple-light/35 border border-purple/20 flex items-start gap-2.5 text-xs text-ink"
              >
                <span className="w-5 h-5 rounded-full bg-purple text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{act}</span>
              </li>
            ))}
          </ul>

          {rec.public_health_guidance && (
            <div className="p-3 rounded-xl bg-teal-light/55 border border-teal/25 text-xs text-ink">
              <strong>Official Public Health Guidance:</strong> {rec.public_health_guidance}
            </div>
          )}
        </div>
      </section>

      {/* TRAINED WHO MALARIA ARCHIVE FORECASTER (SHOWN FOR MALARIA MODULE) */}
      {(detail.disease_type === "malaria" || diseaseType === "malaria") && (
        <MalariaCaseForecaster
          locationBreadcrumb={locInfo.location_breadcrumb || selectedLocation.breadcrumb}
        />
      )}
    </div>
  );
}
