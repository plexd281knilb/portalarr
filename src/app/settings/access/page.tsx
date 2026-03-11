"use client";

import { useState, useEffect } from "react";
import { getAppUsers, createAppUser, deleteAppUser } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus, Shield, User, Mail } from "lucide-react";
import { format } from "date-fns";

export default function AccessSettingsPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadUsers = async () => {
        setLoading(true);
        const data = await getAppUsers();
        setUsers(data);
        setLoading(false);
    };

    useEffect(() => { loadUsers(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await createAppUser(formData);
        (e.target as HTMLFormElement).reset();
        loadUsers();
    };

    const handleDelete = async (id: string) => {
        if (confirm("Delete this user? They will lose access immediately.")) {
            await deleteAppUser(id);
            loadUsers();
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h3 className="text-lg font-medium">Access Management</h3>
                <p className="text-sm text-muted-foreground">
                    Create accounts for accessing the Admin Dashboard.
                </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                {/* CREATE USER FORM */}
                <Card>
                    <CardHeader>
                        <CardTitle>Create Account</CardTitle>
                        <CardDescription>Add a new administrator or standard user.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Username</Label>
                                <Input name="username" placeholder="e.g. admin" required />
                            </div>
                            {/* NEW EMAIL INPUT */}
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input name="email" type="email" placeholder="admin@example.com" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Password</Label>
                                <Input name="password" type="password" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select name="role" defaultValue="USER">
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Admin (Full Access)</SelectItem>
                                        <SelectItem value="USER">User (Read Only)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full">
                                <UserPlus className="h-4 w-4 mr-2" /> Create User
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* USER LIST */}
                <Card>
                    <CardHeader>
                        <CardTitle>Existing Users</CardTitle>
                        <CardDescription>Manage current access.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-sm text-muted-foreground">Loading...</div>
                            ) : users.length === 0 ? (
                                <div className="text-sm text-muted-foreground italic">No users created yet.</div>
                            ) : (
                                users.map((user) => (
                                    <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                {user.role === "ADMIN" ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
                                            </div>
                                            <div>
                                                <div className="font-medium">{user.username}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Mail className="h-3 w-3" /> {user.email || "No Email"}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                                    Added {format(new Date(user.createdAt), "MMM d, yyyy")}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(user.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}