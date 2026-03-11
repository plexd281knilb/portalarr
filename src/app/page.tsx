import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Activity, ExternalLink, HelpCircle } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="p-10 max-w-[1600px] mx-auto space-y-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold tracking-tight mb-2 text-white">System Dashboard</h2>
        <p className="text-slate-400">Real-time status, content requests, and support.</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3 items-start">
        {/* COLUMN 1: SYSTEM STATUS */}
        <Card className="bg-[#0B0F19] border-slate-800 text-white">
          <CardHeader className="border-b border-slate-800 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-5 w-5 text-slate-400" />
              System Status
            </CardTitle>
            <CardDescription className="text-slate-400">Live server performance.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-200">Overall Health</span>
              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded border border-green-500/30 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400"></span>
                All Systems Operational
              </span>
            </div>
            <div className="text-center py-4 border-y border-slate-800">
              <div className="text-4xl font-bold text-white">4</div>
              <div className="text-xs text-slate-400 tracking-widest mt-1 uppercase">Active Streams</div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">Main Server</span>
                  <span className="text-green-400 text-xs font-semibold">ONLINE</span>
                </div>
                <div className="flex gap-2 text-xs text-slate-400">
                  <span className="bg-slate-800 px-2 py-1 rounded text-slate-300">2.3% CPU</span>
                  <span className="bg-slate-800 px-2 py-1 rounded text-slate-300">27.7% RAM</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* COLUMN 2: REQUEST CONTENT */}
        <Card className="bg-[#0B0F19] border-slate-800 text-white">
          <CardHeader className="border-b border-slate-800 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ExternalLink className="h-5 w-5 text-slate-400" />
              Request Content
            </CardTitle>
            <CardDescription className="text-slate-400">Looking for something specific?</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col gap-3">
            <Button variant="outline" className="w-full justify-between h-12 bg-white text-black hover:bg-slate-200 border-none">
              Main Overseerr <ExternalLink className="h-4 w-4 opacity-50" />
            </Button>
            <Button variant="outline" className="w-full justify-between h-12 bg-white text-black hover:bg-slate-200 border-none">
              Kids Overseerr <ExternalLink className="h-4 w-4 opacity-50" />
            </Button>
          </CardContent>
        </Card>

        {/* COLUMN 3: SUPPORT */}
        <Card className="bg-[#0B0F19] border-slate-800 text-white">
          <CardHeader className="border-b border-slate-800 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <HelpCircle className="h-5 w-5 text-slate-400" />
              Support
            </CardTitle>
            <CardDescription className="text-slate-400">Report issues or check status.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Name</Label>
              <Input id="name" placeholder="Your Name" className="bg-[#06080D] border-slate-800 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue" className="text-slate-300">Issue</Label>
              <Textarea id="issue" placeholder="Describe the problem..." className="bg-[#06080D] border-slate-800 text-white" />
            </div>
            <Button className="w-full bg-white text-black hover:bg-slate-200">Submit Ticket</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}