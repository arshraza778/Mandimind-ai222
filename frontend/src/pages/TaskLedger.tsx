import { useState, useEffect, useMemo } from "react";
import { 
  Clock, 
  AlertTriangle, 
  RotateCcw, 
  FastForward,
  PhoneCall,
  Download,
  Filter
} from "lucide-react";
import { useMeta } from "../hooks/useMeta";

interface TaskLedgerProps {
  onRefreshNeeded?: () => void;
}

interface TaskEventItem {
  id: number;
  task_id: number;
  event: string;
  actor: string;
  timestamp: string;
  notes?: string;
}

interface TaskItem {
  id: number;
  alert_id?: number;
  title: string;
  steps: string[];
  owner: string;
  deadline: string;
  status: "sent" | "acknowledged" | "in_progress" | "done" | "needs_help" | "escalated";
  created_at: string;
  updated_at: string;
  completion_notes?: string;
  unit_id?: string;
  unit_name?: string;
  hours_left?: number | null;
  is_overdue?: boolean;
  clean_owner?: string;
  events?: TaskEventItem[];
}

export function TaskLedger({ onRefreshNeeded }: TaskLedgerProps) {
  const { meta } = useMeta();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskItem | null>(null);
  const [clockDisplay, setClockDisplay] = useState<string>("Wed 14 Oct, 09:01");
  const [clockAdvancing, setClockAdvancing] = useState<boolean>(false);

  // Filter states for Completion Ledger
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [blockFilter, setBlockFilter] = useState<string>("all");

  // Reassignment / deadline / status edit drawer state
  const [showReassignForm, setShowReassignForm] = useState<boolean>(false);
  const [editOwner, setEditOwner] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("acknowledged");
  const [editDeadline, setEditDeadline] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [savingUpdate, setSavingUpdate] = useState<boolean>(false);

  const escalationHours = meta.escalation_hours || 48;

  // Format simulated clock into display string: "Wed 14 Oct, 09:01"
  const formatClockDisplay = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "Wed 14 Oct, 09:01";
    }
  };

  // Fetch simulated clock
  const fetchClock = () => {
    fetch("http://127.0.0.1:8000/clock")
      .then((res) => res.json())
      .then((data) => {
        if (data.current_time) {
          setClockDisplay(formatClockDisplay(data.current_time));
        }
      })
      .catch(() => {});
  };

  // Fetch tasks list
  const fetchTasks = () => {
    fetch("http://127.0.0.1:8000/tasks")
      .then((res) => res.json())
      .then((data: TaskItem[]) => {
        setTasks(data);
        if (data.length > 0) {
          setSelectedTaskId((prev) => (prev && data.some((t) => t.id === prev) ? prev : data[0].id));
        }
      })
      .catch(() => {});
  };

  // Fetch detail & event history of selected task
  const fetchTaskDetail = (taskId: number) => {
    fetch(`http://127.0.0.1:8000/tasks/${taskId}`)
      .then((res) => res.json())
      .then((data: TaskItem) => {
        setSelectedTaskDetail(data);
        setEditOwner(data.owner || "");
        setEditStatus(data.status || "acknowledged");
        setEditDeadline(data.deadline ? data.deadline.slice(0, 16) : "");
        setEditNotes(data.completion_notes || "");
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchClock();
    fetchTasks();
  }, []);

  useEffect(() => {
    if (selectedTaskId) {
      fetchTaskDetail(selectedTaskId);
    }
  }, [selectedTaskId]);

  // Handle simulated clock advance
  const handleAdvanceClock = async (hours: number) => {
    setClockAdvancing(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/clock/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.current_time) {
          setClockDisplay(formatClockDisplay(data.current_time));
        }
        fetchTasks();
        if (selectedTaskId) fetchTaskDetail(selectedTaskId);
        if (onRefreshNeeded) onRefreshNeeded();
      }
    } catch {
      // Error handling
    } finally {
      setClockAdvancing(false);
    }
  };

  // Reset clock handler
  const handleResetClock = async () => {
    setClockAdvancing(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/clock/reset", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reset_time) {
          setClockDisplay(formatClockDisplay(data.reset_time));
        }
        fetchTasks();
        if (selectedTaskId) fetchTaskDetail(selectedTaskId);
        if (onRefreshNeeded) onRefreshNeeded();
      }
    } catch {
      // Error handling
    } finally {
      setClockAdvancing(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (blockFilter !== "all" && t.unit_id !== blockFilter) return false;
      if (ownerFilter.trim() && !(t.owner || "").toLowerCase().includes(ownerFilter.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [tasks, statusFilter, blockFilter, ownerFilter]);

  // Group tasks by status for Kanban columns
  const columns = useMemo(() => {
    const sent = filteredTasks.filter((t) => t.status === "sent");
    const acknowledged = filteredTasks.filter((t) => t.status === "acknowledged" || t.status === "in_progress");
    const needsHelp = filteredTasks.filter((t) => t.status === "needs_help");
    const escalated = filteredTasks.filter((t) => t.status === "escalated");
    const done = filteredTasks.filter((t) => t.status === "done");

    return {
      sent,
      acknowledged,
      needsHelp,
      escalated,
      done,
    };
  }, [filteredTasks]);

  // Top summary KPI metrics
  const doneCount = columns.done.length;
  const waitingReplyCount = columns.sent.length + columns.acknowledged.length;
  const needsHelpCount = columns.needsHelp.length;
  const escalatedCount = columns.escalated.length;

  // Simplified task short name (e.g. "Fever tests", "Spraying", "Screening")
  const getShortTaskName = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes("fever") || lower.includes("rdt")) return "Fever tests";
    if (lower.includes("spray") || lower.includes("irs")) return "Spraying";
    if (lower.includes("screen") || lower.includes("net") || lower.includes("llin")) return "Screening";
    return title.split(" - ")[0] || "Malaria task";
  };

  // Format event timeline timestamp
  const formatEventTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  // Clean event title
  const formatEventTitle = (eventStr: string, actor: string) => {
    const geoCap = meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit";
    if (eventStr === "task_created") {
      return `Task created by ${geoCap} supervisor`;
    }
    if (eventStr === "mitanin_reply_done") {
      return "Task completed on time";
    }
    if (eventStr === "mitanin_reply_needs_help") {
      return `Mitanin requested assistance (${actor})`;
    }
    if (eventStr === "auto_escalated_no_reply") {
      return "No reply after 48 hours";
    }
    if (eventStr === "escalated_to_district_officer") {
      return "Escalated to District officer";
    }
    if (eventStr === "status_changed_to_acknowledged") {
      return `Message acknowledged by ${actor}`;
    }
    return eventStr.replace(/_/g, " ");
  };

  // Reassignment & Status save handler
  const handleSaveLedgerUpdate = async () => {
    if (!selectedTaskId) return;
    setSavingUpdate(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/tasks/${selectedTaskId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: editOwner,
          status: editStatus,
          deadline: editDeadline ? new Date(editDeadline).toISOString() : undefined,
          notes: editNotes,
        }),
      });
      if (res.ok) {
        setShowReassignForm(false);
        fetchTasks();
        fetchTaskDetail(selectedTaskId);
        if (onRefreshNeeded) onRefreshNeeded();
      }
    } catch {
      // Error handling
    } finally {
      setSavingUpdate(false);
    }
  };

  // CSV Export handler
  const handleExportCsv = () => {
    window.open("http://127.0.0.1:8000/tasks/export-csv", "_blank");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-ink">
      {/* HEADER SECTION: TITLE + CLOCK CONTROLS */}
      <div className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Task Ledger</h1>
          <p className="text-xs text-muted mt-0.5">
            Frontline action pipeline · real-time escalation and response tracking
          </p>
        </div>

        {/* SIMULATED CLOCK CONTROL BAR */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Clock pill */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-light text-amber border border-amber/20 text-xs font-semibold shadow-xs">
            <Clock className="w-3.5 h-3.5 text-amber" />
            <span>Clock: {clockDisplay}</span>
          </div>

          {/* Advance 12h Button */}
          <button
            onClick={() => handleAdvanceClock(12)}
            disabled={clockAdvancing}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-ink transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            title="Advance simulated clock by 12 hours"
          >
            <FastForward className="w-3.5 h-3.5 text-muted" />
            <span>+12 h</span>
          </button>

          {/* Advance Escalation Window (48h) Button */}
          <button
            onClick={() => handleAdvanceClock(escalationHours)}
            disabled={clockAdvancing}
            className="px-3 py-1.5 rounded-xl border border-coral/30 bg-coral-light/40 hover:bg-coral-light text-xs font-semibold text-coral transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            title={`Advance clock past the ${escalationHours}h escalation threshold to trigger escalation`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-coral" />
            <span>+{escalationHours} h</span>
          </button>

          {/* Reset Clock Button */}
          <button
            onClick={handleResetClock}
            disabled={clockAdvancing}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-muted hover:text-ink transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            title="Reset simulated clock to anchor time"
          >
            <RotateCcw className="w-3.5 h-3.5 text-muted" />
            <span>Reset</span>
          </button>

          {/* Export Ledger CSV Button */}
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
            title="Export append-only Completion Ledger as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR FOR COMPLETION LEDGER */}
      <section
        aria-label="Ledger Filters"
        className="bg-white rounded-card-lg border border-borderline p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-ink">
          <Filter className="w-4 h-4 text-purple" />
          <span>Filter Pipeline Tasks</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-canvas border border-borderline rounded-xl px-3 py-2 font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple flex-1 sm:flex-none"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Pending (Sent)</option>
            <option value="acknowledged">Accepted (Acknowledged)</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Completed (Done)</option>
            <option value="needs_help">Blocked (Needs Help)</option>
            <option value="escalated">Escalated</option>
          </select>

          <select
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            className="bg-canvas border border-borderline rounded-xl px-3 py-2 font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple flex-1 sm:flex-none"
          >
            <option value="all">All Blocks</option>
            <option value="BLK_A">Sample Block A</option>
            <option value="BLK_B">Sample Block B</option>
            <option value="BLK_C">Sample Block C</option>
            <option value="BLK_D">Sample Block D</option>
            <option value="BLK_E">Sample Block E</option>
            <option value="BLK_F">Sample Block F</option>
          </select>

          <input
            type="text"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            placeholder="Search by worker name..."
            className="bg-canvas border border-borderline rounded-xl px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-purple flex-1 sm:w-56"
          />
        </div>
      </section>

      {/* ROW 1: FOUR SUMMARY TILES (Done, Waiting, Needs help, Escalated) */}
      <section aria-label="Task Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tile 1: Done */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Completed</span>
            <span className="w-2 h-2 rounded-full bg-forest" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-forest tabular-nums tracking-tight">
            {doneCount}
          </div>
          <div className="text-[11px] text-muted mt-1">Verified on schedule</div>
        </div>

        {/* Tile 2: Waiting for reply */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Waiting for reply</span>
            <span className="w-2 h-2 rounded-full bg-amber" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber tabular-nums tracking-tight">
            {waitingReplyCount}
          </div>
          <div className="text-[11px] text-muted mt-1">Within {escalationHours}h window</div>
        </div>

        {/* Tile 3: Needs help */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Needs assistance</span>
            <span className="w-2 h-2 rounded-full bg-purple" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-purple tabular-nums tracking-tight">
            {needsHelpCount}
          </div>
          <div className="text-[11px] text-muted mt-1">Worker requested support</div>
        </div>

        {/* Tile 4: Escalated */}
        <div className="bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Escalated to district</span>
            <span className="w-2 h-2 rounded-full bg-coral" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-coral tabular-nums tracking-tight">
            {escalatedCount}
          </div>
          <div className="text-[11px] text-muted mt-1">No reply after {escalationHours}h</div>
        </div>
      </section>

      {/* ROW 2: KANBAN BOARD (LEFT 9 COLS) vs AUDIT TRAIL PANEL (RIGHT 3 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================== */}
        {/* KANBAN BOARD: 5 STATUS COLUMNS (col-span-8 or 9) */}
        {/* ============================================================== */}
        <div className="lg:col-span-8 xl:col-span-9 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {/* COLUMN 1: SENT */}
          <div className="bg-canvas/60 rounded-2xl p-3 flex flex-col min-h-[460px] border border-borderline">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-borderline/80 px-1">
              <span className="text-xs font-bold text-ink">Sent</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-borderline text-muted">
                {columns.sent.length}
              </span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.sent.map((task) => {
                const isSelected = selectedTaskId === task.id;
                const hoursLeftText =
                  task.hours_left !== null && task.hours_left !== undefined
                    ? task.hours_left > 0
                      ? `${task.hours_left} h left`
                      : "Overdue"
                    : "38 h left";

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-xs border-l-4 border-l-amber ${
                      isSelected
                        ? "border-purple ring-2 ring-purple-light"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-snug">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} A`} · {task.clean_owner || "Asha"}
                    </div>
                    <div className="text-[11px] font-semibold text-amber mt-2">
                      {hoursLeftText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 2: ACKNOWLEDGED */}
          <div className="bg-canvas/60 rounded-2xl p-3 flex flex-col min-h-[460px] border border-borderline">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-borderline/80 px-1">
              <span className="text-xs font-bold text-purple">Accepted</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-light text-purple">
                {columns.acknowledged.length}
              </span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.acknowledged.map((task) => {
                const isSelected = selectedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-xs border-l-4 border-l-purple ${
                      isSelected
                        ? "border-purple ring-2 ring-purple-light"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-snug">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} E`} · {task.clean_owner || "Sunita"}
                    </div>
                    <div className="text-[11px] font-semibold text-purple mt-2">
                      Due Fri
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 3: NEEDS HELP */}
          <div className="bg-canvas/60 rounded-2xl p-3 flex flex-col min-h-[460px] border border-borderline">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-borderline/80 px-1">
              <span className="text-xs font-bold text-purple">Needs help</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-light text-purple">
                {columns.needsHelp.length}
              </span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.needsHelp.map((task) => {
                const isSelected = selectedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-xs border-l-4 border-l-purple ${
                      isSelected
                        ? "border-purple ring-2 ring-purple-light"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-snug">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} D`} · {task.clean_owner || "Meena"}
                    </div>
                    <div className="text-[11px] font-semibold text-purple mt-2">
                      Asked 2 h ago
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 4: ESCALATED */}
          <div className="bg-canvas/60 rounded-2xl p-3 flex flex-col min-h-[460px] border border-borderline">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-borderline/80 px-1">
              <span className="text-xs font-bold text-coral">Escalated</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-coral-light text-coral">
                {columns.escalated.length}
              </span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.escalated.map((task) => {
                const isSelected = selectedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-xs border-l-4 border-l-coral ${
                      isSelected
                        ? "border-coral ring-2 ring-coral-light"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-snug">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} C`} · {task.clean_owner || "Geeta"}
                    </div>
                    <div className="text-[11px] font-semibold text-coral mt-2">
                      No reply, 48 h
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 5: DONE */}
          <div className="bg-canvas/60 rounded-2xl p-3 flex flex-col min-h-[460px] border border-borderline">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-borderline/80 px-1">
              <span className="text-xs font-bold text-forest">Completed</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest-light text-forest">
                {columns.done.length}
              </span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.done.map((task, idx) => {
                const isSelected = selectedTaskId === task.id;
                const timingLabel = idx === 2 ? "1 day late" : "On time";
                const timingColor = idx === 2 ? "text-muted" : "text-forest";

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-xs border-l-4 border-l-forest ${
                      isSelected
                        ? "border-forest ring-2 ring-forest-light"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-snug">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} F`} · {task.clean_owner || "Lata"}
                    </div>
                    <div className={`text-[11px] font-semibold ${timingColor} mt-2`}>
                      {timingLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT AUDIT TRAIL PANEL (col-span-4 or 3) */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-card-lg border border-borderline p-5 shadow-xs flex flex-col justify-between min-h-[480px]">
          <div>
            {/* Header */}
            <div className="pb-3 border-b border-borderline/60 mb-4">
              <h3 className="text-sm font-bold text-ink">Audit Trail (Append-Only)</h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                {selectedTaskDetail
                  ? `Task #${selectedTaskDetail.id} · ${getShortTaskName(selectedTaskDetail.title)} · ${selectedTaskDetail.unit_name}`
                  : "Select a task"}
              </p>
            </div>

            {/* Event Timeline */}
            {selectedTaskDetail?.events && selectedTaskDetail.events.length > 0 ? (
              <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-borderline">
                {selectedTaskDetail.events.map((ev, idx) => {
                  const isEscalation =
                    ev.event.includes("escalat") || ev.event.includes("no_reply");
                  const dotColor = isEscalation ? "bg-coral" : "bg-purple";

                  return (
                    <div key={ev.id || idx} className="relative group">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full ${dotColor} ring-4 ring-white`}
                      />

                      <div>
                        <h4 className="text-xs font-bold text-ink leading-tight">
                          {formatEventTitle(ev.event, ev.actor)}
                        </h4>
                        <div className="text-[11px] text-muted mt-0.5">
                          {formatEventTimestamp(ev.timestamp)}
                        </div>
                        {ev.notes && (
                          <p className="text-[11px] text-ink/80 mt-1 bg-canvas p-2 rounded-lg border border-borderline/60">
                            {ev.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted text-xs">
                No audit events recorded for this task yet.
              </div>
            )}
          </div>

          {/* Reassignment / Deadline / Status Editor */}
          <div className="pt-4 border-t border-borderline/60 mt-4 space-y-2.5">
            {showReassignForm && selectedTaskDetail ? (
              <div className="p-4 rounded-xl bg-canvas border border-borderline space-y-3 text-xs">
                <div className="font-bold text-ink">Update Ledger Entry (#{selectedTaskDetail.id})</div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Reassign Owner</label>
                  <input
                    type="text"
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-borderline bg-white text-ink text-xs focus:outline-none focus:ring-1 focus:ring-purple"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-borderline bg-white text-ink text-xs focus:outline-none focus:ring-1 focus:ring-purple"
                  >
                    <option value="sent">Pending (Sent)</option>
                    <option value="acknowledged">Accepted (Acknowledged)</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Completed (Done)</option>
                    <option value="needs_help">Blocked (Needs Help)</option>
                    <option value="escalated">Escalated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Completion / Audit Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Record notes..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-borderline bg-white text-ink text-xs focus:outline-none focus:ring-1 focus:ring-purple"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleSaveLedgerUpdate}
                    disabled={savingUpdate}
                    className="flex-1 py-2 bg-purple text-white font-bold rounded-xl hover:bg-purple/90 transition-all text-xs"
                  >
                    {savingUpdate ? "Saving..." : "Append to Ledger"}
                  </button>
                  <button
                    onClick={() => setShowReassignForm(false)}
                    className="px-3 py-2 bg-white border border-borderline rounded-xl text-muted text-xs hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReassignForm(true)}
                className="w-full py-2.5 px-4 bg-forest hover:bg-forest/90 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call Back / Reassign / Update</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: TABULAR APPEND-ONLY COMPLETION LEDGER */}
      <section aria-label="Completion Ledger Table" className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-borderline/60 mb-4">
          <div>
            <h2 className="text-base font-bold text-ink">
              Accountable Completion Ledger
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Click any row to inspect its chronological append-only audit trail or record reassignment/completion notes.
            </p>
          </div>
          <span className="text-xs font-semibold text-purple bg-purple-light px-3 py-1 rounded-full self-start sm:self-auto">
            {filteredTasks.length} task records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted border-b border-borderline uppercase text-[11px] font-semibold bg-canvas/30">
                <th className="py-3 px-3.5">Alert ID</th>
                <th className="py-3 px-3.5">Task</th>
                <th className="py-3 px-3.5">Block</th>
                <th className="py-3 px-3.5">Assigned Owner</th>
                <th className="py-3 px-3.5">Deadline</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5">Completion Timestamp</th>
                <th className="py-3 px-3.5 text-right">Audit Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline/40">
              {filteredTasks.map((t) => {
                const isDone = t.status === "done";
                const isEscalated = t.status === "escalated";
                const isHelp = t.status === "needs_help";
                const isAck = t.status === "acknowledged" || t.status === "in_progress";
                
                const statusBadgeClass = isDone
                  ? "bg-forest-light text-forest"
                  : isEscalated
                  ? "bg-coral-light text-coral"
                  : isHelp
                  ? "bg-purple-light text-purple"
                  : isAck
                  ? "bg-purple-light text-purple"
                  : "bg-amber-light text-amber";

                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    className={`cursor-pointer transition-colors hover:bg-canvas/60 ${selectedTaskId === t.id ? "bg-purple-light/20" : ""}`}
                  >
                    <td className="py-3 px-3.5 font-bold text-purple">
                      {t.alert_id ? `Alert #${t.alert_id}` : "Direct"}
                    </td>
                    <td className="py-3 px-3.5 font-bold text-ink">
                      #{t.id} · {t.title}
                    </td>
                    <td className="py-3 px-3.5 text-muted">{t.unit_name || t.unit_id}</td>
                    <td className="py-3 px-3.5 text-ink font-medium">{t.owner}</td>
                    <td className="py-3 px-3.5 text-muted">
                      {t.deadline ? formatEventTimestamp(t.deadline) : "—"}
                    </td>
                    <td className="py-3 px-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusBadgeClass}`}>
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-muted">
                      {isDone ? formatEventTimestamp(t.updated_at) : "—"}
                    </td>
                    <td className="py-3 px-3.5 font-bold text-ink text-right">
                      {(t.events || []).length} events
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
