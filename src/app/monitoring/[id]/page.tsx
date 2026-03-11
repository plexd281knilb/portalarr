import { fetchGlancesNodeDetails } from "@/app/data";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import ServerDetailView from "@/components/server-detail-view";

// Define the type for the props properly
type Props = {
  params: Promise<{ id: string }>;
};

export default async function MonitoringDetailPage({ params }: Props) {
  // CRITICAL FIX: Await the params object
  const { id } = await params;
  
  const data = await fetchGlancesNodeDetails(id);

  if (!data) {
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold text-red-500">Server Not Found</h1>
            <Link href="/">
                <Button variant="ghost" className="mt-4"><ArrowLeft className="mr-2 h-4 w-4"/> Back</Button>
            </Link>
        </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center space-x-4">
        <Link href="/monitoring">
            <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4"/></Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">{data.name}</h2>
        <div className={`px-2 py-1 rounded text-xs font-medium ${data.online ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {data.online ? "Online" : "Offline"}
        </div>
      </div>

      <ServerDetailView data={data} />
    </div>
  );
}