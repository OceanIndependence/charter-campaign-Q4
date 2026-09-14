/** One row of data/consultants-seed.csv, as generated into src/data/consultants-seed.ts. */
export interface ConsultantSeedRow {
  /** Line number in the CSV (header is line 1), for the import report */
  line: number;
  name: string;
  jobTitle: string;
  /** "Mobile phone" column */
  phone: string;
  /** Lowercased */
  email: string;
  /** "WhatsApp" column — identical to phone in every seeded row, kept separate */
  whatsapp: string;
  /** "Photo URL (Sirv)" column — on cdn.oceanindependence.com */
  photoUrl: string;
}

/** What one run of the seed import did. Returned by the API and rendered on the import page. */
export interface ConsultantImportResult {
  ranAt: string;
  /** "blob (private)" or "filesystem" — which DATA store took the writes */
  backend: string;
  dryRun: boolean;
  total: number;
  created: Array<{ id: string; displayName: string; jobTitle: string; email: string; photoStatus: "ok" | "missing" }>;
  skipped: Array<{ line: number; name: string; email: string; reason: string }>;
  invalid: Array<{ line: number; name: string; email: string; reason: string }>;
  photoFailures: Array<{ displayName: string; photoUrl: string; httpStatus: number | null; error: string | null }>;
}
