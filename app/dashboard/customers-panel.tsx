"use client";

import { useEffect, useState } from "react";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

async function fetchCustomers(): Promise<Customer[] | null> {
  const response = await fetch("/api/customers");
  if (!response.ok) {
    return null;
  }
  const body = await response.json();
  return body.customers;
}

export function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchCustomers();
      if (cancelled) return;
      if (result === null) {
        setError("Failed to load customers.");
      } else {
        setCustomers(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }

    setName("");
    setPhone("");
    setEmail("");
    setSubmitting(false);

    const result = await fetchCustomers();
    if (result !== null) {
      setCustomers(result);
    }
  }

  return (
    <section>
      <h2>Customers</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="customerName">Name</label>
          <input
            id="customerName"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="customerPhone">Phone</label>
          <input id="customerPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="customerEmail">Email</label>
          <input
            id="customerEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add customer"}
        </button>
      </form>

      {customers === null ? (
        <p>Loading…</p>
      ) : customers.length === 0 ? (
        <p>No customers yet.</p>
      ) : (
        <ul>
          {customers.map((customer) => (
            <li key={customer.id}>
              {customer.name}
              {customer.phone ? ` — ${customer.phone}` : ""}
              {customer.email ? ` — ${customer.email}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
