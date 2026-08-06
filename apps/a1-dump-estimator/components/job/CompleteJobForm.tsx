"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, inputClassName } from "@/components/ui";
import { PhotoUploader, type LocalPhoto } from "@/components/estimate/PhotoUploader";
import { completeJobAction } from "@/app/jobs/[id]/actions";

/**
 * Photos here are recorded by filename only — this app has no Storage
 * bucket wired up yet (see README "What's real vs. stubbed"), so this
 * proves the completion workflow and its required-evidence rule without
 * pretending an upload happened.
 */
export function CompleteJobForm({ jobId }: { jobId: string }) {
  const [cleanSitePhotos, setCleanSitePhotos] = useState<LocalPhoto[]>([]);
  const [receiptPhotos, setReceiptPhotos] = useState<LocalPhoto[]>([]);
  const [actualWeightLbs, setActualWeightLbs] = useState("");
  const [actualDumpFee, setActualDumpFee] = useState("");
  const [actualLaborHours, setActualLaborHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    if (cleanSitePhotos.length === 0) {
      setError("At least one clean-site photo is required.");
      return;
    }
    if (receiptPhotos.length === 0) {
      setError("The official dump receipt photo is required.");
      return;
    }

    startTransition(async () => {
      await completeJobAction({
        jobId,
        cleanSitePhotoPaths: cleanSitePhotos.map((p) => p.file.name),
        dumpReceiptImagePath: receiptPhotos[0].file.name,
        actualWeightLbs: actualWeightLbs ? Number(actualWeightLbs) : null,
        actualDumpFee: actualDumpFee ? Number(actualDumpFee) : null,
        actualLaborHours: actualLaborHours ? Number(actualLaborHours) : null,
      });
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

      <Button fullWidth onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Completing…" : "Mark Job Complete"}
      </Button>
    </div>
  );
}
