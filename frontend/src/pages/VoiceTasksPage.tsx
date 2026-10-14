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
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 text-ink" data-testid="voice-tasks-page">
      {/* High-Contrast Outdoor Header */}
      <div className="rounded-2xl bg-ink text-white p-6 sm:p-7 shadow-xs border border-borderline">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-purple-light text-xs font-bold uppercase tracking-wider">
              <Volume2 className="w-4 h-4 text-purple-light" />
              Mitanin Field Audio System · EN / हिन्दी / छत्तीसगढ़ी
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t("voice.page_title")}
            </h1>
            <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
              {t("voice.page_subtitle")}
            </p>
          </div>
          <div className="bg-white rounded-xl p-1.5 text-ink shadow-xs">
            <LanguageSelector />
          </div>
        </div>

        {/* Explicit Completion Safeguard Notice */}
        <div className="mt-5 rounded-xl bg-amber-light/20 border border-amber/40 px-4 py-2.5 text-xs sm:text-sm text-amber-light flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber shrink-0" />
          <span>{t("voice.explicit_completion_notice")}</span>
        </div>
      </div>

      {/* Search, Voice Filter & Disease Tabs */}
      <div className="rounded-card-lg bg-white border border-borderline p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("employee.search_tasks_placeholder")}
              aria-label={t("employee.search_tasks_placeholder")}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-borderline text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple bg-canvas/30"
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                diseaseFilter === d
                  ? "bg-purple text-white shadow-xs"
                  : "bg-canvas hover:bg-purple-light/40 border border-borderline text-ink"
              }`}
            >
              {d === "all" ? t("employee.filter_all") : localizeDisease(d)}
            </button>
          ))}
        </div>
      </div>

      {actionFeedback && (
        <div className="rounded-xl bg-forest-light border border-forest/30 px-4 py-3 text-xs sm:text-sm font-bold text-forest flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-forest shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* High-Contrast Field Task Cards */}
      {loading ? (
        <div className="rounded-card-lg bg-white border border-borderline p-8 text-center text-muted font-semibold text-xs">
          Loading Mitanin voice tasks...
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const loc = localizeTask(task);
            const isDone = (task.status || "").toLowerCase() === "done";
            return (
              <div
                key={task.id}
                className="rounded-card-lg bg-white border border-borderline shadow-xs p-5 sm:p-6 space-y-4"
                data-testid={`voice-task-card-${task.id}`}
              >
                {/* Top Metadata Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-borderline/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-teal text-white text-[10px] font-bold uppercase tracking-wider">
                      {loc.diseaseLabel}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        task.priority === "High" || task.priority === "Critical"
                          ? "bg-coral-light text-coral"
                          : "bg-amber-light text-amber"
                      }`}
                    >
                      {t("voice.priority_label")}: {localizePriority(task.priority)}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                      isDone
                        ? "bg-forest-light text-forest"
                        : "bg-canvas text-muted border border-borderline"
                    }`}
                  >
                    {localizeStatus(task.status)}
                  </span>
                </div>

                {/* Task Title & Instructions */}
                <div className="space-y-1.5">
                  <h2 className="text-lg sm:text-xl font-bold text-ink leading-snug">
                    {loc.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted font-normal leading-relaxed">
                    {loc.instructions}
                  </p>
                </div>

                {/* Location, Deadline & Safety Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-canvas/60 rounded-xl p-3.5 border border-borderline text-xs">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-teal shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider">
                        {t("voice.location_label")}
                      </div>
                      <div className="font-bold text-ink mt-0.5">{loc.locationLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider">
                        {t("voice.deadline_label")}
                      </div>
                      <div className="font-bold text-ink mt-0.5">{loc.deadlineFormatted}</div>
                    </div>
                  </div>
                </div>

                {/* Safety Callout */}
                <div className="rounded-xl bg-amber-light/40 border border-amber/30 p-3.5 text-xs text-ink flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold text-amber">{t("voice.safety_label")}: </strong>
                    <span>{loc.safety}</span>
                  </div>
                </div>

                {/* Voice Player */}
                <VoiceTaskPlayer task={task} defaultExpanded={true} largeOutdoorMode={true} />

                {/* Dictate Completion Notes + Explicit Action Buttons */}
                <div className="pt-3 border-t border-borderline/60 space-y-3">
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
                      className="flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl border border-borderline text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple bg-white"
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

                  {/* Explicit Task Workflow Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "acknowledge")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-canvas border border-borderline text-ink hover:bg-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple" />
                      <span>{t("employee.acknowledge_btn")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "start")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple text-white hover:bg-purple/90 text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>{t("employee.start_btn")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "complete")}
                      data-testid={`explicit-complete-task-${task.id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-forest text-white hover:bg-forest/90 text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t("employee.complete_btn")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExplicitTaskAction(task.id, "need_help")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber text-white hover:bg-amber/90 text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
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
