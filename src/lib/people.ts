/**
 * The benchmark team, shown on About → People. Each person has a page at /people/<slug>.
 * If `email` matches a site account, that page redirects to the account's researcher profile
 * (/users/<id>) and the profile shows the team role + these links — so a person who joins
 * later only has to register with the same e-mail. Photos: public/people/, square JPEG,
 * rectangular tiles per McMaster brand rules; add one only with the person's permission.
 */
export type PersonLink = { label: string; href: string };
export type Person = {
  slug: string;
  name: string;
  /** one line, shown under the name */
  role: string;
  group: "current" | "past";
  /** account e-mail, lower-case — used to link the entry to a registered profile */
  email?: string;
  photo?: string;
  links?: PersonLink[];
};

const ITEC_2022: PersonLink = { label: "ITEC 2022 paper", href: "https://doi.org/10.1109/ITEC53557.2022.9813996" };
const DATASET: PersonLink = { label: "Dataset (Borealis)", href: "https://doi.org/10.5683/SP3/ZVTR4B" };

export const PEOPLE: Person[] = [
  { slug: "phil-kollmeyer", name: "Dr. Phillip J. Kollmeyer", role: "Assistant Professor, Electrical and Computer Engineering · project lead", group: "current", email: "kollmeyp@mcmaster.ca", photo: "/people/phil-kollmeyer.jpg",
    links: [{ label: "IEEE Xplore", href: "https://ieeexplore.ieee.org/author/37590030300" }, ITEC_2022, DATASET, { label: "Faculty page", href: "https://www.eng.mcmaster.ca/ece/faculty/dr-phil-kollmeyer/" }] },
  { slug: "ahmad-ali", name: "Ahmad Ali", role: "MASc student · platform development and evaluation infrastructure", group: "current", email: "ali584@mcmaster.ca", photo: "/people/ahmad-ali.jpg",
    links: [{ label: "IEEE Xplore", href: "https://ieeexplore.ieee.org/author/398565157970670" }] },
  { slug: "ahnaf-rahman", name: "Ahnaf Akif Rahman", role: "PhD candidate · SOC estimation models and evaluation", group: "current", email: "rahma12@mcmaster.ca", photo: "/people/ahnaf-rahman.jpg",
    links: [{ label: "IEEE Xplore", href: "https://ieeexplore.ieee.org/author/37089247887" }] },
  { slug: "paarth-kadakia", name: "Paarth Kadakia", role: "Software intern", group: "current" },
  { slug: "aidan-mclean", name: "Aidan McLean", role: "Software intern", group: "current", photo: "/people/aidan-mclean.jpg" },
  { slug: "mina-nassim", name: "Mina (Naguib) Nassim, PhD, P.Eng.", role: "Data collection and the original MATLAB evaluation tool", group: "past", photo: "/people/mina-nassim.jpg", links: [ITEC_2022, DATASET] },
  { slug: "fauzia-khanum", name: "Fauzia Khanum, MASc", role: "Data collection and dataset curation", group: "past", photo: "/people/fauzia-khanum.jpg",
    links: [{ label: "IEEE Xplore", href: "https://ieeexplore.ieee.org/author/37088928399" }, ITEC_2022, DATASET] },
  { slug: "atjen-von-liebenstein", name: "Atjen von Liebenstein, MASc", role: "Embedded deployment and complexity of SOC estimators", group: "past", photo: "/people/atjen-von-liebenstein.jpg",
    links: [{ label: "IEEE paper", href: "https://ieeexplore.ieee.org/document/11098050" }] },
];

export const personBySlug = (slug: string) => PEOPLE.find((p) => p.slug === slug);
export const personByEmail = (email: string | null | undefined) => (email ? PEOPLE.find((p) => p.email === email.toLowerCase()) : undefined);
/** first-name + last-name initials for the placeholder tile */
export const initialsOf = (name: string) => name.replace(/^Dr\.\s*/, "").replace(/,.*$/, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("");
