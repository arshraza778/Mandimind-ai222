import { useState, useEffect, useMemo } from "react";
import { Check, ArrowLeft, Send, AlertTriangle, Calendar, Clock } from "lucide-react";
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
          // Fallback defaults matching design if backend empty
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 3-STEP STEPPER BAR */}
      <div className="flex items-center justify-between pb-2 border-b border-borderline/60">
        <div className="flex items-center gap-6">
          {/* Step 1: Alert */}
          <button
            onClick={() => setCurrentStep(1)}
            className="flex items-center gap-2 group transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                currentStep === 1
                  ? "bg-[#534AB7] text-white ring-4 ring-[#EEEDFE]"
                  : currentStep > 1
                  ? "bg-[#27825C] text-white"
                  : "bg-canvas text-muted border border-borderline"
              }`}
            >
              {currentStep > 1 ? <Check className="w-4 h-4" /> : "1"}
            </div>
            <span
              className={`text-sm font-semibold ${
                currentStep === 1 ? "text-ink" : "text-muted group-hover:text-ink"
              }`}
            >
              Alert
            </span>
          </button>

          <div className="w-12 h-0.5 bg-borderline" />

          {/* Step 2: Task */}
          <button
            onClick={() => setCurrentStep(2)}
            className="flex items-center gap-2 group transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                currentStep === 2
                  ? "bg-[#534AB7] text-white ring-4 ring-[#EEEDFE]"
                  : currentStep > 2
                  ? "bg-[#27825C] text-white"
                  : "bg-canvas text-muted border border-borderline"
              }`}
            >
              {currentStep > 2 ? <Check className="w-4 h-4" /> : "2"}
            </div>
            <span
              className={`text-sm font-semibold ${
                currentStep === 2 ? "text-ink" : "text-muted group-hover:text-ink"
              }`}
            >
              Task
            </span>
          </button>

          <div className="w-12 h-0.5 bg-borderline" />

          {/* Step 3: Review */}
          <button
            onClick={() => setCurrentStep(3)}
            className="flex items-center gap-2 group transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                currentStep === 3
                  ? "bg-[#534AB7] text-white ring-4 ring-[#EEEDFE]"
                  : "bg-canvas text-muted border border-borderline"
              }`}
            >
              3
            </div>
            <span
              className={`text-sm font-semibold ${
                currentStep === 3 ? "text-ink" : "text-muted group-hover:text-ink"
              }`}
            >
              Review
            </span>
          </button>
        </div>

        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink transition-colors px-3 py-1.5 rounded-xl hover:bg-canvas"
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
        <div className="lg:col-span-7 bg-white rounded-card-lg border border-borderline p-6 shadow-2xs space-y-5">
          {/* STEP 1 VIEW: ALERT SELECTOR & CONFIRMATION */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-ink">Select originating alert</h2>
                <p className="text-xs text-muted">
                  Choose which alert to pre-fill the action task from.
                </p>
              </div>

              <div className="space-y-2.5">
                {alerts.map((a) => {
                  const isSelected = selectedAlert?.id === a.id;
                  const isHigh = a.risk === "High";
                  const isMed = a.risk === "Medium";
                  const chipColor = isHigh
                    ? "bg-[#FCEBE8] text-[#C8472A]"
                    : isMed
                    ? "bg-[#FEF3D6] text-[#A8650A]"
                    : "bg-[#EBF5E9] text-[#27825C]";

                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAlert(a)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "border-[#534AB7] bg-[#EEEDFE]/30 shadow-2xs"
                          : "border-borderline hover:border-[#534AB7]/40 bg-white"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-ink">
                            {a.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} ${a.unit_id}`}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${chipColor}`}>
                            {a.risk.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          Lead time: {a.forecast_period} · Method: {a.method_used.replace("_", " ")}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="text-xs font-bold text-[#534AB7]">Selected</span>
                        )}
                        <input
                          type="radio"
                          name="selectedAlertRadio"
                          checked={isSelected}
                          onChange={() => setSelectedAlert(a)}
                          className="accent-[#534AB7] w-4 h-4"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2 bg-[#534AB7] text-white text-xs font-semibold rounded-xl hover:bg-[#534AB7]/90 transition-all shadow-xs"
                >
                  Continue to Task form
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 VIEW: TASK FORM */}
          {currentStep === 2 && (
            <div className="space-y-5">
              {/* Header Note with Pre-fill indicator */}
              <div>
                <h2 className="text-base font-bold text-ink">Create task from alert</h2>
                <p className="text-xs text-muted">
                  Pre-filled from{" "}
                  <span className="font-semibold text-ink">
                    {selectedAlert?.unit_name ||
                      (selectedAlert
                        ? `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} ${selectedAlert.unit_id}`
                        : `Sample ${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} A`)}
                  </span>{" "}
                  ({selectedAlert?.risk || "High"} risk). Confirm or adjust.
                </p>
              </div>

              {formError && (
                <div className="p-3 text-xs bg-[#FCEBE8] text-[#C8472A] border border-[#FCEBE8] rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Task template selector buttons */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">Task template</label>
                <div className="flex flex-wrap gap-2">
                  {TASK_TEMPLATES.map((tmpl) => {
                    const isSelected = selectedTemplate === tmpl.id;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedTemplate(tmpl.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-[#534AB7] text-white shadow-xs font-semibold"
                            : "bg-[#F3F2FA] text-ink hover:bg-[#EEEDFE] border border-borderline/60"
                        }`}
                      >
                        {tmpl.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Villages Chips */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">Villages</label>
                <div className="flex flex-wrap gap-2">
                  {availableVillages.map((v) => {
                    const isSelected = selectedVillages.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleVillage(v)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-[#EEEDFE] text-[#534AB7] border border-[#534AB7]/40 font-semibold"
                            : "bg-white text-muted hover:text-ink border border-borderline"
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 text-[#534AB7]" /> : "+"}
                        <span>{v}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Assign to (Mitanin picker with open tasks & availability) */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">Assign to</label>
                <div className="space-y-2">
                  {mitanins.map((mitanin) => {
                    const isSelected = selectedMitaninId === mitanin.id;
                    const isBusy = mitanin.availability?.toLowerCase().includes("busy");
                    const openCount = mitanin.open_tasks ?? 0;

                    return (
                      <div
                        key={mitanin.id}
                        onClick={() => setSelectedMitaninId(mitanin.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "border-[#534AB7] bg-[#EEEDFE]/30 shadow-2xs ring-1 ring-[#534AB7]"
                            : "border-borderline hover:border-[#534AB7]/40 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#186443] flex items-center justify-center text-white font-bold text-xs shrink-0">
                            M
                          </div>
                          <div>
                            <div className="text-xs font-bold text-ink">{mitanin.name}</div>
                            <div className="text-[11px] text-muted">
                              {openCount} open {openCount === 1 ? "task" : "tasks"} ·{" "}
                              <span
                                className={
                                  isBusy ? "text-[#C8472A] font-semibold" : "text-[#27825C] font-semibold"
                                }
                              >
                                {mitanin.availability || "Available"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="text-xs font-bold text-[#534AB7] pr-2">Selected</span>
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
                  <label className="block text-xs font-bold text-ink mb-1.5">Deadline</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs font-semibold text-ink border border-borderline rounded-xl focus:outline-hidden focus:border-[#534AB7] focus:ring-1 focus:ring-[#534AB7] bg-white shadow-2xs"
                    />
                    <Calendar className="w-4 h-4 text-muted absolute left-3 top-2.5" />
                  </div>
                </div>

                {/* Acknowledgement window from config */}
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">Reply window</label>
                  <div className="flex items-center gap-2 px-3.5 py-2 text-xs border border-borderline rounded-xl bg-canvas/40 text-muted shadow-2xs">
                    <Clock className="w-4 h-4 text-muted shrink-0" />
                    <span className="font-medium">
                      {escalationHours} hours, then escalate to district
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-borderline/60">
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
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#186443] text-white hover:bg-[#186443]/90 transition-all shadow-xs"
                >
                  Review task
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 VIEW: REVIEW STEP */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-ink">Review & dispatch task</h2>
                <p className="text-xs text-muted">
                  Verify the task parameters before dispatching to frontline worker.
                </p>
              </div>

              {formError && (
                <div className="p-3 text-xs bg-[#FCEBE8] text-[#C8472A] border border-[#FCEBE8] rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Review Summary Card */}
              <div className="p-4 rounded-xl border border-borderline bg-canvas/40 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted">Task Title</span>
                    <p className="text-sm font-bold text-ink">{taskTitle}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FCEBE8] text-[#C8472A]">
                    {selectedAlert?.risk?.toUpperCase() || "HIGH"} RISK
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-borderline/50">
                  <div>
                    <span className="text-[10px] text-muted block">Originating Alert</span>
                    <span className="font-semibold text-ink">
                      {selectedAlert?.unit_name ||
                        `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} ${selectedAlert?.unit_id || "A"}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Assigned Mitanin</span>
                    <span className="font-semibold text-ink">{currentMitanin?.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Target Villages</span>
                    <span className="font-semibold text-ink">{selectedVillages.join(", ")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block">Deadline</span>
                    <span className="font-semibold text-ink">{formattedDeadlineDisplay}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-borderline/50">
                  <span className="text-[10px] text-muted block mb-1">Audit Policy</span>
                  <p className="text-xs text-muted">
                    Initial status will be set to <span className="font-semibold text-ink">sent</span>. If not replied within{" "}
                    <span className="font-semibold text-ink">{escalationHours} hours</span>, task will automatically escalate.
                  </p>
                </div>
              </div>

              {/* Dispatch Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-borderline/60">
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
                  className="px-6 py-2.5 text-xs font-semibold rounded-xl bg-[#186443] text-white hover:bg-[#186443]/90 transition-all shadow-xs flex items-center gap-2"
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
          <div className="w-full mb-2">
            <h3 className="text-sm font-bold text-ink">Message preview</h3>
            <p className="text-xs text-muted">Exactly what the Mitanin receives</p>
          </div>

          {/* Smartphone Frame Container */}
          <div className="w-[320px] bg-[#1E1B2E] p-3 rounded-[40px] shadow-2xl border-4 border-[#2D2942]">
            {/* Phone Screen Glass */}
            <div className="w-full bg-[#EDECE6] rounded-[32px] overflow-hidden flex flex-col min-h-[500px] border border-black/10">
              {/* Speaker notch */}
              <div className="h-5 bg-transparent flex justify-center items-center pt-1">
                <div className="w-16 h-1.5 bg-[#2D2942]/40 rounded-full" />
              </div>

              {/* App / SMS Header */}
              <div className="bg-[#186443] px-4 py-3 text-white">
                <h4 className="text-xs font-bold tracking-tight">Health alert</h4>
              </div>

              {/* Message Bubble Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {/* SMS / IVR Text Card */}
                  <div className="bg-white p-4 rounded-2xl shadow-xs border border-black/5 space-y-2">
                    <p className="text-xs font-bold text-ink leading-snug">
                      {activeTemplateObj.previewAction}
                    </p>
                    <p className="text-xs text-ink/80 leading-relaxed">
                      Please visit 10 homes in {villagesSummaryText} and test fevers by {deadlineDayName}.
                    </p>
                  </div>

                  {/* Local language indicator badge */}
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E4E3F7] text-[#534AB7]">
                    Local language: planned
                  </div>
                </div>

                {/* Simulated Frontline Action Buttons on Phone */}
                <div className="space-y-2 pt-6">
                  <div className="w-full py-2.5 px-3 bg-[#186443] text-white text-xs font-bold rounded-xl text-center shadow-xs cursor-default">
                    1 Done
                  </div>
                  <div className="w-full py-2.5 px-3 bg-[#A8650A] text-white text-xs font-bold rounded-xl text-center shadow-xs cursor-default">
                    2 Need help
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