"use client";

import { useState } from "react";

interface LeadFormProps {
  companySlug: string;
  companyPhone: string | null;
}

const initialFields = {
  name: "",
  phone: "",
  email: "",
  pickupAddress: "",
  destinationAddress: "",
  moveDate: "",
  preferredTime: "",
  propertyType: "",
  accessNotes: "",
  inventoryNotes: "",
  specialItems: "",
  notes: "",
};

type Fields = typeof initialFields;

export function LeadForm({ companySlug, companyPhone }: LeadFormProps) {
  const [fields, setFields] = useState<Fields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof Fields>(key: K) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields((prev) => ({ ...prev, [key]: event.target.value }));
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companySlug, ...fields }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="lead-confirmation" role="status">
        <h2>Thanks — we&apos;ve got your request.</h2>
        <p>We&apos;ll be in touch shortly to confirm details and get you a quote.</p>
        {companyPhone && (
          <p>
            Need to talk now? Call{" "}
            <a className="tap-target" href={`tel:${companyPhone.replace(/[^0-9+]/g, "")}`}>
              {companyPhone}
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="lead-form">
      <div className="field">
        <label htmlFor="leadName">Name*</label>
        <input id="leadName" required value={fields.name} onChange={update("name")} />
      </div>
      <div className="field">
        <label htmlFor="leadPhone">Phone</label>
        <input
          id="leadPhone"
          type="tel"
          value={fields.phone}
          onChange={update("phone")}
          placeholder="Phone or email required"
        />
      </div>
      <div className="field">
        <label htmlFor="leadEmail">Email</label>
        <input id="leadEmail" type="email" value={fields.email} onChange={update("email")} />
      </div>
      <div className="field">
        <label htmlFor="leadPickup">Moving from</label>
        <input
          id="leadPickup"
          value={fields.pickupAddress}
          onChange={update("pickupAddress")}
          placeholder="Pickup address or city"
        />
      </div>
      <div className="field">
        <label htmlFor="leadDestination">Moving to</label>
        <input
          id="leadDestination"
          value={fields.destinationAddress}
          onChange={update("destinationAddress")}
          placeholder="Destination address or city"
        />
      </div>
      <div className="field">
        <label htmlFor="leadMoveDate">Move date</label>
        <input
          id="leadMoveDate"
          type="date"
          value={fields.moveDate}
          onChange={update("moveDate")}
        />
      </div>
      <div className="field">
        <label htmlFor="leadPreferredTime">Preferred time</label>
        <input
          id="leadPreferredTime"
          value={fields.preferredTime}
          onChange={update("preferredTime")}
          placeholder="e.g. morning, afternoon"
        />
      </div>
      <div className="field">
        <label htmlFor="leadPropertyType">Home type</label>
        <input
          id="leadPropertyType"
          value={fields.propertyType}
          onChange={update("propertyType")}
          placeholder="e.g. 2-bedroom apartment"
        />
      </div>
      <div className="field">
        <label htmlFor="leadAccessNotes">Stairs, elevator, or parking notes</label>
        <input id="leadAccessNotes" value={fields.accessNotes} onChange={update("accessNotes")} />
      </div>
      <div className="field">
        <label htmlFor="leadInventoryNotes">What are we moving?</label>
        <textarea
          id="leadInventoryNotes"
          value={fields.inventoryNotes}
          onChange={update("inventoryNotes")}
          rows={3}
          placeholder="Rough inventory — furniture, boxes, appliances..."
        />
      </div>
      <div className="field">
        <label htmlFor="leadSpecialItems">Heavy or special items</label>
        <input
          id="leadSpecialItems"
          value={fields.specialItems}
          onChange={update("specialItems")}
          placeholder="e.g. piano, safe, gun safe"
        />
      </div>
      <div className="field">
        <label htmlFor="leadNotes">Anything else we should know?</label>
        <textarea id="leadNotes" value={fields.notes} onChange={update("notes")} rows={3} />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary tap-target" disabled={submitting}>
        {submitting ? "Sending…" : "Request my free estimate"}
      </button>
    </form>
  );
}
