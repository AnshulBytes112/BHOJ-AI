import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware for FINBOOKS.
 * Currently a placeholder for future Auth & RBAC logic.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth Guard Logic (Future)
  const token = request.cookies.get('token');
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};
