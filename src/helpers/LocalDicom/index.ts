// =============================================================
//
// File        : index.ts
// Project     : H-kia-CT-Viewer-Front
//
// =============================================================

import dicomImageLoader from "@cornerstonejs/dicom-image-loader";
import * as dicomParser from "dicom-parser";

import { initCornerstone } from "~/helpers/Cornerstone";

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

export type LocalDicomImage = {
  file: File;
  filename: string;
  relativePath: string;
  imageId: string;
  instanceNumber: number | null;
  sliceLocation: number | null;
  imagePositionPatient: number[] | null;
  imageOrientationPatient: number[] | null;
  sortPosition: number | null;
  rows: number | null;
  columns: number | null;
};

export type LocalDicomSeries = {
  studyInstanceUid: string | null;
  seriesInstanceUid: string | null;
  frameOfReferenceUid: string | null;
  modality: string | null;
  seriesDescription: string | null;
  protocolName: string | null;
  manufacturer: string | null;
  rows: number | null;
  columns: number | null;
  sliceThickness: number | null;
  pixelSpacing: number[] | null;
  images: LocalDicomImage[];
};

export type LocalDicomBuildResult = {
  selectedSeries: LocalDicomSeries;
  series: LocalDicomSeries[];
  metrics: {
    timeToFirstSliceMs: number;
    dicomFilesCount: number;
    skippedFilesCount: number;
  };
};

type ParsedDicomFile = Omit<LocalDicomImage, "imageId"> & {
  frameOfReferenceUid: string | null;
  modality: string | null;
  protocolName: string | null;
  seriesDescription: string | null;
  seriesInstanceUid: string | null;
  sliceThickness: number | null;
  studyInstanceUid: string | null;
  manufacturer: string | null;
  pixelSpacing: number[] | null;
  hasPixelData: boolean;
};

function getDisplayPath(file: File) {
  const fileWithRelativePath = file as FileWithRelativePath;

  return fileWithRelativePath.webkitRelativePath || file.name;
}

function readNumberList(dataSet: dicomParser.DataSet, tag: string) {
  const rawValue = dataSet.string(tag);

  if (!rawValue) {
    return null;
  }

  const values = rawValue
    .split("\\")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? values : null;
}

function readNumber(dataSet: dicomParser.DataSet, tag: string) {
  const rawValue = dataSet.string(tag);
  const value = rawValue == null ? Number.NaN : Number(rawValue);

  return Number.isFinite(value) ? value : null;
}

function readUint16(dataSet: dicomParser.DataSet, tag: string) {
  try {
    const value = dataSet.uint16(tag);

    return Number.isFinite(value) ? value : null;
  } catch {
    return readNumber(dataSet, tag);
  }
}

function getNormal(orientation: number[] | null) {
  if (!orientation || orientation.length < 6) {
    return null;
  }

  const row = orientation.slice(0, 3);
  const column = orientation.slice(3, 6);

  return [
    row[1] * column[2] - row[2] * column[1],
    row[2] * column[0] - row[0] * column[2],
    row[0] * column[1] - row[1] * column[0],
  ];
}

function getProjectedSortPosition(position: number[] | null, orientation: number[] | null) {
  const normal = getNormal(orientation);

  if (!position || position.length < 3 || !normal) {
    return null;
  }

  return position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2];
}

async function parseDicomFile(file: File): Promise<ParsedDicomFile | null> {
  try {
    const byteArray = new Uint8Array(await file.arrayBuffer());
    const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
    const imagePositionPatient = readNumberList(dataSet, "x00200032");
    const imageOrientationPatient = readNumberList(dataSet, "x00200037");
    const relativePath = getDisplayPath(file);

    return {
      columns: readUint16(dataSet, "x00280011") ?? null,
      file,
      filename: file.name,
      frameOfReferenceUid: dataSet.string("x00200052") || null,
      hasPixelData: Boolean(dataSet.elements.x7fe00010),
      imageOrientationPatient,
      imagePositionPatient,
      instanceNumber: readNumber(dataSet, "x00200013"),
      manufacturer: dataSet.string("x00080070") || null,
      modality: dataSet.string("x00080060") || null,
      pixelSpacing: readNumberList(dataSet, "x00280030"),
      protocolName: dataSet.string("x00181030") || null,
      relativePath,
      rows: readUint16(dataSet, "x00280010") ?? null,
      seriesDescription: dataSet.string("x0008103e") || null,
      seriesInstanceUid: dataSet.string("x0020000e") || null,
      sliceLocation: readNumber(dataSet, "x00201041"),
      sliceThickness: readNumber(dataSet, "x00180050"),
      sortPosition: getProjectedSortPosition(imagePositionPatient, imageOrientationPatient),
      studyInstanceUid: dataSet.string("x0020000d") || null,
    };
  } catch {
    return null;
  }
}

function compareDicomImages(left: LocalDicomImage, right: LocalDicomImage) {
  if (left.sortPosition != null && right.sortPosition != null) {
    return left.sortPosition - right.sortPosition;
  }

  if (left.instanceNumber != null && right.instanceNumber != null) {
    return left.instanceNumber - right.instanceNumber;
  }

  return left.relativePath.localeCompare(right.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function chooseMainSeries(series: LocalDicomSeries[]) {
  const sortedSeries = [...series].sort((left, right) => {
    const leftIsCt = left.modality?.toUpperCase() === "CT" ? 1 : 0;
    const rightIsCt = right.modality?.toUpperCase() === "CT" ? 1 : 0;

    if (leftIsCt !== rightIsCt) {
      return rightIsCt - leftIsCt;
    }

    return right.images.length - left.images.length;
  });

  return sortedSeries[0] || null;
}

function groupSeries(parsedFiles: ParsedDicomFile[]) {
  const groupedSeries = new Map<string, ParsedDicomFile[]>();

  parsedFiles.forEach((file) => {
    if (!file.hasPixelData) {
      return;
    }

    const key = [
      file.studyInstanceUid || "unknown-study",
      file.seriesInstanceUid || "unknown-series",
    ].join("::");
    const currentGroup = groupedSeries.get(key) || [];

    currentGroup.push(file);
    groupedSeries.set(key, currentGroup);
  });

  return Array.from(groupedSeries.values()).map((images) => {
    const firstImage = images[0];
    const sortedImages = images
      .map((image) => ({
        columns: image.columns,
        file: image.file,
        filename: image.filename,
        imageId: "",
        imageOrientationPatient: image.imageOrientationPatient,
        imagePositionPatient: image.imagePositionPatient,
        instanceNumber: image.instanceNumber,
        relativePath: image.relativePath,
        rows: image.rows,
        sliceLocation: image.sliceLocation,
        sortPosition: image.sortPosition,
      }))
      .sort(compareDicomImages);

    return {
      columns: firstImage.columns,
      frameOfReferenceUid: firstImage.frameOfReferenceUid,
      images: sortedImages,
      manufacturer: firstImage.manufacturer,
      modality: firstImage.modality,
      pixelSpacing: firstImage.pixelSpacing,
      protocolName: firstImage.protocolName,
      rows: firstImage.rows,
      seriesDescription: firstImage.seriesDescription,
      seriesInstanceUid: firstImage.seriesInstanceUid,
      sliceThickness: firstImage.sliceThickness,
      studyInstanceUid: firstImage.studyInstanceUid,
    } satisfies LocalDicomSeries;
  });
}

export async function buildLocalDicomStudy(files: File[]): Promise<LocalDicomBuildResult> {
  const startedAt = performance.now();
  const parsedFiles = (await Promise.all(files.map(parseDicomFile))).filter(
    (file): file is ParsedDicomFile => Boolean(file),
  );
  const series = groupSeries(parsedFiles);
  const selectedSeries = chooseMainSeries(series);

  if (!selectedSeries || selectedSeries.images.length === 0) {
    throw new Error("No CT series found");
  }

  await initCornerstone();

  const fileManager = dicomImageLoader.wadouri.fileManager;
  const selectedImages = selectedSeries.images.map((image) => ({
    ...image,
    imageId: fileManager.add(image.file),
  }));
  const timeToFirstSliceMs = Math.round(performance.now() - startedAt);
  const selectedSeriesWithImageIds = {
    ...selectedSeries,
    images: selectedImages,
  };
  const nextSeries = series.map((item) =>
    item === selectedSeries ? selectedSeriesWithImageIds : item,
  );

  if (import.meta.env.DEV) {
    console.info("[Local DICOM import metrics]", {
      dicom_files_count: parsedFiles.length,
      selected_series_uid: selectedSeriesWithImageIds.seriesInstanceUid,
      selected_slices_count: selectedSeriesWithImageIds.images.length,
      skipped_files_count: files.length - parsedFiles.length,
      time_to_first_slice_ms: timeToFirstSliceMs,
    });
  }

  return {
    metrics: {
      dicomFilesCount: parsedFiles.length,
      skippedFilesCount: files.length - parsedFiles.length,
      timeToFirstSliceMs,
    },
    selectedSeries: selectedSeriesWithImageIds,
    series: nextSeries,
  };
}
