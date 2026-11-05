import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // NOTE: these cookies are set by the browser and are only for routing/UX.
  // The real security boundary is firestore.rules (data access is enforced server-side by Firebase).

  // 1. ISOLAMENTO RIGIDO /admin:
  // Se la route richiesta è /admin o qualsiasi sotto-percorso di /admin,
  // controlla il cookie 'user_role'. Se non è presente o non è strettamente 'admin',
  // blocca immediatamente la richiesta ed esegui un redirect forzato a /presenze.
  if (pathname.startsWith('/admin')) {
    const userRole = request.cookies.get('user_role')?.value;
    if (userRole !== 'admin') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/presenze';
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  const hasSession = request.cookies.get('cc_session')?.value === '1';
  const isPublicRoute =
    pathname.startsWith('/login') ||
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
