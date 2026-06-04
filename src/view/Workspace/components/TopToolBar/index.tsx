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

import type { ReactNode } from "react";

import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import ContrastRoundedIcon from "@mui/icons-material/ContrastRounded";
import FilterCenterFocusRoundedIcon from "@mui/icons-material/FilterCenterFocusRounded";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import MouseRoundedIcon from "@mui/icons-material/MouseRounded";
import OpenWithRoundedIcon from "@mui/icons-material/OpenWithRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import StraightenRoundedIcon from "@mui/icons-material/StraightenRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import ViewAgendaRoundedIcon from "@mui/icons-material/ViewAgendaRounded";
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";

import { cn } from "~/helpers/Cn";
import type {
  ViewerAction,
  ViewerLayoutMode,
  ViewerTool,
  WindowPresetId,
} from "../CornerstoneViewer";

type ToolbarItem<TId extends string> = {
  id: TId;
  label: string;
  icon: ReactNode;
  isEnabled?: boolean;
};

type TopToolBarProps = {
  activeTool: ViewerTool;
  canRunAi: boolean;
  isAiPredicting: boolean;
  isBusy: boolean;
  status: string;
  viewerMode: ViewerLayoutMode;
  windowPreset: WindowPresetId;
  onBack: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onRunAiPrediction: () => void;
  onToolChange: (tool: ViewerTool) => void;
  onViewerAction: (action: ViewerAction) => void;
  onViewerModeChange: (mode: ViewerLayoutMode) => void;
  onWindowPresetChange: (preset: WindowPresetId) => void;
};

const viewerTools: Array<ToolbarItem<ViewerTool>> = [
  { id: "window", icon: <ContrastRoundedIcon fontSize="small" />, label: "Window/Level" },
  { id: "pan", icon: <OpenWithRoundedIcon fontSize="small" />, label: "Pan" },
  { id: "zoom", icon: <ZoomInRoundedIcon fontSize="small" />, label: "Zoom" },
  { id: "crosshair", icon: <CenterFocusStrongRoundedIcon fontSize="small" />, label: "Crosshair" },
  {
    id: "length",
    icon: <StraightenRoundedIcon fontSize="small" />,
    isEnabled: false,
    label: "Length - à venir",
  },
  {
    id: "hu",
    icon: <FilterCenterFocusRoundedIcon fontSize="small" />,
    isEnabled: false,
    label: "HU ROI - à venir",
  },
];

const viewerActions: Array<ToolbarItem<ViewerAction>> = [
  { id: "reset", icon: <RestartAltRoundedIcon fontSize="small" />, label: "Reset" },
  {
    id: "capture",
    icon: <PhotoCameraRoundedIcon fontSize="small" />,
    isEnabled: false,
    label: "Capture - à venir",
  },
  {
    id: "undo",
    icon: <UndoRoundedIcon fontSize="small" />,
    isEnabled: false,
    label: "Undo - à venir",
  },
];

const layoutItems: Array<ToolbarItem<ViewerLayoutMode>> = [
  { id: "mpr", icon: <GridViewRoundedIcon fontSize="small" />, label: "MPR" },
  { id: "axial", icon: <ViewAgendaRoundedIcon fontSize="small" />, label: "Axial 1x1" },
  { id: "sagittal", icon: <ViewColumnRoundedIcon fontSize="small" />, label: "Sagittal 1x1" },
  { id: "coronal", icon: <ViewAgendaRoundedIcon fontSize="small" />, label: "Coronal 1x1" },
  { id: "volume3d", icon: <ViewInArRoundedIcon fontSize="small" />, label: "3D" },
];

const presetItems: Array<ToolbarItem<WindowPresetId>> = [
  { id: "soft", icon: <ContrastRoundedIcon fontSize="small" />, label: "Soft tissue" },
  { id: "bone", icon: <ContrastRoundedIcon fontSize="small" />, label: "Bone" },
  { id: "lung", icon: <ContrastRoundedIcon fontSize="small" />, label: "Lung" },
];

function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-1 border-r border-border-soft pr-2 last:border-r-0 last:pr-0">
      {children}
    </div>
  );
}

function CompactButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 text-xs font-semibold text-text-soft transition disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-primary/70 bg-primary/20 text-primary-100"
          : "border-border-soft bg-surface-100 hover:border-primary/60 hover:text-text",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function TopToolBar({
  activeTool,
  canRunAi,
  isAiPredicting,
  isBusy,
  onBack,
  onImport,
  onRefresh,
  onRunAiPrediction,
  onToolChange,
  onViewerAction,
  onViewerModeChange,
  onWindowPresetChange,
  status,
  viewerMode,
  windowPreset,
}: TopToolBarProps) {
  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-2 text-text shadow-sm">
      <ToolbarGroup>
        <CompactButton label="Retour import" onClick={onBack}>
          <ArrowBackRoundedIcon fontSize="small" />
        </CompactButton>
        <div className="hidden min-w-[9rem] sm:block">
          <p className="text-xs font-semibold leading-4 text-text">Hekia CT Viewer</p>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">{status}</p>
        </div>
      </ToolbarGroup>

      <ToolbarGroup>
        <CompactButton label="Importer un examen" onClick={onImport}>
          <UploadFileRoundedIcon fontSize="small" />
        </CompactButton>
        <CompactButton disabled={isBusy} label="Actualiser" onClick={onRefresh}>
          <RefreshRoundedIcon fontSize="small" />
        </CompactButton>
      </ToolbarGroup>

      <ToolbarGroup>
        {layoutItems.map((item) => (
          <CompactButton
            active={viewerMode === item.id}
            key={item.id}
            label={item.label}
            onClick={() => onViewerModeChange(item.id)}
          >
            {item.icon}
          </CompactButton>
        ))}
      </ToolbarGroup>

      <ToolbarGroup>
        {viewerTools.map((tool) => (
          <CompactButton
            active={activeTool === tool.id}
            disabled={viewerMode === "volume3d" || tool.isEnabled === false}
            key={tool.id}
            label={tool.label}
            onClick={() => onToolChange(tool.id)}
          >
            {tool.icon}
          </CompactButton>
        ))}
        <CompactButton
          active={activeTool === "none"}
          disabled={viewerMode === "volume3d"}
          label="Scroll"
          onClick={() => onToolChange("none")}
        >
          <MouseRoundedIcon fontSize="small" />
        </CompactButton>
      </ToolbarGroup>

      <ToolbarGroup>
        {presetItems.map((preset) => (
          <CompactButton
            active={windowPreset === preset.id}
            disabled={viewerMode === "volume3d"}
            key={preset.id}
            label={preset.label}
            onClick={() => onWindowPresetChange(preset.id)}
          >
            <span>{preset.id.toUpperCase()}</span>
          </CompactButton>
        ))}
      </ToolbarGroup>

      <ToolbarGroup>
        {viewerActions.map((action) => (
          <CompactButton
            disabled={viewerMode === "volume3d" || action.isEnabled === false}
            key={action.id}
            label={action.label}
            onClick={() => onViewerAction(action.id)}
          >
            {action.icon}
          </CompactButton>
        ))}
      </ToolbarGroup>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "hidden h-2 w-2 rounded-full sm:block",
            canRunAi ? "bg-secondary" : "bg-warning",
          )}
          title={canRunAi ? "IA disponible" : "IA indisponible"}
        />
        <CompactButton
          active={isAiPredicting}
          disabled={!canRunAi || isBusy}
          label={isAiPredicting ? "IA en cours" : "Lancer l'IA"}
          onClick={onRunAiPrediction}
        >
          <PsychologyRoundedIcon fontSize="small" />
        </CompactButton>
      </div>
    </header>
  );
}
