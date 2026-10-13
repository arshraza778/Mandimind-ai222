import { useState } from "react";
import { X, User } from "lucide-react";

interface AssignTaskModalProps {
  alert: {
    alert_id: number;
    unit_id: string;
    unit_name: string;
    risk: string;
    lead_time: string;
  };
  onClose: () => void;
  onTaskCreated: () => void;
}

export function AssignTaskModal({ alert, onClose, onTaskCreated }: AssignTaskModalProps) {
  const [title, setTitle] = useState(`Active malaria response protocol - ${alert.unit_name}`);
  const [owner, setOwner] = useState("Mitanin Anita [SAMPLE FRONTLINE BLK A]");
  const [steps, setSteps] = useState([
    "Fever screening and rapid diagnostic test (RDT) sweep across high-risk hamlets.",
    "Verify LLIN bednet intactness and chemical residual status.",
    "Record positive clinical findings and dispatch immediate notification.",
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStepChange = (index: number, val: string) => {
    const updated = [...steps];
    updated[index] = val;
    setSteps(updated);
  };

  const addStep = () => {
    setSteps([...steps, ""]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const filteredSteps = steps.filter((s) => s.trim().length > 0);
      const res = await fetch("http://127.0.0.1:8000/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_id: alert.alert_id,
          title,
          steps: filteredSteps,
          owner,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to assign task");
      }

      onTaskCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-card-lg border border-borderline shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-borderline flex items-center justify-between bg-canvas/40">
          <div>
            <h3 className="text-base font-bold text-ink">Assign Action Task</h3>
            <p className="text-xs text-muted">
              Originating Alert: <span className="font-semibold text-ink">{alert.unit_name}</span> ({alert.risk} Risk)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-ink hover:bg-canvas transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-coral-light text-coral border border-coral/20 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-borderline rounded-xl focus:outline-hidden focus:border-purple focus:ring-1 focus:ring-purple"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Assigned Frontline Worker (Mitanin)
            </label>
            <div className="relative">
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-borderline rounded-xl focus:outline-hidden focus:border-purple"
              />
              <User className="w-4 h-4 text-muted absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-ink">Action Steps</label>
              <button
                type="button"
                onClick={addStep}
                className="text-xs text-purple font-semibold hover:underline"
              >
                + Add step
              </button>
            </div>
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted font-bold shrink-0">{idx + 1}.</span>
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => handleStepChange(idx, e.target.value)}
                    required
                    className="flex-1 px-3 py-1.5 text-xs border border-borderline rounded-lg focus:outline-hidden focus:border-purple"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="text-muted hover:text-coral text-sm px-1"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-borderline">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-borderline text-ink hover:bg-canvas transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold rounded-xl bg-purple text-white hover:bg-purple/90 transition-colors shadow-xs flex items-center gap-2"
            >
              {submitting ? "Dispatching..." : "Dispatch Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
