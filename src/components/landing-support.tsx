"use client";

import { useState, useEffect } from "react";
import { submitSupportTicket } from "@/app/actions";
import { getCurrentUser } from "@/app/auth-actions"; // <-- Import the new helper
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function LandingSupport() {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    
    // State to hold the user data
    const [defaultUser, setDefaultUser] = useState({ name: "", email: "" });

    // When the component loads, fetch the user's data
    useEffect(() => {
        getCurrentUser().then(user => {
            if (user) {
                setDefaultUser({ name: user.username, email: user.email });
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
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary"/> Support
                </CardTitle>
                <CardDescription>Report issues to the server admin.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input 
                            name="name" 
                            required 
                            placeholder="Your Name" 
                            defaultValue={defaultUser.name}
                            // The key forces React to update the input once the fetch finishes
                            key={`name-${defaultUser.name}`} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input 
                            name="email" 
                            type="email" 
                            required 
                            placeholder="For replies..." 
                            defaultValue={defaultUser.email}
                            // The key forces React to update the input once the fetch finishes
                            key={`email-${defaultUser.email}`} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Issue</Label>
                        <Textarea name="issue" required placeholder="Describe the problem..." rows={4} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : (success ? <CheckCircle2 className="h-4 w-4"/> : <Send className="h-4 w-4 mr-2"/>)}
                        {success ? "Sent!" : "Submit Ticket"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}