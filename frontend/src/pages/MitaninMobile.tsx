import { useState, useEffect, useMemo } from "react";
import { Check, ArrowLeft, WifiOff, MessageSquare } from "lucide-react";
import { useMeta } from "../hooks/useMeta";
import { useI18n } from "../i18n/I18nContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { VoiceTaskPlayer } from "../components/VoiceTaskPlayer";

interface MitaninMobileProps {
  onReturnToDistrict?: () => void;
  onLedgerUpdate?: () => void;
}

interface TaskItem {
  id: number;
  alert_id?: number;
  disease_type?: string;
  disease_label?: string;
  title: string;
  steps: string[];
  owner: string;
  deadline: string;
  status: "sent" | "acknowledged" | "in_progress" | "done" | "needs_help" | "escalated";
  created_at: string;
  updated_at: string;
  unit_id?: string;
  unit_name?: string;
  location_name?: string;
}

export function MitaninMobile({ onReturnToDistrict, onLedgerUpdate }: MitaninMobileProps) {
  const { meta } = useMeta();
  const { t: tr, localizeTask } = useI18n();
  // Navigation / Views: "home" | "detail" | "confirmation" | "sms"
  const [currentScreen, setCurrentScreen] = useState<"home" | "detail" | "confirmation" | "sms">("home");

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [diseaseFilter, setDiseaseFilter] = useState<string>("all");
  const [repliedAction, setRepliedAction] = useState<"done" | "needs_help" | null>(null);
  const [replyTime, setReplyTime] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Mitanin identity (Sample Asha)
  const mitaninName = "Asha";
  const fullNameMatch = "Asha";

  // Fetch open tasks assigned to Asha or fallback to all open
  const fetchMyTasks = () => {
    fetch("http://127.0.0.1:8000/tasks")
      .then((res) => res.json())
      .then((data: TaskItem[]) => {
        const seen = new Set<string>();
        const uniqueData: TaskItem[] = [];
        for (const item of data) {
          const key = `${(item.owner || "").toLowerCase()}::${(item.disease_type || "malaria").toLowerCase()}::${item.title.trim().toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueData.push(item);
          }
        }

        const ashaTasks = uniqueData.filter((t) =>
          t.owner.toLowerCase().includes(fullNameMatch.toLowerCase())
        );
        if (ashaTasks.length > 0) {
          setTasks(ashaTasks);
          if (!selectedTask) setSelectedTask(ashaTasks[0]);
        } else {
          setTasks(uniqueData);
          if (uniqueData.length > 0 && !selectedTask) setSelectedTask(uniqueData[0]);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchMyTasks();
  }, []);

  const activeTasks = useMemo(() => {
    const pending = tasks.filter(
      (t) =>
        t.status === "sent" ||
        t.status === "acknowledged" ||
        t.status === "in_progress" ||
        t.status === "needs_help"
    );
    const base = pending.length > 0 ? pending : tasks;
    if (diseaseFilter === "all") return base;
    return base.filter((t) => (t.disease_type || "malaria") === diseaseFilter);
  }, [tasks, diseaseFilter]);

  const nextTask = useMemo(() => {
    if (!selectedTask) return null;
    return activeTasks.find((t) => t.id !== selectedTask.id) || null;
  }, [activeTasks, selectedTask]);

  const [completionNotes, setCompletionNotes] = useState<string>("");

  const getReadableStatus = (st?: string) => {
    if (st === "done") return "Completed";
    if (st === "in_progress") return "In Progress";
    if (st === "acknowledged") return "Accepted";
    if (st === "needs_help") return "Blocked";
    return "Pending";
  };

  const handleReply = async (status: "acknowledged" | "in_progress" | "done" | "needs_help") => {
    if (!selectedTask) return;
    setSubmitting(true);

    try {
      const nowStr = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      setReplyTime(nowStr);

      const defaultNote =
        status === "done"
          ? "Mitanin marked completed from mobile phone."
          : status === "needs_help"
          ? "Mitanin marked task blocked / requested field assistance."
          : status === "in_progress"
          ? "Mitanin started field verification activity."
          : "Mitanin accepted task assignment.";

      const res = await fetch(`http://127.0.0.1:8000/tasks/${selectedTask.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          actor: selectedTask.owner || `Mitanin ${mitaninName} [SAMPLE]`,
          notes: completionNotes.trim() || defaultNote,
          completion_notes: completionNotes.trim() || undefined,
        }),
      });

      if (res.ok) {
        if (status === "done" || status === "needs_help") {
          setRepliedAction(status);
          setCurrentScreen("confirmation");
        } else {
          const updated = await res.json();
          setSelectedTask({ ...selectedTask, status: updated.status || status });
        }
        setCompletionNotes("");
        fetchMyTasks();
        if (onLedgerUpdate) onLedgerUpdate();
      }
    } catch {
      // Error handling
    } finally {
      setSubmitting(false);
    }
  };

  const getDeadlineLabel = (deadlineStr?: string) => {
    if (!deadlineStr) return "Due Friday";
    try {
      const d = new Date(deadlineStr);
      const day = d.toLocaleDateString("en-US", { weekday: "long" });
      return `Due ${day}`;
    } catch {
      return "Due Friday";
    }
  };

  const getDiseasePill = (diseaseType?: string, diseaseLabel?: string) => {
    const dt = (diseaseType || "malaria").toLowerCase();
    const label =
      diseaseLabel ||
      (dt === "dengue"
        ? "Dengue"
        : dt === "diarrhoea"
        ? "Diarrhoea"
        : dt === "heat"
        ? "Heat Risk"
        : "Malaria");
    const cls =
      dt === "dengue"
        ? "bg-purple-light text-purple"
        : dt === "diarrhoea"
        ? "bg-teal-light text-teal"
        : dt === "heat"
        ? "bg-amber-light text-amber"
        : "bg-coral-light text-coral";
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="py-4 px-4 bg-canvas min-h-full flex flex-col items-center justify-start select-none">
      {/* Top Helper Navigation / Mode Switcher */}
      <div className="w-full max-w-[390px] mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onReturnToDistrict && (
            <button
              onClick={onReturnToDistrict}
              className="px-3 py-1.5 rounded-xl border border-borderline bg-white hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-muted" />
              <span>District app</span>
            </button>
          )}

          {/* Quick tab switcher for inspection */}
          <div className="flex items-center bg-white border border-borderline rounded-xl p-0.5 shadow-2xs text-[11px] font-medium text-muted">
            <button
              onClick={() => setCurrentScreen("home")}
              className={`px-2 py-1 rounded-lg transition-colors ${
                currentScreen === "home"
                  ? "bg-[#EEEDFE] text-[#534AB7] font-bold"
                  : "hover:text-ink"
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => {
                if (activeTasks.length > 0 && !selectedTask) setSelectedTask(activeTasks[0]);
                setCurrentScreen("detail");
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                currentScreen === "detail"
                  ? "bg-[#EEEDFE] text-[#534AB7] font-bold"
                  : "hover:text-ink"
              }`}
            >
              Detail
            </button>
            <button
              onClick={() => setCurrentScreen("sms")}
              className={`px-2 py-1 rounded-lg transition-colors ${
                currentScreen === "sms"
                  ? "bg-[#EEEDFE] text-[#534AB7] font-bold"
                  : "hover:text-ink"
              }`}
            >
              SMS
            </button>
          </div>
        </div>

        <LanguageSelector compact />
      </div>

      {/* PHONE CONTAINER */}
      <div className="w-full max-w-[390px] bg-[#1E1B2E] p-3 rounded-[44px] shadow-2xl border-4 border-[#2D2942]">
        <div className="w-full bg-[#FAF9F5] rounded-[34px] overflow-hidden flex flex-col h-[660px] max-h-[78vh] border border-black/10 relative">
          {/* Speaker Notch */}
          <div className="h-6 bg-[#186443] shrink-0 flex justify-center items-center">
            <div className="w-20 h-1.5 bg-black/25 rounded-full" />
          </div>

          {/* SCREEN 1: HOME ("MY TASKS") */}
          {currentScreen === "home" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="bg-[#186443] px-5 py-2.5 text-white shrink-0 flex items-center justify-between">
                <h2 className="text-base font-bold tracking-tight">{tr("employee.my_tasks_title")}</h2>
                <span className="text-[11px] bg-white/15 px-2.5 py-0.5 rounded-full font-semibold">
                  {activeTasks.length} active
                </span>
              </div>

              <div className="px-4 pt-3.5 pb-2.5 bg-[#FAF9F5] border-b border-borderline/60 shrink-0 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-ink">
                      {tr("employee.welcome")}, {mitaninName}
                    </h3>
                    <p className="text-xs text-muted">
                      {activeTasks.length} {activeTasks.length === 1 ? "task" : "tasks"} this week
                    </p>
                  </div>

                  <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EBF5E9] text-[#27825C] text-[10px] font-semibold border border-[#27825C]/20"
                    title="Offline caching is planned"
                  >
                    <WifiOff className="w-3 h-3 text-[#27825C]" />
                    <span>Offline ready</span>
                  </div>
                </div>

                {/* Compact Disease Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {[
                    { id: "all", label: "All" },
                    { id: "malaria", label: "Malaria" },
                    { id: "dengue", label: "Dengue" },
                    { id: "diarrhoea", label: "Diarrhoea" },
                    { id: "heat", label: "Heat" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDiseaseFilter(f.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
                        diseaseFilter === f.id
                          ? "bg-[#186443] text-white"
                          : "bg-white text-muted border border-borderline hover:text-ink"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Task List Inside Phone Screen */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {activeTasks.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted bg-white rounded-2xl border border-borderline">
                    No tasks for this filter.
                  </div>
                ) : (
                  activeTasks.map((t, idx) => {
                    const isFirst = idx === 0;
                    const deadlineText = getDeadlineLabel(t.deadline);
                    const isMonday = idx === 1;
                    const locTask = localizeTask(t);

                    return (
                      <div
                        key={t.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isFirst
                            ? "bg-white border-[#186443]/40 shadow-sm"
                            : "bg-white border-borderline shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getDiseasePill(t.disease_type, t.disease_label)}
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3D6] text-[#A8650A]">
                              {isMonday ? "Due Monday" : deadlineText}
                            </span>
                          </div>
                          {t.status === "done" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF5E9] text-[#27825C]">
                              Done
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-ink leading-snug">
                          {locTask.title}
                        </h4>

                        <p className="text-[11px] text-muted mt-1">
                          {t.location_name ||
                            t.unit_name ||
                            `Sample ${
                              meta.geography_label
                                ? meta.geography_label.charAt(0).toUpperCase() +
                                  meta.geography_label.slice(1)
                                : "Unit"
                            } A`}{" "}
                          · Sector hamlets
                        </p>

                        {/* Voice Task Player on Mobile Card */}
                        <VoiceTaskPlayer task={t} />

                        <div className="pt-2.5">
                          <button
                            onClick={() => {
                              setSelectedTask(t);
                              setCurrentScreen("detail");
                            }}
                            className="w-full min-h-[48px] py-2.5 px-4 bg-[#186443] hover:bg-[#186443]/90 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 active:scale-98"
                          >
                            <span>Open task</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sticky Phone Footer link to SMS fallback preview */}
              <div className="py-2.5 px-4 bg-[#FAF9F5] border-t border-borderline/60 shrink-0 text-center">
                <button
                  onClick={() => setCurrentScreen("sms")}
                  className="text-xs font-semibold text-[#534AB7] hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>View plain SMS preview</span>
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 2: TASK DETAIL (LARGE BUTTONS "1 DONE" / "2 NEED HELP") */}
          {currentScreen === "detail" && selectedTask && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="bg-[#186443] px-5 py-3 text-white shrink-0 flex items-center justify-between">
                <button
                  onClick={() => setCurrentScreen("home")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h2 className="text-base font-bold tracking-tight">Health alert</h2>
                <div className="w-8" />
              </div>

              <div className="p-4 flex-1 overflow-y-auto flex flex-col justify-between space-y-4 min-h-0">
                <div className="space-y-3.5">
                  <div className="bg-[#FAF3E0] p-3.5 rounded-2xl border border-[#F3E7C4] space-y-1.5">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {getDiseasePill(selectedTask.disease_type, selectedTask.disease_label)}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/80 text-ink border border-borderline">
                          {getReadableStatus(selectedTask.status)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-[#A8650A]">
                        {getDeadlineLabel(selectedTask.deadline)} · Priority: High
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-ink leading-snug">
                      {localizeTask(selectedTask).title}
                    </h3>
                    <div className="text-[11px] text-muted font-medium">
                      Worker: <strong className="text-ink">{selectedTask.owner || "Mitanin Asha"}</strong> · Location:{" "}
                      <strong className="text-ink">{selectedTask.location_name || selectedTask.unit_name || "Sample Block A"}</strong>
                    </div>
                    <p className="text-xs text-ink/80 leading-relaxed">
                      {localizeTask(selectedTask).instructions}
                    </p>
                    <div className="text-[10px] text-[#186443] font-semibold pt-1 border-t border-[#F3E7C4]">
                      Preventive & operational field verification workflow only — does not provide clinical patient treatment instructions.
                    </div>
                  </div>

                  {/* Voice Task Player in Mobile Task Detail */}
                  <VoiceTaskPlayer task={selectedTask} defaultExpanded={true} />

                  {/* Simple Steps */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-ink">Simple field steps</h4>

                    <div className="space-y-2">
                      {(selectedTask.steps && selectedTask.steps.length > 0
                        ? selectedTask.steps
                        : ["Visit 10 homes", "Verify stagnant water & household check-in", "Tap Done when finished"]
                      ).map((stepText, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-borderline shadow-2xs"
                        >
                          <div className="w-6 h-6 rounded-full bg-[#EBF5E9] text-[#27825C] flex items-center justify-center text-xs font-bold shrink-0">
                            {sIdx + 1}
                          </div>
                          <span className="text-xs font-medium text-ink">{stepText}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Completion Notes Input */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-ink">
                      Field / Completion Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={completionNotes}
                      onChange={(e) => setCompletionNotes(e.target.value)}
                      placeholder="Add household count, container check, or blocker note..."
                      className="w-full px-3 py-2 rounded-xl border border-borderline bg-white text-xs text-ink"
                    />
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="space-y-2 pt-2 shrink-0">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleReply("acknowledged")}
                      disabled={submitting}
                      className="py-2 px-3 bg-white border border-borderline hover:bg-canvas text-ink text-xs font-bold rounded-xl shadow-2xs"
                    >
                      Accept Task
                    </button>
                    <button
                      onClick={() => handleReply("in_progress")}
                      disabled={submitting}
                      className="py-2 px-3 bg-[#EEEDFE] text-[#534AB7] text-xs font-bold rounded-xl shadow-2xs"
                    >
                      Mark In Progress
                    </button>
                  </div>
                  <button
                    onClick={() => handleReply("done")}
                    disabled={submitting}
                    className="w-full min-h-[50px] py-3 px-6 bg-[#186443] hover:bg-[#186443]/90 text-white text-base font-bold rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>1 Done (Completed)</span>
                  </button>

                  <button
                    onClick={() => handleReply("needs_help")}
                    disabled={submitting}
                    className="w-full min-h-[50px] py-3 px-6 bg-[#A8650A] hover:bg-[#A8650A]/90 text-white text-base font-bold rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>2 Need help (Blocked)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 3: CONFIRMATION SCREEN WITH NEXT TASK */}
          {/* ============================================================== */}
          {currentScreen === "confirmation" && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* App Bar */}
              <div className="bg-[#186443] px-5 py-3 text-white shrink-0 flex items-center justify-between">
                <h2 className="text-base font-bold tracking-tight">All done</h2>
              </div>

              {/* Body */}
              <div className="p-6 flex-1 overflow-y-auto flex flex-col justify-between items-center text-center space-y-6">
                <div className="space-y-5 my-auto w-full">
                  {/* Big Check Circle */}
                  <div className="w-20 h-20 rounded-full bg-[#EBF5E9] text-[#27825C] flex items-center justify-center mx-auto shadow-sm ring-8 ring-[#EBF5E9]/50">
                    <Check className="w-10 h-10 text-[#27825C]" />
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-ink">
                      Thank you, {mitaninName}
                    </h3>
                    <p className="text-xs text-muted mt-1 leading-relaxed max-w-xs mx-auto">
                      Marked {repliedAction === "done" ? "done" : "help requested"} at{" "}
                      {replyTime || "4:10 pm"}. Your supervisor can see it.
                    </p>
                  </div>

                  {/* Next Task Card */}
                  {nextTask && (
                    <div className="p-4 rounded-2xl border border-borderline bg-white shadow-2xs text-left space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted">
                        Next task
                      </span>
                      <h4 className="text-xs font-bold text-ink">{nextTask.title}</h4>
                      <div className="text-[11px] text-muted">
                        {getDeadlineLabel(nextTask.deadline)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Back to my tasks button (min-h-[56px]) */}
                <div className="w-full pt-4 shrink-0">
                  <button
                    onClick={() => setCurrentScreen("home")}
                    className="w-full min-h-[56px] py-4 px-6 bg-[#186443] hover:bg-[#186443]/90 text-white text-sm font-bold rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center cursor-pointer"
                  >
                    <span>Back to my tasks</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 4: PLAIN SMS PREVIEW (PROPOSED) */}
          {/* ============================================================== */}
          {currentScreen === "sms" && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* App Bar */}
              <div className="bg-[#2D2942] px-5 py-3 text-white shrink-0 flex items-center justify-between">
                <button
                  onClick={() => setCurrentScreen("home")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h2 className="text-base font-bold tracking-tight">Messages</h2>
                <div className="w-8" />
              </div>

              {/* Body */}
              <div className="p-5 flex-1 overflow-y-auto flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <div className="text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EEEDFE] text-[#534AB7]">
                      Plain SMS (proposed)
                    </span>
                  </div>

                  {/* Incoming SMS Bubble */}
                  <div className="bg-white p-4 rounded-2xl shadow-xs border border-borderline space-y-2 max-w-[92%]">
                    <p className="text-xs text-ink leading-relaxed font-mono">
                      MITANIN SIGNAL: Fever cases may rise in your area. Visit 10 homes, test fevers by Fri. Reply 1 = Done, 2 = Need help.
                    </p>
                  </div>

                  {/* Outgoing Reply Bubble (Simulated keypad reply) */}
                  <div className="flex justify-end">
                    <div className="bg-[#186443] text-white py-2 px-5 rounded-2xl text-xs font-mono font-bold shadow-xs">
                      1
                    </div>
                  </div>

                  {/* Confirmation SMS */}
                  <div className="bg-white p-3 rounded-2xl shadow-xs border border-borderline max-w-[92%]">
                    <p className="text-xs text-ink/80 font-mono">
                      Thank you. Task marked done.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-canvas rounded-xl border border-borderline text-[11px] text-muted text-center shrink-0">
                  Works on basic feature phones via GSM SMS gateway without requiring mobile data.
                </div>
              </div>
            </div>
          )}

          {/* Home Indicator Bar */}
          <div className="h-5 bg-[#FAF9F5] shrink-0 flex justify-center items-center pb-1">
            <div className="w-28 h-1 bg-black/20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
