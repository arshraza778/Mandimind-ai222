import { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Info,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Thermometer,
  Wind,
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

interface WeatherDiseasePredictorProps {
  defaultTemperatureC?: number;
  defaultHumidityPct?: number;
  locationBreadcrumb?: string;
}

interface SymptomItem {
  key: string;
  label: string;
  isEmergencyFlag?: boolean;
}

const SYMPTOM_GROUPS: { groupTitle: string; items: SymptomItem[] }[] = [
  {
    groupTitle: "Fever & Systemic Symptoms",
    items: [
      { key: "high_fever", label: "High Fever" },
      { key: "fever", label: "Fever" },
      { key: "chills", label: "Chills" },
      { key: "shivering", label: "Shivering" },
      { key: "fatigue", label: "Fatigue" },
      { key: "weakness", label: "Weakness" },
      { key: "body_aches", label: "Body Aches" },
      { key: "dizziness", label: "Dizziness" },
      { key: "swollen_glands", label: "Swollen Glands" },
    ],
  },
  {
    groupTitle: "Head, Neurological, Eyes & ENT",
    items: [
      { key: "headache", label: "Headache" },
      { key: "severe_headache", label: "Severe Headache" },
      { key: "throbbing_headache", label: "Throbbing Headache" },
      { key: "sinus_headache", label: "Sinus Headache" },
      { key: "facial_pain", label: "Facial Pain" },
      { key: "pain_behind_the_eyes", label: "Pain Behind the Eyes" },
      { key: "pain_behind_eyes", label: "Retro-orbital Eye Pain" },
      { key: "trouble_seeing", label: "Trouble Seeing (Vision)", isEmergencyFlag: true },
      { key: "confusion", label: "Confusion / Altered State", isEmergencyFlag: true },
      { key: "runny_nose", label: "Runny Nose" },
      { key: "sneezing", label: "Sneezing" },
      { key: "sore_throat", label: "Sore Throat" },
      { key: "reduced_smell_and_taste", label: "Reduced Smell & Taste" },
    ],
  },
  {
    groupTitle: "Cardiorespiratory Symptoms (Red Flags Highlighted)",
    items: [
      { key: "chest_pain", label: "Chest Pain", isEmergencyFlag: true },
      { key: "shortness_of_breath", label: "Shortness of Breath", isEmergencyFlag: true },
      { key: "rapid_breathing", label: "Rapid Breathing", isEmergencyFlag: true },
      { key: "rapid_heart_rate", label: "Rapid Heart Rate", isEmergencyFlag: true },
      { key: "cough", label: "Cough" },
    ],
  },
  {
    groupTitle: "Gastrointestinal, Skin & Musculoskeletal",
    items: [
      { key: "nausea", label: "Nausea" },
      { key: "vomiting", label: "Vomiting" },
      { key: "abdominal_pain", label: "Abdominal Pain" },
      { key: "diarrhea", label: "Diarrhea" },
      { key: "rashes", label: "Skin Rashes" },
      { key: "skin_irritation", label: "Skin Irritation" },
      { key: "itchiness", label: "Itchiness" },
      { key: "joint_pain", label: "Joint Pain" },
      { key: "back_pain", label: "Back Pain" },
      { key: "knee_ache", label: "Knee Ache" },
    ],
  },
];

const MEDICAL_HISTORY_ITEMS: { key: string; label: string }[] = [
  { key: "high_blood_pressure", label: "High Blood Pressure" },
  { key: "diabetes", label: "Diabetes" },
  { key: "high_cholesterol", label: "High Cholesterol" },
  { key: "obesity", label: "Obesity" },
  { key: "asthma_history", label: "Asthma History" },
  { key: "asthma", label: "Active Asthma" },
  { key: "nasal_polyps", label: "Nasal Polyps" },
  { key: "hiv_aids", label: "Immunocompromised / HIV" },
];

const SAMPLE_PROFILES: {
  label: string;
  age: number;
  gender: number;
  temperature_c: number;
  humidity: number;
  wind_speed_kmh: number;
  symptoms: string[];
  medical_history: string[];
}[] = [
  {
    label: "Malaria-like Fever Profile",
    age: 34,
    gender: 1,
    temperature_c: 29.5,
    humidity: 0.78,
    wind_speed_kmh: 11.2,
    symptoms: ["high_fever", "chills", "shivering", "headache", "nausea", "vomiting", "fatigue"],
    medical_history: [],
  },
  {
    label: "Dengue-like Profile",
    age: 24,
    gender: 0,
    temperature_c: 32.4,
    humidity: 0.72,
    wind_speed_kmh: 9.5,
    symptoms: ["high_fever", "joint_pain", "pain_behind_eyes", "rashes", "severe_headache", "nausea"],
    medical_history: [],
  },
  {
    label: "Heat Stress / Emergency Profile",
    age: 61,
    gender: 1,
    temperature_c: 40.2,
    humidity: 0.58,
    wind_speed_kmh: 15.0,
    symptoms: ["high_fever", "dizziness", "nausea", "confusion", "rapid_heart_rate"],
    medical_history: ["high_blood_pressure"],
  },
  {
    label: "Cardiopulmonary Red-Flag Profile",
    age: 68,
    gender: 0,
    temperature_c: 14.5,
    humidity: 0.85,
    wind_speed_kmh: 7.5,
    symptoms: ["chest_pain", "shortness_of_breath", "dizziness"],
    medical_history: ["high_blood_pressure", "high_cholesterol", "diabetes"],
  },
];

const UI_COPY: Record<
  "en" | "hi" | "hne",
  {
    badge: string;
    title: string;
    subtitle: string;
    disclaimerBanner: string;
    predictBtn: string;
    predictingBtn: string;
    resetBtn: string;
    emergencyTitle: string;
  }
> = {
  en: {
    badge: "Trained Multiclass ML Classifier (50 Features · 11 Conditions)",
    title: "Weather & Symptom Disease Risk Predictor (Experimental Decision Support)",
    subtitle:
      "Enter age, gender, local ambient weather, medical history, and current symptoms to run live inference against the trained scikit-learn pipeline.",
    disclaimerBanner:
      "Medical Safety Notice: Model outputs are statistical pattern matches from `Weather-related disease prediction.csv` and are NOT a confirmed medical diagnosis.",
    predictBtn: "Run Trained Model Prediction",
    predictingBtn: "Running ML Pipeline...",
    resetBtn: "Clear Inputs",
    emergencyTitle: "URGENT MEDICAL CARE WARNING — Do Not Rely on Algorithmic Prediction",
  },
  hi: {
    badge: "प्रशिक्षित मशीन लर्निंग मॉडल (50 फ़ीचर · 11 स्वास्थ्य स्थितियाँ)",
    title: "मौसम और लक्षण आधारित रोग पूर्वानुमान (प्रयोगात्मक सहायता प्रणाली)",
    subtitle:
      "प्रशिक्षित मशीन लर्निंग पाइपलाइन से परिणाम प्राप्त करने के लिए आयु, लिंग, मौसम, स्वास्थ्य इतिहास और लक्षण चुनें।",
    disclaimerBanner:
      "चिकित्सा सुरक्षा सूचना: यह परिणाम केवल सांख्यिकीय अनुमान है, पक्की डॉक्टरी जाँच (निदान) नहीं है।",
    predictBtn: "मॉडल से अनुमान लगाएँ",
    predictingBtn: "मॉडल गणना कर रहा है...",
    resetBtn: "रीसेट करें",
    emergencyTitle: "आपातकालीन चिकित्सा चेतावनी — तुरंत 108 / नज़दीकी अस्पताल से संपर्क करें",
  },
  hne: {
    badge: "प्रशिक्षित मशीन लर्निंग मॉडल (50 फ़ीचर · 11 बीमारी श्रेणी)",
    title: "मौसम अउ लक्षण ले बीमारी अनुमान (प्रयोगात्मक मदद प्रणाली)",
    subtitle:
      "प्रशिक्षित मॉडल ले अनुमान देखे बर उमर, लिंग, मौसम, जुन्ना बीमारी अउ अभी के लक्षण ला चुनव।",
    disclaimerBanner:
      "डॉक्टरी सुरक्षा सूचना: ए हर सिरिफ आंकड़ा के अनुमान आय, पक्का डॉक्टरी जांच नो हे।",
    predictBtn: "मॉडल ले अनुमान देखव",
    predictingBtn: "मॉडल जांच करत हे...",
    resetBtn: "साफ करव",
    emergencyTitle: "तुरंत अस्पताल चेतावनी — ए अनुमान के भरोसा झन रहव, 108 म फोन करव",
  },
};

export function WeatherDiseasePredictor({
  defaultTemperatureC = 29.5,
  defaultHumidityPct = 74,
  locationBreadcrumb,
}: WeatherDiseasePredictorProps) {
  const { language } = useI18n();
  const copy = UI_COPY[language] || UI_COPY.en;

  const [modelStatus, setModelStatus] = useState<any | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);

  const [age, setAge] = useState<string>("34");
  const [gender, setGender] = useState<number>(1);
  const [temperatureC, setTemperatureC] = useState<string>(String(defaultTemperatureC || 29.5));
  const [humidityFraction, setHumidityFraction] = useState<string>(
    String(
      defaultHumidityPct > 1
        ? Number((defaultHumidityPct / 100).toFixed(2))
        : Number((defaultHumidityPct || 0.74).toFixed(2))
    )
  );
  const [windSpeedKmh, setWindSpeedKmh] = useState<string>("11.2");

  const [selectedSymptoms, setSelectedSymptoms] = useState<Record<string, boolean>>({
    high_fever: true,
    chills: true,
    shivering: true,
    headache: true,
    nausea: true,
    vomiting: true,
    fatigue: true,
  });
  const [selectedHistory, setSelectedHistory] = useState<Record<string, boolean>>({});
  const [symptomSearch, setSymptomSearch] = useState<string>("");

  const [predictionResult, setPredictionResult] = useState<any | null>(null);
  const [predicting, setPredicting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatusLoading(true);
    fetch("http://127.0.0.1:8000/predict/status")
      .then((res) => res.json())
      .then((json) => setModelStatus(json))
      .catch(() =>
        setModelStatus({
          model_loaded: false,
          status: "unreachable",
          message: "Unable to reach backend /predict/status endpoint.",
        })
      )
      .finally(() => setStatusLoading(false));
  }, []);

  const toggleSymptom = (key: string) => {
    setSelectedSymptoms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleHistory = (key: string) => {
    setSelectedHistory((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applySampleProfile = (profile: (typeof SAMPLE_PROFILES)[number]) => {
    setAge(String(profile.age));
    setGender(profile.gender);
    setTemperatureC(String(profile.temperature_c));
    setHumidityFraction(String(profile.humidity));
    setWindSpeedKmh(String(profile.wind_speed_kmh));

    const symMap: Record<string, boolean> = {};
    profile.symptoms.forEach((k) => {
      symMap[k] = true;
    });
    setSelectedSymptoms(symMap);

    const histMap: Record<string, boolean> = {};
    profile.medical_history.forEach((k) => {
      histMap[k] = true;
    });
    setSelectedHistory(histMap);
    setErrorMsg(null);
  };

  const handleReset = () => {
    setSelectedSymptoms({});
    setSelectedHistory({});
    setPredictionResult(null);
    setErrorMsg(null);
  };

  const handleRunPrediction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const ageNum = Number(age);
    const tempNum = Number(temperatureC);
    const humNum = Number(humidityFraction);
    const windNum = Number(windSpeedKmh);

    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 120) {
      setErrorMsg("Please enter a valid Age between 1 and 120 years.");
      return;
    }
    if (!Number.isFinite(tempNum) || tempNum < -30 || tempNum > 60) {
      setErrorMsg("Please enter a valid Temperature between -30°C and 60°C.");
      return;
    }
    if (!Number.isFinite(humNum) || humNum < 0 || humNum > 100) {
      setErrorMsg("Please enter a valid Humidity (0.0–1.0 fraction or 0–100%).");
      return;
    }
    if (!Number.isFinite(windNum) || windNum < 0 || windNum > 200) {
      setErrorMsg("Please enter a valid Wind Speed between 0 and 200 km/h.");
      return;
    }

    setPredicting(true);
    try {
      const symptomsPayload: Record<string, number> = {};
      Object.entries(selectedSymptoms).forEach(([k, v]) => {
        if (v) symptomsPayload[k] = 1;
      });

      const historyPayload: Record<string, number> = {};
      Object.entries(selectedHistory).forEach(([k, v]) => {
        if (v) historyPayload[k] = 1;
      });

      const response = await fetch("http://127.0.0.1:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: ageNum,
          gender,
          temperature_c: tempNum,
          humidity: humNum,
          wind_speed_kmh: windNum,
          symptoms: symptomsPayload,
          medical_history: historyPayload,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const detail =
          typeof errBody.detail === "string"
            ? errBody.detail
            : Array.isArray(errBody.detail)
            ? errBody.detail.map((d: any) => d.msg).join("; ")
            : "Prediction request failed validation.";
        throw new Error(detail);
      }

      const resultJson = await response.json();
      setPredictionResult(resultJson);
    } catch (err: any) {
      setErrorMsg(err.message || "Unable to compute prediction from backend API.");
    } finally {
      setPredicting(false);
    }
  };

  useEffect(() => {
    if (modelStatus?.model_loaded && !predictionResult && !predicting) {
      handleRunPrediction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelStatus?.model_loaded]);

  const activeSymptomCount = Object.values(selectedSymptoms).filter(Boolean).length;
  const activeHistoryCount = Object.values(selectedHistory).filter(Boolean).length;

  return (
    <section
      data-testid="weather-disease-predictor"
      className="bg-white rounded-card border border-borderline p-4 sm:p-6 shadow-2xs space-y-5"
    >
      {/* Header & Model Status Pill */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-borderline pb-4">
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-light text-purple text-[11px] font-bold">
              <Stethoscope className="w-3.5 h-3.5" />
              {copy.badge}
            </span>
            {statusLoading ? (
              <span className="text-xs text-muted">Checking model artifact status...</span>
            ) : modelStatus?.model_loaded ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-forest-light text-forest text-[11px] font-bold">
                <CheckCircle2 className="w-3 h-3" />
                {modelStatus.model_name} Ready · Test Macro-F1:{" "}
                {modelStatus.test_metrics?.macro_f1
                  ? `${(modelStatus.test_metrics.macro_f1 * 100).toFixed(1)}%`
                  : "Loaded"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-coral-light text-coral text-[11px] font-bold">
                <AlertTriangle className="w-3 h-3" />
                Model Artifact Unavailable
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-ink">{copy.title}</h2>
          <p className="text-xs text-muted">{copy.subtitle}</p>
        </div>

        {/* Sample Preset Buttons */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-[11px] font-bold text-muted mr-1">Test Profiles:</span>
          {SAMPLE_PROFILES.map((prof) => (
            <button
              key={prof.label}
              type="button"
              onClick={() => applySampleProfile(prof)}
              className="px-2.5 py-1.5 rounded-xl bg-canvas hover:bg-purple-light/60 border border-borderline text-[11px] font-semibold text-ink transition-colors cursor-pointer"
            >
              {prof.label}
            </button>
          ))}
        </div>
      </div>

      {/* Non-Diagnostic Medical Safety Notice */}
      <div className="p-3 rounded-xl bg-[#FEF3D6] border border-[#F0D99B] flex items-start gap-2.5 text-xs text-[#6B4204]">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#A8650A]" />
        <div>
          <strong>{copy.disclaimerBanner}</strong>{" "}
          {locationBreadcrumb && (
            <span>
              Current Dashboard Context: <strong>{locationBreadcrumb}</strong>.
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Left = Inputs Form, Right = Live Model Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: INPUT FORM (col-span-7) */}
        <form onSubmit={handleRunPrediction} className="lg:col-span-7 space-y-4">
          {/* 1. Demographics & Ambient Weather Inputs */}
          <div className="p-4 rounded-xl bg-canvas/70 border border-borderline space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-purple" />
                <span>1. Demographics & Local Weather Features</span>
              </h3>
              <span className="text-[11px] text-muted">5 Continuous / Encoded Predictors</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div>
                <label htmlFor="ml-age" className="block text-[11px] font-bold text-ink mb-1">
                  Age (Years)
                </label>
                <input
                  id="ml-age"
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
                />
              </div>

              <div>
                <label htmlFor="ml-gender" className="block text-[11px] font-bold text-ink mb-1">
                  Gender (Dataset Code)
                </label>
                <select
                  id="ml-gender"
                  value={gender}
                  onChange={(e) => setGender(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
                >
                  <option value={0}>0 — Female</option>
                  <option value={1}>1 — Male</option>
                </select>
              </div>

              <div>
                <label htmlFor="ml-temp" className="block text-[11px] font-bold text-ink mb-1">
                  Temp (°C)
                </label>
                <input
                  id="ml-temp"
                  type="number"
                  step="0.1"
                  min={-30}
                  max={60}
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
                />
              </div>

              <div>
                <label htmlFor="ml-humidity" className="block text-[11px] font-bold text-ink mb-1">
                  Humidity (0–1)
                </label>
                <input
                  id="ml-humidity"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={humidityFraction}
                  onChange={(e) => setHumidityFraction(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="ml-wind" className="block text-[11px] font-bold text-ink mb-1">
                  Wind (km/h)
                </label>
                <input
                  id="ml-wind"
                  type="number"
                  step="0.1"
                  min={0}
                  max={200}
                  value={windSpeedKmh}
                  onChange={(e) => setWindSpeedKmh(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-borderline text-xs font-semibold text-ink"
                />
              </div>
            </div>
          </div>

          {/* 2. Medical History / Comorbidities */}
          <div className="p-4 rounded-xl bg-canvas/70 border border-borderline space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-teal" />
                <span>2. Medical History & Risk Factors</span>
              </h3>
              <span className="text-[11px] font-semibold text-teal">
                {activeHistoryCount} selected
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MEDICAL_HISTORY_ITEMS.map((item) => {
                const active = !!selectedHistory[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleHistory(item.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? "bg-teal text-white border-teal shadow-2xs"
                        : "bg-white text-ink border-borderline hover:bg-teal-light/40"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Binary Symptom Checklists (37 Features) */}
          <div className="p-4 rounded-xl bg-canvas/70 border border-borderline space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-coral" />
                <span>3. Reported Clinical Symptoms ({activeSymptomCount} active)</span>
              </h3>
              <input
                type="text"
                value={symptomSearch}
                onChange={(e) => setSymptomSearch(e.target.value)}
                placeholder="Filter symptoms (e.g., fever, chest, eye)..."
                className="px-2.5 py-1 rounded-lg bg-white border border-borderline text-xs text-ink w-full sm:w-56"
              />
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {SYMPTOM_GROUPS.map((grp) => {
                const visibleItems = grp.items.filter(
                  (it) =>
                    !symptomSearch.trim() ||
                    it.label.toLowerCase().includes(symptomSearch.toLowerCase()) ||
                    it.key.toLowerCase().includes(symptomSearch.toLowerCase())
                );
                if (visibleItems.length === 0) return null;
                return (
                  <div key={grp.groupTitle} className="space-y-1.5">
                    <div className="text-[11px] font-bold text-muted">{grp.groupTitle}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleItems.map((sym) => {
                        const active = !!selectedSymptoms[sym.key];
                        return (
                          <button
                            key={sym.key}
                            type="button"
                            onClick={() => toggleSymptom(sym.key)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                              active
                                ? sym.isEmergencyFlag
                                  ? "bg-coral text-white border-coral shadow-2xs"
                                  : "bg-purple text-white border-purple shadow-2xs"
                                : sym.isEmergencyFlag
                                ? "bg-white text-coral border-coral/40 hover:bg-coral-light/40"
                                : "bg-white text-ink border-borderline hover:bg-purple-light/40"
                            }`}
                          >
                            {sym.isEmergencyFlag && <AlertTriangle className="w-3 h-3 shrink-0" />}
                            <span>{sym.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-coral-light border border-coral/40 text-xs font-semibold text-coral flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="submit"
              disabled={predicting || !modelStatus?.model_loaded}
              data-testid="run-ml-predict-btn"
              className="flex-1 py-2.5 px-4 rounded-xl bg-purple hover:bg-purple/90 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {predicting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{copy.predictingBtn}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{copy.predictBtn}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="py-2.5 px-3.5 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              {copy.resetBtn}
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN: PREDICTION RESULTS & EXPLAINABILITY (col-span-5) */}
        <div className="lg:col-span-5 space-y-3.5">
          {!predictionResult ? (
            <div className="p-6 rounded-card bg-canvas/60 border border-dashed border-borderline text-center space-y-2">
              <Stethoscope className="w-7 h-7 text-purple mx-auto" />
              <div className="text-sm font-bold text-ink">
                Select Weather & Symptom Inputs to Run Prediction
              </div>
              <p className="text-xs text-muted">
                The trained pipeline evaluates all 50 features and returns multiclass probability scores,
                matched indicators, and medical safety guidance.
              </p>
            </div>
          ) : (
            <>
              {/* URGENT EMERGENCY CARE WARNING BANNER (When Red Flags Triggered) */}
              {predictionResult.emergency_warning?.is_emergency && (
                <div
                  data-testid="emergency-urgent-warning"
                  className="p-4 rounded-xl bg-coral text-white space-y-2 shadow-sm"
                >
                  <div className="flex items-center gap-2 font-extrabold text-xs sm:text-sm uppercase tracking-wide">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>{copy.emergencyTitle}</span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-white/95">
                    {(predictionResult.emergency_warning.reasons || []).map(
                      (reason: string, idx: number) => (
                        <li key={idx}>{reason}</li>
                      )
                    )}
                  </ul>
                  <p className="text-xs font-bold bg-black/20 p-2.5 rounded-lg">
                    {predictionResult.emergency_warning.urgent_action}
                  </p>
                </div>
              )}

              {/* Primary Prediction Card */}
              <div className="p-4 sm:p-5 rounded-xl bg-purple-light/45 border-2 border-purple/35 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple block">
                      Top Predicted Condition (Experimental Model Output)
                    </span>
                    <h3
                      data-testid="predicted-disease-label"
                      className="text-2xl font-extrabold text-ink mt-0.5"
                    >
                      {predictionResult.predicted_disease}
                    </h3>
                    <div className="text-xs font-semibold text-muted">
                      {predictionResult.disease_category}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="px-3 py-1 rounded-full bg-purple text-white text-xs font-extrabold">
                      {predictionResult.model_score_pct}% Score
                    </div>
                    <div className="text-[10px] font-bold text-ink/75 mt-1">
                      {predictionResult.confidence_band}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-ink/85 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-borderline">
                  {predictionResult.uncertainty_note}
                </p>

                {/* Top-5 Class Probability Distribution */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold text-ink">
                    Top Candidate Class Scores (Calibrated Model Distribution):
                  </div>
                  {(predictionResult.top_predictions || []).map((item: any) => (
                    <div key={item.disease} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">{item.disease}</span>
                        <span className="font-mono font-bold text-purple">
                          {item.percentage}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white overflow-hidden border border-borderline">
                        <div
                          className="h-full bg-purple rounded-full transition-all"
                          style={{ width: `${Math.max(item.percentage, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inputs Explanation & Matched Training Indicators */}
              <div className="p-4 rounded-xl bg-canvas/80 border border-borderline space-y-2.5 text-xs">
                <div className="font-bold text-ink flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-purple" />
                  <span>Explanation of Inputs Used</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white border border-borderline">
                    <span className="text-muted block">Demographics</span>
                    <strong className="text-ink">
                      Age {predictionResult.explanation?.inputs_used?.age} · Gender{" "}
                      {predictionResult.explanation?.inputs_used?.gender_code === 1 ? "1 (M)" : "0 (F)"}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-borderline">
                    <span className="text-muted block">Temp & Humidity</span>
                    <strong className="text-ink">
                      {predictionResult.explanation?.inputs_used?.temperature_c}°C ·{" "}
                      {predictionResult.explanation?.inputs_used?.humidity_pct}%
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-borderline">
                    <span className="text-muted block">Wind & Flags</span>
                    <strong className="text-ink flex items-center gap-1">
                      <Wind className="w-3 h-3 text-teal" />
                      {predictionResult.explanation?.inputs_used?.wind_speed_kmh} km/h (
                      {predictionResult.explanation?.inputs_used?.total_active_flags} flags)
                    </strong>
                  </div>
                </div>

                {predictionResult.explanation?.matched_training_indicators?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-muted mb-1">
                      Key Active Features Matching {predictionResult.predicted_disease} Training Profile:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {predictionResult.explanation.matched_training_indicators.map((m: any) => (
                        <span
                          key={m.feature}
                          className="px-2 py-0.5 rounded-md bg-white border border-borderline text-[11px] font-semibold text-ink"
                        >
                          {m.feature.replace(/_/g, " ")} ({m.class_prevalence_pct}% in class)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actionable Non-Diagnostic Next Steps */}
              <div className="p-4 rounded-xl bg-teal-light/50 border border-teal/30 space-y-2 text-xs">
                <div className="font-bold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
                  <span>Recommended Next Steps (Non-Diagnostic Guidance)</span>
                </div>
                <ul className="space-y-1.5">
                  {(predictionResult.recommended_next_steps || []).map(
                    (step: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-ink/90 leading-relaxed">
                        <span className="font-bold text-teal">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>

              {/* Medical Disclaimer & Limitations Footer */}
              <div className="p-3 rounded-xl bg-canvas border border-borderline text-[11px] text-muted space-y-1">
                <div>
                  <strong>Disclaimer:</strong> {predictionResult.medical_disclaimer}
                </div>
                <div>
                  <strong>Model Info:</strong> {predictionResult.model_metadata?.model_name} (
                  {predictionResult.model_metadata?.model_version}) · Untouched Test Accuracy:{" "}
                  {predictionResult.model_metadata?.test_accuracy
                    ? `${(predictionResult.model_metadata.test_accuracy * 100).toFixed(1)}%`
                    : "N/A"}{" "}
                  · Test Macro-F1:{" "}
                  {predictionResult.model_metadata?.test_macro_f1
                    ? `${(predictionResult.model_metadata.test_macro_f1 * 100).toFixed(1)}%`
                    : "N/A"}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
