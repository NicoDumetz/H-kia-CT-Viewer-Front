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

import { type ChangeEvent, type FormEvent, useState } from "react";

import { Button } from "~/components/Button";
import { Input } from "~/components/Input";

type SegmentationUploadProps = {
  isBusy: boolean;
  onUpload: (file: File, name?: string, labelsFile?: File) => void;
};

function isNiftiFile(file: File) {
  const filename = file.name.toLowerCase();

  return filename.endsWith(".nii") || filename.endsWith(".nii.gz");
}

export function SegmentationUpload({ isBusy, onUpload }: SegmentationUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [labelsFile, setLabelsFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;

    setFile(nextFile);
    setError(null);
  };

  const handleLabelsFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLabelsFile(event.target.files?.[0] || null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError("Selectionnez un fichier .nii ou .nii.gz.");
      return;
    }

    if (!isNiftiFile(file)) {
      setError("Le fichier doit etre au format .nii ou .nii.gz.");
      return;
    }

    onUpload(file, name.trim() || undefined, labelsFile || undefined);
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Input
        accept=".nii,.nii.gz"
        disabled={isBusy}
        error={error || undefined}
        label="Masque NIfTI"
        onChange={handleFileChange}
        type="file"
      />
      <Input
        disabled={isBusy}
        label="Nom optionnel"
        onChange={(event) => setName(event.target.value)}
        placeholder="Masque externe"
        type="text"
        value={name}
      />
      <Input
        accept=".json,application/json"
        disabled={isBusy}
        label="Labels JSON optionnel"
        onChange={handleLabelsFileChange}
        type="file"
      />
      <p className="text-xs leading-relaxed text-text-muted">
        Le masque doit avoir la meme shape que le volume prepare.
      </p>
      <Button disabled={isBusy} fullWidth type="submit" variant="soft">
        Importer masque
      </Button>
    </form>
  );
}
