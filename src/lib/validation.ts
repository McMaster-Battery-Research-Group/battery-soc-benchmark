import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[0-9]/, "Include a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.string().trim().email("Enter a valid email address").max(120),
  affiliation: z.string().trim().min(2, "Enter your institution or company").max(120),
  password: passwordSchema,
});

const optionalUrl = (hosts?: string[]) =>
  z
    .string()
    .trim()
    .max(300)
    .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
    .refine((s) => !s || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(s), "Enter a valid link")
    .refine((s) => !s || !hosts || hosts.some((h) => new URL(s).hostname.replace(/^www\./, "").endsWith(h)), hosts ? `Must be a ${hosts[0]} link` : "Enter a valid link")
    .optional()
    .or(z.literal(""));

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  affiliation: z.string().trim().min(2, "Enter your institution or company").max(120),
  occupation: z.string().trim().max(80, "At most 80 characters").optional().or(z.literal("")),
  bio: z.string().trim().max(600, "At most 600 characters").optional().or(z.literal("")),
  website: optionalUrl(),
  linkedin: optionalUrl(["linkedin.com"]),
  googleScholar: optionalUrl(["scholar.google.com", "scholar.google.ca"]),
  researchGate: optionalUrl(["researchgate.net"]),
  github: optionalUrl(["github.com"]),
  orcid: z
    .string()
    .trim()
    .transform((s) => s.replace(/^https?:\/\/(www\.)?orcid\.org\//i, "").toUpperCase())
    .refine((s) => !s || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(s), "ORCID iD looks like 0000-0002-1825-0097")
    .optional()
    .or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const MODEL_TYPES = ["COULOMB_COUNTER", "EKF", "UKF", "LSTM", "GRU", "FNN", "TRANSFORMER", "PHYSICS", "HYBRID", "OTHER"] as const;

/** What a model description has to cover (tracker 2026-10-14 #1); shown as the field's guidance. */
export const DESCRIPTION_MIN = 80;
export const DESCRIPTION_MAX = 2000;
export const DESCRIPTION_GUIDE = "What the inputs are, the model structure (equations, network layers, filter states), what it was trained or fitted on, and what sets it apart from a textbook version. Enough for a reader to tell this model from another of the same type.";

export const submissionMetaSchema = z.object({
  modelName: z.string().trim().min(3, "At least 3 characters").max(50, "At most 50 characters"),
  description: z.string().trim().min(DESCRIPTION_MIN, `Describe the model in at least ${DESCRIPTION_MIN} characters: ${DESCRIPTION_GUIDE}`).max(DESCRIPTION_MAX, `At most ${DESCRIPTION_MAX} characters`),
  paperUrl: optionalUrl(),
  modelType: z.enum(MODEL_TYPES),
  evaluationLevel: z.enum(["DYNAMIC", "STATIC"]).default("DYNAMIC"),
  isPrivate: z.boolean().default(false),
  /** keep the package after evaluation and let viewers download it (tracker 2026-10-14 #2) */
  shareFiles: z.boolean().default(false),
  contestId: z.string().optional().nullable(),
  acceptTerms: z.literal(true, { error: "You must accept the submission terms" }),
});

/** Dates arrive already converted from site-time wall clock (parseZonedInput); null = blank or unreadable. */
export const contestSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters").max(100),
    slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only").min(3).max(60),
    summary: z.string().trim().min(10, "One or two sentences (at least 10 characters)").max(300),
    description: z.string().trim().min(10, "Describe the contest (at least 10 characters)"),
    rules: z.string().trim().min(10, "Add the rules (the starter template is a good base)"),
    startsAt: z.date({ message: "Pick a start date and time" }),
    endsAt: z.date({ message: "Pick a deadline" }),
    registrationEndsAt: z.date().nullable(),
    maxSubmissionsPerUser: z.coerce.number().int().min(1).max(100),
    maxTeamSize: z.coerce.number().int().min(1, "At least 1").max(10, "At most 10"),
    eligibility: z.enum(["ANYONE", "STUDENTS", "ACADEMIC"]),
    eligibilityNote: z.string().trim().max(300).transform((v) => v || null),
    allowedRuntimes: z.array(z.enum(["matlab", "python"])),
    prizes: z.array(z.object({ label: z.string().trim().min(1, "Name the place").max(40), amount: z.string().trim().min(1, "Give the prize").max(60) })).max(10),
  })
  .refine((c) => c.endsAt > c.startsAt, { message: "The deadline must be after the start", path: ["endsAt"] })
  .refine((c) => !c.registrationEndsAt || c.registrationEndsAt <= c.endsAt, { message: "Registration has to close by the deadline", path: ["registrationEndsAt"] });

export const FEEDBACK_CATEGORIES = [
  ["question", "Question"],
  ["bug", "Bug report / something broke"],
  ["feature", "Feature request or idea"],
  ["contest", "Contest / eligibility"],
  ["data", "Dataset or evaluation"],
  ["other", "Other"],
] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  category: z.enum(FEEDBACK_CATEGORIES.map((c) => c[0]) as [string, ...string[]]).default("question"),
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(4000),
  pageUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * A model description is about the model, not its author (tracker 2026-10-14 #19): the author is
 * already shown next to it, and a name says nothing about how the model works. Returns the name
 * token found, or null. Matches the full name and each name part of three letters or more as a
 * whole word, case-insensitively, so "Kalman" in "Rudolf Kalman" would also be caught — authors
 * who share a surname with a method can write "EKF" instead.
 */
export function nameInDescription(description: string, names: string[]): string | null {
  const text = description.toLowerCase();
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = (w: string) => new RegExp("(^|[^\\p{L}\\p{N}])" + esc(w) + "(?=$|[^\\p{L}\\p{N}])", "iu");
  for (const name of names) {
    const full = name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!full) continue;
    if (word(full).test(text)) return name.trim();
    for (const part of full.split(" ")) {
      if (part.replace(/[^\p{L}]/gu, "").length >= 3 && word(part).test(text)) return part;
    }
  }
  return null;
}
export const NAME_IN_DESCRIPTION_MESSAGE = (found: string) => `Describe the model, not its author: "${found}" is an author's name and the authors are already listed next to the description. Say what the model does and how it was built instead.`;

/** Attachments to a model description: a diagram and a write-up (tracker 2026-10-14 #1). */
export const FIGURE_MAX_BYTES = 3 * 1024 * 1024;
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const FIGURE_TYPES: Record<string, "png" | "jpg" | "webp"> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
/** Sniffs the real type from the first bytes: the browser's MIME is a hint, not a guarantee. */
export function sniffAttachment(bytes: Uint8Array): "png" | "jpg" | "webp" | "pdf" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  if (bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "pdf";
  return null;
}

export type FieldErrors = Record<string, string | undefined>;

export function zodErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
