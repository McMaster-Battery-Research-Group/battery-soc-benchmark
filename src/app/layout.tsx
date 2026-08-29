import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ToastProvider } from "@/components/ui/toast";
import { auth } from "@/lib/auth";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Battery SOC Benchmark — McMaster University",
    template: "%s · Battery SOC Benchmark",
  },
  description:
    "A standardized, blinded evaluation platform for battery state-of-charge estimation algorithms, built on the Tesla Model 3 2170 cell dataset from McMaster University.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en" className={poppins.variable}>
      <body className="flex min-h-screen flex-col">
        <ToastProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-brand focus:bg-maroon focus:px-4 focus:py-2 focus:text-white"
          >
            Skip to main content
          </a>
          <SiteHeader user={session?.user ?? null} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
