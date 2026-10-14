import { useState, useEffect } from "react";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  ReferenceLine 
} from "recharts";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { useMeta } from "../hooks/useMeta";
import { AssignTaskModal } from "../components/AssignTaskModal";

interface AlertDetailProps {
  initialAlertId?: number;
  onNavigateBack?: () => void;
  onTaskCreated?: () => void;
  onNavigateToAssignTask?: (alertId: number) => void;
}

export function AlertDetail({
  initialAlertId = 1,
  onNavigateBack,
  onTaskCreated,
  onNavigateToAssignTask,
}: AlertDetailProps) {
  const { meta } = useMeta();
  const [alertsList, setAlertsList] = useState<any[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<number>(initialAlertId);
  const [alert, setAlert] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);

  // Fetch available alerts for switcher / breadcrumbs
  useEffect(() => {
    fetch("http://127.0.0.1:8000/alerts")
      .then((res) => res.json())
      .then((data) => {
        setAlertsList(data);
        if (data.length > 0 && !selectedAlertId) {
          setSelectedAlertId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch specific alert detail
  const fetchDetail = (id: number) => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/alerts/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setAlert(data);
        setFeedbackStatus(data.status);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedAlertId) {
      fetchDetail(selectedAlertId);
    }
  }, [selectedAlertId]);

  // Handle Feedback / Human Review (Acknowledge, Snooze, or False Alarm)
  const handleFeedback = async (action: "acknowledged" | "snooze" | "false_alarm") => {
    if (!alert) return;
    try {
      const notesMap: Record<string, string> = {
        acknowledged: "Reviewed and acknowledged by supervisor for operational response.",
        snooze: "Snoozed by district officer.",
        false_alarm: "Marked as false alarm by district officer.",
      };
      const res = await fetch(`http://127.0.0.1:8000/alerts/${alert.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: notesMap[action],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedbackStatus(data.action);
        if (alert) {
          setAlert({ ...alert, status: data.action });
        }
      }
    } catch {}
  };

  if (loading && !alert) {
    return (
      <div className="p-8 text-center text-muted text-sm">
        Loading alert intelligence...
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="p-8 text-center text-muted text-sm">
        Alert not found. Please select an alert from the overview.
      </div>
    );
  }

  const isHighRisk = alert.risk === "High";
  const isMedRisk = alert.risk === "Medium";
  const riskChipColor = isHighRisk
    ? "bg-coral-light text-coral"
    : isMedRisk
    ? "bg-amber-light text-amber"
    : "bg-forest-light text-forest";

  const isWeatherModel = alert.method_used === "weather_model";
  const chartData = alert.forecast_chart || [];
  const confidenceBars = alert.confidence_bars || (alert.confidence >= 0.8 ? 3 : alert.confidence >= 0.7 ? 2 : 1);
  const confidenceLabel = alert.confidence_label || (confidenceBars === 3 ? "High" : confidenceBars === 2 ? "Medium" : "Low");
  const isReviewed = feedbackStatus === "acknowledged" || alert.status === "acknowledged" || (alert.tasks && alert.tasks.length > 0);
  const sourceLabel = isWeatherModel ? "Weather-informed forecast" : "Seasonal baseline / surveillance rule";
  const skillGateBadge = isWeatherModel ? "Skill gate: Pass" : "Skill gate: Fail (baseline fallback)";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto text-ink">
      {/* CARD 1: TOP ALERT SUMMARY & ACTION HEADER */}
      <section aria-label="Alert Header" className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            {/* Breadcrumb & Switcher */}
            <div className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
              <button 
                onClick={onNavigateBack}
                className="hover:text-purple transition-colors font-medium"
              >
                Alerts
              </button>
              <ChevronRight className="w-3 h-3 text-muted" />
              <span className="text-ink font-semibold">Sample District · {alert.unit_name}</span>

              {/* Selector to switch between other active alerts */}
              {alertsList.length > 1 && (
                <div className="ml-3 inline-flex items-center gap-1">
                  <span className="text-[11px] text-muted">Switch:</span>
                  <select
                    value={selectedAlertId}
                    onChange={(e) => setSelectedAlertId(Number(e.target.value))}
                    className="text-xs bg-canvas border border-borderline rounded-md px-1.5 py-0.5 font-medium text-ink focus:outline-hidden"
                  >
                    {alertsList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.unit_name || a.unit_id} ({a.risk})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Title & Risk Chip */}
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-ink">{alert.unit_name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${riskChipColor}`}>
                {alert.risk} RISK
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isWeatherModel ? "bg-forest-light text-forest" : "bg-canvas text-muted border border-borderline"
              }`}>
                {skillGateBadge}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isReviewed ? "bg-purple-light text-purple" : "bg-amber-light text-amber"
              }`}>
                {isReviewed ? "Reviewed by human supervisor" : "Requires human review before task dispatch"}
              </span>
              {feedbackStatus === "snooze" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-light text-amber">
                  SNOOZED
                </span>
              )}
              {feedbackStatus === "false_alarm" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-coral-light text-coral">
                  FALSE ALARM
                </span>
              )}
            </div>

            {/* Subtext info */}
            <p className="text-xs text-muted mt-1.5">
              Source: <span className="font-semibold text-ink">{sourceLabel}</span> · Target forecast horizon: 2–4 weeks, subject to local validation · Uncertainty: 80% PI · Created Mon 12 Oct
            </p>
            {!isWeatherModel && (
              <p className="text-[11px] text-amber font-semibold mt-1">
                Automatic weather-model-driven escalation is disabled for this block because the weather model did not pass the baseline skill gate.
              </p>
            )}
          </div>

          {/* Right Controls: Confidence Meter & Actions */}
          <div className="flex items-center flex-wrap gap-4">
            {/* Confidence Meter */}
            <div className="text-right">
              <div className="text-xs font-medium text-muted">
                Confidence: <span className="font-bold text-ink">{confidenceLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 justify-end">
                <span className={`h-2 w-8 rounded-full ${confidenceBars >= 1 ? "bg-[#534AB7]" : "bg-[#EEEDFE]"}`} />
                <span className={`h-2 w-8 rounded-full ${confidenceBars >= 2 ? "bg-[#534AB7]" : "bg-[#EEEDFE]"}`} />
                <span className={`h-2 w-8 rounded-full ${confidenceBars >= 3 ? "bg-[#534AB7]" : "bg-[#EEEDFE]"}`} />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center flex-wrap gap-2">
              {!isReviewed && (
                <button
                  onClick={() => handleFeedback("acknowledged")}
                  className="px-3.5 py-2 bg-forest text-white text-xs font-semibold rounded-xl hover:bg-forest/90 transition-all shadow-xs"
                >
                  Review & Acknowledge
                </button>
              )}
              <button
                onClick={async () => {
                  if (!isReviewed) {
                    await handleFeedback("acknowledged");
                  }
                  if (onNavigateToAssignTask && alert) {
                    onNavigateToAssignTask(alert.id);
                  } else {
                    setShowAssignModal(true);
                  }
                }}
                className="px-4 py-2 bg-[#534AB7] text-white text-xs font-semibold rounded-xl hover:bg-[#534AB7]/90 transition-all shadow-xs"
                title="Human review is recorded before assigning operational tasks"
              >
                {isReviewed ? "Assign task" : "Review & Assign task"}
              </button>
              <button
                onClick={() => handleFeedback("snooze")}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  feedbackStatus === "snooze"
                    ? "bg-[#534AB7] text-white border-[#534AB7]"
                    : "border-[#534AB7] text-[#534AB7] bg-white hover:bg-[#EEEDFE]/40"
                }`}
              >
                Snooze
              </button>
              <button
                onClick={() => handleFeedback("false_alarm")}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  feedbackStatus === "false_alarm"
                    ? "bg-[#C8472A] text-white border-[#C8472A]"
                    : "border-[#C8472A] text-[#C8472A] bg-white hover:bg-coral-light/40"
                }`}
              >
                False alarm
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: LARGE CHART (LEFT 8 COLS) & SIDE PANEL (RIGHT 4 COLS) */}
      <section aria-label="Forecast and Intelligence" className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Large Forecast Chart (col-span-8) */}
        <div className="lg:col-span-8 bg-white rounded-card border border-borderline p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-borderline/60 gap-1">
            <div>
              <h3 className="text-base font-bold text-ink">Forecast for {alert.unit_name}</h3>
              <p className="text-xs text-muted">
                {meta.granularity ? meta.granularity.charAt(0).toUpperCase() + meta.granularity.slice(1) : "Period"} cases ·{" "}
                {isWeatherModel 
                  ? "weather model crosses the alert level (simulated)" 
                  : "seasonal baseline used (no weather model for this unit)"}
              </p>
            </div>

            {/* Custom Chart Legend */}
            <div className="flex items-center flex-wrap gap-3 text-[11px] font-medium text-muted">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-ink" /> Actual cases
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 border-b-2 border-dashed border-[#8E8B9E]" /> Seasonal baseline
              </span>
              {isWeatherModel && (
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-purple" /> Weather model
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-[#EEEDFE] rounded-xs" /> 80% range
              </span>
            </div>
          </div>

          {/* Chart Canvas */}
          {chartData && chartData.length > 0 ? (
            <div className="h-64 w-full pt-2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 15, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E1EC" vertical={false} />
                  <XAxis dataKey="period" stroke="#6B6880" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6B6880" fontSize={11} tickLine={false} axisLine={false} domain={[0, 420]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#FFFFFF", 
                      borderColor: "#E3E1EC", 
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                    }} 
                  />
                  {/* Alert level reference line */}
                  <ReferenceLine 
                    y={alert.alert_level || 260} 
                    stroke="#C8472A" 
                    strokeDasharray="4 4" 
                    label={{ value: "alert level", position: "top", fill: "#C8472A", fontSize: 10, offset: 5 }} 
                  />
                  {/* 80% Confidence Range Area */}
                  <Area 
                    type="monotone" 
                    dataKey="ci_upper" 
                    fill="#EEEDFE" 
                    stroke="none" 
                    isAnimationActive={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="actual" 
                    name="Actual" 
                    stroke="#1F1D2B" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, fill: "#1F1D2B" }} 
                    connectNulls={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baseline" 
                    name="Seasonal baseline" 
                    stroke="#8E8B9E" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    dot={false}
                    connectNulls={true}
                  />
                  {/* Weather model curve: only drawn when weather model was used! */}
                  {isWeatherModel && (
                    <Line 
                      type="monotone" 
                      dataKey="weather_model" 
                      name="Weather model" 
                      stroke="#534AB7" 
                      strokeWidth={2.5} 
                      dot={{ r: 4, fill: "#534AB7" }} 
                      connectNulls={true}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <div className="absolute bottom-1 right-36 text-[10px] text-muted font-medium">
                forecast
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-muted text-xs bg-canvas/30 rounded-xl mt-2">
              <AlertTriangle className="w-6 h-6 text-muted mb-1" />
              <p className="font-semibold text-ink">Sample Alert - No forecast trajectory generated.</p>
              <p className="text-[11px] mt-0.5">This unit is currently operating under baseline surveillance.</p>
            </div>
          )}
        </div>

        {/* Side Panel (col-span-4) */}
        <div className="lg:col-span-4 space-y-3.5">
          {/* Card A: "Why this alert" (ONLY shown when weather model was used!) */}
          {isWeatherModel && alert.why_this_alert ? (
            <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs">
              <div className="pb-2 border-b border-borderline/60">
                <h3 className="text-sm font-bold text-ink">Why this alert</h3>
                <p className="text-[11px] text-muted">What pushed the forecast up</p>
              </div>

              <div className="space-y-3 pt-3">
                {alert.why_this_alert.map((driver: any, idx: number) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-ink">{driver.name}</span>
                      <span className="font-semibold text-purple capitalize">{driver.level}</span>
                    </div>
                    {/* Visual Strength Bar */}
                    <div className="w-full h-2 bg-canvas rounded-full overflow-hidden border border-borderline/50">
                      <div 
                        className="h-full bg-[#534AB7] rounded-full"
                        style={{ width: `${driver.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs">
              <div className="pb-2 border-b border-borderline/60">
                <h3 className="text-sm font-bold text-ink">Why this alert</h3>
                <p className="text-[11px] text-muted">Seasonal baseline rule</p>
              </div>
              <p className="text-xs text-muted pt-3 leading-relaxed">
                Weather model does not have statistically significant skill for this unit.
                Triggered solely by seasonal baseline endemic threshold.
              </p>
            </div>
          )}

          {/* Card B: "Method used" & Reactive rule comparison */}
          <div className="bg-white rounded-card border border-borderline p-4 shadow-2xs space-y-3">
            <div className="pb-2 border-b border-borderline/60">
              <h3 className="text-sm font-bold text-ink">Method used</h3>
            </div>

            {/* Method pill + win share text */}
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                isWeatherModel ? "bg-purple-light text-purple" : "bg-canvas text-muted border border-borderline"
              }`}>
                {alert.method_card?.name || (isWeatherModel ? "Weather model" : "Seasonal baseline")}
              </div>
              <div className="text-xs text-muted leading-tight">
                {alert.method_card?.evidence_text || "evaluated against baseline threshold"}
              </div>
            </div>

            {/* Reactive rule comparison */}
            <p className="text-xs text-muted pt-1 leading-relaxed border-t border-borderline/60">
              {alert.method_card?.reactive_comparison || 
                `Compared with a reactive rule (mean + 2 SD), this alert appears about 2 ${meta.unit_label} earlier (simulated).`}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3: TABLE OF SIMILAR PAST SURGES */}
      <section aria-label="Historical Surges" className="bg-white rounded-card border border-borderline p-5 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-borderline/60 mb-3">
          <h3 className="text-base font-bold text-ink">Similar past surges</h3>
          <span className="text-xs text-muted font-medium">from loaded history</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted border-b border-borderline/50 pb-2">
                <th className="font-semibold pb-2.5">Period</th>
                <th className="font-semibold pb-2.5">Peak</th>
                <th className="font-semibold pb-2.5">Model warning</th>
                <th className="font-semibold pb-2.5">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline/40">
              {(alert.similar_past_surges || []).map((surge: any, idx: number) => {
                const isSuccess = surge.outcome_type === "success";
                return (
                  <tr key={idx} className="hover:bg-canvas/50 transition-colors">
                    <td className="py-3 font-medium text-ink">{surge.period}</td>
                    <td className="py-3 text-muted">{surge.peak}</td>
                    <td className="py-3 text-muted">{surge.model_warning}</td>
                    <td className="py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isSuccess ? "bg-forest-light text-forest" : "bg-coral-light text-coral"
                      }`}>
                        {surge.outcome}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: LINKED RESPONSE TASKS */}
      <section aria-label="Linked Response Tasks" className="bg-white rounded-card border border-borderline p-5 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-borderline/60 mb-3">
          <div>
            <h3 className="text-base font-bold text-ink">Linked Response Tasks</h3>
            <p className="text-xs text-muted">
              Accountable frontline workflow linked to Alert #{alert.id} ({alert.unit_name})
            </p>
          </div>
          <span className="text-xs font-semibold text-purple bg-purple-light px-2.5 py-0.5 rounded-full">
            {(alert.tasks || []).length} linked task(s)
          </span>
        </div>

        {(alert.tasks || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted border-b border-borderline/50">
                  <th className="font-semibold pb-2.5">Task ID</th>
                  <th className="font-semibold pb-2.5">Description</th>
                  <th className="font-semibold pb-2.5">Assigned Owner</th>
                  <th className="font-semibold pb-2.5">Deadline</th>
                  <th className="font-semibold pb-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderline/40">
                {(alert.tasks || []).map((t: any) => (
                  <tr key={t.id} className="hover:bg-canvas/50">
                    <td className="py-2.5 font-semibold text-ink">#{t.id}</td>
                    <td className="py-2.5 text-ink">{t.title}</td>
                    <td className="py-2.5 text-muted">{t.owner}</td>
                    <td className="py-2.5 text-muted">{t.deadline ? new Date(t.deadline).toLocaleDateString() : "-"}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-light text-purple">
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted">
            No operational tasks assigned yet. Review the alert above and click "Assign task" to dispatch a Mitanin field workflow.
          </p>
        )}
      </section>

      {/* Assign Task Modal */}
      {showAssignModal && (
        <AssignTaskModal
          alert={{
            alert_id: alert.id,
            unit_id: alert.unit_id,
            unit_name: alert.unit_name,
            risk: alert.risk,
            lead_time: alert.forecast_period,
          }}
          onClose={() => setShowAssignModal(false)}
          onTaskCreated={() => {
            fetchDetail(alert.id);
            if (onTaskCreated) onTaskCreated();
          }}
        />
      )}
    </div>
  );
}
