import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define protected routes - all dashboard routes require authentication
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

// Proxy function for Next.js 16 (replaces middleware convention)
export const proxy = clerkMiddleware(async (auth, req) => {
  // Protect dashboard routes - require authentication
  // All other routes (/, /verify, /sign-in, /sign-up, etc.) are public by default
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Match all routes except static files and Next.js internals
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
