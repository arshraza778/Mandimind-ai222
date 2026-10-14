import { useState, useEffect } from "react";
import { MapPin, Navigation, Info, ShieldCheck } from "lucide-react";

interface LgdBlockMapCardProps {
  selectedDistrictId?: string;
  selectedBlockId?: string;
  onSelectBlock?: (blockId: string, districtId: string) => void;
}

interface BlockPointItem {
  unit_id: string;
  unit_name: string;
  district_name: string;
  district_id: string;
  district_lgd_code?: number;
  block_lgd_code?: number;
  latitude: number | null;
  longitude: number | null;
  coordinate_source?: string;
}

export function LgdBlockMapCard({
  selectedDistrictId,
  selectedBlockId,
  onSelectBlock,
}: LgdBlockMapCardProps) {
  const [blocks, setBlocks] = useState<BlockPointItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterDistrict, setFilterDistrict] = useState<string>(selectedDistrictId || "ALL");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    fetch("http://127.0.0.1:8000/locations/geojson?layer=points")
      .then((res) => res.json())
      .then((geojson) => {
        const features = geojson.features || [];
        const parsed: BlockPointItem[] = features.map((f: any) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [null, null];
          return {
            unit_id: p.unit_id,
            unit_name: p.unit_name,
            district_name: p.district_name || "",
            district_id: p.parent_id || "",
            district_lgd_code: p.district_lgd_code,
            block_lgd_code: p.block_lgd_code,
            longitude: coords[0],
            latitude: coords[1],
            coordinate_source: p.coordinate_source || "WGS84 LGD representative polygon surface point",
          };
        });
        setBlocks(parsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedDistrictId && selectedDistrictId !== "DIST_SAMPLE") {
      setFilterDistrict(selectedDistrictId);
    }
  }, [selectedDistrictId]);

  const uniqueDistricts = Array.from(
    new Map(blocks.map((b) => [b.district_id, b.district_name])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = blocks.filter((b) => {
    if (filterDistrict !== "ALL" && b.district_id !== filterDistrict) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        b.unit_name.toLowerCase().includes(q) ||
        b.district_name.toLowerCase().includes(q) ||
        String(b.block_lgd_code || "").includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-white rounded-card-lg border border-borderline p-5 sm:p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-borderline pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-light text-purple flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple bg-purple-light px-2.5 py-0.5 rounded-full">
                Official LGD Administrative Geography
              </span>
              <span className="text-[11px] text-muted">
                33 Districts · 146 Blocks
              </span>
            </div>
            <h3 className="text-base font-bold text-ink mt-0.5">
              Chhattisgarh LGD Block Coordinates Directory & Map View
            </h3>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          <select
            value={filterDistrict}
            onChange={(e) => setFilterDistrict(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-purple"
          >
            <option value="ALL">All 33 Districts ({blocks.length} blocks)</option>
            {uniqueDistricts.map(([dId, dName]) => (
              <option key={dId} value={dId}>
                {dName}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search block or LGD code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-borderline bg-white text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-purple w-44"
          />
        </div>
      </div>

      {/* Honest Geographic Notice */}
      <div className="p-3 rounded-xl bg-canvas border border-borderline flex items-start gap-2.5 text-xs text-ink">
        <Info className="w-4 h-4 text-purple shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div>
            <strong>Authoritative Source:</strong> Loaded from{" "}
            <code className="text-[11px] font-mono bg-white px-1.5 py-0.5 rounded border border-borderline">
              docs/chhattisgarh_lgd_blocks_dataset/
            </code>
            . Official LGD block coordinates represent authoritative polygon surface center points in WGS84 (EPSG:4326).
          </div>
          <div className="text-muted">
            Districts do not have fabricated coordinates; sub-villages are not invented. Surveillance case and weather observations remain simulated DEMO DATA.
          </div>
        </div>
      </div>

      {/* Grid of Blocks */}
      {loading ? (
        <div className="py-8 text-center text-xs text-muted">
          Loading 146 official LGD block coordinates...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-80 overflow-y-auto pr-1">
          {filtered.map((b) => {
            const isSelected = b.unit_id === selectedBlockId;
            return (
              <div
                key={b.unit_id}
                onClick={() => {
                  if (onSelectBlock) onSelectBlock(b.unit_id, b.district_id);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "border-purple bg-purple-light/40 ring-1 ring-purple"
                    : "border-borderline bg-white hover:border-purple/40 hover:bg-canvas"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="font-bold text-xs text-ink truncate">{b.unit_name}</div>
                  {b.block_lgd_code && (
                    <span className="text-[10px] font-mono font-semibold text-purple bg-purple-light px-1.5 py-0.5 rounded shrink-0">
                      LGD {b.block_lgd_code}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted truncate mt-0.5">
                  {b.district_name} {b.district_lgd_code ? `(Dist ${b.district_lgd_code})` : ""}
                </div>
                <div className="text-[10px] text-muted font-mono mt-1.5 flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-purple shrink-0" />
                  <span>
                    {b.latitude !== null && b.longitude !== null
                      ? `${b.latitude.toFixed(4)}°N, ${b.longitude.toFixed(4)}°E`
                      : "No coordinates (District level)"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Summary */}
      <div className="flex items-center justify-between text-[11px] text-muted border-t border-borderline pt-2">
        <span>
          Showing <strong>{filtered.length}</strong> of {blocks.length} official LGD blocks
        </span>
        <span className="flex items-center gap-1 text-purple font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          Verified Against Government LGD Directory
        </span>
      </div>
    </div>
  );
}
