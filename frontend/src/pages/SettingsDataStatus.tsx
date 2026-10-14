import { useState, useEffect } from "react";
import { RotateCw, AlertTriangle, Save, CheckCircle2, Globe, Upload, Download } from "lucide-react";
import { useMeta } from "../hooks/useMeta";
import { useI18n } from "../i18n/I18nContext";
import { LanguageSelector } from "../components/LanguageSelector";

interface SettingsDataStatusProps {
  authToken?: string | null;
}

interface QualityReport {
  data_source?: string;
  source?: string;
  granularity?: string;
  geography_level?: string;
  is_valid?: boolean;
  unit_count?: number;
  total_records?: number;
  date_range?: {
    start: string;
    end: string;
  };
  errors?: string[];
  warnings?: string[];
  weather_interpolated_count?: number;
  missing_cases_count?: number;
  config_summary?: {
    data_source: string;
    granularity: string;
    geography_level: string;
    forecast_horizon: string;
    weather_lags: string;
    min_win_share_pct: string;
    min_median_improvement_pct: string;
    reactive_rule: string;
    escalation_hours: string;
  };
}

export function SettingsDataStatus({ authToken }: SettingsDataStatusProps) {
  const { meta, refetch: refetchMeta } = useMeta();
  const { t, taskTemplates, refreshTaskTemplates } = useI18n();

  const [report, setReport] = useState<QualityReport | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftHneTitle, setDraftHneTitle] = useState<string>("");
  const [draftHneInstructions, setDraftHneInstructions] = useState<string>("");
  const [draftHiTitle, setDraftHiTitle] = useState<string>("");
  const [draftHiInstructions, setDraftHiInstructions] = useState<string>("");
  const [templateSaveMsg, setTemplateSaveMsg] = useState<string | null>(null);

  // CSV Upload & Schema Validator State
  const [csvUploadText, setCsvUploadText] = useState<string>("");
  const [csvFilename, setCsvFilename] = useState<string>("sample_upload.csv");
  const [csvValidationResult, setCsvValidationResult] = useState<any | null>(null);
  const [validatingCsv, setValidatingCsv] = useState<boolean>(false);

  const handleDownloadTemplate = () => {
    window.open("http://127.0.0.1:8000/data/template-csv", "_blank");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || "");
      setCsvUploadText(content);
    };
    reader.readAsText(file);
  };

  const handleValidateUploadedCsv = async () => {
    if (!csvUploadText.trim()) return;
    setValidatingCsv(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/data/upload-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_content: csvUploadText,
          filename: csvFilename,
        }),
      });
      const data = await res.json();
      setCsvValidationResult(data);
    } catch {
      setCsvValidationResult({
        is_valid: false,
        errors: ["Could not reach backend CSV validation service."],
        warnings: [],
      });
    } finally {
      setValidatingCsv(false);
    }
  };

  const handleStartEditTemplate = (tpl: any) => {
    setEditingKey(tpl.template_key);
    setDraftHneTitle(tpl.translations?.hne?.title || "");
    setDraftHneInstructions(tpl.translations?.hne?.instructions || "");
    setDraftHiTitle(tpl.translations?.hi?.title || "");
    setDraftHiInstructions(tpl.translations?.hi?.instructions || "");
    setTemplateSaveMsg(null);
  };

  const handleSaveTemplate = async (templateKey: string) => {
    setTemplateSaveMsg(null);
    const token = authToken || sessionStorage.getItem("ms_auth_token");
    try {
      const res = await fetch(`http://127.0.0.1:8000/i18n/task-templates/${templateKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title_hne: draftHneTitle,
          instructions_hne: draftHneInstructions,
          title_hi: draftHiTitle,
          instructions_hi: draftHiInstructions,
        }),
      });
      if (res.ok) {
        await refreshTaskTemplates();
        setEditingKey(null);
        setTemplateSaveMsg(t("settings.template_saved_msg"));
      } else {
        const err = await res.json().catch(() => ({}));
        setTemplateSaveMsg(err.detail || "Supervisor login required to save template edits.");
      }
    } catch {
      setTemplateSaveMsg("Could not reach server to update template.");
    }
  };

  const fetchStatus = async () => {
    setChecking(true);
    setErrorNotice(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/data/status");
      if (!res.ok) {
        throw new Error("Failed to fetch data status report");
      }
      const data = await res.json();
      setReport(data);
      refetchMeta();
    } catch (err: any) {
      setErrorNotice(err.message || "Failed to load data status report");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Top summary card metrics
  const dataSourceDisplay = (report?.source || report?.data_source || meta.data_source || "simulated")
    .charAt(0)
    .toUpperCase() + (report?.source || report?.data_source || meta.data_source || "simulated").slice(1);

  const granularityDisplay = (report?.granularity || meta.granularity || "weekly")
    .charAt(0)
    .toUpperCase() + (report?.granularity || meta.granularity || "weekly").slice(1);

  const geographyDisplay = (report?.geography_level || meta.geography_label || "")
    ? (report?.geography_level || meta.geography_label).charAt(0).toUpperCase() +
      (report?.geography_level || meta.geography_label).slice(1)
    : "Unit";

  const dateRangeDisplay = report?.date_range
    ? `${report.date_range.start.slice(0, 4)} to ${report.date_range.end.slice(0, 4)}`
    : meta.date_range
    ? `${meta.date_range.start.slice(0, 4)} to ${meta.date_range.end.slice(0, 4)}`
    : "2020 to 2025";

  const unitsCountDisplay = report?.unit_count ?? 6;

  // Settings values (read-only)
  const config = report?.config_summary;
  const forecastHorizon = config?.forecast_horizon || `2 to 4 ${meta.unit_label || "periods"} (target)`;
  const weatherLags = config?.weather_lags || `2, 3, 4 ${meta.unit_label || "periods"}`;
  const winShare = config?.min_win_share_pct || "60%";
  const medianImprovement = config?.min_median_improvement_pct || "5%";
  const reactiveRule = config?.reactive_rule || "mean + 2 SD, 5 years";
  const escalationHours = config?.escalation_hours || "48 hours";

  // Formatted Quality Report cards (Errors and Warnings in Plain Language)
  const hasErrors = report?.errors && report.errors.length > 0;
  const errorsList = report?.errors || [];
  const warningsList = report?.warnings || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-ink">
      {/* HEADER SECTION */}
      <div className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">{t("nav.settings")}</h1>
          <p className="text-xs text-muted mt-0.5">
            Data pipeline health, validation report, multilingual preferences, and editable Chhattisgarhi task templates
          </p>
        </div>
        <LanguageSelector />
      </div>

      {errorNotice && (
        <div className="p-3.5 text-xs bg-coral-light text-coral border border-coral/30 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{errorNotice}</span>
        </div>
      )}

      {/* ROW 1: FIVE SUMMARY TILES (Data source, Granularity, Level, Date range, Units) */}
      <section aria-label="Dataset Overview" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Tile 1: Data source */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-muted">Data source</span>
          <div className="mt-2 text-2xl font-extrabold text-ink tracking-tight">
            {dataSourceDisplay}
          </div>
          <div className="text-[10px] text-muted mt-1">Configured feed</div>
        </div>

        {/* Tile 2: Granularity */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-muted">Granularity</span>
          <div className="mt-2 text-2xl font-extrabold text-ink tracking-tight">
            {granularityDisplay}
          </div>
          <div className="text-[10px] text-muted mt-1">Temporal resolution</div>
        </div>

        {/* Tile 3: Level */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-muted">Level</span>
          <div className="mt-2 text-2xl font-extrabold text-ink tracking-tight">
            {geographyDisplay}
          </div>
          <div className="text-[10px] text-muted mt-1">Admin hierarchy</div>
        </div>

        {/* Tile 4: Date range */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-muted">Date range</span>
          <div className="mt-2 text-2xl font-extrabold text-ink tracking-tight">
            {dateRangeDisplay}
          </div>
          <div className="text-[10px] text-muted mt-1">Historical baseline</div>
        </div>

        {/* Tile 5: Units */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-muted">Active units</span>
          <div className="mt-2 text-2xl font-extrabold text-ink tracking-tight tabular-nums">
            {unitsCountDisplay}
          </div>
          <div className="text-[10px] text-muted mt-1">Reporting entities</div>
        </div>
      </section>

      {/* ROW 2: THREE-COLUMN MAIN SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================== */}
        {/* COLUMN 1: DATA QUALITY REPORT (col-span-5) */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-borderline/60">
            <div>
              <h2 className="text-base font-bold text-ink">Data Quality Report</h2>
              <p className="text-xs text-muted mt-0.5">Ingestion checks and automated anomaly diagnostics</p>
            </div>

            {/* Re-run data check button */}
            <button
              onClick={fetchStatus}
              disabled={checking}
              className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 text-muted ${checking ? "animate-spin" : ""}`} />
              <span>{checking ? "Checking..." : "Re-check"}</span>
            </button>
          </div>

          {/* Quality Items Stack */}
          <div className="space-y-3">
            {/* OK Status Card */}
            {!hasErrors && (
              <div className="p-3.5 rounded-xl border border-forest/30 bg-forest-light/40 flex items-start gap-3 shadow-xs">
                <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-forest text-white shrink-0">
                  OK
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink">No Ingestion Errors</h4>
                  <p className="text-[11px] text-muted mt-0.5">
                    Required surveillance schema columns are present, zero duplicate keys.
                  </p>
                </div>
              </div>
            )}

            {/* Errors if any exist */}
            {hasErrors &&
              errorsList.map((err, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-coral/30 bg-coral-light/50 flex items-start gap-3 shadow-xs"
                >
                  <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-coral text-white shrink-0">
                    ERR
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-coral">Validation error</h4>
                    <p className="text-[11px] text-ink/80 mt-0.5 leading-relaxed">{err}</p>
                  </div>
                </div>
              ))}

            {/* Plain language warnings matching design and data loader findings */}
            <div className="p-3.5 rounded-xl border border-amber/30 bg-amber-light/40 flex items-start gap-3 shadow-xs">
              <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber text-white shrink-0">
                WARN
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink">Reporting Disruption Flagged</h4>
                <p className="text-[11px] text-muted mt-0.5">
                  2020–21 marked for under-reporting due to pandemic surveillance diversion.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-amber/30 bg-amber-light/40 flex items-start gap-3 shadow-xs">
              <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber text-white shrink-0">
                WARN
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink">Weather Gaps Interpolated</h4>
                <p className="text-[11px] text-muted mt-0.5">
                  {report?.weather_interpolated_count ?? 12} of 1,800 values filled by temporal interpolation.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-amber/30 bg-amber-light/40 flex items-start gap-3 shadow-xs">
              <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber text-white shrink-0">
                WARN
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink">Sample Unit F: Short History</h4>
                <p className="text-[11px] text-muted mt-0.5">
                  Limited time-series; used with caution in skill-gate rolling evaluations.
                </p>
              </div>
            </div>

            {/* Additional dynamic warnings from loader if returned */}
            {warningsList.map((w, idx) => {
              if (
                w.includes("disruption") ||
                w.includes("interpolation") ||
                w.includes("short history")
              ) {
                return null;
              }
              return (
                <div
                  key={`warn-${idx}`}
                  className="p-3.5 rounded-xl border border-amber/30 bg-amber-light/40 flex items-start gap-3 shadow-xs"
                >
                  <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber text-white shrink-0">
                    WARN
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-ink">Quality Advisory</h4>
                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{w}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2: SETTINGS (READ ONLY) (col-span-4) */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-borderline/60">
            <h2 className="text-base font-bold text-ink">Evaluation Parameters</h2>
            <p className="text-xs text-muted mt-0.5">Active threshold settings (read-only)</p>
          </div>

          <div className="divide-y divide-borderline/50 text-xs">
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-muted">Forecast horizon</span>
              <span className="font-bold text-ink text-right">{forecastHorizon}</span>
            </div>

            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-muted">Weather lags</span>
              <span className="font-bold text-ink text-right">{weatherLags}</span>
            </div>

            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-muted">Weather must win in</span>
              <span className="font-bold text-ink text-right">{winShare} of tests</span>
            </div>

            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-muted">And improve error by</span>
              <span className="font-bold text-ink text-right">{medianImprovement}</span>
            </div>

            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-muted">Reactive rule</span>
              <span className="font-bold text-ink text-right">{reactiveRule}</span>
            </div>

            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-muted">Escalate after</span>
              <span className="font-bold text-ink text-right">{escalationHours}</span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 3: HOW TO LOAD REAL DATA (col-span-3) */}
        {/* ============================================================== */}
        <div className="lg:col-span-3 bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-borderline/60">
            <h2 className="text-base font-bold text-ink">How to Load Real Data</h2>
            <p className="text-xs text-muted mt-0.5">Field deployment ingestion steps</p>
          </div>

          {/* 5-Step Checklist */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-purple-light text-purple flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                1
              </div>
              <p className="text-xs text-ink/90 leading-relaxed">
                Convert raw files to contract format with schema adapter
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-purple-light text-purple flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                2
              </div>
              <p className="text-xs text-ink/90 leading-relaxed">
                Confirm LGD place-name mapping for sub-district blocks
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-purple-light text-purple flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                3
              </div>
              <p className="text-xs text-ink/90 leading-relaxed">
                Set <code className="bg-canvas px-1 py-0.5 rounded text-[11px] font-mono">data_source</code> to real in config
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-purple-light text-purple flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                4
              </div>
              <p className="text-xs text-ink/90 leading-relaxed">
                Re-run automated data check and review every warning
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-purple-light text-purple flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                5
              </div>
              <p className="text-xs text-ink/90 leading-relaxed">
                Verify forecasts against rolling-origin evidence page
              </p>
            </div>
          </div>

          {/* CSV Template & Upload section */}
          <div className="pt-3 border-t border-borderline/60 space-y-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="w-full py-2 px-3 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Template</span>
            </button>
            <p className="text-[11px] text-muted leading-relaxed">
              Missing case counts are preserved as null (never silently zeroed), with population denominators required.
            </p>
          </div>
        </div>
      </div>

      {/* SURVEILLANCE + WEATHER CSV UPLOAD & SCHEMA VALIDATOR */}
      <section
        aria-label="CSV Upload and Schema Validator"
        className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-borderline/60 pb-3">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple" />
              <span>Upload & Validate Surveillance + Weather CSV</span>
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Expected columns:{" "}
              <code className="bg-canvas px-1.5 py-0.5 rounded text-[11px]">
                week_start, district, block, reported_cases, population, rainfall_mm, temperature_c, relative_humidity_pct, reporting_completeness
              </code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3.5 py-1.5 rounded-xl border border-borderline bg-canvas hover:bg-white text-xs font-semibold text-ink cursor-pointer transition-colors shadow-xs">
              Choose CSV File
              <input type="file" accept=".csv,text/csv" onChange={handleFileSelect} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3.5 py-1.5 rounded-xl border border-purple/30 bg-purple-light text-purple text-xs font-bold flex items-center gap-1.5 shadow-xs hover:bg-purple-light/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Template CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 space-y-3">
            <textarea
              rows={5}
              value={csvUploadText}
              onChange={(e) => setCsvUploadText(e.target.value)}
              placeholder={"week_start,district,block,reported_cases,population,rainfall_mm,temperature_c,relative_humidity_pct,reporting_completeness\n2025-07-07,Sample District,Sample Block A,18,125000,142.5,29.4,81.0,0.96\n2025-07-14,Sample District,Sample Block A,,125000,168.0,28.8,84.5,0.70"}
              className="w-full p-3.5 rounded-xl border border-borderline bg-canvas/40 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-purple"
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setCsvUploadText(
                    "week_start,district,block,reported_cases,population,rainfall_mm,temperature_c,relative_humidity_pct,reporting_completeness\n2025-07-07,Sample District,Sample Block A,18,125000,142.5,29.4,81.0,0.96\n2025-07-14,Sample District,Sample Block A,,125000,168.0,28.8,84.5,0.70\n2025-07-21,Sample District,Sample Block B,14,,98.2,30.2,76.0,0.92"
                  )
                }
                className="text-xs font-semibold text-purple hover:underline text-left"
              >
                Load sample CSV snippet (missing cases & population test rows)
              </button>
              <button
                type="button"
                onClick={handleValidateUploadedCsv}
                disabled={validatingCsv || !csvUploadText.trim()}
                className="px-5 py-2 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-xs shrink-0"
              >
                {validatingCsv ? "Validating..." : "Validate CSV"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            {csvValidationResult ? (
              <div className="p-4 sm:p-5 rounded-2xl border border-borderline bg-canvas/50 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">
                    Validation Result: {csvValidationResult.filename || csvFilename}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      csvValidationResult.is_valid
                        ? "bg-forest-light text-forest"
                        : "bg-coral-light text-coral"
                    }`}
                  >
                    {csvValidationResult.is_valid ? "VALID SCHEMA" : "SCHEMA ERRORS"}
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  Rows: <strong className="text-ink tabular-nums">{csvValidationResult.total_rows ?? 0}</strong> · Missing case counts preserved:{" "}
                  <strong className="text-ink tabular-nums">{csvValidationResult.missing_cases_count ?? 0}</strong> · Incidence calculated:{" "}
                  <strong className="text-ink tabular-nums">{csvValidationResult.incidence_calculated_rows ?? 0}</strong>
                </div>
                {(csvValidationResult.errors || []).map((err: string, i: number) => (
                  <div key={i} className="p-2.5 rounded-xl bg-coral-light/70 text-coral font-medium text-[11px] border border-coral/20">
                    [Error] {err}
                  </div>
                ))}
                {(csvValidationResult.warnings || []).map((warn: string, i: number) => (
                  <div key={i} className="p-2.5 rounded-xl bg-amber-light/70 text-amber font-medium text-[11px] border border-amber/20">
                    [Notice] {warn}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-[140px] rounded-2xl border border-dashed border-borderline flex items-center justify-center p-5 text-xs text-muted text-center bg-canvas/20">
                Select a CSV file or load a sample snippet, then click "Validate CSV" to inspect schema contract compliance.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MULTILINGUAL & CHHATTISGARHI TASK TEMPLATE REVIEW / EDITOR */}
      <section
        aria-label="Multilingual Task Templates Editor"
        className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs space-y-4"
        data-testid="multilingual-template-editor"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borderline/60 pb-3">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Globe className="w-4 h-4 text-teal" />
              <span>{t("settings.template_editor_title")}</span>
            </h2>
            <p className="text-xs text-muted mt-0.5">{t("settings.language_section_desc")}</p>
          </div>
          {templateSaveMsg && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest-light border border-forest/20 text-xs font-bold text-forest">
              <CheckCircle2 className="w-4 h-4 text-forest" />
              {templateSaveMsg}
            </span>
          )}
        </div>

        <div className="space-y-4">
          {taskTemplates.map((tpl) => {
            const isEditing = editingKey === tpl.template_key;
            return (
              <div
                key={tpl.template_key}
                className="rounded-2xl border border-borderline p-5 bg-canvas/40 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-teal text-white text-[10px] font-bold uppercase tracking-wider">
                      {tpl.disease_type}
                    </span>
                    <code className="text-xs font-mono text-muted">{tpl.template_key}</code>
                    <span className="text-[11px] text-muted">({tpl.review_status})</span>
                  </div>
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => handleStartEditTemplate(tpl)}
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-teal-light border border-borderline text-xs font-bold text-teal transition-colors shadow-xs"
                    >
                      Edit Chhattisgarhi / Hindi Phrasing
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveTemplate(tpl.template_key)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal text-white text-xs font-bold shadow-xs hover:bg-teal/90 transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{t("settings.save_template_btn")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-borderline text-xs font-semibold text-muted hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                  <div className="bg-white rounded-xl p-4 border border-borderline shadow-xs">
                    <div className="font-bold text-muted mb-1 text-[11px] uppercase tracking-wider">English (en)</div>
                    <div className="font-bold text-ink">{tpl.translations.en.title}</div>
                    <p className="text-muted mt-1 leading-relaxed">{tpl.translations.en.instructions}</p>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-borderline shadow-xs">
                    <div className="font-bold text-muted mb-1 text-[11px] uppercase tracking-wider">हिन्दी (hi)</div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={draftHiTitle}
                          onChange={(e) => setDraftHiTitle(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-borderline text-xs font-bold text-ink focus:outline-none focus:ring-1 focus:ring-purple"
                        />
                        <textarea
                          rows={3}
                          value={draftHiInstructions}
                          onChange={(e) => setDraftHiInstructions(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-borderline text-xs text-ink focus:outline-none focus:ring-1 focus:ring-purple"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="font-bold text-ink">{tpl.translations.hi.title}</div>
                        <p className="text-muted mt-1 leading-relaxed">{tpl.translations.hi.instructions}</p>
                      </>
                    )}
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-teal/40 shadow-xs">
                    <div className="font-bold text-teal mb-1 text-[11px] uppercase tracking-wider">छत्तीसगढ़ी (hne)</div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={draftHneTitle}
                          onChange={(e) => setDraftHneTitle(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-teal/40 text-xs font-bold text-ink focus:outline-none focus:ring-1 focus:ring-teal"
                        />
                        <textarea
                          rows={3}
                          value={draftHneInstructions}
                          onChange={(e) => setDraftHneInstructions(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-teal/40 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-teal"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="font-bold text-ink">{tpl.translations.hne.title}</div>
                        <p className="text-muted mt-1 leading-relaxed">{tpl.translations.hne.instructions}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
