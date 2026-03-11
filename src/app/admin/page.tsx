import { fetchDashboardData, fetchMediaAppsActivity } from "@/app/data";
import MainDashboard from "@/components/main-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [dashboardData, appsData] = await Promise.all([
      fetchDashboardData(),
      fetchMediaAppsActivity()
  ]);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Main Dashboard</h2>
      <MainDashboard 
        initialDashboard={dashboardData} 
        initialApps={appsData} 
      />
    </div>
  );
}