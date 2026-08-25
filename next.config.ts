import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Only relevant when STORAGE=local (multipart upload through a server action).
    // On Vercel, STORAGE=supabase uploads directly from the browser instead.
    serverActions: { bodySizeLimit: `${Number(process.env.MAX_UPLOAD_MB ?? 50) + 2}mb` },
  },
  // Keep these out of the webpack bundle and load them from node_modules at runtime.
  // pdfkit in particular resolves its built-in fonts through package.json "imports"
  // (#standard-fonts/Helvetica), which only works when it is NOT bundled.
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "adm-zip", "pdfkit"],
  // …and make sure the whole pdfkit package (font AFM data included) is traced into
  // the serverless functions that build PDFs.
  outputFileTracingIncludes: {
    "/api/submissions/[id]/report.pdf": ["./node_modules/pdfkit/**"],
    "/api/jobs/run": ["./node_modules/pdfkit/**"],
  },
};

export default nextConfig;
