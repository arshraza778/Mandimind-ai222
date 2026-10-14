import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { 
  ResponsiveContainer, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ComposedChart 
} from "recharts";

interface AlertDetailModalProps {
  alertId: number;
  onClose: () => void;
  onAssignClick: () => void;
}

export function AlertDetailModal({ alertId, onClose, onAssignClick }: AlertDetailModalProps) {
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/alerts/${alertId}`)
      .then((res) => res.json())
      .then((data) => {
        setAlert(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [alertId]);

  if (loading || !alert) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-card-lg p-8 max-w-md w-full text-center text-muted font-semibold text-xs shadow-xl">
          Loading alert intelligence...
        </div>
      </div>
    );
  }

  // Format chart series
  const seriesData = alert.series;
  let chartRows: any[] = [];
  if (seriesData) {
    const historical = (seriesData.historical || []).map((h: any) => ({
      period: h.period,
      actual: h.actual,
      baseline: null,
      model: null,
      ci_lower: null,
      ci_upper: null,
    }));
    const forecast = (seriesData.forecast || []).map((f: any) => ({
      period: f.period,
      actual: null,
      baseline: f.baseline,
      model: f.model,
      ci_lower: f.ci_lower,
      ci_upper: f.ci_upper,
    }));
    chartRows = [...historical, ...forecast];
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-card-lg border border-borderline shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-borderline flex items-center justify-between bg-canvas/40">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                alert.risk === "High"
                  ? "bg-coral-light text-coral"
                  : alert.risk === "Medium"
                  ? "bg-amber-light text-amber"
                  : "bg-forest-light text-forest"
              }`}
            >
              {alert.risk.toUpperCase()}
            </span>
            <h3 className="text-base font-bold text-ink">Alert Detail · Unit {alert.unit_id}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted hover:text-ink hover:bg-canvas transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-ink">
          {/* Key Intelligence Parameters */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-canvas/60 p-3.5 rounded-xl border border-borderline">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Method Used</div>
              <div className="text-xs font-bold text-ink mt-1 capitalize">
                {alert.method_used.replace("_", " ")}
              </div>
            </div>
            <div className="bg-canvas/60 p-3.5 rounded-xl border border-borderline">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Confidence</div>
              <div className="text-xs font-bold text-ink mt-1">
                {Math.round(alert.confidence * 100)}% Confidence
              </div>
            </div>
            <div className="bg-canvas/60 p-3.5 rounded-xl border border-borderline">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Forecast Period</div>
              <div className="text-xs font-bold text-ink mt-1">
                {alert.forecast_period}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="p-4 bg-purple-light/40 border border-purple/20 rounded-xl text-xs text-ink leading-relaxed">
            <span className="font-bold text-purple">Clinical Assessment: </span>
            {alert.details}
          </div>

          {/* Forecast Series Chart */}
          {chartRows.length > 0 ? (
            <div className="bg-white border border-borderline rounded-xl p-4 shadow-xs">
              <div className="text-xs font-bold text-ink mb-3 flex items-center justify-between">
                <span>Observed vs Forecast Trajectory</span>
                <div className="flex items-center gap-3 text-[11px] font-medium text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-ink rounded-full" /> Actual
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-muted rounded-full" /> Baseline
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-purple rounded-full" /> Model
                  </span>
                </div>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="period" stroke="#64748B" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "#FFFFFF", 
                        borderColor: "#E2E8F0", 
                        borderRadius: "12px",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                      }} 
                    />
                    <Line type="monotone" dataKey="actual" name="Actual" stroke="#1F1D2B" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#8E8B9E" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="model" name="Weather Model" stroke="#534AB7" strokeWidth={2.5} dot={{ r: 4, fill: "#534AB7" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted bg-canvas border border-borderline rounded-xl">
              No detailed interval series generated for this record.
            </div>
          )}

          {/* Linked Tasks */}
          <div>
            <div className="text-xs font-bold text-ink mb-2">Active Linked Tasks ({alert.tasks?.length || 0})</div>
            {alert.tasks && alert.tasks.length > 0 ? (
              <div className="space-y-2">
                {alert.tasks.map((t: any) => (
                  <div key={t.id} className="p-3.5 bg-canvas/60 border border-borderline rounded-xl text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-ink">{t.title}</div>
                      <div className="text-[11px] text-muted mt-0.5">Assigned to: {t.owner}</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white border border-borderline text-ink">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted italic">No action tasks dispatched yet for this alert.</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-borderline flex items-center justify-end gap-3 bg-canvas/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-borderline text-ink hover:bg-canvas transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              onAssignClick();
            }}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-purple text-white hover:bg-purple/90 transition-all shadow-xs flex items-center gap-1.5"
          >
            <span>Assign Task</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
