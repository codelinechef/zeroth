import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { ClauseIndex } from "@/components/ClauseIndex";
import { Footer } from "@/components/Footer";
import "./globals.css";

// Three families. Archivo carries display and headings, Source Serif 4 the
// prose, IBM Plex Mono every number, label and caption. Sans display against
// serif body is what gives the hierarchy its contrast; two serifs muddle at
// heading sizes.
const archivo = Archivo({
  subsets: ["latin"], weight: ["600", "700"],
  variable: "--font-archivo", display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500"],
  variable: "--font-plex-mono", display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"], weight: ["400", "600"],
  variable: "--font-source-serif", display: "swap",
});

export const metadata: Metadata = {
  title: "Zeroth",
  description:
    "A reproducible benchmark of end-to-end RAG pipeline quality, measured on a public corpus.",
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
        <div className="paper-grid">
          <ClauseIndex />
          <div className="min-w-0">
            <main id="main" className="px-4 py-12 lg:px-16 lg:py-20">
              {children}
            </main>
            <div className="px-4 pb-12 lg:px-16">
              <Footer />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
