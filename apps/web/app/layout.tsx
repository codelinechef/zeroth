import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { ClauseIndex } from "@/components/ClauseIndex";
import "./globals.css";

// Three families, three roles — brief §7.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zeroth",
  description:
    "An open reconstruction of a production confidential-document RAG platform, and a public evaluation board that measures it.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} ${sourceSerif.variable}`}
    >
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:m-2 focus:bg-paper focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <div className="lg:flex">
          <ClauseIndex />
          <div className="min-w-0 flex-1">
            <main id="main" className="mx-auto max-w-3xl px-4 py-10 lg:px-10">
              {children}
            </main>
            <footer className="mx-auto max-w-3xl px-4 pb-10 lg:px-10">
              <hr className="rule mb-4" />
              <p className="text-[length:var(--t-75)] text-ink-muted">
                Zeroth · measured locally, published statically. Every number on
                this site carries the corpus it was measured on.
              </p>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
