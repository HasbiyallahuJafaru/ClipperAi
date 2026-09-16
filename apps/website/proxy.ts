import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Anyone can open these; every other page sends signed-out visitors to sign in. /api answers 401 itself (JSON, no
// redirect), so the pages can show "Sign in to continue."
const isPublic = createRouteMatcher([
  "/", "/how-it-works", "/features", "/pricing", "/faq", "/privacy", "/terms", "/compare(.*)", "/tools(.*)", "/sign-in(.*)", "/sign-up(.*)",
  "/api(.*)", "/robots.txt", "/sitemap.xml",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
