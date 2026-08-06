import { decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";

export async function getPlexServerFriends(adminToken: string) {
    const friendsMap = new Map<string, { email: string; username: string }>();

    const addFriend = (rawEmail?: string, rawUsername?: string) => {
        const email = (rawEmail || "").toLowerCase().trim();
        const username = (rawUsername || (email ? email.split('@')[0] : "")).trim();
        if (!email && !username) return;
        const key = email || username.toLowerCase();
        if (!friendsMap.has(key)) {
            friendsMap.set(key, { email, username });
        }
    };

    // 1. Fetch /api/v2/friends
    try {
        const res = await fetch("https://plex.tv/api/v2/friends", {
            headers: { "Accept": "application/json", "X-Plex-Token": adminToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
        });
        if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
                for (const item of list) {
                    const u = item.user || item;
                    addFriend(u.email || item.email, u.username || item.username || u.title || item.title);
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/v2/friends error:", e);
    }

    // 2. Fetch /api/v2/shared_servers
    try {
        const res = await fetch("https://plex.tv/api/v2/shared_servers", {
            headers: { "Accept": "application/json", "X-Plex-Token": adminToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
        });
        if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
                for (const item of list) {
                    const u = item.user || item;
                    addFriend(u.email || item.email || item.invitedEmail, u.username || item.username || u.title || item.title);
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/v2/shared_servers error:", e);
    }

    // 3. Fetch legacy XML /api/users
    try {
        const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${adminToken}`);
        if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const userMatches = xmlText.matchAll(/<User\s+[^>]*\bemail="([^"]*)"[^>]*\busername="([^"]*)"/gi);
            for (const match of userMatches) {
                addFriend(match[1], match[2]);
            }
            const titleMatches = xmlText.matchAll(/<User\s+[^>]*\btitle="([^"]*)"[^>]*\bemail="([^"]*)"/gi);
            for (const match of titleMatches) {
                addFriend(match[2], match[1]);
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/users XML error:", e);
    }

    return Array.from(friendsMap.values());
}
