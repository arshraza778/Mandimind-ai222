import { useState, useEffect } from "react";
import { MapPin, CheckCircle2, ShieldAlert, Building2, Navigation, ArrowLeft } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { LanguageSelector } from "./LanguageSelector";

export interface SelectedLocationState {
  district_id: string;
  district_name: string;
  block_id: string;
  block_name: string;
  village_id: string;
  village_name: string;
  breadcrumb: string;
}

interface LocationSelectorProps {
  mode: "gate" | "modal";
  portalType: "public" | "employee";
  authToken?: string | null;
  currentUser?: any | null;
  initialLocation?: SelectedLocationState | null;
  onConfirm: (loc: SelectedLocationState) => void;
  onCancel?: () => void;
  onBackToPortal?: () => void;
}

export function LocationSelectorModal({
  mode,
  portalType,
  authToken,
  currentUser,
  initialLocation,
  onConfirm,
  onCancel,
  onBackToPortal,
}: LocationSelectorProps) {
  const { t } = useI18n();
  const [districts, setDistricts] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);

  const [selectedDistrictId, setSelectedDistrictId] = useState<string>(
    initialLocation?.district_id || currentUser?.district_id || "LGD_DIST_374"
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    initialLocation?.block_id || currentUser?.block_id || "LGD_BLK_3595"
  );
  const [selectedVillageId, setSelectedVillageId] = useState<string>(
    initialLocation?.village_id || currentUser?.village_id || ""
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const enforceJurisdiction = portalType === "employee" && !!authToken;

  // 1. Load Districts & initial hierarchy
  useEffect(() => {
    setLoading(true);
    setError(null);
    const headers: Record<string, string> = {};
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    fetch(
      `http://127.0.0.1:8000/locations/hierarchy?enforce_jurisdiction=${enforceJurisdiction}`,
      { headers }
    )
      .then((res) => res.json())
      .then((data) => {
        const distList = data.districts || [];
        const blkList = data.blocks || [];
        const vilList = data.villages || [];

        setDistricts(distList);

        // Pick default valid district
        let dId = selectedDistrictId;
        if (!distList.some((d: any) => d.unit_id === dId) && distList.length > 0) {
          dId = distList[0].unit_id;
          setSelectedDistrictId(dId);
        }

        // Filter blocks for selected district
        const filteredBlks = blkList.filter((b: any) => b.parent_id === dId);
        setBlocks(filteredBlks);

        let bId = selectedBlockId;
        if (!filteredBlks.some((b: any) => b.unit_id === bId) && filteredBlks.length > 0) {
          bId = filteredBlks[0].unit_id;
          setSelectedBlockId(bId);
        }

        // Filter villages for selected block
        const filteredVils = vilList.filter((v: any) => v.parent_id === bId);
        setVillages(filteredVils);

        let vId = selectedVillageId;
        if (!filteredVils.some((v: any) => v.unit_id === vId)) {
          vId = filteredVils.length > 0 ? filteredVils[0].unit_id : "";
          setSelectedVillageId(vId);
        }
      })
      .catch(() => {
        setError("Unable to load location dataset from backend server.");
      })
      .finally(() => setLoading(false));
  }, [authToken, enforceJurisdiction]);

  // 2. When District changes, dynamically fetch filtered blocks
  const handleDistrictChange = (newDistId: string) => {
    setSelectedDistrictId(newDistId);
    setError(null);
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    fetch(
      `http://127.0.0.1:8000/locations/hierarchy?district_id=${encodeURIComponent(
        newDistId
      )}&enforce_jurisdiction=${enforceJurisdiction}`,
      { headers }
    )
      .then((res) => res.json())
      .then((data) => {
        const blkList = data.blocks || [];
        setBlocks(blkList);
        const firstBlk = blkList.length > 0 ? blkList[0].unit_id : "";
        setSelectedBlockId(firstBlk);

        const vilList = (data.villages || []).filter((v: any) => v.parent_id === firstBlk);
        setVillages(vilList);
        setSelectedVillageId(vilList.length > 0 ? vilList[0].unit_id : "");
      })
      .catch(() => {});
  };

  // 3. When Block changes, dynamically fetch filtered villages
  const handleBlockChange = (newBlkId: string) => {
    setSelectedBlockId(newBlkId);
    setError(null);
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    fetch(
      `http://127.0.0.1:8000/locations/hierarchy?district_id=${encodeURIComponent(
        selectedDistrictId
      )}&block_id=${encodeURIComponent(newBlkId)}&enforce_jurisdiction=${enforceJurisdiction}`,
      { headers }
    )
      .then((res) => res.json())
      .then((data) => {
        const vilList = data.villages || [];
        setVillages(vilList);
        setSelectedVillageId(vilList.length > 0 ? vilList[0].unit_id : "");
      })
      .catch(() => {});
  };

  const handleConfirm = async () => {
    if (!selectedDistrictId || !selectedBlockId) {
      setError("Please select a District and Block before continuing.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const params = new URLSearchParams({
        district_id: selectedDistrictId,
        block_id: selectedBlockId,
      });
      if (selectedVillageId) {
        params.set("village_id", selectedVillageId);
      }

      const res = await fetch(`http://127.0.0.1:8000/locations/confirm?${params.toString()}`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Unauthorized or invalid location selection.");
        return;
      }

      const data = await res.json();
      const loc = data.location;
      onConfirm({
        district_id: loc.district.unit_id,
        district_name: loc.district.unit_name,
        block_id: loc.block.unit_id,
        block_name: loc.block.unit_name,
        village_id: loc.village?.unit_id || selectedVillageId || "",
        village_name: loc.village?.unit_name || selectedVillageId || "",
        breadcrumb: loc.location_breadcrumb,
      });
    } catch {
      setError("Network error while confirming location selection.");
    } finally {
      setConfirming(false);
    }
  };

  const cardContent = (
    <div className="bg-white rounded-card-lg border border-borderline shadow-xl max-w-xl w-full p-6 sm:p-8 space-y-6 text-ink">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-borderline pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-light text-purple flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple bg-purple-light px-2.5 py-0.5 rounded-full">
              {portalType === "public"
                ? t("landing.public_card_title", "Public Health Portal")
                : t("location_modal.title", "Authorized Jurisdiction Scope")}
            </span>
            <h2 className="text-xl font-bold text-ink mt-1">
              {t("location_modal.title", "Select Location Before Dashboard Access")}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {t(
                "location_modal.subtitle",
                "Choose your District, Block, and Village to load location-specific malaria risk, climate telemetry, and actions."
              )}
            </p>
          </div>
        </div>
        <LanguageSelector compact />
      </div>

      {/* Jurisdiction Notice for Employees */}
      {portalType === "employee" && currentUser && (
        <div className="p-3.5 rounded-xl bg-[#EEEDFE]/70 border border-purple/30 flex items-start gap-3">
          <Building2 className="w-4 h-4 text-purple shrink-0 mt-0.5" />
          <div className="text-xs text-ink space-y-0.5">
            <div className="font-bold text-purple">
              {currentUser.name} ({currentUser.role_label})
            </div>
            <div className="text-muted">
              {t(
                "location_modal.subtitle",
                "Your dropdowns are enforced by the backend to your assigned jurisdiction. Unauthorized blocks or districts are restricted."
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-coral-light border border-coral/30 flex items-center gap-2.5 text-xs font-semibold text-coral">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cascading Dropdowns */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted">
          {t("common.loading", "Loading location hierarchy from backend...")}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. District */}
          <div>
            <label htmlFor="select-district" className="block text-xs font-bold text-ink mb-1.5">
              1. {t("landing.select_district", "Select District")}
            </label>
            <select
              id="select-district"
              value={selectedDistrictId}
              onChange={(e) => handleDistrictChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-borderline bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple"
            >
              {districts.map((d) => (
                <option key={d.unit_id} value={d.unit_id}>
                  {d.unit_name} {d.district_lgd_code ? `(LGD ${d.district_lgd_code})` : `(${d.unit_id})`}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Block */}
          <div>
            <label htmlFor="select-block" className="block text-xs font-bold text-ink mb-1.5">
              2. {t("landing.select_block", "Select Block")}
            </label>
            <select
              id="select-block"
              value={selectedBlockId}
              onChange={(e) => handleBlockChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-borderline bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple"
            >
              {blocks.map((b) => (
                <option key={b.unit_id} value={b.unit_id}>
                  {b.unit_name} {b.block_lgd_code ? `(LGD ${b.block_lgd_code})` : `(${b.unit_id})`}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Village */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="select-village" className="block text-xs font-bold text-ink">
                3. {t("landing.select_village", "Select Village")}
              </label>
              {villages.length === 0 && (
                <span className="text-[11px] text-muted italic">
                  Block-level scope (No sub-villages in LGD dataset)
                </span>
              )}
            </div>
            {villages.length > 0 ? (
              <select
                id="select-village"
                value={selectedVillageId}
                onChange={(e) => setSelectedVillageId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-borderline bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple"
              >
                {villages.map((v) => (
                  <option key={v.unit_id} value={v.unit_id}>
                    {v.unit_name} ({v.unit_id})
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3.5 py-2.5 rounded-xl border border-borderline/70 bg-canvas text-xs text-muted">
                Official LGD dataset provides District & Block boundaries. Field tasks can be assigned directly at the Block level.
              </div>
            )}
          </div>

          {/* Selected Preview Pill */}
          <div className="p-3 rounded-xl bg-canvas border border-borderline flex items-center justify-between text-xs">
            <span className="text-muted font-medium flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-purple" />
              {t("app.change_location", "Active Selection")}:
            </span>
            <span className="font-bold text-ink truncate max-w-[340px]">
              {districts.find((d) => d.unit_id === selectedDistrictId)?.unit_name || selectedDistrictId}
              {" · "}
              {blocks.find((b) => b.unit_id === selectedBlockId)?.unit_name || selectedBlockId}
              {selectedVillageId && (
                <>
                  {" · "}
                  {villages.find((v) => v.unit_id === selectedVillageId)?.unit_name || selectedVillageId}
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-borderline">
        {mode === "modal" && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-borderline text-xs font-semibold text-muted hover:text-ink hover:bg-canvas transition-colors"
          >
            {t("location_modal.cancel", "Cancel")}
          </button>
        ) : onBackToPortal ? (
          <button
            type="button"
            onClick={onBackToPortal}
            className="px-4 py-2.5 rounded-xl border border-borderline text-xs font-semibold text-muted hover:text-ink hover:bg-canvas transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("app.switch_portal", "Back to Portals")}</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          disabled={loading || confirming}
          onClick={handleConfirm}
          className="px-6 py-2.5 rounded-xl bg-purple hover:bg-purple/90 text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {confirming
              ? t("common.loading", "Confirming...")
              : t("location_modal.apply", "Confirm Location & Open Dashboard")}
          </span>
        </button>
      </div>
    </div>
  );

  if (mode === "modal") {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
        {cardContent}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-36px)] bg-canvas flex flex-col items-center justify-center p-4">
      {cardContent}
    </div>
  );
}
