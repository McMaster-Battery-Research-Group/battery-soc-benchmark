import type { NextConfig } from "next";

/**
 * Security headers. The CSP allows inline scripts/styles because Next.js and
 * Tailwind emit them; everything else is locked to this origin, plus the Google
 * Analytics hosts (Google's documented list) while a measurement ID is configured.
 */
const analyticsOn = Boolean(process.env.GOOGLE_ANALYTICS_ID || process.env.GOOGLE_ANALYTICS_DEV_ID);
const ga = {
  script: analyticsOn ? " https://*.googletagmanager.com" : "",
  img: analyticsOn ? " https://*.google-analytics.com https://*.googletagmanager.com" : "",
  connect: analyticsOn ? " https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com" : "",
};
const csp = [
  "default-src 'self'",
  // `next dev` evaluates its hot-reload bundles with eval; without this, no client component hydrates locally.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}${ga.script}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${ga.img}`,
  "font-src 'self' data:",
  // uploads go through /api/upload on this host; the only other destination is Google Analytics
  `connect-src 'self'${ga.connect}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Only relevant when STORAGE=local (multipart upload through a server action).
    // On Vercel, STORAGE=supabase uploads directly from the browser instead.
    // Package, plus the optional description attachments (3 MB diagram + 10 MB PDF) and form overhead.
    serverActions: { bodySizeLimit: `${Number(process.env.MAX_UPLOAD_MB ?? 50) + 16}mb` },
  },
  poweredByHeader: false,
  // scripts/web-update.sh builds into a side directory (NEXT_DIST_DIR=.next-build) and swaps it in once the
  // build succeeds, so the live site never serves a half-written .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Keep these out of the webpack bundle and load them from node_modules at runtime.
  // pdfkit in particular resolves its built-in fonts through package.json "imports"
  // (#standard-fonts/Helvetica), which only works when it is NOT bundled.
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "adm-zip", "pdfkit"],
  // …and make sure the whole pdfkit package (font AFM data included) is traced into
  // the serverless functions that build PDFs.
  outputFileTracingIncludes: {
    "/api/submissions/[id]/report.pdf": ["./node_modules/pdfkit/**"],
    "/api/jobs/run": ["./node_modules/pdfkit/**", "./src/lib/assets/*.gif"],
    // Inline confetti GIF for results e-mails sent from the web tier (rescore / re-send).
    "/api/**": ["./src/lib/assets/*.gif"],
    "/admin/**": ["./src/lib/assets/*.gif"],
    // Example packages are read from disk (fs.readFile), which the tracer cannot see.
    "/examples": ["./evaluator/examples/*.zip"],
    "/examples/download/[file]": ["./evaluator/examples/*.zip"],
  },
};

export default nextConfig;
