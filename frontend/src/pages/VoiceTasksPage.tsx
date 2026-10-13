import React, { useState, useEffect, useCallback } from "react";
import {
  Volume2,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldAlert,
  HelpCircle,
  PlayCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { LanguageSelector } from "../components/LanguageSelector";
import { VoiceTaskPlayer } from "../components/VoiceTaskPlayer";
import { VoiceInputButton } from "../components/VoiceInputButton";

const API_BASE = "http://127.0.0.1:8000";

interface VoiceTasksPageProps {
  authToken?: string | null;
  currentUser?: any;
  selectedLocation?: {
    district_id: string;
    block_id: string;
    village_id?: string | null;
  };
}

const REFERENCE_AWARENESS_TASK = {
  id: 901,
  disease_type: "malaria",
  title: "Scheduled Malaria Awareness & Field Report Visit",
  instructions:
    "Visit the assigned village, conduct the scheduled malaria awareness activity, and submit the field report before 4 PM.",
  priority: "High",
  district_id: "DIST_SAMPLE",
  block_id: "BLK_A",
  village_id: "VIL_A1",
  location_name: "Sample District · Sample Block A · Sample Village A1 (Sector 4 Hamlet)",
  deadline: "2026-10-12T16:00:00",
  status: "sent",
};

export const VoiceTasksPage: React.FC<VoiceTasksPageProps> = ({
  authToken,
  selectedLocation,
}) => {
  const { t, localizeTask, localizePriority, localizeStatus, localizeDisease } = useI18n();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [diseaseFilter, setDiseaseFilter] = useState<string>("all");
  const [completionNotesByTask, setCompletionNotesByTask] = useState<Record<number, string>>({});
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      if (authToken) {
        const res = await fetch(`${API_BASE}/employee/tasks`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.tasks) ? data.tasks : [];
          setTasks(list.length > 0 ? list : [REFERENCE_AWARENESS_TASK]);
          setLoading(false);
          return;
        }
      }
      // Fallback to public/demo tasks for selected block
      const blk = selectedLocation?.block_id || "BLK_A";
      const res = await fetch(`${API_BASE}/tasks?unit_id=${blk}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.tasks || [];
        setTasks([REFERENCE_AWARENESS_TASK, ...list]);
      } else {
        setTasks([REFERENCE_AWARENESS_TASK]);
      }
    } catch {
      setTasks([REFERENCE_AWARENESS_TASK]);
    } finally {
      setLoading(false);
    }
  }, [authToken, selectedLocation?.block_id]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleExplicitTaskAction = async (
    taskId: number,
    action: "acknowledge" | "start" | "complete" | "need_help"
  ) => {
    setActionFeedback(null);
    const notes = completionNotesByTask[taskId] || "";

    if (authToken && taskId !== 901) {
      try {
        const res = await fetch(`${API_BASE}/employee/tasks/${taskId}/action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            action,
            notes: notes || `Updated via Voice Tasks explicit ${action} button.`,
            completion_notes: action === "complete" ? notes || "Completed field visit." : undefined,
          }),
        });
        if (res.ok) {
          setActionFeedback(`Task #${taskId} updated (${action}).`);
          fetchTasks();
          return;
        }
      } catch {
        // fallback to local state update for prototype demo task
      }
    }

    const statusMap: Record<string, string> = {
      acknowledge: "acknowledged",
      start: "in_progress",
      complete: "done",
      need_help: "needs_help",
    };
    setTasks((prev) =>
      prev.map((item) =>
        item.id === taskId ? { ...item, status: statusMap[action] || item.status } : item
      )
    );
    setActionFeedback(`Task #${taskId} status explicitly updated to '${statusMap[action]}'.`);
  };

  const filteredTasks = tasks.filter((task) => {
    if (diseaseFilter !== "all" && (task.disease_type || "malaria").toLowerCase() !== diseaseFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const loc = localizeTask(task);
    const q = searchQuery.toLowerCase();
    return (
      loc.title.toLowerCase().includes(q) ||
      loc.instructions.toLowerCase().includes(q) ||
      loc.locationLabel.toLowerCase().includes(q) ||
      String(task.title || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6" data-testid="voice-tasks-page">
      {/* High-Contrast Outdoor Header */}
      <div className="rounded-2xl bg-slate-900 text-white p-6 shadow-md border-2 border-teal-500">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400 text-teal-200 text-xs font-bold uppercase tracking-wider">
              <Volume2 className="w-4 h-4" />
              Mitanin Field Audio System · EN / हिन्दी / छत्तीसगढ़ी
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t("voice.page_title")}
            </h1>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              {t("voice.page_subtitle")}
            </p>
          </div>
          <div className="bg-white rounded-xl p-2 text-slate-900">
            <LanguageSelector />
          </div>
        </div>

        {/* Explicit Completion Safeguard Notice */}
        <div className="mt-4 rounded-xl bg-amber-500/20 border border-amber-400/60 px-4 py-2.5 text-xs sm:text-sm text-amber-100 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0" />
          <span>{t("voice.explicit_completion_notice")}</span>
        </div>
      </div>

      {/* Search, Voice Filter & Disease Tabs */}
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("employee.search_tasks_placeholder")}
              aria-label={t("employee.search_tasks_placeholder")}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-300 text-sm font-medium focus:border-teal-700 focus:outline-none"
            />
          </div>
          <VoiceInputButton
            size="md"
            onTranscript={(text) => setSearchQuery(text)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {["all", "malaria", "dengue", "diarrhoea", "heat"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDiseaseFilter(d)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                diseaseFilter === d
                  ? "bg-teal-800 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-800"
              }`}
            >
              {d === "all" ? t("employee.filter_all") : localizeDisease(d)}
            </button>
          ))}
        </div>
      </div>

      {actionFeedback && (
        <div className="rounded-xl bg-emerald-50 border-2 border-emerald-400 px-4 py-3 text-sm font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* High-Contrast Field Task Cards */}
      {loading ? (
        <div className="rounded-2xl bg-white border-2 border-slate-200 p-8 text-center text-slate-600 font-semibold">
          Loading Mitanin voice tasks...
        </div>
      ) : (
        <div className="space-y-5">
          {filteredTasks.map((task) => {
            const loc = localizeTask(task);
            const isDone = (task.status || "").toLowerCase() === "done";
            return (
              <div
                key={task.id}
                className="rounded-2xl bg-white border-2 border-slate-300 shadow-sm p-5 sm:p-6 space-y-4"
                data-testid={`voice-task-card-${task.id}`}
              >
                {/* Top Metadata Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-lg bg-teal-900 text-white text-xs sm:text-sm font-extrabold uppercase">
                      {loc.diseaseLabel}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-extrabold ${
                        task.priority === "High" || task.priority === "Critical"
                          ? "bg-rose-100 text-rose-900 border border-rose-300"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}
                    >
                      {t("voice.priority_label")}: {localizePriority(task.priority)}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-bold ${
                      isDone
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-slate-100 text-slate-800 border border-slate-300"
                    }`}
                  >
                    {localizeStatus(task.status)}
                  </span>
                </div>

                {/* Large High-Contrast Task Title & Instructions */}
                <div className="space-y-2">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 leading-snug">
                    {loc.title}
                  </h2>
                  <p className="text-base sm:text-lg text-slate-800 font-medium leading-relaxed">
                    {loc.instructions}
                  </p>
                </div>

                {/* Location, Deadline & Safety Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase">
                        {t("voice.location_label")}
                      </div>
                      <div className="font-bold text-slate-900">{loc.locationLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase">
                        {t("voice.deadline_label")}
                      </div>
                      <div className="font-bold text-slate-900">{loc.deadlineFormatted}</div>
                    </div>
                  </div>
                </div>

                {/* Safety Callout */}
                <div className="rounded-xl bg-amber-50 border-2 border-amber-200 p-3.5 text-sm text-amber-950 flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">{t("voice.safety_label")}: </strong>
                    <span>{loc.safety}</span>
                  </div>
                </div>

                {/* Prominent Voice Player with Speed & Language Controls */}
                <VoiceTaskPlayer task={task} defaultExpanded={true} largeOutdoorMode={true} />

                {/* Dictate Completion Notes + Explicit Action Buttons */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={completionNotesByTask[task.id] || ""}
                      onChange={(e) =>
                        setCompletionNotesByTask((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                      placeholder={t("employee.observations_label")}
                      aria-label={t("employee.observations_label")}
                      className="flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 text-sm font-medium"
                    />
                    <VoiceInputButton
                      size="md"
                      onTranscript={(spoken) =>
                        setCompletionNotesByTask((prev) => ({
                          ...prev,
                          [task.id]: prev[task.id] ? `${prev[task.id]} ${spoken}` : spoken,
                        }))
                      }
                    />
                  </div>

                  {/* Large Explicit Task Workflow Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "acknowledge")}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{t("employee.acknowledge_btn")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "start")}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold cursor-pointer"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>{t("employee.start_btn")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "complete")}
                      data-testid={`explicit-complete-task-${task.id}`}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t("employee.complete_btn")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "need_help")}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold cursor-pointer"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>{t("employee.need_help_btn")}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
