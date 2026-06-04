// =============================================================
//
// ██╗  ██╗███████╗██╗  ██╗██╗ █████╗
// ██║  ██║██╔════╝██║ ██╔╝██║██╔══██╗
// ███████║█████╗  █████╔╝ ██║███████║
// ██╔══██║██╔══╝  ██╔═██╗ ██║██╔══██║
// ██║  ██║███████╗██║  ██╗██║██║  ██║
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
//
// File        : index.tsx
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import { useMemo, useState } from "react";

import { cn } from "~/helpers/Cn";
import type { SegmentationBBox } from "~/types/Segmentations";

export type MaskLabelState = {
  labelId: number;
  name: string;
  color: string;
  isVisible: boolean;
  group: string;
  isPresent: boolean;
  voxelCount: number;
  volumeMm3: number;
  bboxIjk?: SegmentationBBox | null;
  centerIjk?: number[] | null;
  centerWorld?: number[] | null;
  isSelected?: boolean;
};

type MaskLabelsPanelProps = {
  labels: MaskLabelState[];
  opacity: number;
  overlayStatus: "available" | "unavailable" | "loading";
  onToggleLabel: (labelId: number) => void;
  onOpacityChange: (opacity: number) => void;
  onCenterLabel: (labelId: number) => void;
  onSetAllLabelsVisible: (visible: boolean) => void;
  onSetGroupVisible: (group: string, visible: boolean) => void;
  onShowOnlyGroup: (group: string) => void;
};

function formatVolume(volumeMm3: number) {
  if (!Number.isFinite(volumeMm3)) {
    return "-";
  }

  return `${Math.round(volumeMm3).toLocaleString("fr-FR")} mm3`;
}

function formatVoxelCount(voxelCount: number) {
  if (!Number.isFinite(voxelCount)) {
    return "-";
  }

  return Math.round(voxelCount).toLocaleString("fr-FR");
}

function formatGroupName(group: string) {
  return group.replace(/_/g, " ");
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function getGroupSortWeight(group: string) {
  const priority = [
    "vertebrae",
    "sacrum",
    "thoracic_bones",
    "bones",
    "lungs",
    "vessels",
    "muscles",
    "abdominal_organs",
    "pelvic_organs",
    "other",
  ];
  const index = priority.indexOf(group);

  return index === -1 ? priority.length : index;
}

export function SegmentationLabelPanel({
  labels,
  opacity,
  overlayStatus,
  onCenterLabel,
  onOpacityChange,
  onSetAllLabelsVisible,
  onSetGroupVisible,
  onShowOnlyGroup,
  onToggleLabel,
}: MaskLabelsPanelProps) {
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const opacityPercent = Math.round(opacity * 100);
  const normalizedSearch = normalizeSearchValue(search);
  const presentLabelsCount = labels.filter((label) => label.isPresent).length;
  const visiblePresentLabelsCount = labels.filter(
    (label) => label.isPresent && label.isVisible,
  ).length;
  const hasSpineLabels = labels.some(
    (label) => label.isPresent && (label.group === "vertebrae" || label.group === "sacrum"),
  );
  const groups = useMemo(() => {
    const groupMap = new Map<string, MaskLabelState[]>();

    labels.forEach((label) => {
      const group = label.group || "other";
      const currentLabels = groupMap.get(group) || [];

      currentLabels.push(label);
      groupMap.set(group, currentLabels);
    });

    return [...groupMap.entries()]
      .map(([group, groupLabels]) => ({
        group,
        labels: groupLabels
          .filter((label) => {
            if (!normalizedSearch) {
              return true;
            }

            return (
              label.name.toLowerCase().includes(normalizedSearch) ||
              String(label.labelId).includes(normalizedSearch) ||
              group.toLowerCase().includes(normalizedSearch)
            );
          })
          .sort((left, right) => {
            if (left.isPresent !== right.isPresent) {
              return left.isPresent ? -1 : 1;
            }

            return left.name.localeCompare(right.name);
          }),
        presentCount: groupLabels.filter((label) => label.isPresent).length,
        visibleCount: groupLabels.filter((label) => label.isPresent && label.isVisible).length,
      }))
      .filter((group) => group.labels.length > 0)
      .sort((left, right) => {
        const weightDelta = getGroupSortWeight(left.group) - getGroupSortWeight(right.group);

        return weightDelta || left.group.localeCompare(right.group);
      });
  }, [labels, normalizedSearch]);
  const toggleGroupCollapsed = (group: string) => {
    setCollapsedGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups);

      if (nextGroups.has(group)) {
        nextGroups.delete(group);
      } else {
        nextGroups.add(group);
      }

      return nextGroups;
    });
  };

  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">Labels</p>
          <p className="text-xs text-text-muted">
            {labels.length
              ? `${presentLabelsCount}/${labels.length} présents · ${visiblePresentLabelsCount} visibles`
              : "Aucun label"}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Remplissage</span>
          <input
            className="h-1.5 w-20 accent-primary"
            max={1}
            min={0.1}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            step={0.05}
            type="range"
            value={opacity}
          />
          <span className="w-8 text-right text-text-soft">{opacityPercent}%</span>
        </label>
      </div>

      {overlayStatus === "loading" ? (
        <p className="mb-3 rounded border border-border-soft bg-black/20 px-2 py-1 text-xs text-text-muted">
          Chargement de l'overlay masque...
        </p>
      ) : null}

      {overlayStatus === "unavailable" ? (
        <p className="mb-3 rounded border border-quaternary-700 bg-quaternary-700/15 px-2 py-1 text-xs text-quaternary-100">
          Overlay non encore disponible dans le viewer.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          className="h-7 rounded border border-border-soft bg-surface px-2 text-[11px] font-medium text-text-soft transition hover:border-primary/70 hover:text-text disabled:opacity-50"
          disabled={!presentLabelsCount}
          onClick={() => onSetAllLabelsVisible(true)}
          type="button"
        >
          Tout afficher
        </button>
        <button
          className="h-7 rounded border border-border-soft bg-surface px-2 text-[11px] font-medium text-text-soft transition hover:border-primary/70 hover:text-text disabled:opacity-50"
          disabled={!presentLabelsCount}
          onClick={() => onSetAllLabelsVisible(false)}
          type="button"
        >
          Tout masquer
        </button>
        <button
          className="h-7 rounded border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary-200 transition hover:border-primary"
          disabled={!hasSpineLabels}
          onClick={() => onShowOnlyGroup("vertebrae")}
          type="button"
        >
          Vertèbres seules
        </button>
      </div>

      <input
        className="h-8 w-full rounded border border-border-soft bg-surface px-2 text-xs text-text outline-none transition placeholder:text-text-muted focus:border-primary/70"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Rechercher un label"
        type="search"
        value={search}
      />

      {labels.length ? (
        <div className="max-h-[calc(100vh-27rem)] space-y-2 overflow-y-auto pr-1">
          {groups.map(({ group, labels: groupLabels, presentCount, visibleCount }) => {
            const hasPresentLabels = presentCount > 0;
            const areAllVisible = hasPresentLabels && visibleCount === presentCount;
            const isCollapsed = !normalizedSearch && collapsedGroups.has(group);

            return (
              <section className="rounded border border-border-soft bg-surface-100" key={group}>
                <div className="flex items-center gap-2 border-b border-border-soft px-2 py-2">
                  <button
                    aria-label={
                      isCollapsed
                        ? `Déplier le groupe ${formatGroupName(group)}`
                        : `Replier le groupe ${formatGroupName(group)}`
                    }
                    className="h-6 w-6 shrink-0 rounded border border-border-soft text-xs font-semibold text-text-soft transition hover:border-primary/70 hover:text-text"
                    onClick={() => toggleGroupCollapsed(group)}
                    type="button"
                  >
                    {isCollapsed ? "+" : "-"}
                  </button>
                  <input
                    aria-label={`Afficher le groupe ${formatGroupName(group)}`}
                    checked={areAllVisible}
                    className="h-4 w-4 accent-primary"
                    disabled={!hasPresentLabels}
                    onChange={(event) => onSetGroupVisible(group, event.target.checked)}
                    type="checkbox"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-text">
                      {formatGroupName(group)}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {presentCount} présents · {visibleCount} visibles
                    </p>
                  </div>
                </div>

                {isCollapsed ? null : (
                  <div className="divide-y divide-border-soft">
                    {groupLabels.map((label) => {
                      const canFocusLabel = Boolean(
                        label.isPresent &&
                          ((label.centerIjk && label.centerIjk.length >= 3) ||
                            (label.centerWorld && label.centerWorld.length >= 3)),
                      );

                      return (
                        <div
                          className={cn(
                            "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2",
                            label.isSelected && "bg-primary/10",
                            !label.isPresent && "opacity-45",
                          )}
                          key={label.labelId}
                        >
                        <input
                          aria-label={`Afficher ${label.name}`}
                          checked={label.isPresent && label.isVisible}
                          className="h-4 w-4 accent-primary"
                          disabled={!label.isPresent}
                          onChange={() => onToggleLabel(label.labelId)}
                          type="checkbox"
                        />
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 rounded-sm border border-white/30"
                          style={{ backgroundColor: label.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-text">{label.name}</p>
                          <p className="text-[11px] text-text-muted">
                            {label.isPresent
                              ? `${formatVoxelCount(label.voxelCount)} voxels · ${formatVolume(
                                  label.volumeMm3,
                                )}`
                              : "Absent"}
                          </p>
                        </div>
                        <button
                          className="h-7 rounded border border-border-soft px-2 text-[11px] font-medium text-text-soft transition hover:border-primary/70 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!canFocusLabel}
                          onClick={() => onCenterLabel(label.labelId)}
                          type="button"
                        >
                          Focus
                        </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-text-muted">
          Importez une segmentation pour voir les labels détectés.
        </p>
      )}
    </div>
  );
}

export const MaskLabelsPanel = SegmentationLabelPanel;
