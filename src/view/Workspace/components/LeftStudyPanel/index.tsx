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

import { cn } from "~/helpers/Cn";
import type { Study, StudyViewerResponse, StudyVolumeResponse } from "~/types/Studies";
import type { StudyWorkspace } from "~/types/Workspace";

type LeftStudyPanelProps = {
  currentStudyId: string;
  studies: Study[];
  viewer: StudyViewerResponse | null;
  volume: StudyVolumeResponse | null;
  workspace: StudyWorkspace;
  onOpenStudy: (studyId: string) => void;
};

function formatDate(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatShape(shape: number[] | undefined) {
  if (!shape?.length) {
    return "-";
  }

  return shape.join(" x ");
}

function formatSpacing(spacing: number[] | undefined) {
  if (!spacing?.length) {
    return "-";
  }

  return spacing.map((value) => `${Number(value).toFixed(2)} mm`).join(" / ");
}

function getMetadataValue(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
) {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return null;
}

function PanelSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-b border-border-soft px-3 py-3 last:border-b-0">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-text-soft">{value}</span>
    </div>
  );
}

export function LeftStudyPanel({
  currentStudyId,
  onOpenStudy,
  studies,
  viewer,
  volume,
  workspace,
}: LeftStudyPanelProps) {
  const currentStudy = studies.find((study) => study.id === currentStudyId);
  const metadata = currentStudy?.metadata;
  const patientName = getMetadataValue(metadata, ["patient_name", "PatientName", "patient"]);
  const patientId = getMetadataValue(metadata, ["patient_id", "PatientID"]);
  const studyDescription = getMetadataValue(metadata, [
    "study_description",
    "StudyDescription",
    "description",
  ]);
  const selectedSeriesUid = volume?.volume.metadata.selected_series_instance_uid || null;
  const dicomSeries = viewer?.dicom?.series || [];

  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-hidden border-r border-border-soft bg-surface lg:flex">
      <PanelSection title="Patient / Study">
        <div className="space-y-1">
          <FieldRow label="Patient" value={patientName || "-"} />
          <FieldRow label="ID" value={patientId || currentStudyId.slice(0, 8)} />
          <FieldRow label="Study" value={studyDescription || workspace.study.input_type} />
          <FieldRow label="Créé" value={formatDate(workspace.study.created_at)} />
          <FieldRow label="Statut" value={workspace.study.status} />
        </div>
      </PanelSection>

      <PanelSection title="Volume canonique">
        <div className="rounded border border-border-soft bg-black/20 p-2">
          <FieldRow
            label="Source"
            value={volume?.volume.metadata.source_type || workspace.study.input_type}
          />
          <FieldRow label="Shape" value={formatShape(volume?.volume.metadata.shape)} />
          <FieldRow label="Spacing" value={formatSpacing(volume?.volume.metadata.spacing)} />
          <FieldRow
            label="Série"
            value={
              volume?.volume.metadata.selected_series_description ||
              volume?.volume.metadata.selected_protocol_name ||
              "ct.nii.gz"
            }
          />
          <p className="mt-2 border-t border-border-soft pt-2 text-[11px] leading-relaxed text-secondary-200">
            Rendu principal via le volume préparé backend.
          </p>
        </div>
      </PanelSection>

      <PanelSection title="Séries DICOM">
        {dicomSeries.length ? (
          <div className="space-y-2">
            {dicomSeries.map((series, index) => {
              const isSelected = Boolean(
                selectedSeriesUid && series.series_instance_uid === selectedSeriesUid,
              );

              return (
                <div
                  className={cn(
                    "rounded border border-border-soft bg-surface-100 p-2 text-xs",
                    isSelected && "border-secondary/70 bg-secondary/10",
                  )}
                  key={series.series_instance_uid || `${series.series_description}-${index}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold text-text">
                      {series.series_description || series.protocol_name || `Série ${index + 1}`}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {series.files_count}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-text-muted">
                    {series.modality || "-"} · {series.rows || "-"} x {series.columns || "-"}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-text-muted">
            Aucune série brute listée pour cet examen.
          </p>
        )}
      </PanelSection>

      <PanelSection title="Studies">
        {studies.length ? (
          <div className="max-h-[24rem] space-y-1 overflow-y-auto pr-1">
            {studies.map((study) => (
              <button
                className={cn(
                  "w-full rounded border px-2 py-2 text-left text-xs transition",
                  study.id === currentStudyId
                    ? "border-primary/70 bg-primary/15 text-text"
                    : "border-border-soft bg-surface-100 text-text-soft hover:border-primary/50",
                )}
                key={study.id}
                onClick={() => onOpenStudy(study.id)}
                type="button"
              >
                <span className="block truncate font-semibold">{study.id.slice(0, 8)}</span>
                <span className="block truncate text-[11px] text-text-muted">
                  {study.input_type} · {study.status} · {study.files_count} fichiers
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">Aucune étude chargée.</p>
        )}
      </PanelSection>
    </aside>
  );
}
