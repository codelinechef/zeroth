import fs from "node:fs";
import path from "node:path";

/**
 * Where the paper lives, read from content/site.json.
 *
 * This module exists because a URL was once hardcoded into the citation
 * component — an address that had never been registered. A citation is the one
 * place an invented URL does lasting damage: it is copied into someone else's
 * bibliography and cannot be corrected there.
 *
 * `url_status` is carried through to the page so a provisional address is
 * labelled as provisional rather than presented as permanent.
 */
const FILE = path.join(process.cwd(), "..", "..", "content", "site.json");

import type { AuthorLink } from "./links";

export type Site = {
  canonical_url: string;
  url_status: "permanent" | "provisional";
  url_note: string;
  publisher: string;
  author: string;
  author_display: string;
  first_published_year: number;
  project_name: string;
  citation_title: string;
  author_links: AuthorLink[];
};

export function getSite(): Site | null {
  if (!fs.existsSync(FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Site;
  } catch {
    return null;
  }
}
