// Server Component wrapper for the Work Aggregation tab under /reports/sites
import SitesWorkTab from "./SitesWorkTab";

export const dynamic = "force-dynamic";

export default async function Page() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">稼働集計（現場別）</h1>
      <SitesWorkTab />
    </div>
  );
}

