import type { NextConfig } from "next";

/**
 * Security headers. The CSP allows inline scripts/styles because Next.js and
 * Tailwind emit them; everything else is locked to this origin (plus Supabase
 * Storage for direct browser uploads and Google Fonts if ever used).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${process.env.SUPABASE_URL ?? "https://*.supabase.co"}`,
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
    serverActions: { bodySizeLimit: `${Number(process.env.MAX_UPLOAD_MB ?? 50) + 2}mb` },
  },
  poweredByHeader: false,
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
