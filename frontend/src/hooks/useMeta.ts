import { useState, useEffect, useCallback } from "react";

export interface DateRange {
  start: string;
  end: string;
}

export interface MetaData {
  name: string;
  description: string;
  data_source: string;
  granularity: string;
  unit_label: string;
  geography_label: string;
  banner_text: string;
  date_range: DateRange | null;
  district: string;
  sample_blocks: string[];
  lead_time: string;
  horizon_steps?: number[];
  escalation_hours?: number;
  honesty_rules: string[];
  planned_not_built: string[];
}

export interface UseMetaReturn {
  meta: MetaData;
  loading: boolean;
  error: string | null;
  backendHealth: "ok" | "offline" | "checking";
  refetch: () => void;
}

// Initial empty state until /meta returns configuration
const defaultFallbackMeta: MetaData = {
  name: "Mitanin Signal",
  description: "Climate-informed malaria early-warning and action-tracking prototype for Chhattisgarh",
  data_source: "",
  granularity: "",
  unit_label: "",
  geography_label: "",
  banner_text: "",
  date_range: null,
  district: "Sample District",
  sample_blocks: [],
  lead_time: "",
  horizon_steps: [],
  escalation_hours: 48,
  honesty_rules: [],
  planned_not_built: []
};

export function useMeta(): UseMetaReturn {
  const [meta, setMeta] = useState<MetaData>(defaultFallbackMeta);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<"ok" | "offline" | "checking">("checking");

  const fetchMeta = useCallback(() => {
    setLoading(true);

    // Check health
    fetch("http://127.0.0.1:8000/health")
      .then((res) => {
        if (!res.ok) throw new Error("Health check returned status " + res.status);
        return res.json();
      })
      .then((data) => {
        if (data.status === "ok") {
          setBackendHealth("ok");
        } else {
          setBackendHealth("offline");
        }
      })
      .catch(() => setBackendHealth("offline"));

    // Fetch /meta
    fetch("http://127.0.0.1:8000/meta")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch /meta: " + res.statusText);
        return res.json();
      })
      .then((data: MetaData) => {
        setMeta(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  return {
    meta,
    loading,
    error,
    backendHealth,
    refetch: fetchMeta,
  };
}
