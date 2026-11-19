import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // NOTE: the session cookie is set by the browser and is only for routing/UX (sign-in page or not).
  // The real security boundary is firestore.rules + the API routes (roles are checked there, per league).
  // No role cookie any more: /admin only redirects to Impostazioni, where each section checks the league role.

  const hasSession = request.cookies.get('cc_session')?.value === '1';
  const isPublicRoute =
    pathname.startsWith('/login') ||
    // Invite links: the page shows the league and asks to sign in (then comes back)
    pathname.startsWith('/join') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.');

  // In localhost o sessione attiva consentiamo la navigazione pubblica
  if (
    request.nextUrl.hostname === 'localhost' ||
    request.nextUrl.hostname === '127.0.0.1' ||
    isPublicRoute ||
    hasSession
  ) {
    return NextResponse.next();
  }

  // Se non autenticato e su route protetta, reindirizza al login
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

// Supporto convenzione middleware Next.js
export const middleware = proxy;
export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
