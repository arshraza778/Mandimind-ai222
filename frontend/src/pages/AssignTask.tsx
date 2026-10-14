import { useState, useEffect, useMemo } from "react";
import { Check, ArrowLeft, Send, AlertTriangle, Calendar, Clock, ChevronRight } from "lucide-react";
import { useMeta } from "../hooks/useMeta";

interface AssignTaskProps {
  initialAlertId?: number;
  onNavigateBack?: () => void;
  onTaskCreated?: () => void;
  onNavigateToLedger?: () => void;
}

interface AlertData {
  id: number;
  unit_id: string;
  unit_name?: string;
  risk: string;
  confidence: number;
  confidence_label?: string;
  forecast_period: string;
  method_used: string;
}

interface MitaninUser {
  id: number;
  name: string;
  role: string;
  unit_id: string;
  open_tasks?: number;
  availability?: string;
}

const TASK_TEMPLATES = [
  {
    id: "fever_testing",
    label: "Fever testing",
    titlePrefix: "Fever screening and rapid diagnostic testing sweep",
    defaultInstruction: "Please visit 10 homes in {villages} and test fevers by {deadline}.",
    previewAction: "Fever cases may rise in your area.",
    steps: [
      "Fever screening and rapid diagnostic test (RDT) sweep across selected hamlets.",
      "Check body temperature and record fever histories in daily register.",
      "Dispense ACT blister packs immediately to test-positive cases.",
    ],
  },
  {
    id: "spraying_support",
    label: "Spraying support",
    titlePrefix: "Indoor residual spraying (IRS) mobilisation and verification",
    defaultInstruction: "Please guide spraying teams across {villages} and check room coverage by {deadline}.",
    previewAction: "Spraying teams are visiting your village.",
    steps: [
      "Mobilize households to keep rooms cleared for chemical spraying.",
      "Inspect chemical wall deposit and mark coverage cards.",
      "Record households declining or unavailable during spraying.",
    ],
  },
  {
    id: "screening",
    label: "Screening",
    titlePrefix: "High-risk community screening and net verification",
    defaultInstruction: "Please verify bed net usage and screen vulnerable households in {villages} by {deadline}.",
    previewAction: "High transmission risk detected in your hamlet.",
    steps: [
      "Verify Long-Lasting Insecticidal Net (LLIN) condition in all dwellings.",
      "Target pregnant women and infants for preventive screening.",
      "Refer acute symptomatic individuals to the primary health centre.",
    ],
  },
];

export function AssignTask({
  initialAlertId,
  onNavigateBack,
  onTaskCreated,
  onNavigateToLedger,
}: AssignTaskProps) {
  const { meta } = useMeta();

  // 3-step Stepper: 1 = Alert, 2 = Task, 3 = Review
  const [currentStep, setCurrentStep] = useState<number>(2);

  // Available alerts and selected alert
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertData | null>(null);

  // Mitanin frontline workers
  const [mitanins, setMitanins] = useState<MitaninUser[]>([]);
  const [selectedMitaninId, setSelectedMitaninId] = useState<number | null>(null);

  // Form Fields
  const [selectedTemplate, setSelectedTemplate] = useState<string>("fever_testing");
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [selectedVillages, setSelectedVillages] = useState<string[]>([
    "Sample Village A",
    "Sample Village B",
    "Sample Village C",
  ]);
  const [deadlineDate, setDeadlineDate] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Available village list
  const availableVillages = useMemo(
    () => [
      "Sample Village A",
      "Sample Village B",
      "Sample Village C",
      "Sample Village D",
      "Sample Village E",
    ],
    []
  );

  // Default deadline to Friday / next 5 days
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setDeadlineDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // Fetch alerts for step 1 & prefill
  useEffect(() => {
    fetch("http://127.0.0.1:8000/alerts")
      .then((res) => res.json())
      .then((data: AlertData[]) => {
        setAlerts(data);
        if (data.length > 0) {
          const matched = initialAlertId
            ? data.find((a) => a.id === initialAlertId) || data[0]
            : data[0];
          setSelectedAlert(matched);
        }
      })
      .catch(() => {});
  }, [initialAlertId]);

  // Fetch Mitanins
  useEffect(() => {
    fetch("http://127.0.0.1:8000/users?role=mitanin")
      .then((res) => res.json())
      .then((data: MitaninUser[]) => {
        if (data.length > 0) {
          setMitanins(data);
          setSelectedMitaninId(data[0].id);
        } else {
          const fallbackUsers: MitaninUser[] = [
            { id: 1, name: "Mitanin Asha (sample)", role: "mitanin", unit_id: "BLK_A", open_tasks: 1, availability: "Available" },
            { id: 2, name: "Mitanin Rekha (sample)", role: "mitanin", unit_id: "BLK_A", open_tasks: 3, availability: "Busy this week" },
            { id: 3, name: "Mitanin Sunita (sample)", role: "mitanin", unit_id: "BLK_A", open_tasks: 0, availability: "Available" },
          ];
          setMitanins(fallbackUsers);
          setSelectedMitaninId(fallbackUsers[0].id);
        }
      })
      .catch(() => {
        const fallbackUsers: MitaninUser[] = [
          { id: 1, name: "Mitanin Asha (sample)", role: "mitanin", unit_id: "BLK_A", open_tasks: 1, availability: "Available" },
          { id: 2, name: "Mitanin Rekha (sample)", role: "mitanin", unit_id: "BLK_A", open_tasks: 3, availability: "Busy this week" },
          { id: 3, name: "Mitanin Sunita (sample)", role: "mitanin", unit_id: "BLK_A", open_tasks: 0, availability: "Available" },
        ];
        setMitanins(fallbackUsers);
        setSelectedMitaninId(fallbackUsers[0].id);
      });
  }, []);

  // Sync title when alert or template changes
  useEffect(() => {
    const tmpl = TASK_TEMPLATES.find((t) => t.id === selectedTemplate);
    const geoLabelCap = meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit";
    const unitLabel = selectedAlert?.unit_name || (selectedAlert ? `${geoLabelCap} ${selectedAlert.unit_id}` : `Sample ${geoLabelCap} A`);
    if (tmpl) {
      setTaskTitle(`${tmpl.titlePrefix} - ${unitLabel}`);
    }
  }, [selectedTemplate, selectedAlert, meta.geography_label]);

  // Village chip toggle
  const toggleVillage = (v: string) => {
    if (selectedVillages.includes(v)) {
      if (selectedVillages.length > 1) {
        setSelectedVillages(selectedVillages.filter((item) => item !== v));
      }
    } else {
      setSelectedVillages([...selectedVillages, v]);
    }
  };

  // Selected Mitanin entity
  const currentMitanin = useMemo(() => {
    return mitanins.find((m) => m.id === selectedMitaninId) || mitanins[0];
  }, [mitanins, selectedMitaninId]);

  // Deadline display string
  const formattedDeadlineDisplay = useMemo(() => {
    if (!deadlineDate) return "Friday, 16 Oct";
    try {
      const parts = deadlineDate.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
      }
    } catch {
      // Fallback
    }
    return deadlineDate;
  }, [deadlineDate]);

  const deadlineDayName = useMemo(() => {
    if (!deadlineDate) return "Friday";
    try {
      const parts = deadlineDate.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString("en-US", { weekday: "long" });
      }
    } catch {
      // Fallback
    }
    return "Friday";
  }, [deadlineDate]);

  // Villages summary text for live preview
  const villagesSummaryText = useMemo(() => {
    if (selectedVillages.length === 0) return "your village";
    if (selectedVillages.length === 1) return selectedVillages[0];
    if (
      selectedVillages.length === 3 &&
      selectedVillages.includes("Sample Village A") &&
      selectedVillages.includes("Sample Village B") &&
      selectedVillages.includes("Sample Village C")
    ) {
      return "Sample Village A to C";
    }
    return selectedVillages.join(", ");
  }, [selectedVillages]);

  // Active template object
  const activeTemplateObj = useMemo(() => {
    return TASK_TEMPLATES.find((t) => t.id === selectedTemplate) || TASK_TEMPLATES[0];
  }, [selectedTemplate]);

  // Escalation window hours from config (via useMeta)
  const escalationHours = meta.escalation_hours || 48;

  // Submit Handler
  const handleSubmitTask = async () => {
    if (!taskTitle.trim()) {
      setFormError("Task title is required.");
      return;
    }
    if (!currentMitanin) {
      setFormError("Please select a Mitanin health worker.");
      return;
    }
    if (selectedVillages.length === 0) {
      setFormError("Please select at least one village.");
      return;
    }
    if (!deadlineDate) {
      setFormError("Please specify a deadline date.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const deadlineIso = new Date(`${deadlineDate}T18:00:00Z`).toISOString();
      const payload = {
        alert_id: selectedAlert?.id || 1,
        title: taskTitle,
        steps: [
          ...activeTemplateObj.steps,
          `Cover priority target villages: ${selectedVillages.join(", ")}.`,
        ],
        owner: currentMitanin.name,
        deadline: deadlineIso,
      };

      const res = await fetch("http://127.0.0.1:8000/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create task");
      }

      // Successful task creation
      if (onTaskCreated) onTaskCreated();

      // Navigate to task ledger
      if (onNavigateToLedger) {
        onNavigateToLedger();
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to create task");
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-ink">
      {/* 3-STEP STEPPER BAR */}
      <div className="bg-white rounded-card-lg border border-borderline p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          {/* Step 1: Alert */}
          <button
            onClick={() => setCurrentStep(1)}
            className="flex items-center gap-2.5 group transition-all text-left"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                currentStep === 1
                  ? "bg-purple text-white ring-4 ring-purple-light shadow-xs"
                  : currentStep > 1
                  ? "bg-forest text-white"
                  : "bg-canvas text-muted border border-borderline"
              }`}
            >
              {currentStep > 1 ? <Check className="w-4 h-4" /> : "1"}
            </div>
            <div>
              <span className="text-[10px] font-semibold text-muted block uppercase tracking-wider">Step 1</span>
              <span
                className={`text-xs font-bold ${
                  currentStep === 1 ? "text-purple" : "text-ink group-hover:text-purple"
                }`}
              >
                Alert
              </span>
            </div>
          </button>

          <ChevronRight className="w-4 h-4 text-muted/60 hidden sm:block" />

          {/* Step 2: Task */}
          <button
            onClick={() => setCurrentStep(2)}
            className="flex items-center gap-2.5 group transition-all text-left"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                currentStep === 2
                  ? "bg-purple text-white ring-4 ring-purple-light shadow-xs"
                  : currentStep > 2
                  ? "bg-forest text-white"
                  : "bg-canvas text-muted border border-borderline"
              }`}
            >
              {currentStep > 2 ? <Check className="w-4 h-4" /> : "2"}
            </div>
            <div>
              <span className="text-[10px] font-semibold text-muted block uppercase tracking-wider">Step 2</span>
              <span
                className={`text-xs font-bold ${
                  currentStep === 2 ? "text-purple" : "text-ink group-hover:text-purple"
                }`}
              >
                Task Parameters
              </span>
            </div>
          </button>

          <ChevronRight className="w-4 h-4 text-muted/60 hidden sm:block" />

          {/* Step 3: Review */}
          <button
            onClick={() => setCurrentStep(3)}
            className="flex items-center gap-2.5 group transition-all text-left"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                currentStep === 3
                  ? "bg-purple text-white ring-4 ring-purple-light shadow-xs"
                  : "bg-canvas text-muted border border-borderline"
              }`}
            >
              3
            </div>
            <div>
              <span className="text-[10px] font-semibold text-muted block uppercase tracking-wider">Step 3</span>
              <span
                className={`text-xs font-bold ${
                  currentStep === 3 ? "text-purple" : "text-ink group-hover:text-purple"
                }`}
              >
                Review & Dispatch
              </span>
            </div>
          </button>
        </div>

        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors px-3 py-1.5 rounded-xl hover:bg-canvas border border-transparent hover:border-borderline shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to alerts
          </button>
        )}
      </div>

      {/* MAIN TWO-COLUMN WORKFLOW: FORM (LEFT) vs LIVE PHONE PREVIEW (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ============================================================== */}
        {/* LEFT COLUMN: 3-STEP FORM BODY (col-span-7) */}
        {/* ============================================================== */}
        <div className="lg:col-span-7 bg-white rounded-card-lg border border-borderline p-6 shadow-xs space-y-6">
          {/* STEP 1 VIEW: ALERT SELECTOR & CONFIRMATION */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="pb-3 border-b border-borderline/60">
                <h2 className="text-base font-bold text-ink">Select originating alert</h2>
                <p className="text-xs text-muted mt-0.5">
                  Choose which alert to pre-fill the action task parameters from.
                </p>
              </div>

              <div className="space-y-3">
                {alerts.map((a) => {
                  const isSelected = selectedAlert?.id === a.id;
                  const isHigh = a.risk === "High";
                  const isMed = a.risk === "Medium";
                  const chipColor = isHigh
                    ? "bg-coral-light text-coral"
                    : isMed
                    ? "bg-amber-light text-amber"
                    : "bg-forest-light text-forest";

                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAlert(a)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "border-purple bg-purple-light/20 shadow-xs ring-1 ring-purple"
                          : "border-borderline hover:border-purple/40 bg-white"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-ink">
                            {a.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} ${a.unit_id}`}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${chipColor}`}>
                            {a.risk}
                          </span>
                        </div>
                        <div className="text-xs text-muted">
                          Lead time: <span className="font-medium text-ink">{a.forecast_period}</span> · Method:{" "}
                          <span className="font-medium text-ink capitalize">{a.method_used.replace("_", " ")}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isSelected && (
                          <span className="text-xs font-bold text-purple hidden sm:inline">Selected</span>
                        )}
                        <input
                          type="radio"
                          name="selectedAlertRadio"
                          checked={isSelected}
                          onChange={() => setSelectedAlert(a)}
                          className="accent-purple w-4 h-4 cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 flex justify-end border-t border-borderline/60">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2.5 bg-purple text-white text-xs font-semibold rounded-xl hover:bg-purple/90 transition-all shadow-xs flex items-center gap-2"
                >
                  <span>Continue to Task form</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 VIEW: TASK FORM */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Header Note with Pre-fill indicator */}
              <div className="pb-3 border-b border-borderline/60">
                <h2 className="text-base font-bold text-ink">Create task from alert</h2>
                <p className="text-xs text-muted mt-0.5">
                  Pre-filled from{" "}
                  <span className="font-semibold text-ink">
                    {selectedAlert?.unit_name ||
                      (selectedAlert
                        ? `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} ${selectedAlert.unit_id}`
                        : `Sample ${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} A`)}
                  </span>{" "}
                  ({selectedAlert?.risk || "High"} risk). Adjust parameters as required.
                </p>
              </div>

              {formError && (
                <div className="p-3.5 text-xs bg-coral-light text-coral border border-coral/30 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{formError}</span>
                </div>
              )}

              {/* Task template selector buttons */}
              <div>
                <label className="block text-xs font-bold text-ink mb-2">Task Template</label>
                <div className="flex flex-wrap gap-2">
                  {TASK_TEMPLATES.map((tmpl) => {
                    const isSelected = selectedTemplate === tmpl.id;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedTemplate(tmpl.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isSelected
                            ? "bg-purple text-white shadow-xs"
                            : "bg-canvas text-ink hover:bg-purple-light/40 border border-borderline"
                        }`}
                      >
                        {tmpl.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Task Title Input */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold text-ink border border-borderline rounded-xl focus:outline-none focus:ring-2 focus:ring-purple bg-white shadow-xs"
                  placeholder="Enter task title..."
                />
              </div>

              {/* Villages Chips */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-ink">Target Villages</label>
                  <span className="text-[11px] text-muted">
                    {selectedVillages.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableVillages.map((v) => {
                    const isSelected = selectedVillages.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleVillage(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-purple-light text-purple border border-purple/40 font-semibold"
                            : "bg-white text-muted hover:text-ink border border-borderline"
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 text-purple" /> : <span className="text-muted">+</span>}
                        <span>{v}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Assign to (Mitanin picker with open tasks & availability) */}
              <div>
                <label className="block text-xs font-bold text-ink mb-2">Assign To Mitanin Frontline Worker</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {mitanins.map((mitanin) => {
                    const isSelected = selectedMitaninId === mitanin.id;
                    const isBusy = mitanin.availability?.toLowerCase().includes("busy");
                    const openCount = mitanin.open_tasks ?? 0;

                    return (
                      <div
                        key={mitanin.id}
                        onClick={() => setSelectedMitaninId(mitanin.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "border-purple bg-purple-light/20 shadow-xs ring-1 ring-purple"
                            : "border-borderline hover:border-purple/40 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-forest text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {mitanin.name.replace("Mitanin ", "").charAt(0) || "M"}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-ink">{mitanin.name}</div>
                            <div className="text-[11px] text-muted mt-0.5">
                              {openCount} open {openCount === 1 ? "task" : "tasks"} ·{" "}
                              <span className={isBusy ? "text-coral font-semibold" : "text-forest font-semibold"}>
                                {mitanin.availability || "Available"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-purple text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Deadline & Acknowledgement / Escalation Window */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Deadline */}
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">Action Deadline</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold text-ink border border-borderline rounded-xl focus:outline-none focus:ring-2 focus:ring-purple bg-white shadow-xs"
                    />
                    <Calendar className="w-4 h-4 text-muted absolute left-3 top-3" />
                  </div>
                </div>

                {/* Acknowledgement window from config */}
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">Reply Escalation Window</label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 text-xs border border-borderline rounded-xl bg-canvas text-ink shadow-xs">
                    <Clock className="w-4 h-4 text-amber shrink-0" />
                    <span className="font-semibold text-ink">
                      {escalationHours} hours, then escalate to district
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="pt-4 flex items-center justify-between border-t border-borderline/60">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-borderline text-ink hover:bg-canvas transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-6 py-2.5 text-xs font-semibold rounded-xl bg-purple text-white hover:bg-purple/90 transition-all shadow-xs flex items-center gap-2"
                >
                  <span>Review Task</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 VIEW: REVIEW STEP */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="pb-3 border-b border-borderline/60">
                <h2 className="text-base font-bold text-ink">Review & dispatch task</h2>
                <p className="text-xs text-muted mt-0.5">
                  Verify the task parameters before dispatching to frontline worker.
                </p>
              </div>

              {formError && (
                <div className="p-3.5 text-xs bg-coral-light text-coral border border-coral/30 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{formError}</span>
                </div>
              )}

              {/* Review Summary Card */}
              <div className="p-5 rounded-2xl border border-borderline bg-canvas/40 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">Task Title</span>
                    <p className="text-sm font-bold text-ink mt-0.5">{taskTitle}</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-coral-light text-coral shrink-0">
                    {selectedAlert?.risk?.toUpperCase() || "HIGH"} RISK
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs pt-3 border-t border-borderline/60">
                  <div>
                    <span className="text-[10px] text-muted uppercase tracking-wider block">Originating Alert</span>
                    <span className="font-bold text-ink mt-0.5 block">
                      {selectedAlert?.unit_name ||
                        `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} ${selectedAlert?.unit_id || "A"}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase tracking-wider block">Assigned Mitanin</span>
                    <span className="font-bold text-ink mt-0.5 block">{currentMitanin?.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase tracking-wider block">Target Villages</span>
                    <span className="font-semibold text-ink mt-0.5 block">{selectedVillages.join(", ")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase tracking-wider block">Action Deadline</span>
                    <span className="font-semibold text-ink mt-0.5 block">{formattedDeadlineDisplay}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-borderline/60">
                  <span className="text-[10px] text-muted uppercase tracking-wider block mb-1">Audit Policy</span>
                  <p className="text-xs text-muted">
                    Initial status will be set to <span className="font-semibold text-ink">sent</span>. If not replied within{" "}
                    <span className="font-semibold text-ink">{escalationHours} hours</span>, task will automatically escalate to the district medical officer.
                  </p>
                </div>
              </div>

              {/* Dispatch Action Buttons */}
              <div className="pt-4 flex items-center justify-between border-t border-borderline/60">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-borderline text-ink hover:bg-canvas transition-colors"
                >
                  Back to edit
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitTask}
                  className="px-6 py-2.5 text-xs font-semibold rounded-xl bg-forest text-white hover:bg-forest/90 transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? "Sending..." : "Send to Mitanin"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN: LIVE PHONE PREVIEW (col-span-5) */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full mb-3 text-center sm:text-left">
            <h3 className="text-sm font-bold text-ink">Live Mobile Preview</h3>
            <p className="text-xs text-muted">Exact message delivered to Mitanin Sahayak</p>
          </div>

          {/* Smartphone Frame Container */}
          <div className="w-[320px] bg-[#1E1B2E] p-3 rounded-[40px] shadow-xl border-4 border-[#2D2942]">
            {/* Phone Screen Glass */}
            <div className="w-full bg-[#f8fafc] rounded-[32px] overflow-hidden flex flex-col min-h-[500px] border border-black/10">
              {/* Speaker notch */}
              <div className="h-5 bg-transparent flex justify-center items-center pt-1">
                <div className="w-16 h-1.5 bg-[#2D2942]/40 rounded-full" />
              </div>

              {/* App / SMS Header */}
              <div className="bg-forest px-4 py-3 text-white flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold tracking-tight">Mitanin Sahayak</h4>
                  <p className="text-[10px] text-white/80">Health Alert & Field Task</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </div>

              {/* Message Bubble Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {/* SMS / IVR Text Card */}
                  <div className="bg-white p-4 rounded-2xl shadow-xs border border-borderline space-y-2">
                    <p className="text-xs font-bold text-ink leading-snug">
                      {activeTemplateObj.previewAction}
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      Please visit 10 homes in <span className="font-semibold text-ink">{villagesSummaryText}</span> and test fevers by <span className="font-semibold text-ink">{deadlineDayName}</span>.
                    </p>
                  </div>

                  {/* Local language indicator badge */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-light text-purple">
                    <span>Language: Hindi / Chhattisgarhi</span>
                  </div>
                </div>

                {/* Simulated Frontline Action Buttons on Phone */}
                <div className="space-y-2 pt-6">
                  <div className="w-full py-2.5 px-3 bg-forest text-white text-xs font-bold rounded-xl text-center shadow-xs cursor-default">
                    1. Mark Completed (Done)
                  </div>
                  <div className="w-full py-2.5 px-3 bg-amber text-white text-xs font-bold rounded-xl text-center shadow-xs cursor-default">
                    2. Request Help / Supplies
                  </div>
                </div>
              </div>

              {/* Home indicator bar */}
              <div className="h-4 flex justify-center items-center pb-1">
                <div className="w-24 h-1 bg-black/20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}