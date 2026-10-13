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
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Globe,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface MalariaCaseForecasterProps {
  locationBreadcrumb?: string;
}

export function MalariaCaseForecaster({
  locationBreadcrumb,
}: MalariaCaseForecasterProps) {
  const [modelStatus, setModelStatus] = useState<any | null>(null);
  const [forecastData, setForecastData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [predicting, setPredicting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Controls
  const [mode, setMode] = useState<"country" | "custom">("country");
  const [selectedCountry, setSelectedCountry] = useState<string>("India");
  const [horizonYears, setHorizonYears] = useState<number>(3);
  const [baseYear, setBaseYear] = useState<number>(2018);

  // Custom lag inputs (default initialized to India 2018, 2017, 2016 incidence per 1,000)
  const [customLag1, setCustomLag1] = useState<string>("5.33");
  const [customLag2, setCustomLag2] = useState<string>("7.47");
  const [customLag3, setCustomLag3] = useState<string>("9.99");
  const [customRegion, setCustomRegion] = useState<string>("South-East Asia");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/predict/malaria-cases/status")
      .then((res) => res.json())
      .then((statusJson) => {
        setModelStatus(statusJson);
      })
      .catch(() => {});
  }, []);

  const runForecast = (
    overrideMode?: "country" | "custom",
    overrideCountry?: string,
    overrideHorizon?: number,
    overrideBaseYear?: number
  ) => {
    const activeMode = overrideMode || mode;
    const activeCountry = overrideCountry ?? selectedCountry;
    const activeHorizon = overrideHorizon ?? horizonYears;
    const activeBaseYear = overrideBaseYear ?? baseYear;

    setPredicting(true);
    setErrorMsg(null);

    const payload: Record<string, any> = {
      country: activeCountry,
      horizon_years: activeHorizon,
      base_year: activeBaseYear,
      location_context: locationBreadcrumb || undefined,
    };

    if (activeMode === "custom") {
      const l1 = Number(customLag1);
      const l2 = Number(customLag2);
      const l3 = Number(customLag3);
      if (
        Number.isNaN(l1) ||
        Number.isNaN(l2) ||
        Number.isNaN(l3) ||
        l1 < 0 ||
        l2 < 0 ||
        l3 < 0 ||
        l1 > 1000 ||
        l2 > 1000 ||
        l3 > 1000
      ) {
        setErrorMsg(
          "Please enter valid 3-year historical incidence rates between 0.0 and 1,000.0 per 1,000 population at risk."
        );
        setPredicting(false);
        setLoading(false);
        return;
      }
      payload.incidence_lag_1 = l1;
      payload.incidence_lag_2 = l2;
      payload.incidence_lag_3 = l3;
      payload.who_region = customRegion;
    }

    fetch("http://127.0.0.1:8000/predict/malaria-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail =
            typeof body.detail === "string"
              ? body.detail
              : Array.isArray(body.detail)
              ? body.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ")
              : "Failed to compute malaria case forecast.";
          throw new Error(detail);
        }
        return body;
      })
      .then((json) => {
        setForecastData(json);
      })
      .catch((err) => {
        setErrorMsg(err.message || "Unable to compute malaria forecast.");
      })
      .finally(() => {
        setPredicting(false);
        setLoading(false);
      });
  };

  useEffect(() => {
    runForecast("country", "India", 3, 2018);
  }, [locationBreadcrumb]);

  const countries: string[] = modelStatus?.countries || ["India"];
  const whoRegions: string[] = modelStatus?.who_regions || [
    "South-East Asia",
    "Africa",
    "Eastern Mediterranean",
    "Western Pacific",
    "Americas",
    "Europe",
  ];
  const testMetrics = modelStatus?.selected_model_metrics?.test_2017_2018;
  const persistenceTest =
    modelStatus?.baseline_comparison?.["Persistence Baseline (lag_1)"]
      ?.test_2017_2018;

  // Build unified chart series combining historical years + forecasted years
  const chartData: any[] = [];
  if (forecastData) {
    const hist: any[] = forecastData.historical_series || [];
    const fcList: any[] = forecastData.forecasts || [];

    hist.forEach((h) => {
      chartData.push({
        year: String(h.year),
        actual_incidence: h.incidence_per_1000,
        backtest_prediction: h.backtest_prediction,
        forecast_incidence:
          h.year === forecastData.base_year ? h.incidence_per_1000 : null,
        persistence_baseline:
          h.year === forecastData.base_year ? h.incidence_per_1000 : null,
        ci_range: null,
        reported_cases: h.reported_cases,
        estimated_cases_median: h.estimated_cases_median,
      });
    });

    fcList.forEach((f) => {
      chartData.push({
        year: `${f.year} (Forecast)`,
        actual_incidence: f.actual_observed_incidence_per_1000 ?? null,
        backtest_prediction: null,
        forecast_incidence: f.predicted_incidence_per_1000,
        persistence_baseline: f.persistence_baseline_per_1000,
        ci_lower: f.ci_80_lower,
        ci_upper: f.ci_80_upper,
        ci_range: [f.ci_80_lower, f.ci_80_upper],
        reported_cases: f.projected_reported_cases,
        estimated_cases_median: f.projected_estimated_cases,
      });
    });
  }

  const nextYearPred = forecastData?.predicted_next_year;
  const trendSummary = forecastData?.trend_summary;
  const mitaninGuidance = forecastData?.mitanin_guidance;
  const factors: any[] = forecastData?.associated_factors || [];

  const getRiskBadgeColor = (cat?: string) => {
    if (cat === "Very High" || cat === "High")
      return "bg-coral-light text-coral border-coral/30";
    if (cat === "Moderate") return "bg-amber-light text-amber border-amber/30";
    return "bg-forest-light text-forest border-forest/30";
  };

  return (
    <section
      aria-label="WHO Historical Malaria Case & Incidence ML Forecaster"
      data-testid="malaria-case-forecaster"
      className="bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs space-y-4 text-ink"
    >
      {/* 1. HEADER & MODEL METRICS PILL BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-borderline">
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-light text-purple text-[11px] font-bold">
              <BarChart3 className="w-3.5 h-3.5" />
              Trained Malaria Forecasting ML Pipeline (WHO Archive 2000–2018 · 107 Countries)
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-light text-amber text-[11px] font-bold">
              Experimental Decision-Support Model
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-ink">
            Malaria Incidence & Case Trend Forecaster (`docs/archive/*.csv`)
          </h2>
          <p className="text-xs text-muted">
            Trained{" "}
            <strong className="text-ink">
              {modelStatus?.selected_model || "HuberRegressor (Robust Linear ARX)"}
            </strong>{" "}
            on chronological WHO surveillance data (Train 2003–2014, Val 2015–2016, Held-Out Test 2017–2018).
          </p>
        </div>

        {testMetrics && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-canvas border border-borderline text-xs">
              <span className="text-muted">Held-Out Test MAE:</span>{" "}
              <strong className="text-ink">{testMetrics.mae}</strong>{" "}
              <span className="text-[11px] text-forest font-bold">
                ({testMetrics.skill_score_pct} skill vs Persistence{" "}
                {persistenceTest?.mae ?? 6.4521})
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-canvas border border-borderline text-xs">
              <span className="text-muted">Test RMSE:</span>{" "}
              <strong className="text-ink">{testMetrics.rmse}</strong>{" "}
              <span className="text-[11px] text-muted">
                (R² = {testMetrics.r2})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. GRANULARITY & EXPERIMENTAL HONESTY DISCLOSURE */}
      {forecastData?.granularity_limitation_note && (
        <div className="p-3 rounded-xl bg-amber-light/60 border border-amber/30 flex items-start gap-2.5 text-xs text-ink">
          <Info className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <div>{forecastData.granularity_limitation_note}</div>
        </div>
      )}

      {/* 3. INTERACTIVE FORECAST CONTROLS */}
      <div className="p-3.5 rounded-xl bg-canvas border border-borderline space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("country");
                runForecast("country", selectedCountry, horizonYears, baseYear);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                mode === "country"
                  ? "bg-purple text-white"
                  : "bg-white text-ink border border-borderline hover:bg-purple-light/30"
              }`}
            >
              WHO Country Historical Lookup
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                mode === "custom"
                  ? "bg-purple text-white"
                  : "bg-white text-ink border border-borderline hover:bg-purple-light/30"
              }`}
            >
              Custom 3-Year Incidence Lags
            </button>
          </div>

          <div className="text-[11px] text-muted">
            Target Variable:{" "}
            <strong className="text-ink">
              Malaria Cases per 1,000 Population at Risk
            </strong>
          </div>
        </div>

        {mode === "country" ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label
                htmlFor="malaria-country-select"
                className="block text-[11px] font-bold text-muted mb-1"
              >
                Country (107 WHO Archive Series)
              </label>
              <select
                id="malaria-country-select"
                value={selectedCountry}
                onChange={(e) => {
                  const nextC = e.target.value;
                  setSelectedCountry(nextC);
                  runForecast("country", nextC, horizonYears, baseYear);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="malaria-base-year-select"
                className="block text-[11px] font-bold text-muted mb-1"
              >
                Forecast Origin Year (`base_year`)
              </label>
              <select
                id="malaria-base-year-select"
                value={baseYear}
                onChange={(e) => {
                  const nextY = Number(e.target.value);
                  setBaseYear(nextY);
                  runForecast("country", selectedCountry, horizonYears, nextY);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              >
                {[2018, 2017, 2016, 2015, 2014, 2013, 2012, 2010].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === 2018 ? "(Latest Observed)" : "(Walk-Forward Backtest)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="malaria-horizon-select"
                className="block text-[11px] font-bold text-muted mb-1"
              >
                Forecast Horizon (Years Ahead)
              </label>
              <select
                id="malaria-horizon-select"
                value={horizonYears}
                onChange={(e) => {
                  const nextH = Number(e.target.value);
                  setHorizonYears(nextH);
                  runForecast("country", selectedCountry, nextH, baseYear);
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              >
                {[1, 2, 3, 4, 5].map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "Year" : "Years"} Ahead ({baseYear + 1}–{baseYear + h})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => runForecast("country", selectedCountry, horizonYears, baseYear)}
                disabled={predicting}
                className="w-full px-3.5 py-2 rounded-lg bg-purple hover:bg-purple/90 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${predicting ? "animate-spin" : ""}`} />
                <span>{predicting ? "Forecasting..." : "Update Forecast"}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                Incidence t-3 ({baseYear - 2})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={customLag3}
                onChange={(e) => setCustomLag3(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                Incidence t-2 ({baseYear - 1})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={customLag2}
                onChange={(e) => setCustomLag2(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                Incidence t-1 ({baseYear})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={customLag1}
                onChange={(e) => setCustomLag1(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                WHO Region
              </label>
              <select
                value={customRegion}
                onChange={(e) => setCustomRegion(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              >
                {whoRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                Horizon (Yrs)
              </label>
              <select
                value={horizonYears}
                onChange={(e) => setHorizonYears(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
              >
                {[1, 2, 3, 4, 5].map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "Yr" : "Yrs"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                onClick={() => runForecast("custom")}
                disabled={predicting}
                className="w-full px-3 py-2 rounded-lg bg-purple hover:bg-purple/90 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Run Custom Lags</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-coral-light border border-coral/30 text-coral text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!loading && forecastData && nextYearPred && (
        <>
          {/* 4. KEY FORECAST OUTPUT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Next Year Predicted Incidence */}
            <div className="p-3.5 rounded-xl bg-canvas border border-borderline space-y-1">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Predicted Incidence ({nextYearPred.year})</span>
                <Calendar className="w-3.5 h-3.5 text-purple" />
              </div>
              <div className="text-2xl font-extrabold text-ink">
                {nextYearPred.predicted_incidence_per_1000}{" "}
                <span className="text-xs font-normal text-muted">per 1,000</span>
              </div>
              <div className="text-[11px] text-muted">
                80% Interval:{" "}
                <strong className="text-ink">
                  [{nextYearPred.ci_80_lower} – {nextYearPred.ci_80_upper}]
                </strong>{" "}
                · Persistence: {nextYearPred.persistence_baseline_per_1000}
              </div>
            </div>

            {/* Card 2: Transmission Risk Stratum */}
            <div className="p-3.5 rounded-xl bg-canvas border border-borderline space-y-1">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>WHO Risk Stratum ({forecastData.forecast_period})</span>
                <Globe className="w-3.5 h-3.5 text-teal" />
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getRiskBadgeColor(
                    nextYearPred.risk_category
                  )}`}
                >
                  {nextYearPred.risk_category} Risk
                </span>
              </div>
              <div className="text-[11px] text-ink font-medium pt-0.5">
                {nextYearPred.who_transmission_stratum}
              </div>
            </div>

            {/* Card 3: Predicted Trajectory Direction */}
            <div className="p-3.5 rounded-xl bg-canvas border border-borderline space-y-1">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Predicted Trend vs {forecastData.base_year}</span>
                {trendSummary?.delta_next_year_per_1000 <= 0 ? (
                  <TrendingDown className="w-4 h-4 text-forest" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-coral" />
                )}
              </div>
              <div className="text-base font-bold text-ink">
                {trendSummary?.direction}
              </div>
              <div className="text-[11px] text-muted">
                1-Yr Change:{" "}
                <strong className="text-ink">
                  {trendSummary?.delta_next_year_per_1000 > 0 ? "+" : ""}
                  {trendSummary?.delta_next_year_per_1000} per 1,000 (
                  {trendSummary?.pct_change_next_year > 0 ? "+" : ""}
                  {trendSummary?.pct_change_next_year}%)
                </strong>
              </div>
            </div>

            {/* Card 4: Projected Case Burden (Reported vs WHO Estimated) */}
            <div className="p-3.5 rounded-xl bg-canvas border border-borderline space-y-1">
              <div className="text-xs text-muted">
                Projected {forecastData.country} Burden ({nextYearPred.year})
              </div>
              <div className="text-lg font-bold text-ink">
                {nextYearPred.projected_reported_cases !== null &&
                nextYearPred.projected_reported_cases !== undefined
                  ? `${Number(
                      nextYearPred.projected_reported_cases
                    ).toLocaleString()} reported`
                  : "Rate-only mode"}
              </div>
              <div className="text-[11px] text-muted">
                {nextYearPred.projected_estimated_cases !== null &&
                nextYearPred.projected_estimated_cases !== undefined
                  ? `WHO Estimated Median: ~${Number(
                      nextYearPred.projected_estimated_cases
                    ).toLocaleString()}`
                  : "Calibrated from WHO archive"}
              </div>
            </div>
          </div>

          {/* 5. HISTORICAL SERIES + MULTI-YEAR FORECAST CHART & HORIZON TABLE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Trajectory Chart (col-span-7) */}
            <div className="lg:col-span-7 p-4 rounded-xl border border-borderline bg-white flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-ink">
                    {forecastData.country} Malaria Incidence Trajectory (2000–
                    {forecastData.base_year + forecastData.horizon_years})
                  </h3>
                  <p className="text-[11px] text-muted">
                    Actual WHO surveillance rate (per 1,000 at risk) vs. trained
                    HuberRegressor forecast & persistence baseline
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-medium">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1C1846] inline-block" />
                    Observed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#C8472A] inline-block" />
                    ML Forecast
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8A85B8] inline-block" />
                    Persistence
                  </span>
                </div>
              </div>

              <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E5E4DF"
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 10, fill: "#6C6A63" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6C6A63" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#E5E4DF",
                        borderRadius: "10px",
                        fontSize: "11px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ci_range"
                      fill="#C8472A"
                      fillOpacity={0.14}
                      stroke="none"
                      name="80% Prediction Interval"
                    />
                    <Line
                      type="monotone"
                      dataKey="actual_incidence"
                      stroke="#1C1846"
                      strokeWidth={2.2}
                      dot={{ r: 2.5 }}
                      name="Actual Incidence (per 1,000)"
                    />
                    <Line
                      type="monotone"
                      dataKey="persistence_baseline"
                      stroke="#8A85B8"
                      strokeWidth={1.6}
                      strokeDasharray="4 4"
                      dot={false}
                      name="Persistence Baseline"
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast_incidence"
                      stroke="#C8472A"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                      name="ML Forecast (per 1,000)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Multi-Year Forecast Horizon Table (col-span-5) */}
            <div className="lg:col-span-5 p-4 rounded-xl border border-borderline bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-ink mb-1">
                  Forecast Horizon Table ({forecastData.forecast_period})
                </h3>
                <p className="text-[11px] text-muted mb-2.5">
                  Recursive multi-step projections from base year{" "}
                  <strong>{forecastData.base_year}</strong> (lag_1 ={" "}
                  {forecastData.input_lags_per_1000?.incidence_lag_1} per 1,000)
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-borderline text-[11px] text-muted">
                        <th className="py-1.5 pr-2">Year</th>
                        <th className="py-1.5 px-2">ML Forecast</th>
                        <th className="py-1.5 px-2">80% Interval</th>
                        <th className="py-1.5 px-2">Baseline</th>
                        <th className="py-1.5 pl-2">Risk Tier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borderline/60">
                      {(forecastData.forecasts || []).map((f: any) => (
                        <tr key={f.year}>
                          <td className="py-2 pr-2 font-bold text-ink">
                            {f.year}
                            {f.actual_observed_incidence_per_1000 !== null &&
                              f.actual_observed_incidence_per_1000 !==
                                undefined && (
                                <span className="block text-[10px] font-normal text-forest">
                                  Actual: {f.actual_observed_incidence_per_1000}
                                </span>
                              )}
                          </td>
                          <td className="py-2 px-2 font-bold text-purple">
                            {f.predicted_incidence_per_1000}
                          </td>
                          <td className="py-2 px-2 text-[11px] text-muted">
                            [{f.ci_80_lower}–{f.ci_80_upper}]
                          </td>
                          <td className="py-2 px-2 text-muted">
                            {f.persistence_baseline_per_1000}
                          </td>
                          <td className="py-2 pl-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getRiskBadgeColor(
                                f.risk_category
                              )}`}
                            >
                              {f.risk_category}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {mitaninGuidance?.india_underreporting_context && (
                <div className="mt-3 p-2.5 rounded-lg bg-purple-light/45 border border-purple/20 text-[11px] text-ink leading-relaxed">
                  <strong>WHO Archive Surveillance Finding (India):</strong>{" "}
                  {mitaninGuidance.india_underreporting_context}
                </div>
              )}
            </div>
          </div>

          {/* 6. ASSOCIATED FACTORS & MITANIN PUBLIC-HEALTH GUIDANCE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Associated Statistical Factors (col-span-6) */}
            <div className="lg:col-span-6 p-4 rounded-xl bg-canvas/70 border border-borderline space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold text-ink">
                  Factors Associated with This Prediction (Non-Causal)
                </h3>
                <span className="text-[10px] font-semibold text-muted uppercase">
                  13 Engineered Features
                </span>
              </div>
              <div className="space-y-2">
                {factors.map((fac: any, i: number) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg bg-white border border-borderline text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold text-ink">
                      <span>{fac.factor}</span>
                      <span className="text-purple">{fac.value}</span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                      {fac.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Mitanin Actionable Public-Health Guidance & Escalation (col-span-6) */}
            <div className="lg:col-span-6 p-4 rounded-xl bg-teal-light/35 border border-teal/25 space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal shrink-0" />
                  <h3 className="text-xs sm:text-sm font-bold text-ink">
                    Mitanin Frontline Guidance · {mitaninGuidance?.headline}
                  </h3>
                </div>

                <ul className="space-y-1.5">
                  {(mitaninGuidance?.recommended_actions || []).map(
                    (act: string, idx: number) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-ink leading-relaxed"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>

              <div className="space-y-2 pt-2 border-t border-teal/20">
                <div className="p-2.5 rounded-lg bg-white/90 border border-coral/30 text-xs text-ink">
                  <strong className="text-coral">
                    Approved Escalation Protocol:
                  </strong>{" "}
                  {mitaninGuidance?.escalation_instructions}
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-muted">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                  <span>{forecastData.experimental_disclaimer}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
