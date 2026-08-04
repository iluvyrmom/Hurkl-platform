import { describe, expect, it, vi } from "vitest";
import {
  type AccountTypeRpcClient,
  NotHurklAdminError,
  setCompanyAccountType,
} from "./account-type-admin";

function fakeRpcClient(result: { error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as AccountTypeRpcClient, rpc };
}

describe("setCompanyAccountType", () => {
  it("calls the set_company_account_type RPC with the right arguments", async () => {
    const { client, rpc } = fakeRpcClient({ error: null });

    await setCompanyAccountType(client, "company-1", "demo");

    expect(rpc).toHaveBeenCalledWith("set_company_account_type", {
      p_company_id: "company-1",
      p_new_account_type: "demo",
    });
  });

  it("maps the database's admin-check rejection to NotHurklAdminError", async () => {
    const { client } = fakeRpcClient({
      error: { message: "Only a HURKL admin may change a company's account type" },
    });

    await expect(setCompanyAccountType(client, "company-1", "demo")).rejects.toThrow(
      NotHurklAdminError,
    );
  });

  it("throws a generic error for any other failure, rather than swallowing it", async () => {
    const { client } = fakeRpcClient({ error: { message: "connection refused" } });

    await expect(setCompanyAccountType(client, "company-1", "demo")).rejects.toThrow(
      /connection refused/,
    );
  });
});
