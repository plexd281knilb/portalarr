import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTmdbUpcomingMovies, getTmdbNowPlayingMovies, TmdbMediaItem } from "@/lib/curation/tmdb";

export async function GET(req: NextRequest) {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const apiKey = settings?.tmdbApiKey || process.env.TMDB_API_KEY || "";

        const [upcoming, nowPlaying] = await Promise.allSettled([
            getTmdbUpcomingMovies(),
            getTmdbNowPlayingMovies()
        ]);

        const upcomingItems: TmdbMediaItem[] = upcoming.status === "fulfilled" ? upcoming.value : [];
        const nowPlayingItems: TmdbMediaItem[] = nowPlaying.status === "fulfilled" ? nowPlaying.value : [];

        // Distinguish between theatrical only vs items with announced digital streaming dates
        const withDigitalDate = upcomingItems.filter((it: TmdbMediaItem) => Boolean(it.digitalReleaseDate));
        const theatricalUpcoming = upcomingItems.filter((it: TmdbMediaItem) => Boolean(it.theatricalReleaseDate));

        return NextResponse.json({
            success: true,
            hasApiKey: Boolean(apiKey),
            counts: {
                digitalStreamingUpcoming: withDigitalDate.length,
                theatricalUpcoming: theatricalUpcoming.length,
                nowPlayingInTheaters: nowPlayingItems.length
            },
            digitalStreaming: withDigitalDate,
            theatricalUpcoming,
            nowPlaying: nowPlayingItems
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
