import { PageHeader } from "@/components/ui";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  return (
    <div>
      <PageHeader title="Sign in" />
      <div className="px-4 pt-6">
        <SignInForm />
      </div>
    </div>
  );
}
