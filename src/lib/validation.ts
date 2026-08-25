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

export const submissionMetaSchema = z.object({
  modelName: z.string().trim().min(3, "At least 3 characters").max(50, "At most 50 characters"),
  description: z.string().trim().min(20, "Describe the model in at least 20 characters").max(1000, "At most 1000 characters"),
  modelType: z.enum(MODEL_TYPES),
  evaluationLevel: z.enum(["DYNAMIC", "STATIC"]).default("DYNAMIC"),
  isPrivate: z.boolean().default(false),
  contestId: z.string().optional().nullable(),
  acceptTerms: z.literal(true, { error: "You must accept the submission terms" }),
});

export const contestSchema = z.object({
  title: z.string().trim().min(3).max(100),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only").min(3).max(60),
  summary: z.string().trim().min(10).max(300),
  description: z.string().trim().min(10),
  rules: z.string().trim().min(10),
  prizeText: z.string().trim().min(1).max(200),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  status: z.enum(["DRAFT", "OPEN", "CLOSED", "JUDGED"]),
  maxSubmissionsPerUser: z.coerce.number().int().min(1).max(100),
}).refine((c) => c.endsAt > c.startsAt, { message: "End date must be after start date", path: ["endsAt"] });

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

export type FieldErrors = Record<string, string | undefined>;

export function zodErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
