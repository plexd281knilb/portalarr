import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome to the Server!</h2>
        <p className="text-muted-foreground mt-2">Your central hub for server requests, status, and applications.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current server health</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-500 font-semibold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block"></span>
              All Systems Operational
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}