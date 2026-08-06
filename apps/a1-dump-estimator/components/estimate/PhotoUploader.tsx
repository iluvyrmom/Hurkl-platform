"use client";

import { useRef, useState } from "react";
import { CameraIcon, TrashIcon } from "@/components/icons";

export interface LocalPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/**
 * Local-only photo capture: drag/drop, file picker, and camera capture
 * (native `capture` attribute — works without any extra permissions dialog
 * beyond the browser's own camera prompt). Photos are attached for the
 * record and future AI analysis but are not yet uploaded to storage or
 * analyzed — see PHOTO_ANALYSIS_PROVIDER in .env.example and README "What's
 * real vs. stubbed."
 */
export function PhotoUploader({
  photos,
  onChange,
}: {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const newPhotos: LocalPhoto[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    onChange([...photos, ...newPhotos]);
  }

  function removePhoto(id: string) {
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors ${
          dragActive ? "border-brand-orange bg-orange-50" : "border-slate-300 text-brand-slate"
        }`}
      >
        <p className="mb-3">Drag photos here, or:</p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-[48px] items-center gap-2 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white"
          >
            <CameraIcon className="h-5 w-5" /> Camera
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[48px] items-center gap-2 rounded-lg border-2 border-brand-navy px-4 text-sm font-semibold text-brand-navy"
          >
            Upload
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, next/image can't optimize it */}
              <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
