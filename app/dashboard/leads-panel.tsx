"use client";

import { useEffect, useState } from "react";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  move_date: string | null;
  status: string;
  created_at: string;
}

async function fetchLeads(): Promise<Lead[] | null> {
  const response = await fetch("/api/leads");
  if (!response.ok) {
    return null;
  }
  const body = await response.json();
  return body.leads;
}

export function LeadsPanel() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchLeads();
      if (cancelled) return;
      if (result === null) {
        setError("Failed to load leads.");
      } else {
        setLeads(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h2>Leads</h2>
      {error && <p role="alert">{error}</p>}
      {leads === null ? (
        <p>Loading…</p>
      ) : leads.length === 0 ? (
        <p>No leads yet.</p>
      ) : (
        <ul>
          {leads.map((lead) => (
            <li key={lead.id}>
              <strong>{lead.name}</strong> — {lead.status}
              {lead.phone ? ` — ${lead.phone}` : ""}
              {lead.email ? ` — ${lead.email}` : ""}
              {lead.pickup_address || lead.destination_address
                ? ` — ${lead.pickup_address ?? "?"} → ${lead.destination_address ?? "?"}`
                : ""}
              {lead.move_date ? ` — ${lead.move_date}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
