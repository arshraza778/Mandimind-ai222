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

  // Initial load
  useEffect(() => {
    fetchClock();
    fetchTasks();
  }, []);

  // Update task detail when selectedTaskId changes
  useEffect(() => {
    if (selectedTaskId) {
      fetchTaskDetail(selectedTaskId);
    }
  }, [selectedTaskId]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (ownerFilter.trim()) params.set("owner", ownerFilter.trim());
    if (blockFilter !== "all") params.set("block_id", blockFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    window.open(`http://127.0.0.1:8000/tasks/export-csv${qs}`, "_blank");
  };

  const handleSaveLedgerUpdate = async () => {
    if (!selectedTaskDetail) return;
    setSavingUpdate(true);
    try {
      const payload: Record<string, any> = {
        status: editStatus,
        owner: editOwner,
        actor: "Supervisor [SAMPLE]",
        notes: editNotes || `Ledger update for task #${selectedTaskDetail.id}`,
        completion_notes: editNotes || undefined,
      };
      if (editDeadline) {
        payload.deadline = new Date(editDeadline).toISOString();
      }
      const res = await fetch(`http://127.0.0.1:8000/tasks/${selectedTaskDetail.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowReassignForm(false);
        fetchTasks();
        fetchTaskDetail(selectedTaskDetail.id);
        if (onRefreshNeeded) onRefreshNeeded();
      }
    } catch {
      // ignore
    } finally {
      setSavingUpdate(false);
    }
  };

  // Advance clock handler
  const handleAdvanceClock = async (hours: number) => {
    setClockAdvancing(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/clock/advance?hours=${hours}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.new_time) {
          setClockDisplay(formatClockDisplay(data.new_time));
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* HEADER SECTION: TITLE + CLOCK CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-borderline/60">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Task ledger</h1>
          <p className="text-xs text-muted">
            Frontline action pipeline · real-time escalation and response tracking
          </p>
        </div>

        {/* SIMULATED CLOCK CONTROL BAR */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Clock pill */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FEF3D6] text-[#A8650A] border border-[#FEF3D6] text-xs font-semibold shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-[#A8650A]" />
            <span>Simulated clock: {clockDisplay}</span>
          </div>

          {/* Advance 12h Button */}
          <button
            onClick={() => handleAdvanceClock(12)}
            disabled={clockAdvancing}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-ink transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
            title="Advance simulated clock by 12 hours"
          >
            <FastForward className="w-3.5 h-3.5 text-muted" />
            <span>+12 h</span>
          </button>

          {/* Advance Escalation Window (48h) Button */}
          <button
            onClick={() => handleAdvanceClock(escalationHours)}
            disabled={clockAdvancing}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-[#C8472A] transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
            title={`Advance clock past the ${escalationHours}h escalation threshold to trigger escalation`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#C8472A]" />
            <span>+{escalationHours} h</span>
          </button>

          {/* Reset Clock Button */}
          <button
            onClick={handleResetClock}
            disabled={clockAdvancing}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-muted hover:text-ink transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
            title="Reset simulated clock to anchor time"
          >
            <RotateCcw className="w-3.5 h-3.5 text-muted" />
            <span>Reset</span>
          </button>

          {/* Export Ledger CSV Button */}
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 rounded-xl bg-[#534AB7] hover:bg-[#534AB7]/90 text-white text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5"
            title="Export append-only Completion Ledger as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Ledger CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR FOR COMPLETION LEDGER */}
      <section
        aria-label="Ledger Filters"
        className="bg-white rounded-card border border-borderline p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-ink">
          <Filter className="w-3.5 h-3.5 text-purple" />
          <span>Completion Ledger Filters (Alert → Task → Owner → Deadline → Status → Completion Timestamp)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-canvas border border-borderline rounded-lg px-2.5 py-1.5 font-medium text-ink"
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
            className="bg-canvas border border-borderline rounded-lg px-2.5 py-1.5 font-medium text-ink"
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
            placeholder="Filter by owner (e.g. Asha)..."
            className="bg-canvas border border-borderline rounded-lg px-2.5 py-1.5 text-ink placeholder:text-muted"
          />
        </div>
      </section>

      {/* ROW 1: FOUR SUMMARY TILES (Done, Waiting, Needs help, Escalated) */}
      <section aria-label="Task Summary" className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Tile 1: Done */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-muted">Done</span>
          <div className="mt-2 text-3xl font-extrabold text-[#27825C] tracking-tight">
            {doneCount}
          </div>
        </div>

        {/* Tile 2: Waiting for reply */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-muted">Waiting for reply</span>
          <div className="mt-2 text-3xl font-extrabold text-[#A8650A] tracking-tight">
            {waitingReplyCount}
          </div>
        </div>

        {/* Tile 3: Needs help */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-muted">Needs help</span>
          <div className="mt-2 text-3xl font-extrabold text-[#534AB7] tracking-tight">
            {needsHelpCount}
          </div>
        </div>

        {/* Tile 4: Escalated */}
        <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-muted">Escalated</span>
          <div className="mt-2 text-3xl font-extrabold text-[#C8472A] tracking-tight">
            {escalatedCount}
          </div>
        </div>
      </section>

      {/* ROW 2: KANBAN BOARD (LEFT 9 COLS) vs AUDIT TRAIL PANEL (RIGHT 3 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ============================================================== */}
        {/* KANBAN BOARD: 5 STATUS COLUMNS (col-span-9) */}
        {/* ============================================================== */}
        <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* COLUMN 1: SENT */}
          <div className="bg-canvas/50 rounded-2xl p-2.5 flex flex-col min-h-[460px] border border-borderline/60">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-borderline/60 px-1">
              <span className="text-xs font-bold text-ink">Sent</span>
              <span className="text-xs font-semibold text-muted">{columns.sent.length}</span>
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
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-2xs border-l-4 border-l-[#A8650A] ${
                      isSelected
                        ? "border-[#534AB7] ring-2 ring-[#EEEDFE]"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-tight">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} A`} · {task.clean_owner || "Asha"}
                    </div>
                    <div className="text-[11px] font-semibold text-[#A8650A] mt-2">
                      {hoursLeftText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 2: ACKNOWLEDGED */}
          <div className="bg-canvas/50 rounded-2xl p-2.5 flex flex-col min-h-[460px] border border-borderline/60">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-borderline/60 px-1">
              <span className="text-xs font-bold text-[#534AB7]">Acknowledged</span>
              <span className="text-xs font-semibold text-muted">{columns.acknowledged.length}</span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.acknowledged.map((task) => {
                const isSelected = selectedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-2xs border-l-4 border-l-[#534AB7] ${
                      isSelected
                        ? "border-[#534AB7] ring-2 ring-[#EEEDFE]"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-tight">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} E`} · {task.clean_owner || "Sunita"}
                    </div>
                    <div className="text-[11px] font-semibold text-[#534AB7] mt-2">
                      Due Fri
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 3: NEEDS HELP */}
          <div className="bg-canvas/50 rounded-2xl p-2.5 flex flex-col min-h-[460px] border border-borderline/60">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-borderline/60 px-1">
              <span className="text-xs font-bold text-[#6D28D9]">Needs help</span>
              <span className="text-xs font-semibold text-muted">{columns.needsHelp.length}</span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.needsHelp.map((task) => {
                const isSelected = selectedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-2xs border-l-4 border-l-[#6D28D9] ${
                      isSelected
                        ? "border-[#534AB7] ring-2 ring-[#EEEDFE]"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-tight">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} D`} · {task.clean_owner || "Meena"}
                    </div>
                    <div className="text-[11px] font-semibold text-[#6D28D9] mt-2">
                      Asked 2 h ago
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 4: ESCALATED */}
          <div className="bg-canvas/50 rounded-2xl p-2.5 flex flex-col min-h-[460px] border border-borderline/60">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-borderline/60 px-1">
              <span className="text-xs font-bold text-[#C8472A]">Escalated</span>
              <span className="text-xs font-semibold text-muted">{columns.escalated.length}</span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.escalated.map((task) => {
                const isSelected = selectedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-2xs border-l-4 border-l-[#C8472A] ${
                      isSelected
                        ? "border-[#C8472A] ring-2 ring-[#FCEBE8]"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-tight">
                      {getShortTaskName(task.title)}
                    </h4>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {task.unit_name || `${meta.geography_label ? meta.geography_label.charAt(0).toUpperCase() + meta.geography_label.slice(1) : "Unit"} C`} · {task.clean_owner || "Geeta"}
                    </div>
                    <div className="text-[11px] font-semibold text-[#C8472A] mt-2">
                      No reply, 48 h
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 5: DONE */}
          <div className="bg-canvas/50 rounded-2xl p-2.5 flex flex-col min-h-[460px] border border-borderline/60">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-borderline/60 px-1">
              <span className="text-xs font-bold text-[#27825C]">Done</span>
              <span className="text-xs font-semibold text-muted">{columns.done.length}</span>
            </div>

            <div className="space-y-2 flex-1">
              {columns.done.map((task, idx) => {
                const isSelected = selectedTaskId === task.id;
                const timingLabel = idx === 2 ? "1 day late" : "On time";
                const timingColor = idx === 2 ? "text-muted" : "text-[#27825C]";

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 rounded-xl border bg-white transition-all cursor-pointer shadow-2xs border-l-4 border-l-[#27825C] ${
                      isSelected
                        ? "border-[#27825C] ring-2 ring-[#EBF5E9]"
                        : "border-borderline hover:border-borderline/80"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-ink leading-tight">
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
        {/* RIGHT AUDIT TRAIL PANEL (col-span-3) */}
        {/* ============================================================== */}
        <div className="lg:col-span-3 bg-white rounded-card-lg border border-borderline p-5 shadow-2xs flex flex-col justify-between min-h-[480px]">
          <div>
            {/* Header */}
            <div className="pb-3 border-b border-borderline/60 mb-4">
              <h3 className="text-sm font-bold text-ink">Audit trail (append-only)</h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                {selectedTaskDetail
                  ? `Task #${selectedTaskDetail.id} · ${getShortTaskName(selectedTaskDetail.title)} · ${selectedTaskDetail.unit_name}`
                  : "Select a task"}
              </p>
            </div>

            {/* Event Timeline */}
            {selectedTaskDetail?.events && selectedTaskDetail.events.length > 0 ? (
              <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-borderline/80">
                {selectedTaskDetail.events.map((ev, idx) => {
                  const isEscalation =
                    ev.event.includes("escalat") || ev.event.includes("no_reply");
                  const dotColor = isEscalation ? "bg-[#C8472A]" : "bg-[#534AB7]";

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
                          <p className="text-[11px] text-ink/75 mt-1 bg-canvas/60 p-2 rounded-lg border border-borderline/40">
                            {ev.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-muted text-xs">
                No audit events recorded for this task yet.
              </div>
            )}
          </div>

          {/* Reassignment / Deadline / Status Editor */}
          <div className="pt-4 border-t border-borderline/60 mt-4 space-y-2.5">
            {showReassignForm && selectedTaskDetail ? (
              <div className="p-3 rounded-xl bg-canvas border border-borderline space-y-2 text-xs">
                <div className="font-bold text-ink">Update Ledger Entry (#{selectedTaskDetail.id})</div>
                <div>
                  <label className="block text-[11px] text-muted mb-0.5">Reassign Owner</label>
                  <input
                    type="text"
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-borderline bg-white text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-0.5">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-borderline bg-white text-ink"
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
                  <label className="block text-[11px] text-muted mb-0.5">Completion / Audit Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Record reassignment or completion note..."
                    className="w-full px-2 py-1 rounded border border-borderline bg-white text-ink"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleSaveLedgerUpdate}
                    disabled={savingUpdate}
                    className="flex-1 py-1.5 bg-[#534AB7] text-white font-bold rounded-lg hover:bg-[#534AB7]/90"
                  >
                    {savingUpdate ? "Saving..." : "Append to Ledger"}
                  </button>
                  <button
                    onClick={() => setShowReassignForm(false)}
                    className="px-2.5 py-1.5 bg-white border border-borderline rounded-lg text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReassignForm(true)}
                className="w-full py-2.5 px-4 bg-[#186443] hover:bg-[#186443]/90 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call back / reassign / update ledger</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: TABULAR APPEND-ONLY COMPLETION LEDGER */}
      <section aria-label="Completion Ledger Table" className="bg-white rounded-card border border-borderline p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-borderline/60 mb-3">
          <div>
            <h2 className="text-base font-bold text-ink">
              Accountable Completion Ledger (Alert → Task → Owner → Deadline → Status → Completion Timestamp)
            </h2>
            <p className="text-xs text-muted">
              Click any row to inspect its chronological append-only audit trail or record reassignment/completion notes.
            </p>
          </div>
          <span className="text-xs font-semibold text-purple bg-purple-light px-2.5 py-1 rounded-full">
            {filteredTasks.length} task record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted border-b border-borderline/60 uppercase text-[11px]">
                <th className="py-2.5 px-3">Alert ID</th>
                <th className="py-2.5 px-3">Task</th>
                <th className="py-2.5 px-3">Block</th>
                <th className="py-2.5 px-3">Assigned Owner</th>
                <th className="py-2.5 px-3">Deadline</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Completion Timestamp</th>
                <th className="py-2.5 px-3">Audit Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline/40">
              {filteredTasks.map((t) => {
                const isDone = t.status === "done";
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    className={`cursor-pointer hover:bg-canvas/60 ${selectedTaskId === t.id ? "bg-purple-light/20" : ""}`}
                  >
                    <td className="py-2.5 px-3 font-semibold text-purple">
                      {t.alert_id ? `Alert #${t.alert_id}` : "Direct"}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-ink">
                      #{t.id} · {t.title}
                    </td>
                    <td className="py-2.5 px-3 text-muted">{t.unit_name || t.unit_id}</td>
                    <td className="py-2.5 px-3 text-ink font-medium">{t.owner}</td>
                    <td className="py-2.5 px-3 text-muted">
                      {t.deadline ? formatEventTimestamp(t.deadline) : "-"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-canvas border border-borderline text-ink">
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">
                      {isDone ? formatEventTimestamp(t.updated_at) : "—"}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-ink">
                      {(t.events || []).length} event(s)
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
