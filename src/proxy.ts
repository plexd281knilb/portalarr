import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 requires this to be named 'proxy' or 'default'
export default function proxy(request: NextRequest) {
    return NextResponse.next();
}

// Keep your existing matcher config if you had one, or use this default:
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};