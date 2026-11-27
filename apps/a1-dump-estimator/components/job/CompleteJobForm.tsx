"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, inputClassName } from "@/components/ui";
import { PhotoUploader, type LocalPhoto } from "@/components/estimate/PhotoUploader";
import { completeJobAction } from "@/app/jobs/[id]/actions";
import { fileToDataUrl } from "@/lib/files/file-to-data-url";

/**
 * Clean-site photos and the receipt image are recorded by filename only —
 * this app has no Storage bucket wired up for permanent photo storage yet
 * (see README "What's real vs. stubbed"). The receipt's actual bytes ARE
 * sent to the server (as a data: URL) for OCR extraction and duplicate
 * detection, just not persisted anywhere beyond that one request.
 */
export function CompleteJobForm({ jobId }: { jobId: string }) {
  const [cleanSitePhotos, setCleanSitePhotos] = useState<LocalPhoto[]>([]);
  const [receiptPhotos, setReceiptPhotos] = useState<LocalPhoto[]>([]);
  const [actualWeightLbs, setActualWeightLbs] = useState("");
  const [actualDumpFee, setActualDumpFee] = useState("");
  const [actualLaborHours, setActualLaborHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(overrideConfirmed: boolean) {
    setError(null);
    if (!overrideConfirmed) {
      setDuplicateWarning(null);
      if (cleanSitePhotos.length === 0) {
        setError("At least one clean-site photo is required.");
        return;
      }
      if (receiptPhotos.length === 0) {
        setError("The official dump receipt photo is required.");
        return;
      }
    }

    startTransition(async () => {
      const receiptDataUrl = await fileToDataUrl(receiptPhotos[0].file);
      const result = await completeJobAction({
        jobId,
        cleanSitePhotoPaths: cleanSitePhotos.map((p) => p.file.name),
        dumpReceiptImagePath: receiptPhotos[0].file.name,
        dumpReceiptImageDataUrl: receiptDataUrl,
        actualWeightLbs: actualWeightLbs ? Number(actualWeightLbs) : null,
        actualDumpFee: actualDumpFee ? Number(actualDumpFee) : null,
        actualLaborHours: actualLaborHours ? Number(actualLaborHours) : null,
        duplicateOverrideConfirmed: overrideConfirmed,
      });

      if (!result.ok && result.error === "duplicate") {
        setDuplicateWarning(
          `This receipt matches one already used for job ${result.duplicateOfJobId} — same photo or same ticket number. If this is a mistake (wrong photo), go back and re-upload the correct receipt. If it's genuinely this job's receipt, confirm below to proceed anyway.`,
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Clean-site photos</h2>
        <PhotoUploader photos={cleanSitePhotos} onChange={setCleanSitePhotos} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Dump receipt</h2>
        <PhotoUploader photos={receiptPhotos} onChange={setReceiptPhotos} />
        <p className="text-xs text-brand-slate">
          Checked automatically for duplicates and read for facility, ticket number, date, weight,
          and amount — always double-check against the physical receipt.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Actuals</h2>
        <Field label="Actual weight (lbs)">
          <input
            type="number"
            className={inputClassName}
            value={actualWeightLbs}
            onChange={(e) => setActualWeightLbs(e.target.value)}
          />
        </Field>
        <Field label="Actual dump fee ($)">
          <input
            type="number"
            className={inputClassName}
            value={actualDumpFee}
            onChange={(e) => setActualDumpFee(e.target.value)}
          />
        </Field>
        <Field label="Actual labor hours">
          <input
            type="number"
            className={inputClassName}
            value={actualLaborHours}
            onChange={(e) => setActualLaborHours(e.target.value)}
          />
        </Field>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-brand-danger">{error}</p>
      )}

      {duplicateWarning && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">{duplicateWarning}</p>
          <Button variant="danger" fullWidth onClick={() => submit(true)} disabled={isPending}>
            {isPending ? "Working…" : "Confirm — Not a Duplicate, Complete Anyway"}
          </Button>
        </div>
      )}

      <Button fullWidth onClick={() => submit(false)} disabled={isPending}>
        {isPending ? "Completing…" : "Mark Job Complete"}
      </Button>
    </div>
  );
}
