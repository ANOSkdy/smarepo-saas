// Server Component wrapper for the Work Aggregation tab under /reports/sites
import ReportsTabs from "@/components/reports/ReportsTabs";
import SitesWorkTab from "./SitesWorkTab";

export const dynamic = "force-dynamic";

export default async function Page() {
  return (
    <div className="p-4 space-y-4">
      <ReportsTabs />
      <h1 className="text-xl font-semibold">現場別集計</h1>
      <SitesWorkTab />
    </div>
  );
}

