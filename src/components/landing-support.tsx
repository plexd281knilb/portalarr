"use client";

import { useState, useEffect } from "react";
import { submitSupportTicket } from "@/app/actions";
import { getCurrentUser } from "@/app/auth-actions"; // <-- Import the new helper
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Send, CheckCircle2, AlertCircle, Loader2, Wrench } from "lucide-react";

export default function LandingSupport() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // State to hold the user data
  const [defaultUser, setDefaultUser] = useState({ name: "", email: "" });
  const [userRole, setUserRole] = useState<string | null>(null);

  // When the component loads, fetch the user's data
  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user) {
        setDefaultUser({ name: user.username, email: user.email });
        setUserRole(user.role);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target as HTMLFormElement);
    await submitSupportTicket(formData);
    setLoading(false);
    setSuccess(true);
    (e.target as HTMLFormElement).reset();

    // Reset success message after 3 seconds
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <Card className="h-full flex flex-col border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200 animate-in fade-in duration-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <AlertCircle className="h-5 w-5 text-primary" /> Support
        </CardTitle>
        <CardDescription>Report issues to the server admin.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Name</Label>
            <Input
              name="name"
              required
              placeholder="Your Name"
              defaultValue={defaultUser.name}
              // The key forces React to update the input once the fetch finishes
              key={`name-${defaultUser.name}`}
              className="h-9 text-xs bg-background/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Email</Label>
            <Input
              name="email"
              type="email"
              required
              placeholder="For replies..."
              defaultValue={defaultUser.email}
              // The key forces React to update the input once the fetch finishes
              key={`email-${defaultUser.email}`}
              className="h-9 text-xs bg-background/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Issue Description</Label>
            <Textarea
              name="issue"
              required
              placeholder="Describe the problem..."
              rows={3}
              className="text-xs bg-background/60 resize-none"
            />
          </div>
          <Button 
            type="submit" 
            className="w-full font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98" 
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {success ? "Ticket Sent!" : "Submit Ticket"}
          </Button>
        </form>

        {userRole === "ADMIN" || userRole === "SUPER_USER" ? (
          <div className="pt-4 mt-4 border-t border-border/40 grid grid-cols-2 gap-2">
            <Button
              asChild
              variant="outline"
              className="w-full text-[10px] sm:text-xs font-semibold border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:ring-2 hover:ring-amber-500/40 transition-all duration-200 active:scale-95"
            >
              <Link href="/radarr">
                <Wrench className="h-3 w-3 mr-1" /> Fix Movies
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full text-[10px] sm:text-xs font-semibold border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/10 hover:ring-2 hover:ring-cyan-500/40 transition-all duration-200 active:scale-95"
            >
              <Link href="/sonarr">
                <Wrench className="h-3 w-3 mr-1" /> Fix TV Shows
              </Link>
            </Button>
          </div>
        ) : (
          <div className="pt-4 mt-4 border-t border-border/40">
            <Button
              variant="outline"
              className="w-full text-xs text-muted-foreground border-dashed border-border/60 hover:text-foreground hover:border-border transition-all duration-200"
              onClick={(e) => {
                e.preventDefault();
                const issueArea = document.querySelector(
                  'textarea[name="issue"]',
                ) as HTMLTextAreaElement;
                if (issueArea) {
                  issueArea.value =
                    "I would like to request Super User access to fix my own Movies and TV Shows issues.";
                  issueArea.focus();
                }
              }}
            >
              <Wrench className="h-3 w-3 mr-2" /> Request Super User Access
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
