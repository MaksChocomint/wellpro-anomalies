"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/api";
import {
  Building2,
  MapPin,
  Layers,
  Drill,
  ChevronRight,
  HardHat,
} from "lucide-react";
import { SelectedRig } from "@/types/selection";

interface Company {
  company_id: number;
  name: string;
  code?: string;
}

interface Field {
  field_id: number;
  company_id: number;
  name: string;
  location: string;
  code?: string;
}

interface Cluster {
  cluster_id: number;
  field_id: number;
  number: number;
}

interface Well {
  well_id: number;
  cluster_id: number;
  name: string;
}

interface Rig {
  rig_id: number;
  well_id: number;
  name: string;
  model: string;
}

interface SelectionData {
  companies: Company[];
  fields: Field[];
  clusters: Cluster[];
  wells: Well[];
  rigs: Rig[];
}

interface SelectionState {
  company: Company | null;
  field: Field | null;
  cluster: Cluster | null;
  well: Well | null;
}

type ListItem = Company | Field | Cluster | Well;
type SelectionLevel = keyof SelectionState;

const EMPTY_DATA: SelectionData = {
  companies: [],
  fields: [],
  clusters: [],
  wells: [],
  rigs: [],
};

const EMPTY_SELECTION: SelectionState = {
  company: null,
  field: null,
  cluster: null,
  well: null,
};

function sanitizeHierarchy(raw: SelectionData): SelectionData {
  const rigWellIds = new Set(raw.rigs.map((rig) => rig.well_id));
  const wells = raw.wells.filter((well) => rigWellIds.has(well.well_id));
  const wellIds = new Set(wells.map((well) => well.well_id));
  const rigs = raw.rigs.filter((rig) => wellIds.has(rig.well_id));

  const clusterIds = new Set(wells.map((well) => well.cluster_id));
  const clusters = raw.clusters.filter((cluster) =>
    clusterIds.has(cluster.cluster_id),
  );

  const fieldIds = new Set(clusters.map((cluster) => cluster.field_id));
  const fields = raw.fields.filter((field) => fieldIds.has(field.field_id));

  const companyIds = new Set(fields.map((field) => field.company_id));
  const companies = raw.companies.filter((company) =>
    companyIds.has(company.company_id),
  );

  return { companies, fields, clusters, wells, rigs };
}

function getItemValue(item: ListItem, key: string): string | number | undefined {
  return (item as unknown as Record<string, string | number | undefined>)[key];
}

function getItemLabel(item: ListItem, title: string, key: string): string {
  const namedItem = item as { name?: string; number?: number };
  if (namedItem.name) return namedItem.name;
  if (typeof namedItem.number === "number") return `${title} №${namedItem.number}`;
  const fallback = getItemValue(item, key);
  return `${title} №${fallback ?? "?"}`;
}

export default function SelectionScreen({
  onSelect,
}: {
  onSelect: (rig: SelectedRig) => void;
}) {
  const [data, setData] = useState<SelectionData>(EMPTY_DATA);
  const [sel, setSel] = useState<SelectionState>(EMPTY_SELECTION);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const [companies, fields, clusters, wells, rigs] = await Promise.all([
          api.getCompanies(),
          api.getFields(),
          api.getClusters(),
          api.getWells(),
          api.getRigs(),
        ]);

        if (!isMounted) return;

        setData(
          sanitizeHierarchy({
            companies,
            fields,
            clusters,
            wells,
            rigs,
          }),
        );
        setLoadingError(null);
      } catch (error) {
        console.error("[SelectionScreen] Failed to load entities:", error);
        if (!isMounted) return;

        setData(EMPTY_DATA);
        setLoadingError(
          "Не удалось загрузить объекты. Проверьте backend и состояние базы данных.",
        );
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const availableFields = useMemo(
    () =>
      data.fields.filter(
        (field) => field.company_id === sel.company?.company_id,
      ),
    [data.fields, sel.company?.company_id],
  );

  const availableClusters = useMemo(
    () =>
      data.clusters.filter((cluster) => cluster.field_id === sel.field?.field_id),
    [data.clusters, sel.field?.field_id],
  );

  const availableWells = useMemo(
    () =>
      data.wells.filter((well) => well.cluster_id === sel.cluster?.cluster_id),
    [data.wells, sel.cluster?.cluster_id],
  );

  const targetRig = useMemo(
    () => data.rigs.find((rig) => rig.well_id === sel.well?.well_id),
    [data.rigs, sel.well?.well_id],
  );

  const handleSelect = (level: SelectionLevel, item: ListItem) => {
    setSel((prev) => {
      if (level === "company") {
        return { company: item as Company, field: null, cluster: null, well: null };
      }
      if (level === "field") {
        return {
          ...prev,
          field: item as Field,
          cluster: null,
          well: null,
        };
      }
      if (level === "cluster") {
        return {
          ...prev,
          cluster: item as Cluster,
          well: null,
        };
      }
      return { ...prev, well: item as Well };
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "company":
        return <Building2 className="w-5 h-5" />;
      case "field":
        return <MapPin className="w-5 h-5" />;
      case "cluster":
        return <Layers className="w-5 h-5" />;
      case "well":
        return <Drill className="w-5 h-5" />;
      default:
        return <ChevronRight className="w-5 h-5" />;
    }
  };

  const getColor = (index: number) => {
    const colors = ["#2563eb", "#059669", "#d97706", "#dc2626"];
    return colors[index % colors.length];
  };

  const getBgColor = (index: number) => {
    const colors = ["bg-blue-50", "bg-emerald-50", "bg-amber-50", "bg-rose-50"];
    return colors[index % colors.length];
  };

  const renderList = (
    title: string,
    items: ListItem[],
    key: string,
    current: ListItem | null,
    setKey: SelectionLevel,
    iconType: string,
    index: number,
  ) => (
    <div className="surface overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="rounded-md border border-slate-200 bg-slate-50 p-2"
            style={{ color: getColor(index) }}
          >
            {getIcon(iconType)}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500">
              {items.length}{" "}
              {items.length === 1
                ? "объект"
                : items.length < 5
                  ? "объекта"
                  : "объектов"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto p-3">
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item) => {
              const itemId = getItemValue(item, key);
              if (itemId === undefined) return null;

              const currentId = current ? getItemValue(current, key) : undefined;
              const isSelected = currentId === itemId;
              const hoverKey = `${setKey}-${itemId}`;
              const isHovered = hoveredItem === hoverKey;

              return (
                <button
                  key={String(itemId)}
                  onClick={() => handleSelect(setKey, item)}
                  onMouseEnter={() => setHoveredItem(hoverKey)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`w-full rounded-md border px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "border-blue-700 bg-[var(--primary)] text-white"
                      : isHovered
                        ? "border-slate-300 bg-slate-50 text-slate-900"
                        : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1 rounded-md ${
                        isSelected ? "bg-white/20" : "bg-slate-100"
                      }`}
                      style={{ color: isSelected ? "white" : getColor(index) }}
                    >
                      {getIcon(iconType)}
                    </div>
                    <span className="flex-1 font-medium">
                      {getItemLabel(item, title, key)}
                    </span>
                    {"code" in item && item.code && (
                      <span
                        className={`text-xs px-2 py-1 rounded-md ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {item.code}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="p-3 bg-slate-100 rounded-full w-12 h-12 mx-auto mb-3 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-400 text-sm">Нет доступных объектов</p>
          </div>
        )}
      </div>
    </div>
  );

  const selectionSteps = [sel.company, sel.field, sel.cluster, sel.well];
  const progress = selectionSteps.filter(Boolean).length * 25;

  return (
    <div className="app-shell">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-[var(--primary)]">
            <HardHat className="h-5 w-5" />
            <span className="ui-label text-[var(--primary)]">
              WellPro / Система мониторинга
            </span>
          </div>

          <h1 className="mb-3 text-4xl font-black tracking-tight text-slate-950">
            Выбор буровой установки
          </h1>

          <p className="mx-auto max-w-2xl text-base font-medium text-slate-500">
            Выберите объект для мониторинга в иерархической структуре предприятия
          </p>

          {sel.company && (
            <div className="max-w-md mx-auto mt-8">
              <div className="flex justify-between mb-2 text-sm">
                <span className="text-slate-500">Прогресс выбора</span>
                <span className="text-blue-600 font-medium">{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-400">
                <span>Компания</span>
                <span>Месторождение</span>
                <span>Куст</span>
                <span>Скважина</span>
              </div>
            </div>
          )}
        </div>

        <div className="mb-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {renderList(
            "Компания",
            data.companies,
            "company_id",
            sel.company,
            "company",
            "company",
            0,
          )}
          {renderList(
            "Месторождение",
            availableFields,
            "field_id",
            sel.field,
            "field",
            "field",
            1,
          )}
          {renderList(
            "Куст",
            availableClusters,
            "cluster_id",
            sel.cluster,
            "cluster",
            "cluster",
            2,
          )}
          {renderList(
            "Скважина",
            availableWells,
            "well_id",
            sel.well,
            "well",
            "well",
            3,
          )}
        </div>

        {loadingError && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {loadingError}
          </div>
        )}

        {sel.well && (
          <div className="text-center">
            <button
              onClick={() => {
                if (!targetRig || !sel.company || !sel.field || !sel.cluster || !sel.well) {
                  return;
                }

                onSelect({
                  ...targetRig,
                  companyName: sel.company.name,
                  fieldName: sel.field.name,
                  clusterNumber: sel.cluster.number,
                  wellName: String(sel.well.name),
                });
              }}
              disabled={!targetRig}
              className={`inline-flex items-center gap-3 rounded-lg border px-8 py-4 text-lg font-black transition-colors ${
                targetRig
                  ? "border-blue-700 bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
                  : "cursor-not-allowed border-slate-300 bg-slate-300 text-white"
              }`}
            >
              <Drill className="w-5 h-5" />
              <span>Запустить мониторинг</span>
              <ChevronRight className="w-5 h-5" />
              <span className="ml-4 pl-4 border-l border-white/30 text-sm text-white/80">
                {targetRig?.name || "Буровая не найдена"} • {sel.well.name}
              </span>
            </button>
          </div>
        )}

        <div className="text-center mt-12">
          <div className="inline-flex items-center gap-2 text-sm text-slate-400">
            <MapPin className="w-4 h-4" />
            <span>Выберите компанию → месторождение → куст → скважину</span>
          </div>
        </div>
      </div>
    </div>
  );
}
