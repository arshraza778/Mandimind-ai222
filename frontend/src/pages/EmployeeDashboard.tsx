import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  User,
  MapPin,
  CheckCircle2,
  Play,
  FileText,
  Bell,
  Search,
  Send,
  Paperclip,
  Thermometer,
  CloudRain,
  HelpCircle,
  XCircle,
  Volume2,
} from "lucide-react";
import type { SelectedLocationState } from "../components/LocationSelectorModal";
import { VoiceTaskPlayer } from "../components/VoiceTaskPlayer";
import { VoiceInputButton } from "../components/VoiceInputButton";
import { useI18n } from "../i18n/I18nContext";

interface EmployeeDashboardProps {
  activeView: "emp-dashboard" | "my-tasks";
  authToken: string;
  selectedLocation: SelectedLocationState;
  onChangeLocation: () => void;
  onSwitchView: (view: "emp-dashboard" | "my-tasks" | "voice-tasks") => void;
  onDataUpdated?: () => void;
  onSelectDiseaseDetail?: (diseaseType: string) => void;
}

export function EmployeeDashboard({
  activeView,
  authToken,
  selectedLocation,
  onChangeLocation,
  onSwitchView,
  onDataUpdated,
  onSelectDiseaseDetail: _onSelectDiseaseDetail,
}: EmployeeDashboardProps) {
  const { t: tr, localizeTask } = useI18n();
  const [dashData, setDashData] = useState<any | null>(null);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // My Tasks filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [diseaseFilter, setDiseaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Task Update / Complete Modal State
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [modalAction, setModalAction] = useState<"update" | "complete" | "need_help" | "cancel">("complete");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [modalAttachment, setModalAttachment] = useState<string>("");
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);

  // Field Report Form State
  const [reportTaskId, setReportTaskId] = useState<string>("");
  const [reportDiseaseType, setReportDiseaseType] = useState<string>("malaria");
  const [reportTitle, setReportTitle] = useState<string>("");
  const [householdsVisited, setHouseholdsVisited] = useState<number>(15);
  const [rdtConducted, setRdtConducted] = useState<number>(4);
  const [positiveCases, setPositiveCases] = useState<number>(0);
  const [suspectedCases, setSuspectedCases] = useState<number>(0);
  const [stagnantSites, setStagnantSites] = useState<number>(3);
  const [netsDistributed, setNetsDistributed] = useState<number>(5);
  const [emergingConcern, setEmergingConcern] = useState<boolean>(false);
  const [observations, setObservations] = useState<string>("");
  const [evidenceNotes, setEvidenceNotes] = useState<string>("");
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  const headers = {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };

  const fetchDashboard = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      district_id: selectedLocation.district_id,
      block_id: selectedLocation.block_id,
    });
    if (selectedLocation.village_id) {
      params.set("village_id", selectedLocation.village_id);
    }

    fetch(`http://127.0.0.1:8000/employee/dashboard?${params.toString()}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to load employee dashboard");
        }
        return res.json();
      })
      .then((json) => {
        setDashData(json);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  const fetchFilteredTasks = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (dueFilter !== "all") params.set("due_filter", dueFilter);
    if (diseaseFilter !== "all") params.set("disease_type", diseaseFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());

    fetch(`http://127.0.0.1:8000/employee/tasks?${params.toString()}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setMyTasks(list))
      .catch(() => {});
  };

  useEffect(() => {
    fetchDashboard();
  }, [authToken, selectedLocation.district_id, selectedLocation.block_id, selectedLocation.village_id]);

  useEffect(() => {
    fetchFilteredTasks();
  }, [authToken, statusFilter, priorityFilter, dueFilter, diseaseFilter, searchQuery, dashData]);

  const handleQuickTaskAction = async (
    taskId: number,
    action: "acknowledge" | "start" | "update" | "complete" | "need_help" | "cancel",
    notes?: string,
    evidence?: string
  ) => {
    setActionSubmitting(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/employee/tasks/${taskId}/action`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          notes,
          completion_notes: action === "complete" ? notes : undefined,
          evidence_attachment: evidence || undefined,
        }),
      });
      if (res.ok) {
        setEditingTask(null);
        setModalNotes("");
        setModalAttachment("");
        fetchDashboard();
        fetchFilteredTasks();
        if (onDataUpdated) onDataUpdated();
      }
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim() || !observations.trim()) return;
    setReportSubmitting(true);
    setReportSuccess(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/employee/reports", {
        method: "POST",
        headers,
        body: JSON.stringify({
          task_id: reportTaskId ? parseInt(reportTaskId, 10) : null,
          disease_type: reportDiseaseType,
          title: reportTitle.trim(),
          village_id: selectedLocation.village_id,
          households_visited: householdsVisited,
          rdt_conducted: rdtConducted,
          positive_cases: positiveCases,
          suspected_cases: suspectedCases,
          stagnant_water_sites: stagnantSites,
          nets_distributed: netsDistributed,
          emerging_concern: emergingConcern,
          observations: observations.trim(),
          evidence_notes: evidenceNotes.trim() || null,
        }),
      });
      if (res.ok) {
        setReportTitle("");
        setObservations("");
        setEvidenceNotes("");
        setEmergingConcern(false);
        setReportSuccess("Multi-disease field report submitted and routed to your Supervisor for review.");
        fetchDashboard();
      }
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading && !dashData) {
    return (
      <div className="p-8 text-center text-sm text-muted">
        Loading Field Employee Dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-5 rounded-card bg-coral-light border border-coral/30 text-coral text-sm font-semibold">
          {error}
        </div>
      </div>
    );
  }

  const emp = dashData?.employee || {};
  const sup = dashData?.supervisor;
  const risk = dashData?.risk || {};
  const climate = dashData?.climate || {};
  const counts = dashData?.task_counts || {};
  const tasks = dashData?.tasks || [];
  const reports = dashData?.reports || [];
  const notifications = dashData?.notifications || [];
  const trends = dashData?.historical_trends || [];

  const getStatusBadge = (t: any) => {
    const st = t.status;
    if (st === "done" || st === "completed") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-forest-light text-forest">Completed</span>;
    }
    if (st === "cancelled") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-canvas text-muted border border-borderline">Cancelled</span>;
    }
    if (t.is_overdue || st === "escalated") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-coral-light text-coral">Overdue / Escalated</span>;
    }
    if (st === "needs_help") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-light text-amber">Needs Help</span>;
    }
    if (st === "in_progress") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-light text-purple">In Progress</span>;
    }
    if (st === "acknowledged") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-light text-teal">Acknowledged</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF3D6] text-[#A8650A]">Pending</span>;
  };

  const getPriorityBadge = (priority: string) => {
    const p = (priority || "Medium").toLowerCase();
    if (p === "critical" || p === "high") {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-coral-light text-coral uppercase">{priority}</span>;
    }
    if (p === "medium") {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-light text-amber uppercase">{priority}</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-forest-light text-forest uppercase">{priority || "Low"}</span>;
  };

  const getDiseaseBadge = (diseaseType?: string, diseaseLabel?: string) => {
    const dt = (diseaseType || "malaria").toLowerCase();
    const label =
      diseaseLabel ||
      (dt === "dengue"
        ? "Dengue"
        : dt === "diarrhoea"
        ? "Diarrhoeal Disease"
        : dt === "heat"
        ? "Heat-Related Health Risk"
        : "Malaria");
    const colorCls =
      dt === "dengue"
        ? "bg-purple-light text-purple"
        : dt === "diarrhoea"
        ? "bg-teal-light text-teal"
        : dt === "heat"
        ? "bg-amber-light text-amber"
        : "bg-coral-light text-coral";
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colorCls}`}>
        {label}
      </span>
    );
  };

  // =========================================================================
  // VIEW B: DEDICATED "MY TASKS" PAGE
  // =========================================================================
  if (activeView === "my-tasks") {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-ink">
        {/* Header */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-light text-teal text-xs font-bold">
                Field Employee / Mitanin
              </span>
              <span className="text-xs text-muted font-medium">
                {selectedLocation.breadcrumb}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink mt-1">
              My Assigned Tasks ({myTasks.length})
            </h1>
            <p className="text-xs text-muted">
              View, filter, acknowledge, start, update, and complete tasks assigned to {emp.name}. Changes persist to the database.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onSwitchView("emp-dashboard")}
            className="px-4 py-2.5 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink transition-colors cursor-pointer shrink-0"
          >
            Back to Employee Overview
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search task title or instructions..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-borderline text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple"
            />
          </div>

          {/* Disease / Risk Filter */}
          <div>
            <select
              aria-label="Filter by Disease or Risk"
              value={diseaseFilter}
              onChange={(e) => setDiseaseFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-borderline text-xs font-medium text-ink bg-white focus:outline-none focus:ring-2 focus:ring-purple"
            >
              <option value="all">All 4 Health Risks</option>
              <option value="malaria">Malaria</option>
              <option value="dengue">Dengue</option>
              <option value="diarrhoea">Diarrhoeal Disease</option>
              <option value="heat">Heat-Related Risk</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              aria-label="Filter by Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-borderline text-xs font-medium text-ink bg-white focus:outline-none focus:ring-2 focus:ring-purple"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending (Sent)</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue / Escalated</option>
              <option value="needs_help">Needs Help</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              aria-label="Filter by Priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-borderline text-xs font-medium text-ink bg-white focus:outline-none focus:ring-2 focus:ring-purple"
            >
              <option value="all">All Priorities</option>
              <option value="Critical">Critical Priority</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>

          {/* Due Date Filter */}
          <div>
            <select
              aria-label="Filter by Due Date"
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-borderline text-xs font-medium text-ink bg-white focus:outline-none focus:ring-2 focus:ring-purple"
            >
              <option value="all">All Due Dates</option>
              <option value="overdue">Overdue Only</option>
              <option value="due_soon">Due Within 24 Hours</option>
            </select>
          </div>
        </div>

        {/* Task Cards List */}
        {myTasks.length === 0 ? (
          <div className="bg-white rounded-card border border-borderline p-10 text-center text-sm text-muted">
            No assigned tasks match the selected filters.
          </div>
        ) : (
          <div className="space-y-3">
            {myTasks.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-card border border-borderline p-5 shadow-2xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-borderline pb-3">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-mono text-xs font-bold text-purple bg-purple-light px-2 py-0.5 rounded">
                      TASK #{t.id}
                    </span>
                    {getDiseaseBadge(t.disease_type, t.disease_label)}
                    {getPriorityBadge(t.priority)}
                    {getStatusBadge(t)}
                    <span className="text-xs text-muted">
                      Assigned Location: <strong className="text-ink">{t.location_name || t.unit_name}</strong>
                    </span>
                  </div>

                  <div className="text-xs text-muted flex items-center gap-3">
                    <span>
                      Assigned:{" "}
                      <strong>
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : "-"}
                      </strong>
                    </span>
                    <span>
                      Due:{" "}
                      <strong className={t.is_overdue ? "text-coral" : "text-ink"}>
                        {t.deadline ? new Date(t.deadline).toLocaleString() : "-"}
                      </strong>
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-ink">{localizeTask(t).title}</h3>
                  <p className="text-xs text-muted mt-1">{localizeTask(t).instructions || t.description}</p>
                  {t.instructions && (
                    <div className="mt-2 p-2.5 rounded-xl bg-canvas border border-borderline text-xs text-ink">
                      <strong>{tr("voice.instructions_label")}:</strong> {localizeTask(t).instructions}
                    </div>
                  )}
                </div>

                {/* Text-to-Speech Voice Task Player (EN / हिन्दी / छत्तीसगढ़ी) */}
                <VoiceTaskPlayer task={t} />

                {(t.completion_notes || t.evidence_attachment) && (
                  <div className="p-3 rounded-xl bg-forest-light/50 border border-forest/20 text-xs space-y-1">
                    {t.completion_notes && (
                      <div>
                        <strong>Completion / Progress Notes:</strong> {t.completion_notes}
                      </div>
                    )}
                    {t.evidence_attachment && (
                      <div className="flex items-center gap-1.5 text-forest font-semibold">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>Attachment: {t.evidence_attachment}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-borderline">
                  {t.status === "sent" && (
                    <button
                      type="button"
                      onClick={() => handleQuickTaskAction(t.id, "acknowledge", "Acknowledged by Mitanin.")}
                      className="px-3.5 py-1.5 rounded-xl bg-teal text-white text-xs font-bold hover:bg-teal/90 transition-colors cursor-pointer"
                    >
                      {tr("employee.acknowledge_btn")}
                    </button>
                  )}

                  {(t.status === "sent" || t.status === "acknowledged") && (
                    <button
                      type="button"
                      onClick={() => handleQuickTaskAction(t.id, "start", "Started field execution.")}
                      className="px-3.5 py-1.5 rounded-xl bg-purple text-white text-xs font-bold hover:bg-purple/90 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>{tr("employee.start_btn")}</span>
                    </button>
                  )}

                  {t.status !== "done" && t.status !== "completed" && t.status !== "cancelled" && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(t);
                          setModalAction("update");
                          setModalNotes(t.completion_notes || "");
                          setModalAttachment(t.evidence_attachment || "");
                        }}
                        className="px-3.5 py-1.5 rounded-xl border border-borderline hover:bg-canvas text-xs font-bold text-ink transition-colors cursor-pointer"
                      >
                        Update Progress / Attachment
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(t);
                          setModalAction("complete");
                          setModalNotes(t.completion_notes || "");
                          setModalAttachment(t.evidence_attachment || "");
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-forest text-white text-xs font-bold hover:bg-forest/90 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{tr("employee.complete_btn")}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(t);
                          setModalAction("need_help");
                          setModalNotes("");
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-light text-amber text-xs font-bold hover:bg-amber/20 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>{tr("employee.need_help_btn")}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task Update / Complete Modal */}
        {editingTask && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-card-lg border border-borderline max-w-md w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-borderline pb-3">
                <h3 className="text-base font-bold text-ink capitalize">
                  {modalAction.replace("_", " ")} — Task #{editingTask.id}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="text-muted hover:text-ink"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="text-xs text-muted font-medium">{localizeTask(editingTask).title}</div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-ink">
                      {modalAction === "complete" ? "Completion Notes" : "Progress / Field Notes"}
                    </label>
                    <VoiceInputButton
                      onTranscript={(spoken) =>
                        setModalNotes((prev) => (prev ? `${prev} ${spoken}` : spoken))
                      }
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Enter household count, RDT tally, or field observations..."
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Evidence Attachment / Register Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={modalAttachment}
                    onChange={(e) => setModalAttachment(e.target.value)}
                    placeholder="e.g., RDT_Register_Page12.jpg or Slide #BLK-A-19"
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-borderline">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 rounded-xl border border-borderline text-xs font-semibold text-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionSubmitting}
                  onClick={() =>
                    handleQuickTaskAction(editingTask.id, modalAction, modalNotes, modalAttachment)
                  }
                  className="px-5 py-2 rounded-xl bg-purple text-white text-xs font-bold"
                >
                  {actionSubmitting ? "Saving..." : "Save to Database"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW A: MAIN FIELD EMPLOYEE DASHBOARD
  // =========================================================================
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-ink">
      {/* 1. EMPLOYEE PROFILE & ASSIGNED JURISDICTION CARD */}
      <section className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
            <User className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-xl font-bold text-ink">{emp.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-light text-teal">
                {emp.role_label || "Field Employee / Mitanin"}
              </span>
            </div>
            <div className="text-xs text-muted flex items-center flex-wrap gap-3">
              <span className="flex items-center gap-1 font-semibold text-ink">
                <MapPin className="w-3.5 h-3.5 text-purple" />
                {tr("employee.jurisdiction")}: {selectedLocation.breadcrumb}
              </span>
              {sup && (
                <span>
                  Reporting Supervisor: <strong>{sup.name}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchView("voice-tasks")}
            className="px-3.5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{tr("employee.open_voice_tasks")}</span>
          </button>
          <button
            type="button"
            onClick={onChangeLocation}
            className="px-3.5 py-2.5 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-purple" />
            <span>{tr("app.change_location")}</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView("my-tasks")}
            className="px-4 py-2.5 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
          >
            {tr("employee.my_tasks_title")} ({counts.total || 0})
          </button>
        </div>
      </section>

      {/* 2. TASK STATUS KPI ROW + LOCAL MALARIA RISK */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] text-muted font-semibold">Local Malaria Risk</div>
          <div className="text-xl font-extrabold text-coral mt-1.5">{risk.category || "High"}</div>
          <div className="text-[11px] text-muted mt-1 truncate">{risk.forecast_period}</div>
        </div>

        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] text-muted font-semibold">Pending Tasks</div>
          <div className="text-2xl font-extrabold text-amber mt-1.5 tabular-nums">{counts.pending ?? 0}</div>
          <div className="text-[11px] text-muted mt-1 truncate">Awaiting acknowledgement</div>
        </div>

        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] text-muted font-semibold">In Progress</div>
          <div className="text-2xl font-extrabold text-purple mt-1.5 tabular-nums">{counts.in_progress ?? 0}</div>
          <div className="text-[11px] text-muted mt-1 truncate">Active execution</div>
        </div>

        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] text-muted font-semibold">Completed</div>
          <div className="text-2xl font-extrabold text-forest mt-1.5 tabular-nums">{counts.completed ?? 0}</div>
          <div className="text-[11px] text-muted mt-1 truncate">Verified in ledger</div>
        </div>

        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] text-muted font-semibold">Overdue / Escalated</div>
          <div className="text-2xl font-extrabold text-coral mt-1.5 tabular-nums">{counts.overdue ?? 0}</div>
          <div className="text-[11px] text-muted mt-1 truncate">Past deadline</div>
        </div>

        <div className="bg-white rounded-card-lg border border-borderline p-4 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] text-muted font-semibold">Latest Climate</div>
          <div className="text-sm font-bold text-ink mt-1.5 flex items-center gap-2">
            <span className="flex items-center gap-1 tabular-nums">
              <Thermometer className="w-3.5 h-3.5 text-amber" />
              {climate.temperature_c}°C
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <CloudRain className="w-3.5 h-3.5 text-purple" />
              {climate.rainfall_mm}mm
            </span>
          </div>
          <div className="text-[10px] text-muted mt-1 truncate">As of {climate.latest_date}</div>
        </div>
      </section>

      {/* 3. ASSIGNED TASKS & NOTIFICATIONS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Assigned Tasks List (col-span-8) */}
        <div className="lg:col-span-8 bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-borderline pb-3">
              <div>
                <h2 className="text-base font-bold text-ink">{tr("employee.my_tasks_title")}</h2>
                <p className="text-xs text-muted">
                  Acknowledge, start, listen via voice TTS, and complete your assigned field tasks across all 4 health risks
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSwitchView("my-tasks")}
                className="text-xs font-bold text-purple hover:underline cursor-pointer shrink-0"
              >
                View All & Filter →
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map((t: any) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl border border-borderline bg-canvas/40 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-[11px] font-bold text-purple">#{t.id}</span>
                      {getDiseaseBadge(t.disease_type, t.disease_label)}
                      <span className="text-xs sm:text-sm font-bold text-ink">
                        {localizeTask(t).title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {getPriorityBadge(t.priority)}
                      {getStatusBadge(t)}
                    </div>
                  </div>

                  <p className="text-xs text-muted leading-relaxed">
                    {localizeTask(t).instructions || t.instructions || t.description}
                  </p>

                  {/* Voice Task Player */}
                  <VoiceTaskPlayer task={t} />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[11px] text-muted">
                    <span>
                      Due: <strong>{t.deadline ? new Date(t.deadline).toLocaleString() : "-"}</strong>
                    </span>

                    <div className="flex items-center gap-2">
                      {t.status === "sent" && (
                        <button
                          type="button"
                          onClick={() => handleQuickTaskAction(t.id, "acknowledge", "Acknowledged task")}
                          className="px-3 py-1 rounded-lg bg-teal hover:bg-teal/90 text-white font-bold cursor-pointer transition-colors"
                        >
                          {tr("employee.acknowledge_btn")}
                        </button>
                      )}
                      {(t.status === "sent" || t.status === "acknowledged") && (
                        <button
                          type="button"
                          onClick={() => handleQuickTaskAction(t.id, "start", "Started field work")}
                          className="px-3 py-1 rounded-lg bg-purple hover:bg-purple/90 text-white font-bold cursor-pointer transition-colors"
                        >
                          {tr("employee.start_btn")}
                        </button>
                      )}
                      {t.status !== "done" && t.status !== "completed" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickTaskAction(
                              t.id,
                              "complete",
                              "Completed household fever screening and larval inspection."
                            )
                          }
                          className="px-3 py-1 rounded-lg bg-forest hover:bg-forest/90 text-white font-bold cursor-pointer transition-colors"
                        >
                          {tr("employee.complete_btn")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications & Local Alert Panel (col-span-4) */}
        <div className="lg:col-span-4 bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-borderline pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple" />
                <h2 className="text-base font-bold text-ink">Alerts & Notifications</h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-light text-purple">
                {notifications.length}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {notifications.map((n: any) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-xl border border-borderline bg-canvas/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-purple">
                      {n.category.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-muted">
                      {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink">{n.title}</div>
                  <p className="text-[11px] text-muted leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. FIELD REPORT SUBMISSION FORM & LOCAL CLIMATE/MALARIA TRENDS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Field Report Submission Form (col-span-6) */}
        <div className="lg:col-span-6 bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-borderline pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal" />
              <h2 className="text-base font-bold text-ink">Submit Multi-Disease Field Surveillance Report</h2>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Record household visits, suspected/confirmed cases, vector breeding, safe-water or heat-safety checks for {selectedLocation.village_name}
            </p>
          </div>

          {reportSuccess && (
            <div className="p-3 rounded-xl bg-forest-light text-forest text-xs font-semibold">
              {reportSuccess}
            </div>
          )}

          <form onSubmit={handleReportSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Disease / Health Risk</label>
                <select
                  aria-label="Report Disease or Health Risk"
                  value={reportDiseaseType}
                  onChange={(e) => setReportDiseaseType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-bold text-ink bg-white"
                >
                  <option value="malaria">Malaria</option>
                  <option value="dengue">Dengue</option>
                  <option value="diarrhoea">Diarrhoeal Disease</option>
                  <option value="heat">Heat-Related Health Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Report Title</label>
                <input
                  type="text"
                  required
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g., Sector 4 Daily RDT & Larval Sweep"
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Linked Task (Optional)</label>
                <select
                  value={reportTaskId}
                  onChange={(e) => setReportTaskId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink bg-white"
                >
                  <option value="">General Village Surveillance</option>
                  {tasks.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} — {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">Homes Visited</label>
                <input
                  type="number"
                  min={0}
                  value={householdsVisited}
                  onChange={(e) => setHouseholdsVisited(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-borderline text-xs font-bold text-ink"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">RDTs / Checks</label>
                <input
                  type="number"
                  min={0}
                  value={rdtConducted}
                  onChange={(e) => setRdtConducted(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-borderline text-xs font-bold text-ink"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">Suspected Cases</label>
                <input
                  type="number"
                  min={0}
                  value={suspectedCases}
                  onChange={(e) => setSuspectedCases(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-borderline text-xs font-bold text-amber"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">Positive Cases</label>
                <input
                  type="number"
                  min={0}
                  value={positiveCases}
                  onChange={(e) => setPositiveCases(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-borderline text-xs font-bold text-coral"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">Water Sites</label>
                <input
                  type="number"
                  min={0}
                  value={stagnantSites}
                  onChange={(e) => setStagnantSites(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-borderline text-xs font-bold text-ink"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted mb-1">Nets / ORS</label>
                <input
                  type="number"
                  min={0}
                  value={netsDistributed}
                  onChange={(e) => setNetsDistributed(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-borderline text-xs font-bold text-ink"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-coral-light/40 border border-coral/25">
              <input
                id="emerging-concern-chk"
                type="checkbox"
                checked={emergingConcern}
                onChange={(e) => setEmergingConcern(e.target.checked)}
                className="w-4 h-4 accent-coral rounded"
              />
              <label htmlFor="emerging-concern-chk" className="text-xs font-bold text-ink cursor-pointer">
                Flag as Emerging Local Health Concern (triggers immediate supervisor priority review)
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Field Observations</label>
              <textarea
                rows={2}
                required
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Describe fever cases, vector containers, ORS distribution, safe-water kit check, or heat-stress outreach..."
                className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                Evidence / Register ID (Optional)
              </label>
              <input
                type="text"
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                placeholder="e.g., Register #A1-52, RDT Lot #88, H2S Kit #04"
                className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={reportSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-teal hover:bg-teal/90 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{reportSubmitting ? "Submitting..." : "Submit Field Report"}</span>
            </button>
          </form>
        </div>

        {/* Submitted Reports & Local Trend Chart (col-span-6) */}
        <div className="lg:col-span-6 space-y-5 flex flex-col justify-between">
          {/* Submitted Reports Status */}
          <div className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-3.5 flex-1">
            <h2 className="text-base font-bold text-ink border-b border-borderline pb-2.5">
              My Submitted Field Reports ({reports.length})
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {reports.map((r: any) => (
                <div
                  key={r.id}
                  className="p-3 rounded-xl border border-borderline bg-canvas/40 flex items-start justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center flex-wrap gap-1.5">
                      {getDiseaseBadge(r.disease_type, r.disease_label)}
                      {r.emerging_concern && (
                        <span className="px-1.5 py-0.5 rounded bg-coral text-white text-[9px] font-bold uppercase">
                          Emerging Concern
                        </span>
                      )}
                      <span className="font-bold text-ink">{r.title}</span>
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {r.households_visited} homes · {r.rdt_conducted} checks ({r.positive_cases} pos, {r.suspected_cases || 0} susp)
                    </div>
                    {r.review_notes && (
                      <div className="text-[11px] text-purple mt-1 font-medium">
                        Supervisor note: {r.review_notes}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      r.review_status === "approved"
                        ? "bg-forest-light text-forest"
                        : r.review_status === "rejected"
                        ? "bg-coral-light text-coral"
                        : "bg-amber-light text-amber"
                    }`}
                  >
                    {r.review_status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Local Malaria & Rainfall Trend */}
          <div className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm">
            <h2 className="text-sm font-bold text-ink pb-2">
              Local Malaria & Rainfall Trend ({selectedLocation.block_name})
            </h2>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E1EC" vertical={false} />
                  <XAxis dataKey="period" stroke="#6B6880" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6B6880" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="rainfall_mm" name="Rainfall (mm)" fill="#EEEDFE" barSize={12} />
                  <Line type="monotone" dataKey="cases" name="Cases (sim)" stroke="#C8472A" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
