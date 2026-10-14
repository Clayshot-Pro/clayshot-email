import { listConnectedAccounts } from "../providers/registry";
import { adminAuthorized, deviceAccountIds } from "../deviceAuth";

export async function getConnectedAccounts(request: Request, env: Env): Promise<Response> {
  const [admin, ids, accounts] = await Promise.all([
    adminAuthorized(request, env),
    deviceAccountIds(request, env),
    listConnectedAccounts(env),
  ]);
  const permitted = new Set(ids);
  return Response.json({
    accounts: accounts.filter(account => permitted.has(account.id) || (admin && account.provider === "native")),
  });
}
