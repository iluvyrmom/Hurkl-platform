import { PageHeader } from "@/components/ui";
import { NewEstimateForm } from "@/components/estimate/NewEstimateForm";

export default function NewEstimatePage() {
  return (
    <div>
      <PageHeader title="New Estimate" subtitle="Two minutes, start to finish" />
      <NewEstimateForm />
    </div>
  );
}
