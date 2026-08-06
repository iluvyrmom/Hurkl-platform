import { Card, PageHeader } from "@/components/ui";
import { DEFAULT_BUSINESS } from "@/lib/config/business";
import { getPhotoAnalysisProvider } from "@/lib/providers/photo-analysis";
import { getMapsProvider } from "@/lib/providers/maps";
import { getPaymentProvider } from "@/lib/providers/payments";
import { getOCRProvider } from "@/lib/providers/ocr";
import { getNotificationProvider } from "@/lib/providers/notifications";
import { getSupabaseClient } from "@/lib/db/supabase-client";
import { getLearningAccuracySummary } from "@/lib/learning/service";

export default async function SettingsPage() {
  const accuracy = await getLearningAccuracySummary(DEFAULT_BUSINESS.id);

  const providers = [
    { label: "Database", name: getSupabaseClient() ? "supabase" : "in-memory (dev)" },
    { label: "Photo analysis", name: getPhotoAnalysisProvider().name },
    { label: "Maps / routing", name: getMapsProvider().name },
    { label: "Payments", name: getPaymentProvider().name },
    { label: "Receipt OCR", name: getOCRProvider().name },
    { label: "Notifications", name: getNotificationProvider().name },
  ];

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-5 px-4 pt-5">
        <Card className="space-y-1">
          <h2 className="text-base font-bold text-brand-navy">Business</h2>
          <p className="text-sm text-brand-slate">{DEFAULT_BUSINESS.name}</p>
          <p className="text-sm text-brand-slate">{DEFAULT_BUSINESS.primaryAddress}</p>
          <p className="mt-2 text-xs text-brand-slate">
            Business profile editing is future work — Phase 1 ships one seeded business record.
          </p>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-base font-bold text-brand-navy">Providers</h2>
          <ul className="divide-y divide-slate-200">
            {providers.map((p) => (
              <li key={p.label} className="flex items-center justify-between py-2 text-sm">
                <span className="text-brand-slate">{p.label}</span>
                <span className="font-mono font-semibold text-brand-navy">{p.name}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brand-slate">
            Anything showing a mock/in-memory provider is running with zero external cost — set the
            matching key in .env.local to activate a real provider. See README.
          </p>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-base font-bold text-brand-navy">Learning system</h2>
          <p className="text-sm text-brand-slate">{accuracy.sampleSize} completed job(s) recorded</p>
          {accuracy.sampleSize > 0 && (
            <ul className="text-sm text-brand-slate">
              {accuracy.averageWeightErrorPercent != null && (
                <li>Weight estimate error: {accuracy.averageWeightErrorPercent.toFixed(1)}%</li>
              )}
              {accuracy.averageDumpFeeErrorPercent != null && (
                <li>Dump fee estimate error: {accuracy.averageDumpFeeErrorPercent.toFixed(1)}%</li>
              )}
              {accuracy.averageLaborHoursErrorPercent != null && (
                <li>Labor hours estimate error: {accuracy.averageLaborHoursErrorPercent.toFixed(1)}%</li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
