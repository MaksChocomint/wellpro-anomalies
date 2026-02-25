"use client";
import { useState, useEffect } from "react";
import { api } from "@/utils/api";
import {
  Building2,
  MapPin,
  Layers,
  Drill,
  ChevronRight,
  HardHat,
  Factory,
} from "lucide-react";

export default function SelectionScreen({
  onSelect,
}: {
  onSelect: (rig: any) => void;
}) {
  const [data, setData] = useState<any>({
    companies: [],
    fields: [],
    clusters: [],
    wells: [],
    rigs: [],
  });
  const [sel, setSel] = useState<any>({
    company: null,
    field: null,
    cluster: null,
    well: null,
  });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [c, f, cl, w, r] = await Promise.all([
        api.getCompanies(),
        api.getFields(),
        api.getClusters(),
        api.getWells(),
        api.getRigs(),
      ]);
      setData({ companies: c, fields: f, clusters: cl, wells: w, rigs: r });
    };
    load();
  }, []);

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
    items: any[],
    key: string,
    current: any,
    setKey: string,
    iconType: string,
    index: number,
  ) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      {/* Заголовок */}
      <div
        className={`px-5 py-4 border-b border-slate-100 ${getBgColor(index)}`}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 bg-white rounded-lg shadow-sm"
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

      {/* Список элементов */}
      <div className="p-3 max-h-80 overflow-y-auto">
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item: any) => {
              const isSelected = current?.[key] === item[key];
              const isHovered = hoveredItem === `${setKey}-${item[key]}`;

              return (
                <button
                  key={item[key]}
                  onClick={() => setSel({ ...sel, [setKey]: item })}
                  onMouseEnter={() => setHoveredItem(`${setKey}-${item[key]}`)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg transition-all ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm"
                      : isHovered
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-600 hover:bg-slate-50"
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
                      {item.name || `${title} №${item.number || item[key]}`}
                    </span>
                    {item.code && (
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

  const targetRig = data.rigs.find((r: any) => r.well_id === sel.well?.well_id);

  // Прогресс выбора
  const selectionSteps = [sel.company, sel.field, sel.cluster, sel.well];
  const progress = selectionSteps.filter(Boolean).length * 25;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Заголовок */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm mb-6">
            <HardHat className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-slate-600 font-medium">
              WellPro • Система мониторинга
            </span>
          </div>

          <h1 className="text-4xl font-bold text-slate-800 mb-3">
            Выбор буровой установки
          </h1>

          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Выберите объект для мониторинга в иерархической структуре
            предприятия
          </p>

          {/* Прогресс выбора */}
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

        {/* Сетка выбора */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
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
            data.fields.filter(
              (f: any) => f.company_id === sel.company?.company_id,
            ),
            "field_id",
            sel.field,
            "field",
            "field",
            1,
          )}
          {renderList(
            "Куст",
            data.clusters.filter(
              (c: any) => c.field_id === sel.field?.field_id,
            ),
            "cluster_id",
            sel.cluster,
            "cluster",
            "cluster",
            2,
          )}
          {renderList(
            "Скважина",
            data.wells.filter(
              (w: any) => w.cluster_id === sel.cluster?.cluster_id,
            ),
            "well_id",
            sel.well,
            "well",
            "well",
            3,
          )}
        </div>

        {/* Кнопка перехода */}
        {sel.well && (
          <div className="text-center">
            <button
              onClick={() =>
                onSelect(
                  targetRig || {
                    rig_id: 1,
                    name: "WR-505",
                    type: "БУ-5000",
                    depth: 5000,
                  },
                )
              }
              className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold text-lg text-white shadow-lg hover:shadow-xl transition-all"
            >
              <Drill className="w-5 h-5" />
              <span>Запустить мониторинг</span>
              <ChevronRight className="w-5 h-5" />

              {/* Информация о выбранной установке */}
              <span className="ml-4 pl-4 border-l border-white/30 text-sm text-white/80">
                {targetRig?.name || "WR-505"} • {targetRig?.depth || 5000}м
              </span>
            </button>
          </div>
        )}

        {/* Подсказка */}
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
