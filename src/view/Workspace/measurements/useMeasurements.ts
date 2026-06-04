// =============================================================
//
// File        : useMeasurements.ts
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MedicalMeasurement } from "./measurementTypes";

type MeasurementsByStudy = Record<string, MedicalMeasurement[]>;

export function useMeasurements(studyId?: string) {
  const [measurementsByStudyId, setMeasurementsByStudyId] = useState<MeasurementsByStudy>({});
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

  const measurements = useMemo(() => {
    if (!studyId) {
      return [];
    }

    return measurementsByStudyId[studyId] || [];
  }, [measurementsByStudyId, studyId]);

  const addMeasurement = useCallback((measurement: MedicalMeasurement) => {
    setMeasurementsByStudyId((currentState) => {
      const currentMeasurements = currentState[measurement.studyId] || [];

      return {
        ...currentState,
        [measurement.studyId]: [...currentMeasurements, measurement],
      };
    });
    setSelectedMeasurementId(measurement.id);
  }, []);

  const deleteMeasurement = useCallback((measurementId: string) => {
    setMeasurementsByStudyId((currentState) => {
      const nextState: MeasurementsByStudy = {};

      Object.entries(currentState).forEach(([currentStudyId, currentMeasurements]) => {
        nextState[currentStudyId] = currentMeasurements.filter(
          (measurement) => measurement.id !== measurementId,
        );
      });

      return nextState;
    });
    setSelectedMeasurementId((currentId) =>
      currentId === measurementId ? null : currentId,
    );
  }, []);

  const resetMeasurements = useCallback(() => {
    if (!studyId) {
      return;
    }

    setMeasurementsByStudyId((currentState) => ({
      ...currentState,
      [studyId]: [],
    }));
    setSelectedMeasurementId(null);
  }, [studyId]);

  useEffect(() => {
    setSelectedMeasurementId(null);
  }, [studyId]);

  return {
    addMeasurement,
    deleteMeasurement,
    measurements,
    resetMeasurements,
    selectedMeasurementId,
    selectMeasurement: setSelectedMeasurementId,
  };
}
