import { NextResponse } from "next/server";
import { getLibraryBooks } from "@/app/actions";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const libraryId = searchParams.get("libraryId");
        console.log(`[API /api/books] 📥 Received GET request for libraryId="${libraryId}"`);

        if (!libraryId) {
            return NextResponse.json({ success: false, error: "Missing libraryId parameter" }, { status: 400 });
        }

        const books = await getLibraryBooks(libraryId);
        console.log(`[API /api/books] 📤 Responding with ${books.length} books for libraryId="${libraryId}"`);

        return NextResponse.json({ success: true, books }, {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    } catch (e: any) {
        console.error(`[API /api/books] ❌ Error:`, e.message);
        return NextResponse.json({ success: false, error: e.message || "Failed to fetch books" }, { status: 500 });
    }
}
