import { Card, EmptyState, PageHeader, inputClassName } from "@/components/ui";
import { requireCurrentBusinessId } from "@/lib/auth/business";
import { listCustomers } from "@/lib/customers/service";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const businessId = await requireCurrentBusinessId();
  const customers = await listCustomers(businessId);
  const filtered = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q),
      )
    : customers;

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${customers.length} on file`} />
      <div className="space-y-4 px-4 pt-5">
        <form>
          <input
            className={inputClassName}
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or phone"
          />
        </form>

        {filtered.length === 0 ? (
          <EmptyState>No customers found.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {filtered.map((customer) => (
              <li key={customer.id}>
                <Card>
                  <p className="font-semibold text-brand-navy">{customer.name}</p>
                  <p className="text-sm text-brand-slate">{customer.phone}</p>
                  {customer.address && <p className="text-sm text-brand-slate">{customer.address}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
