import { fetchMediaAppsActivity } from "@/app/data";
import AppsDashboard from "@/components/apps-dashboard";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const initialData = await fetchMediaAppsActivity();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Applications</h2>
        <div className="flex items-center space-x-2">
            <Link href="/settings">
                <Button variant="outline" size="sm">Manage Apps</Button>
            </Link>
        </div>
      </div>
      
      {/* Client Component handles the tabs & live refreshing */}
      <AppsDashboard initialData={initialData} />
    </div>
  );
}