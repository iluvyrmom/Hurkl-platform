"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateCompanyForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [industry, setIndustry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName,
        ownerName,
        businessPhone,
        businessEmail,
        industry,
        timezone,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="companyName">Company name</label>
        <input
          id="companyName"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="ownerName">Your name</label>
        <input
          id="ownerName"
          required
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="businessPhone">Business phone</label>
        <input
          id="businessPhone"
          value={businessPhone}
          onChange={(e) => setBusinessPhone(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="businessEmail">Business email</label>
        <input
          id="businessEmail"
          type="email"
          value={businessEmail}
          onChange={(e) => setBusinessEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="industry">Industry / service type</label>
        <input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
      </div>
      <div>
        <label htmlFor="timezone">Timezone</label>
        <input
          id="timezone"
          placeholder="America/Los_Angeles"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Creating company…" : "Create company"}
      </button>
    </form>
  );
}
