import { useState, useEffect } from "react";
import {
  ShieldCheck,
  MapPin,
  Users,
  AlertTriangle,
  FileCheck,
  Plus,
  Search,
  Edit3,
  XCircle,
} from "lucide-react";
import type { SelectedLocationState } from "../components/LocationSelectorModal";
import { MultiDiseaseOverview } from "../components/MultiDiseaseOverview";

interface SupervisorDashboardProps {
  activeView: "sup-dashboard" | "team-tasks";
  authToken: string;
  selectedLocation: SelectedLocationState;
  onChangeLocation: () => void;
  onSwitchView: (view: string) => void;
  onDataUpdated?: () => void;
  onSelectDiseaseDetail?: (diseaseType: string) => void;
}

export function SupervisorDashboard({
  activeView,
  authToken,
  selectedLocation,
  onChangeLocation,
  onSwitchView,
  onDataUpdated,
  onSelectDiseaseDetail,
}: SupervisorDashboardProps) {
  const [dashData, setDashData] = useState<any | null>(null);
  const [teamTasks, setTeamTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Team Tasks Filters
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [blockFilter, setBlockFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [diseaseFilter, setDiseaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Alert Filter
  const [alertDiseaseFilter, setAlertDiseaseFilter] = useState<string>("all");

  // Assign New Task Modal State
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [newTaskDiseaseType, setNewTaskDiseaseType] = useState<string>("malaria");
  const [newTaskTitle, setNewTaskTitle] = useState<string>("");
  const [newTaskDescription, setNewTaskDescription] = useState<string>("");
  const [newTaskInstructions, setNewTaskInstructions] = useState<string>("");
  const [newTaskOwnerId, setNewTaskOwnerId] = useState<string>("");
  const [newTaskPriority, setNewTaskPriority] = useState<string>("High");
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>("");
  const [assigning, setAssigning] = useState<boolean>(false);

  // Edit Task Priority / Deadline Modal State
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editPriority, setEditPriority] = useState<string>("High");
  const [editStatus, setEditStatus] = useState<string>("sent");
  const [editDeadline, setEditDeadline] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [updatingTask, setUpdatingTask] = useState<boolean>(false);

  // Review Field Report Modal State
  const [reviewingReport, setReviewingReport] = useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected" | "corrections_requested">("approved");
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);

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

    fetch(`http://127.0.0.1:8000/supervisor/dashboard?${params.toString()}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to load supervisor dashboard");
        }
        return res.json();
      })
      .then((json) => {
        setDashData(json);
        if (json.employees && json.employees.length > 0 && !newTaskOwnerId) {
          setNewTaskOwnerId(String(json.employees[0].id));
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  const fetchTeamTasks = () => {
    const params = new URLSearchParams();
    if (employeeFilter !== "all") params.set("employee", employeeFilter);
    if (blockFilter !== "all") params.set("block_id", blockFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (dueFilter !== "all") params.set("due_filter", dueFilter);
    if (diseaseFilter !== "all") params.set("disease_type", diseaseFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());

    fetch(`http://127.0.0.1:8000/supervisor/team-tasks?${params.toString()}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setTeamTasks(list))
      .catch(() => {});
  };

  useEffect(() => {
    fetchDashboard();
  }, [authToken, selectedLocation.district_id, selectedLocation.block_id, selectedLocation.village_id]);

  useEffect(() => {
    fetchTeamTasks();
  }, [authToken, employeeFilter, blockFilter, statusFilter, priorityFilter, dueFilter, diseaseFilter, searchQuery, dashData]);

  const handleAlertStatusUpdate = async (
    alertId: number,
    nextStatus: "acknowledged" | "resolved"
  ) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/alerts/${alertId}/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          status: nextStatus,
          notes:
            nextStatus === "acknowledged"
              ? "Acknowledged by Supervisor for field follow-up."
              : "Resolved by Supervisor after field action verification.",
        }),
      });
      if (res.ok) {
        fetchDashboard();
        if (onDataUpdated) onDataUpdated();
      }
    } catch {}
  };

  const handleAssignNewTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAssigning(true);
    try {
      const emps: any[] = dashData?.employees || [];
      const chosenEmp = emps.find((em) => String(em.id) === newTaskOwnerId) || emps[0];
      const res = await fetch("http://127.0.0.1:8000/supervisor/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          disease_type: newTaskDiseaseType,
          description: newTaskDescription.trim() || newTaskTitle.trim(),
          instructions: newTaskInstructions.trim() || "Perform household RDT fever check and report results.",
          steps: [newTaskInstructions.trim() || "Perform household RDT fever check and report results."],
          owner: chosenEmp ? chosenEmp.name : "Mitanin Asha [SAMPLE]",
          owner_id: chosenEmp ? chosenEmp.id : undefined,
          priority: newTaskPriority,
          district_id: selectedLocation.district_id,
          block_id: chosenEmp?.block_id || selectedLocation.block_id,
          village_id: chosenEmp?.village_id || selectedLocation.village_id,
          deadline: newTaskDeadline ? new Date(newTaskDeadline).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        setShowAssignModal(false);
        setNewTaskTitle("");
        setNewTaskDescription("");
        setNewTaskInstructions("");
        fetchDashboard();
        fetchTeamTasks();
        if (onDataUpdated) onDataUpdated();
      }
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setUpdatingTask(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/supervisor/tasks/${editingTask.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          priority: editPriority,
          status: editStatus,
          deadline: editDeadline ? new Date(editDeadline).toISOString() : undefined,
          notes: editNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setEditingTask(null);
        setEditNotes("");
        fetchDashboard();
        fetchTeamTasks();
        if (onDataUpdated) onDataUpdated();
      }
    } finally {
      setUpdatingTask(false);
    }
  };

  const handleReviewReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingReport || !reviewNotes.trim()) return;
    setReviewSubmitting(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/supervisor/reports/${reviewingReport.id}/review`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            review_status: reviewDecision,
            review_notes: reviewNotes.trim(),
          }),
        }
      );
      if (res.ok) {
        setReviewingReport(null);
        setReviewNotes("");
        fetchDashboard();
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading && !dashData) {
    return (
      <div className="p-8 text-center text-sm text-muted">
        Loading Supervisor Operations Dashboard...
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

  const sup = dashData?.supervisor || {};
  const allowedBlocks: string[] = dashData?.authorized_block_ids || [];
  const risk = dashData?.risk || {};
  const employees: any[] = dashData?.employees || [];
  const taskSummary = dashData?.task_summary || {};
  const reports: any[] = dashData?.reports || [];
  const highRiskLocations: any[] = dashData?.high_risk_locations || [];

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
    if (st === "in_progress" || st === "acknowledged") {
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-light text-purple">In Progress</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF3D6] text-[#A8650A]">Pending</span>;
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
  // SHARED MODALS (Assign Task, Edit Task, Review Report)
  // =========================================================================
  const modals = (
    <>
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card-lg border border-borderline max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-borderline pb-3">
              <h3 className="text-base font-bold text-ink">
                Assign New Task to Field Employee
              </h3>
              <button type="button" onClick={() => setShowAssignModal(false)} className="text-muted hover:text-ink">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignNewTask} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Assign to Employee (within Jurisdiction)</label>
                  <select
                    value={newTaskOwnerId}
                    onChange={(e) => setNewTaskOwnerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
                  >
                    {employees.map((em) => (
                      <option key={em.id} value={em.id}>
                        {em.name} ({em.block_id} · {em.village_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Disease / Health Risk</label>
                  <select
                    aria-label="Assign Task Disease or Health Risk"
                    value={newTaskDiseaseType}
                    onChange={(e) => setNewTaskDiseaseType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-bold text-ink bg-white"
                  >
                    <option value="malaria">Malaria</option>
                    <option value="dengue">Dengue</option>
                    <option value="diarrhoea">Diarrhoeal Disease</option>
                    <option value="heat">Heat-Related Health Risk</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g., Door-to-door fever RDT screening in Sector 4"
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Deadline Date (Optional)</label>
                  <input
                    type="date"
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Field Instructions</label>
                <textarea
                  rows={2}
                  value={newTaskInstructions}
                  onChange={(e) => setNewTaskInstructions(e.target.value)}
                  placeholder="Specify number of households, RDT testing instructions, and larval checks..."
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-borderline">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-xl border border-borderline text-xs font-semibold text-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-5 py-2 rounded-xl bg-purple text-white text-xs font-bold"
                >
                  {assigning ? "Dispatching..." : "Dispatch Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card-lg border border-borderline max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-borderline pb-3">
              <h3 className="text-base font-bold text-ink">
                Update Task #{editingTask.id} Priority / Deadline
              </h3>
              <button type="button" onClick={() => setEditingTask(null)} className="text-muted hover:text-ink">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTask} className="space-y-3">
              <div className="text-xs font-semibold text-ink">{editingTask.title}</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
                  >
                    <option value="sent">Pending (Sent)</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Completed</option>
                    <option value="escalated">Escalated</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">New Deadline (Optional)</label>
                <input
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Supervisor Audit Note</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Reason for priority or deadline update..."
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                />
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
                  type="submit"
                  disabled={updatingTask}
                  className="px-5 py-2 rounded-xl bg-purple text-white text-xs font-bold"
                >
                  {updatingTask ? "Saving..." : "Save Task Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewingReport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card-lg border border-borderline max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-borderline pb-3">
              <h3 className="text-base font-bold text-ink">
                Review Field Report #{reviewingReport.id}
              </h3>
              <button type="button" onClick={() => setReviewingReport(null)} className="text-muted hover:text-ink">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-canvas border border-borderline text-xs space-y-1">
              <div className="font-bold text-ink">{reviewingReport.title}</div>
              <div className="text-muted">Submitted by: {reviewingReport.employee_name}</div>
              <div className="text-ink mt-1">{reviewingReport.observations}</div>
            </div>

            <form onSubmit={handleReviewReport} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Review Decision</label>
                <select
                  value={reviewDecision}
                  onChange={(e) => setReviewDecision(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
                >
                  <option value="approved">Approve Report</option>
                  <option value="corrections_requested">Request Corrections</option>
                  <option value="rejected">Reject Report</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Supervisor Review Remarks</label>
                <textarea
                  rows={3}
                  required
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Enter verification remarks or requested follow-up corrections..."
                  className="w-full px-3 py-2 rounded-xl border border-borderline text-xs text-ink"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-borderline">
                <button
                  type="button"
                  onClick={() => setReviewingReport(null)}
                  className="px-4 py-2 rounded-xl border border-borderline text-xs font-semibold text-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="px-5 py-2 rounded-xl bg-purple text-white text-xs font-bold"
                >
                  {reviewSubmitting ? "Submitting..." : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  // =========================================================================
  // VIEW B: DEDICATED "TEAM TASKS" PAGE
  // =========================================================================
  if (activeView === "team-tasks") {
    return (
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-4 text-ink">
        <div className="bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-light text-purple text-xs font-bold">
                Supervisor Team Tasks
              </span>
              <span className="text-xs text-muted">
                Jurisdiction: {allowedBlocks.join(", ")}
              </span>
            </div>
            <h1 className="text-xl font-bold text-ink mt-1">
              Team Tasks Management ({teamTasks.length})
            </h1>
            <p className="text-xs text-muted">
              Filter team tasks by employee, location, disease/risk, status, priority, and due date. Update priority or deadlines as authorized.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="px-4 py-2 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Assign New Task</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchView("sup-dashboard")}
              className="px-3.5 py-2 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink"
            >
              Supervisor Overview
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search task or employee..."
              className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-borderline text-xs text-ink"
            />
          </div>

          <select
            aria-label="Filter by Disease or Risk"
            value={diseaseFilter}
            onChange={(e) => setDiseaseFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
          >
            <option value="all">All 4 Health Risks</option>
            <option value="malaria">Malaria</option>
            <option value="dengue">Dengue</option>
            <option value="diarrhoea">Diarrhoeal Disease</option>
            <option value="heat">Heat-Related Risk</option>
          </select>

          <select
            aria-label="Filter by Employee"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
          >
            <option value="all">All Employees</option>
            {employees.map((em) => (
              <option key={em.id} value={em.name}>
                {em.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Location Block"
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
          >
            <option value="all">All Authorized Blocks</option>
            {allowedBlocks.map((bId) => (
              <option key={bId} value={bId}>
                Block {bId}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress / Ack</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue / Escalated</option>
            <option value="needs_help">Needs Help</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            aria-label="Filter by Priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
          >
            <option value="all">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            aria-label="Filter by Due Date"
            value={dueFilter}
            onChange={(e) => setDueFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-borderline text-xs font-semibold text-ink bg-white"
          >
            <option value="all">All Due Dates</option>
            <option value="overdue">Overdue Only</option>
            <option value="due_soon">Due Within 24h</option>
          </select>
        </div>

        {/* Team Tasks Table */}
        <div className="bg-white rounded-card border border-borderline shadow-2xs overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-borderline bg-canvas/60 text-[11px] font-bold uppercase text-muted">
                <th className="py-3 px-4">Task ID, Risk & Title</th>
                <th className="py-3 px-3">Assigned Employee</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Due Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline text-xs">
              {teamTasks.map((t) => (
                <tr key={t.id} className="hover:bg-canvas/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center flex-wrap gap-1.5 font-bold text-ink">
                      <span className="font-mono text-purple">#{t.id}</span>
                      {getDiseaseBadge(t.disease_type, t.disease_label)}
                      <span>{t.title}</span>
                    </div>
                    <div className="text-[11px] text-muted truncate max-w-md mt-0.5">
                      {t.instructions || t.description}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-semibold text-ink">{t.owner}</td>
                  <td className="py-3 px-3 text-muted">{t.location_name || t.unit_name}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-light text-purple uppercase">
                      {t.priority || "High"}
                    </span>
                  </td>
                  <td className="py-3 px-3">{getStatusBadge(t)}</td>
                  <td className="py-3 px-3 text-muted">
                    {t.deadline ? new Date(t.deadline).toLocaleDateString() : "-"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTask(t);
                        setEditPriority(t.priority || "High");
                        setEditStatus(t.status);
                        setEditDeadline("");
                      }}
                      className="px-2.5 py-1 rounded-lg border border-borderline hover:bg-canvas text-xs font-semibold text-purple inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {modals}
      </div>
    );
  }

  // =========================================================================
  // VIEW A: MAIN SUPERVISOR OVERVIEW DASHBOARD
  // =========================================================================
  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-4 text-ink">
      {/* 1. SUPERVISOR PROFILE & JURISDICTION HEADER */}
      <section className="bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-purple text-white flex items-center justify-center font-bold shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-lg font-bold text-ink">{sup.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-light text-purple">
                {sup.designation || "Supervisor"}
              </span>
            </div>
            <div className="text-xs text-muted flex items-center flex-wrap gap-3">
              <span className="font-semibold text-ink flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-purple" />
                Active Location: {selectedLocation.breadcrumb}
              </span>
              <span>
                Authorized Blocks: <strong>{allowedBlocks.join(", ")}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={onChangeLocation}
            className="px-3.5 py-2 rounded-xl border border-borderline hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-purple" />
            <span>Change Location</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            className="px-4 py-2 rounded-xl bg-teal hover:bg-teal/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Task</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView("team-tasks")}
            className="px-4 py-2 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold shadow-2xs"
          >
            Open Team Tasks ({taskSummary.total || 0})
          </button>
        </div>
      </section>

      {/* 2. SUPERVISOR KPI SUMMARY */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs">
          <div className="text-[11px] text-muted font-semibold">Selected Location Risk</div>
          <div className="text-xl font-extrabold text-coral mt-1">{risk.category || "High"}</div>
          <div className="text-[11px] text-muted mt-0.5">{selectedLocation.block_name}</div>
        </div>

        <div className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs">
          <div className="text-[11px] text-muted font-semibold">Employees Managed</div>
          <div className="text-2xl font-bold text-ink mt-1">{employees.length}</div>
          <div className="text-[11px] text-muted mt-0.5">Active Mitanin workers</div>
        </div>

        <div className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs">
          <div className="text-[11px] text-muted font-semibold">Pending / In Progress</div>
          <div className="text-2xl font-bold text-amber mt-1">
            {(taskSummary.pending || 0) + (taskSummary.in_progress || 0)}
          </div>
          <div className="text-[11px] text-muted mt-0.5">Active field tasks</div>
        </div>

        <div className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs">
          <div className="text-[11px] text-muted font-semibold">Completed Tasks</div>
          <div className="text-2xl font-bold text-forest mt-1">{taskSummary.completed || 0}</div>
          <div className="text-[11px] text-muted mt-0.5">Closed in ledger</div>
        </div>

        <div className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs">
          <div className="text-[11px] text-muted font-semibold">Overdue / Escalated</div>
          <div className="text-2xl font-bold text-coral mt-1">{taskSummary.overdue || 0}</div>
          <div className="text-[11px] text-muted mt-0.5">Requires supervisor follow-up</div>
        </div>

        <div className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs">
          <div className="text-[11px] text-muted font-semibold">Reports Awaiting Review</div>
          <div className="text-2xl font-bold text-purple mt-1">
            {dashData?.reports_awaiting_review || 0}
          </div>
          <div className="text-[11px] text-muted mt-0.5">Submitted by Mitanins</div>
        </div>
      </section>

      {/* 2B. UNIFIED MULTI-DISEASE EARLY-WARNING OVERVIEW (4 HEALTH RISKS) */}
      {dashData?.multi_disease && (
        <MultiDiseaseOverview
          multiDisease={dashData.multi_disease}
          locationBreadcrumb={selectedLocation.breadcrumb}
          portalMode="supervisor"
          onSelectDiseaseDetail={(dType) => {
            if (onSelectDiseaseDetail) onSelectDiseaseDetail(dType);
          }}
        />
      )}

      {/* 3. EMPLOYEE-WISE TASK COMPLETION STATISTICS & HIGH-RISK ALERTS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Employees Under Supervisor Jurisdiction (col-span-8) */}
        <div className="lg:col-span-8 bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-borderline pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple" />
              <h2 className="text-base font-bold text-ink">
                Employees Under Jurisdiction & Task Completion Statistics
              </h2>
            </div>
            <span className="text-xs text-muted">{employees.length} Mitanins</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-borderline text-[11px] font-bold uppercase text-muted">
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Assigned Village</th>
                  <th className="py-2.5 px-2 text-center">Pending</th>
                  <th className="py-2.5 px-2 text-center">In Progress</th>
                  <th className="py-2.5 px-2 text-center">Overdue</th>
                  <th className="py-2.5 px-2 text-center">Completed</th>
                  <th className="py-2.5 px-3">Completion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderline">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-canvas/40">
                    <td className="py-3 px-3 font-bold text-ink">{emp.name}</td>
                    <td className="py-3 px-3 text-muted">
                      {emp.block_id} · {emp.village_id}
                    </td>
                    <td className="py-3 px-2 text-center font-semibold text-amber">
                      {emp.pending_tasks}
                    </td>
                    <td className="py-3 px-2 text-center font-semibold text-purple">
                      {emp.in_progress_tasks}
                    </td>
                    <td className="py-3 px-2 text-center font-semibold text-coral">
                      {emp.overdue_tasks}
                    </td>
                    <td className="py-3 px-2 text-center font-semibold text-forest">
                      {emp.completed_tasks} / {emp.total_tasks}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-canvas rounded-full overflow-hidden border border-borderline">
                          <div
                            className="h-full bg-forest rounded-full"
                            style={{ width: `${emp.completion_rate_pct}%` }}
                          />
                        </div>
                        <span className="font-bold text-ink">{emp.completion_rate_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* High-Risk Locations & Multi-Disease Active Alerts (col-span-4) */}
        <div className="lg:col-span-4 bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-borderline pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-coral" />
              <h2 className="text-base font-bold text-ink">Multi-Disease Alerts</h2>
            </div>
            <select
              aria-label="Filter Alerts by Disease"
              value={alertDiseaseFilter}
              onChange={(e) => setAlertDiseaseFilter(e.target.value)}
              className="px-2 py-1 rounded-lg border border-borderline text-[11px] font-bold text-ink bg-white"
            >
              <option value="all">All Risks</option>
              <option value="malaria">Malaria</option>
              <option value="dengue">Dengue</option>
              <option value="diarrhoea">Diarrhoea</option>
              <option value="heat">Heat Risk</option>
            </select>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {highRiskLocations
              .filter(
                (al: any) =>
                  alertDiseaseFilter === "all" || al.disease_type === alertDiseaseFilter
              )
              .map((al: any) => (
                <div
                  key={al.id}
                  className="p-3.5 rounded-xl border border-borderline bg-canvas/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center flex-wrap gap-1.5">
                      {getDiseaseBadge(al.disease_type, al.disease_label)}
                      <span className="font-bold text-xs text-ink">{al.unit_name}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        al.risk === "High" || al.risk === "Very High"
                          ? "bg-coral-light text-coral"
                          : "bg-amber-light text-amber"
                      }`}
                    >
                      {al.risk} Risk
                    </span>
                  </div>
                  <p className="text-[11px] text-muted">
                    {al.trigger_reason || al.details}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <span className="font-semibold text-purple">
                      Status: <strong className="uppercase">{al.status || "active"}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {al.status !== "acknowledged" && al.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => handleAlertStatusUpdate(al.id, "acknowledged")}
                          className="px-2 py-0.5 rounded bg-teal text-white font-bold"
                        >
                          Acknowledge
                        </button>
                      )}
                      {al.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => handleAlertStatusUpdate(al.id, "resolved")}
                          className="px-2 py-0.5 rounded bg-forest text-white font-bold"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* 4. FIELD REPORTS SUBMITTED BY EMPLOYEES (REVIEW WORKFLOW) */}
      <section className="bg-white rounded-card border border-borderline p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-borderline pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-teal" />
            <div>
              <h2 className="text-base font-bold text-ink">
                Field Reports Submitted by Employees ({reports.length})
              </h2>
              <p className="text-xs text-muted">
                Review multi-disease field observations, RDT/safe-water/heat tallies, and approve, reject, or request corrections
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="p-4 rounded-xl border border-borderline bg-canvas/30 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center flex-wrap gap-1.5">
                    {getDiseaseBadge(rep.disease_type, rep.disease_label)}
                    {rep.emerging_concern && (
                      <span className="px-1.5 py-0.5 rounded bg-coral text-white text-[9px] font-bold uppercase">
                        Emerging Concern
                      </span>
                    )}
                    <span className="font-bold text-sm text-ink">{rep.title}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                      rep.review_status === "approved"
                        ? "bg-forest-light text-forest"
                        : rep.review_status === "rejected"
                        ? "bg-coral-light text-coral"
                        : rep.review_status === "corrections_requested"
                        ? "bg-amber-light text-amber"
                        : "bg-purple-light text-purple"
                    }`}
                  >
                    {rep.review_status.replace("_", " ")}
                  </span>
                </div>

                <div className="text-xs text-muted">
                  Employee: <strong className="text-ink">{rep.employee_name}</strong> ·{" "}
                  {rep.location_name}
                </div>

                <div className="flex items-center flex-wrap gap-3 text-xs font-semibold text-ink pt-1">
                  <span>Homes: {rep.households_visited}</span>
                  <span>Checks/RDTs: {rep.rdt_conducted}</span>
                  <span className="text-amber">Suspected: {rep.suspected_cases || 0}</span>
                  <span className="text-coral">Positive: {rep.positive_cases}</span>
                  <span>Water sites: {rep.stagnant_water_sites}</span>
                  <span>Nets/ORS: {rep.nets_distributed}</span>
                </div>

                <p className="text-xs text-ink/90 bg-white p-2.5 rounded-lg border border-borderline mt-1">
                  {rep.observations}
                </p>

                {rep.review_notes && (
                  <div className="text-[11px] text-purple font-medium">
                    Reviewed by {rep.reviewer_name}: “{rep.review_notes}”
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-borderline">
                <button
                  type="button"
                  onClick={() => {
                    setReviewingReport(rep);
                    setReviewDecision("approved");
                    setReviewNotes(rep.review_notes || "Verified and approved.");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-forest text-white text-xs font-bold hover:bg-forest/90"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReviewingReport(rep);
                    setReviewDecision("corrections_requested");
                    setReviewNotes("");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber text-white text-xs font-bold hover:bg-amber/90"
                >
                  Request Corrections
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReviewingReport(rep);
                    setReviewDecision("rejected");
                    setReviewNotes("");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-coral text-white text-xs font-bold hover:bg-coral/90"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {modals}
    </div>
  );
}
