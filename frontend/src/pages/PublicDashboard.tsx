import { useState, useEffect } from "react";
import {
  MapPin,
  AlertTriangle,
  Thermometer,
  CloudRain,
  Activity,
  Clock,
  ShieldCheck,
  Building2,
  PhoneCall,
  Info,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import type { SelectedLocationState } from "../components/LocationSelectorModal";
import { MultiDiseaseOverview } from "../components/MultiDiseaseOverview";
import { WeatherDiseasePredictor } from "../components/WeatherDiseasePredictor";
import { LgdBlockMapCard } from "../components/LgdBlockMapCard";

interface PublicDashboardProps {
  selectedLocation: SelectedLocationState;
  citizenName?: string;
  onChangeLocation: () => void;
  onSwitchPortal: () => void;
  onSelectDiseaseDetail?: (diseaseType: string) => void;
}

export function PublicDashboard({
  selectedLocation,
  citizenName,
  onChangeLocation,
  onSelectDiseaseDetail,
}: PublicDashboardProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRiskData = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      district_id: selectedLocation.district_id,
      block_id: selectedLocation.block_id,
    });
    if (selectedLocation.village_id) {
      params.set("village_id", selectedLocation.village_id);
    }

    fetch(`http://127.0.0.1:8000/public/risk-dashboard?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load location risk data");
        return res.json();
      })
      .then((json) => {
        setData(json);
      })
      .catch((err) => {
        setError(err.message || "Unable to load public risk dashboard.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRiskData();
  }, [selectedLocation.district_id, selectedLocation.block_id, selectedLocation.village_id]);

  if (loading && !data) {
    return (
      <div className="p-8 max-w-6xl mx-auto text-center">
        <div className="p-12 bg-white rounded-card border border-borderline shadow-2xs text-sm text-muted">
          Loading malaria risk and climate telemetry for {selectedLocation.breadcrumb}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-6 bg-coral-light border border-coral/30 rounded-card text-coral text-sm font-semibold">
          {error}
        </div>
      </div>
    );
  }

  const risk = data?.risk || {};
  const climate = data?.climate || {};
  const rec = data?.recommendations || {};
  const dataStatus = data?.data_status || {};
  const locInfo = data?.location || {};
  const facility = locInfo?.health_facility;

  const riskCategory: string = risk.category || "Low";
  const allCategories: string[] = risk.all_categories || ["Low", "Moderate", "High", "Very High"];

  const getRiskStyle = (cat: string) => {
    if (cat === "Very High" || cat === "High") {
      return {
        bg: "bg-coral-light",
        text: "text-coral",
        border: "border-coral/40",
        pillBg: "bg-coral text-white",
      };
    }
    if (cat === "Moderate") {
      return {
        bg: "bg-amber-light",
        text: "text-amber",
        border: "border-amber/40",
        pillBg: "bg-amber text-white",
      };
    }
    return {
      bg: "bg-forest-light",
      text: "text-forest",
      border: "border-forest/40",
      pillBg: "bg-forest text-white",
    };
  };

  const activeStyle = getRiskStyle(riskCategory);

  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-28 max-w-7xl mx-auto space-y-6 text-ink">
      {/* 1. PROMINENT LOCATION HEADER & CONTROLS */}
      <section className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-light text-teal text-xs font-bold">
              <MapPin className="w-3.5 h-3.5" />
              Confirmed Location
            </span>
            {citizenName && (
              <span className="text-xs text-muted font-medium">
                Welcome, {citizenName}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            {locInfo.location_breadcrumb || selectedLocation.breadcrumb}
          </h1>
          {locInfo.granularity_disclosure && (
            <p className="text-xs text-muted flex items-center gap-1.5 pt-0.5">
              <Info className="w-3.5 h-3.5 text-purple shrink-0" />
              <span>{locInfo.granularity_disclosure}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchRiskData}
            className="px-3.5 py-2.5 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onChangeLocation}
            className="px-4 py-2.5 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Change Location</span>
          </button>
        </div>
      </section>

      {/* 2. SIMULATED / HISTORICAL DATA HONESTY DISCLOSURE */}
      <section className="p-4 rounded-xl bg-[#FEF3D6] border border-[#F0D99B] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-[#6B4204]">
        <div className="flex items-start sm:items-center gap-2">
          <Clock className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-[#A8650A]" />
          <span>
            <strong>{dataStatus.status_badge || "SIMULATED / HISTORICAL DATA"}:</strong>{" "}
            {dataStatus.honesty_disclosure}
          </span>
        </div>
        <div className="text-[11px] font-bold shrink-0 bg-white/80 px-2.5 py-1 rounded-lg border border-[#F0D99B]">
          Latest observation: {climate.latest_date} · Model run:{" "}
          {dataStatus.last_model_update
            ? new Date(dataStatus.last_model_update).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Oct 2026"}
        </div>
      </section>

      {/* 2B. IMPORTANT DISTINCTION: FORECAST VS CLINICAL DIAGNOSIS */}
      <section className="rounded-card-lg border-2 border-purple/30 bg-gradient-to-br from-purple-light/80 via-white to-purple-light/40 p-4 sm:p-5 shadow-sm text-ink space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-purple/15">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold tracking-wider uppercase bg-purple text-white shadow-xs">
              <ShieldAlert className="w-3.5 h-3.5" />
              IMPORTANT DISTINCTION
            </span>
            <span className="text-xs font-bold text-purple tracking-tight">
              Community Risk Forecast vs. Clinical Disease Diagnosis
            </span>
          </div>
          <span className="text-[11px] font-semibold text-muted bg-white/90 px-2 py-0.5 rounded border border-borderline self-start sm:self-auto">
            Public Health Notice
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-white/95 border border-purple/15 flex items-start gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-teal-light text-teal flex items-center justify-center shrink-0 mt-0.5">
              <Activity className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed">
              <div className="font-bold text-ink text-[13px]">Community-Level Hazard Forecast</div>
              <p className="text-muted mt-1">
                A risk forecast or environmental heat index estimates <strong className="text-ink font-semibold">community-level hazard</strong> derived from climate and historical surveillance trends.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/95 border border-coral/25 flex items-start gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-coral-light text-coral flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed">
              <div className="font-bold text-coral text-[13px]">Not a Clinical Diagnosis</div>
              <p className="text-muted mt-1">
                This is <strong className="text-coral font-bold">NOT a confirmed clinical disease diagnosis</strong> or water-potability test. It does not certify individual health status.
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-purple-light/70 border border-purple/25 flex items-start sm:items-center gap-2.5 text-xs text-ink">
          <Stethoscope className="w-4 h-4 text-purple shrink-0 mt-0.5 sm:mt-0" />
          <div className="leading-relaxed flex-1">
            <strong className="text-purple font-bold">Action Directive:</strong>{" "}
            Individuals with symptoms must seek diagnostic testing at a health facility or contact their local Mitanin / ASHA community health worker.
            {data?.forecast_vs_outbreak_distinction && (
              <span className="block sm:inline sm:ml-2 text-muted italic">
                — {data.forecast_vs_outbreak_distinction}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2C. UNIFIED MULTI-DISEASE EARLY-WARNING OVERVIEW (4 CARDS) */}
      {data?.multi_disease && (
        <MultiDiseaseOverview
          multiDisease={data.multi_disease}
          locationBreadcrumb={locInfo.location_breadcrumb || selectedLocation.breadcrumb}
          portalMode="public"
          onSelectDiseaseDetail={(dType) => {
            if (onSelectDiseaseDetail) onSelectDiseaseDetail(dType);
          }}
        />
      )}

      {/* 3. PROMINENT HIGH / VERY HIGH RISK ALERT BANNER (Dynamic) */}
      {rec.show_prominent_alert && (
        <section className="p-5 sm:p-6 rounded-card-lg bg-coral-light border-2 border-coral text-ink flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-coral text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-coral">
                Active Public Health Alert · {selectedLocation.block_name}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-ink mt-0.5">
                {rec.headline}
              </h2>
              <p className="text-xs text-ink/90 mt-1">{rec.summary}</p>
            </div>
          </div>
          <span className="px-3.5 py-1.5 rounded-full bg-coral text-white text-xs font-bold shrink-0">
            {riskCategory.toUpperCase()} RISK
          </span>
        </section>
      )}

      {/* 4. CURRENT ESTIMATED RISK & LATEST CLIMATE INDICATORS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Estimated Risk Card (col-span-5) */}
        <div className={`lg:col-span-5 rounded-card-lg border-2 ${activeStyle.border} ${activeStyle.bg} p-6 flex flex-col justify-between shadow-sm`}>
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/80">
                Current Estimated Malaria Risk
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${activeStyle.pillBg}`}>
                {riskCategory}
              </span>
            </div>

            <div className="text-3xl font-extrabold text-ink">{riskCategory} Risk</div>
            <p className="text-xs text-ink/85 leading-relaxed">{rec.summary}</p>

            {/* 4-Category Visual Scale */}
            <div className="pt-2">
              <div className="text-[11px] font-bold text-ink/70 mb-1.5">
                Risk Category Scale:
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {allCategories.map((cat) => {
                  const isCurrent = cat === riskCategory;
                  return (
                    <div
                      key={cat}
                      className={`py-2 px-1 text-center text-[11px] font-bold rounded-lg border transition-all ${
                        isCurrent
                          ? "bg-ink text-white border-ink shadow-xs"
                          : "bg-white/70 text-muted border-borderline"
                      }`}
                    >
                      {cat}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 mt-5 border-t border-black/10 flex items-center justify-between text-xs text-ink/80">
            <span>
              Forecast: <strong>{risk.forecast_period}</strong>
            </span>
            <span>
              Method: <strong>{risk.method_label}</strong>
            </span>
          </div>
        </div>

        {/* Climate & Surveillance KPIs (col-span-7) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Temperature */}
          <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-sm flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-light text-amber flex items-center justify-center shrink-0">
              <Thermometer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted font-medium">Latest Temperature</div>
              <div className="text-2xl font-extrabold text-ink mt-0.5 tabular-nums">
                {climate.temperature_c}°C
              </div>
              <div className="text-[11px] text-muted mt-1 truncate">
                4-week mean: <strong>{climate.temp_4wk_avg_c}°C</strong>
              </div>
            </div>
          </div>

          {/* Rainfall */}
          <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-sm flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-purple-light text-purple flex items-center justify-center shrink-0">
              <CloudRain className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted font-medium">Latest Rainfall</div>
              <div className="text-2xl font-extrabold text-ink mt-0.5 tabular-nums">
                {climate.rainfall_mm} mm
              </div>
              <div className="text-[11px] text-muted mt-1 truncate">
                4-week cumulative: <strong>{climate.rainfall_4wk_mm} mm</strong>
              </div>
            </div>
          </div>

          {/* Vector Suitability / Humidity Indicator */}
          <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-sm flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-teal-light text-teal flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted font-medium">Climate Vector Index</div>
              <div className="text-base font-bold text-ink mt-1">
                {climate.humidity_note}
              </div>
              <div className="text-[11px] text-muted mt-1 truncate">
                Lagged 2–3 week climate driver
              </div>
            </div>
          </div>

          {/* Recent Cases (Simulated Surveillance) */}
          <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-sm flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-coral-light text-coral flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted font-medium">
                Surveillance Cases (Simulated)
              </div>
              <div className="text-2xl font-extrabold text-ink mt-0.5 tabular-nums">
                {climate.latest_cases} <span className="text-xs font-normal text-muted">latest week</span>
              </div>
              <div className="text-[11px] text-muted mt-1 truncate">
                Last 4 weeks: <strong>{climate.cases_4wk_total} cases</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. RECOMMENDED ACTIONS & VERIFIED LOCAL HEALTH FACILITY */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Recommended Actions for Citizens (col-span-7) */}
        <div className="lg:col-span-7 bg-white rounded-card-lg border border-borderline p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-borderline pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal" />
                <h2 className="text-base font-bold text-ink">
                  Recommended Preventive Actions ({riskCategory} Risk)
                </h2>
              </div>
              <span className="text-xs font-semibold text-muted">
                Citizen & Household Guidance
              </span>
            </div>

            <ul className="space-y-2.5">
              {(rec.citizen_actions || []).map((action: string, idx: number) => (
                <li
                  key={idx}
                  className="p-3.5 rounded-xl bg-canvas/70 border border-borderline flex items-start gap-3 text-xs sm:text-sm text-ink"
                >
                  <span className="w-6 h-6 rounded-full bg-teal text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {rec.public_health_guidance && (
            <div className="p-3.5 rounded-xl bg-teal-light/60 border border-teal/20 text-xs text-ink leading-relaxed mt-2">
              <strong>Public Health Guidance:</strong> {rec.public_health_guidance}
            </div>
          )}
        </div>

        {/* Local Health Facility & Helpline Card (col-span-5) */}
        <div className="lg:col-span-5 bg-white rounded-card-lg border border-borderline p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 border-b border-borderline pb-3">
              <Building2 className="w-5 h-5 text-purple" />
              <h2 className="text-base font-bold text-ink">
                Local Health Facility & Testing Guidance
              </h2>
            </div>

            {facility ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-purple-light/50 border border-purple/20">
                  <div className="text-[11px] font-bold uppercase text-purple">
                    {facility.type || "Block Health Facility"}
                  </div>
                  <div className="text-sm font-bold text-ink mt-0.5">
                    {facility.name}
                  </div>
                  {facility.phone && (
                    <div className="text-xs font-semibold text-ink mt-2 flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-purple" />
                      <span>Helpline / Contact: {facility.phone}</span>
                    </div>
                  )}
                </div>

                {facility.services && (
                  <div>
                    <div className="text-xs font-bold text-ink mb-1.5">
                      Available Malaria Services:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {facility.services.map((srv: string, i: number) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-canvas border border-borderline text-xs font-medium text-ink"
                        >
                          {srv}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">
                Contact your village Mitanin or nearest Primary Health Centre (Helpline 104) for free malaria RDT testing.
              </p>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-canvas border border-borderline text-xs text-muted leading-relaxed">
            <strong>When to seek immediate care:</strong> Fever with chills, sweating, headache, or body ache. Free Rapid Diagnostic Testing (RDT) is available through your village Mitanin and all government PHCs/CHCs.
          </div>
        </div>
      </section>

      {/* 5B. AUTHORITATIVE CHHATTISGARH LGD BLOCK DIRECTORY & GEOGRAPHY */}
      <LgdBlockMapCard
        selectedDistrictId={selectedLocation.district_id}
        selectedBlockId={selectedLocation.block_id}
      />

      {/* 6. TRAINED ML WEATHER & SYMPTOM DISEASE RISK PREDICTOR */}
      <WeatherDiseasePredictor
        defaultTemperatureC={climate.temperature_c || 29.5}
        defaultHumidityPct={74}
        locationBreadcrumb={locInfo.location_breadcrumb || selectedLocation.breadcrumb}
      />
    </div>
  );
}
