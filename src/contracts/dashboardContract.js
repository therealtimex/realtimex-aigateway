export const DASHBOARD_CONTRACT_ID = "terminal-governance-dashboard";
export const DASHBOARD_CONTRACT_VERSION = "1.0.0";
export const DASHBOARD_ROUTE = "/dashboard";

export function buildDashboardContractDescriptor() {
  return {
    id: DASHBOARD_CONTRACT_ID,
    version: DASHBOARD_CONTRACT_VERSION,
    stability: "production",
    route: DASHBOARD_ROUTE,
  };
}
