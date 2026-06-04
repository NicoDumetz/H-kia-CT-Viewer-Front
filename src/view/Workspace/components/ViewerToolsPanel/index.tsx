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

import { Button } from "~/components/Button";
import type {
  HuMeasurementPanelState,
  ViewerAction,
  ViewerTool,
} from "../CornerstoneViewer";
import { cn } from "~/helpers/Cn";

type ToolButton<TId extends string> = {
  id: TId;
  icon: IconName;
  label: string;
  disabled?: boolean;
  title?: string;
};

type ViewerToolsPanelProps = {
  activeTool: ViewerTool;
  disabled?: boolean;
  huMeasurementState: HuMeasurementPanelState;
  onAction: (action: ViewerAction) => void;
  onToolChange: (tool: ViewerTool) => void;
};

const toolButtons: Array<ToolButton<ViewerTool>> = [
  { id: "window", icon: "contrast", label: "Contraste" },
  { id: "pan", icon: "pan", label: "Pan" },
  { id: "zoom", icon: "zoom", label: "Zoom" },
  { id: "length", icon: "length", label: "Longueur" },
  { id: "hu", icon: "hu", label: "HU" },
  { id: "crosshair", icon: "crosshair", label: "Crosshair" },
];

const actionButtons: Array<ToolButton<ViewerAction>> = [
  { id: "reset", icon: "reset", label: "Reset", title: "Réinitialise zoom, pan, contraste et annotations temporaires." },
  { id: "capture", icon: "capture", label: "Capture" },
  { id: "undo", icon: "undo", label: "Undo" },
];

type IconName =
  | "capture"
  | "contrast"
  | "crosshair"
  | "hu"
  | "length"
  | "pan"
  | "reset"
  | "undo"
  | "zoom";

const toolHelp: Record<ViewerTool, string> = {
  crosshair: "Cliquez dans une vue pour déplacer le repère.",
  hu: "Cliquez pour placer le centre, déplacez pour définir le rayon, recliquez pour valider.",
  length: "Tracez une distance entre deux points.",
  none: "",
  pan: "Cliquez-glissez pour déplacer la coupe.",
  window: "Cliquez-glissez sur l'image pour ajuster le contraste.",
  zoom: "Cliquez-glissez verticalement pour zoomer.",
};

function formatHuValue(value: number) {
  return `${Math.round(value)} HU`;
}

function HuMeasurementSummary({ state }: { state: HuMeasurementPanelState }) {
  if (state.status === "loading") {
    return <p className="text-xs text-text-muted">Calcul HU en cours...</p>;
  }

  if (state.status === "error") {
    return <p className="text-xs text-quaternary-100">{state.message}</p>;
  }

  if (state.status === "success") {
    const result = state.result;

    return (
      <div className="space-y-1 text-xs leading-relaxed text-text-muted">
        <p className="font-semibold text-text">Mesure HU</p>
        <p>Moyenne : {formatHuValue(result.hu.mean)}</p>
        <p>C'est la densité moyenne dans le cercle sélectionné.</p>
        <p>Médiane : {formatHuValue(result.hu.median)}</p>
        <p>La médiane réduit l'effet des valeurs extrêmes.</p>
        <p>
          Min / Max : {formatHuValue(result.hu.min)} / {formatHuValue(result.hu.max)}
        </p>
        <p>Surface : {Math.round(result.area_mm2)} mm2</p>
        <p>Voxels analysés : {result.voxel_count}</p>
      </div>
    );
  }

  return (
    <p className="text-xs leading-relaxed text-text-muted">
      Cliquez pour placer le centre, puis déplacez pour définir le rayon.
    </p>
  );
}

function ToolIcon({ name }: { name: IconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "h-3.5 w-3.5 flex-shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (name === "contrast") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v16" />
        <path d="M12 20a8 8 0 0 0 0-16" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "pan") {
    return (
      <svg {...commonProps}>
        <path d="M12 3v18" />
        <path d="M3 12h18" />
        <path d="m8 7 4-4 4 4" />
        <path d="m8 17 4 4 4-4" />
        <path d="m7 8-4 4 4 4" />
        <path d="m17 8 4 4-4 4" />
      </svg>
    );
  }

  if (name === "zoom") {
    return (
      <svg {...commonProps}>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M16 16l5 5" />
        <path d="M10.5 7.5v6" />
        <path d="M7.5 10.5h6" />
      </svg>
    );
  }

  if (name === "length") {
    return (
      <svg {...commonProps}>
        <path d="M5 19 19 5" />
        <path d="M5 15v4h4" />
        <path d="M15 5h4v4" />
      </svg>
    );
  }

  if (name === "hu") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="7" />
        <path d="M9 12h6" />
        <path d="M12 9v6" />
      </svg>
    );
  }

  if (name === "crosshair") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="2" />
        <path d="M12 3v5" />
        <path d="M12 16v5" />
        <path d="M3 12h5" />
        <path d="M16 12h5" />
      </svg>
    );
  }

  if (name === "capture") {
    return (
      <svg {...commonProps}>
        <path d="M7 7h10l1.5 3H21v8H3v-8h2.5L7 7Z" />
        <circle cx="12" cy="14" r="3" />
      </svg>
    );
  }

  if (name === "reset") {
    return (
      <svg {...commonProps}>
        <path d="M4 7v5h5" />
        <path d="M5 12a7 7 0 1 0 2-5" />
      </svg>
    );
  }

  if (name === "undo") {
    return (
      <svg {...commonProps}>
        <path d="M9 7 4 12l5 5" />
        <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
      </svg>
    );
  }

  return null;
}

export function ViewerToolsPanel({
  activeTool,
  disabled = false,
  huMeasurementState,
  onAction,
  onToolChange,
}: ViewerToolsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {toolButtons.map((tool) => {
          const isDisabled = disabled || tool.disabled;
          const isActive = activeTool === tool.id;

          return (
            <Button
              className={cn("h-8 px-2 text-xs")}
              disabled={isDisabled}
              fullWidth
              key={tool.id}
              leftIcon={<ToolIcon name={tool.icon} />}
              onClick={() => onToolChange(tool.id)}
              size="sm"
              title={tool.title}
              variant={isActive ? "primary" : "soft"}
            >
              {tool.label}
            </Button>
          );
        })}
        {actionButtons.map((action) => (
          <Button
            className={cn("h-8 px-2 text-xs")}
            disabled={disabled || action.disabled}
            fullWidth
            key={action.id}
            leftIcon={<ToolIcon name={action.icon} />}
            onClick={() => onAction(action.id)}
            size="sm"
            title={action.title}
            variant="soft"
          >
            {action.label}
          </Button>
        ))}
      </div>

      {toolHelp[activeTool] ? (
        <p className="rounded border border-border-soft bg-surface-100 px-3 py-2 text-xs leading-relaxed text-text-muted">
          {toolHelp[activeTool]}
        </p>
      ) : null}

      {activeTool === "hu" || huMeasurementState.status === "success" || huMeasurementState.status === "error" ? (
        <div className="rounded border border-border-soft bg-surface-100 p-3">
          <HuMeasurementSummary state={huMeasurementState} />
        </div>
      ) : null}
    </div>
  );
}
