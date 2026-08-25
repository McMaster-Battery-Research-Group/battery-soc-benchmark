import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Only relevant when STORAGE=local (multipart upload through a server action).
    // On Vercel, STORAGE=blob uploads directly from the browser instead.
    serverActions: { bodySizeLimit: `${Number(process.env.MAX_UPLOAD_MB ?? 50) + 2}mb` },
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "adm-zip"],
};

export default nextConfig;
