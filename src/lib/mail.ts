import { readFileSync } from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { LOGOS, ACKNOWLEDGEMENT, logoPngPath } from "@/lib/logos";

let transporter: Transporter | null = null;
let usingEthereal = false;

async function getTransport(): Promise<Transporter> {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else {
    const test = await nodemailer.createTestAccount();
    usingEthereal = true;
    transporter = nodemailer.createTransport({
      host: test.smtp.host,
      port: test.smtp.port,
      secure: test.smtp.secure,
      auth: { user: test.user, pass: test.pass },
    });
    console.log(`[mail] No SMTP_HOST set — using Ethereal test inbox (${test.user}). Preview URLs will be logged.`);
  }
  return transporter;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** Content-ID for inline images (<img src="cid:…">) */
  cid?: string;
}

export async function sendMail(opts: { to: string; cc?: string; subject: string; html: string; text?: string; attachments?: MailAttachment[] }) {
  try {
    const t = await getTransport();
    const info = await t.sendMail({ from: process.env.MAIL_FROM ?? "no-reply@batterysocbenchmark.ca", ...opts });
    if (usingEthereal) console.log(`[mail] "${opts.subject}" → ${opts.to}: ${nodemailer.getTestMessageUrl(info)}`);
    return true;
  } catch (err) {
    console.error("[mail] send failed", err);
    return false;
  }
}

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** RFC 5322 "Display Name <address>" — without a display name Gmail shows only the local part (e.g. "ali584"). */
export const addr = (name: string | null | undefined, email: string) => (name?.trim() ? `"${name.replace(/["\\]/g, "")}" <${email}>` : email);

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f7;font-family:Arial,Helvetica,sans-serif;color:#495965">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dbdbdd;border-radius:4px">
    <tr><td style="background:#7a003c;padding:18px 24px;color:#fff;font-weight:700;font-size:18px">Battery SOC Benchmark</td></tr>
    <tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px;color:#000">${title}</h1>${body}</td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #dbdbdd;font-size:12px;color:#6d7a84">${logoRow()}McMaster Automotive Resource Centre · McMaster University · Hamilton, Ontario<br>${ACKNOWLEDGEMENT}</td></tr>
  </table></td></tr></table></body></html>`;
}

/** Institutional logos in the e-mail footer — only once the official PNGs exist (e-mail clients need absolute image URLs). */
function logoRow() {
  const imgs = (["mcmaster", "nserc"] as const)
    .filter((k) => logoPngPath(k))
    .map((k) => `<a href="${LOGOS[k].href}"><img src="${site()}${LOGOS[k].png}" alt="${LOGOS[k].alt}" height="40" style="height:40px;width:auto;margin:0 16px 8px 0;vertical-align:middle"></a>`)
    .join("");
  return imgs ? `<div style="margin-bottom:10px">${imgs}</div>` : "";
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#7a003c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600">${label}</a></p><p style="font-size:13px;color:#6d7a84">Or paste this link into your browser:<br>${href}</p>`;

export function verificationEmail(to: string, name: string, token: string) {
  const href = `${site()}/verify?token=${token}`;
  return sendMail({
    to: addr(name, to),
    subject: "Verify your email — Battery SOC Benchmark",
    html: layout("Confirm your email address", `<p>Hi ${name},</p><p>Thanks for registering. Confirm your email to start submitting SOC estimation models for blinded evaluation.</p>${button(href, "Verify email")}<p style="font-size:13px">This link expires in 24 hours.</p>`),
    text: `Verify your email: ${href}`,
  });
}

export function passwordResetEmail(to: string, name: string, token: string) {
  const href = `${site()}/reset-password?token=${token}`;
  return sendMail({
    to: addr(name, to),
    subject: "Reset your password — Battery SOC Benchmark",
    html: layout("Reset your password", `<p>Hi ${name},</p><p>We received a request to reset your password. If this wasn't you, you can ignore this email.</p>${button(href, "Choose a new password")}<p style="font-size:13px">This link expires in 1 hour.</p>`),
    text: `Reset your password: ${href}`,
  });
}

/** Animated confetti for the results e-mail. Mail clients block scripts and CSS animation, but an animated GIF plays in
 *  Gmail, Apple Mail, Outlook web/mobile and most others (Outlook desktop shows the first frame). Embedded inline via CID so
 *  it needs no external host and shows even with remote images blocked. */
const CONFETTI_CID = "confetti@batterysocbenchmark";
function confettiGif(): MailAttachment | null {
  try {
    return { filename: "confetti.gif", content: readFileSync(path.join(process.cwd(), "src/lib/assets/confetti.gif")), contentType: "image/gif", cid: CONFETTI_CID };
  } catch {
    return null;
  }
}
const confettiBanner = (gif: MailAttachment | null) => (gif ? `<img src="cid:${CONFETTI_CID}" width="600" height="150" alt="🎉" style="display:block;width:100%;max-width:600px;height:auto;margin:0 auto 8px" />` : `<p style="text-align:center;font-size:30px;line-height:1;margin:4px 0 14px">🎉</p>`);

export function evaluationCompleteEmail(to: string, name: string, modelName: string, submissionId: string, ok: boolean, summary?: string, report?: Buffer) {
  const href = `${site()}/submissions/${submissionId}`;
  const gif = ok ? confettiGif() : null;
  return sendMail({
    to: addr(name, to),
    subject: ok ? `Evaluation complete: ${modelName}` : `Evaluation failed: ${modelName}`,
    html: layout(
      ok ? "Your model has been evaluated" : "Your evaluation could not be completed",
      `${ok ? confettiBanner(gif) : ""}<p>Hi ${name},</p><p>${ok ? `🎉 Congratulations — <strong>${modelName}</strong> finished blinded evaluation. ${summary ?? ""}` : `<strong>${modelName}</strong> failed during evaluation. ${summary ?? ""}`}</p>${button(href, "View results")}${report ? `<p style="font-size:13px;color:#6d7a84">The full report (summary, all test cases, time-domain traces and per-cycle errors) is attached as a PDF.</p>` : ""}`,
    ),
    text: `${ok ? "Evaluation complete" : "Evaluation failed"}: ${href}`,
    attachments: [...(gif ? [gif] : []), ...(report ? [{ filename: `${modelName.replace(/[^a-z0-9]+/gi, "_")}-soc-benchmark-report.pdf`, content: report, contentType: "application/pdf" }] : [])],
  });
}

/** Invitation to co-author; the owner is CC'd so they have a record of who was invited. */
export function collaboratorInviteEmail(to: string, name: string, byName: string, modelName: string, submissionId: string, evaluated: boolean, token: string, ccOwner?: string) {
  // byName is the owner, who is also the CC recipient
  const view = `${site()}/submissions/${submissionId}`;
  const respond = `${site()}/collab/${token}`;
  return sendMail({
    to: addr(name, to),
    cc: ccOwner && ccOwner.toLowerCase() !== to.toLowerCase() ? addr(byName, ccOwner) : undefined,
    subject: `${byName} listed you as a co-author on "${modelName}"`,
    html: layout(
      "Co-author invitation",
      `<p>Hi ${name},</p><p><strong>${byName}</strong> listed you as a collaborator on the submission <strong>${modelName}</strong> on the Battery SOC Benchmark. Please confirm: your name and picture are shown publicly beside the model only after you accept. Either way you can view the submission (even while private), and ${evaluated ? "the results and PDF report are ready to view" : "you will receive the results e-mail and PDF report when the evaluation finishes"}.</p>${button(respond, "Accept or decline")}<p style="margin-top:8px"><a href="${view}" style="color:#7a003c">View the submission</a></p><p style="font-size:13px;color:#6d7a84">You will be asked to sign in to your own account to respond. Declining removes you from the submission and lets ${byName} know.</p>`,
    ),
    text: `${byName} listed you as a co-author on "${modelName}". Accept or decline: ${respond}\nView: ${view}`,
  });
}

export function collaboratorAcceptedEmail(to: string, ownerName: string, collaboratorName: string, modelName: string, submissionId: string) {
  const href = `${site()}/submissions/${submissionId}`;
  return sendMail({
    to: addr(ownerName, to),
    subject: `${collaboratorName} accepted co-authorship on "${modelName}"`,
    html: layout("Invitation accepted", `<p>Hi ${ownerName},</p><p><strong>${collaboratorName}</strong> accepted your invitation and is now listed as a co-author on <strong>${modelName}</strong> — their name and picture appear beside the model on the leaderboard and on their researcher page.</p>${button(href, "View the submission")}`),
    text: `${collaboratorName} accepted co-authorship on "${modelName}": ${href}`,
  });
}

export function collaboratorDeclinedEmail(to: string, ownerName: string, collaboratorName: string, modelName: string, submissionId: string) {
  const href = `${site()}/submissions/${submissionId}`;
  return sendMail({
    to: addr(ownerName, to),
    subject: `${collaboratorName} declined co-authorship on "${modelName}"`,
    html: layout("Invitation declined", `<p>Hi ${ownerName},</p><p><strong>${collaboratorName}</strong> declined to be listed as a collaborator on <strong>${modelName}</strong> and has been removed from the submission.</p>${button(href, "View the submission")}`),
    text: `${collaboratorName} declined co-authorship on "${modelName}": ${href}`,
  });
}

/** Sent to the owner and accepted collaborators when an administrator moderates a submission. */
export function moderationEmail(to: string, name: string, modelName: string, submissionId: string | null, action: "private" | "public" | "hide" | "unhide" | "delete", reason: string, adminName: string) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const what = {
    private: "was made private by an administrator — it is no longer shown on the public leaderboard, but you and your collaborators can still see it",
    public: "was made public by an administrator — it now appears on the public leaderboard",
    hide: "was hidden by an administrator — it is not visible to anyone except administrators",
    unhide: "was unhidden by an administrator — it is visible again",
    delete: "was deleted by an administrator — its results and leaderboard entry have been removed permanently",
  }[action];
  const href = submissionId ? `${site()}/submissions/${submissionId}` : `${site()}/submissions`;
  return sendMail({
    to: addr(name, to),
    subject: `Your submission "${modelName}" ${action === "delete" ? "was removed" : action === "hide" ? "was hidden" : `is now ${action === "private" ? "private" : action === "public" ? "public" : "visible"}`}`,
    html: layout(
      "Submission moderated",
      `<p>Hi ${esc(name)},</p><p>Your submission <strong>${esc(modelName)}</strong> ${what}.</p><p style="margin:16px 0;padding:12px 16px;border-left:4px solid #7a003c;background:#f6f7f7"><strong>Reason given by ${esc(adminName)}:</strong><br>${esc(reason)}</p>${submissionId ? button(href, "View the submission") : ""}<p style="font-size:13px;color:#6d7a84">Questions or think this was a mistake? Reply to this e-mail or use the <a href="${site()}/contact" style="color:#7a003c">contact form</a>.</p>`,
    ),
    text: `Your submission "${modelName}" ${what}.\n\nReason (${adminName}): ${reason}\n${href}`,
  });
}

/** Sent when a submission's score is recomputed (e.g. the weights changed). The new PDF is attached. */
export function rescoreEmail(to: string, name: string, modelName: string, submissionId: string, oldScore: number, newScore: number, note: string, report?: Buffer) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const href = `${site()}/submissions/${submissionId}`;
  const dir = newScore < oldScore ? "improved" : newScore > oldScore ? "increased" : "changed";
  return sendMail({
    to: addr(name, to),
    subject: `Score updated: ${modelName} (${oldScore.toFixed(2)} → ${newScore.toFixed(2)} %)`,
    html: layout(
      "Your score has been recomputed",
      `<p>Hi ${esc(name)},</p><p>The benchmark's scoring was updated and the weighted error of <strong>${esc(modelName)}</strong> has ${dir} from <strong>${oldScore.toFixed(3)} %</strong> to <strong>${newScore.toFixed(3)} %</strong>. Your model was <em>not</em> re-run — the per-test results are unchanged; only how they are combined into the headline score.</p><p style="margin:16px 0;padding:12px 16px;border-left:4px solid #7a003c;background:#f6f7f7"><strong>What changed:</strong><br>${esc(note)}</p>${button(href, "View the submission")}<p style="font-size:13px;color:#6d7a84">The full score history is listed on the submission page and in the attached report.</p>`,
    ),
    text: `Score updated for "${modelName}": ${oldScore.toFixed(3)} → ${newScore.toFixed(3)} %. ${note}\n${href}`,
    attachments: report ? [{ filename: `${modelName.replace(/[^a-z0-9]+/gi, "_")}-soc-benchmark-report.pdf`, content: report, contentType: "application/pdf" }] : undefined,
  });
}

/** Sent when the benchmark version changes: the submission is kept but unranked until re-submitted. */
export function legacyNoticeEmail(to: string, name: string, modelName: string, submissionId: string, oldVersion: string, newVersion: string, note: string) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const href = `${site()}/submissions/${submissionId}`;
  return sendMail({
    to: addr(name, to),
    subject: `Action needed: "${modelName}" is unranked until re-submitted (benchmark ${newVersion})`,
    html: layout(
      "The benchmark has been updated",
      `<p>Hi ${esc(name)},</p><p>The Battery SOC Benchmark now scores submissions with <strong>${esc(newVersion)}</strong>. Your submission <strong>${esc(modelName)}</strong> was scored by <strong>${esc(oldVersion)}</strong>, and because scores from different benchmark versions are not directly comparable it is <strong>kept on the site for reference but no longer ranked</strong> on the leaderboard.</p><p style="margin:16px 0;padding:12px 16px;border-left:4px solid #7a003c;background:#f6f7f7"><strong>What changed:</strong><br>${esc(note)}</p><p><strong>To be ranked again</strong>, open your submission and use <em>Submit new version</em> (same package or an updated one). It will be evaluated on the current benchmark; your previous score stays in the submission's history. Nothing is deleted.</p>${button(href, "Open the submission")}`,
    ),
    text: `The benchmark moved to ${newVersion}. "${modelName}" (scored by ${oldVersion}) is kept but unranked until you re-submit it: ${href}\n\nWhat changed: ${note}`,
  });
}

export function feedbackNotificationEmail(to: string, msg: { id: string; name: string; email: string; category: string; subject: string; body: string; pageUrl?: string | null }) {
  const href = `${site()}/admin/messages`;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return sendMail({
    to,
    subject: `[SOC Benchmark] ${msg.category}: ${msg.subject}`,
    html: layout(
      `New ${esc(msg.category)} from ${esc(msg.name)}`,
      `<p><strong>${esc(msg.subject)}</strong></p><p style="white-space:pre-wrap">${esc(msg.body)}</p><p style="font-size:13px;color:#6d7a84">From ${esc(msg.name)} &lt;${esc(msg.email)}&gt;${msg.pageUrl ? ` · on ${esc(msg.pageUrl)}` : ""}</p>${button(href, "Open the inbox")}`,
    ),
    text: `${msg.category}: ${msg.subject}\n\n${msg.body}\n\nFrom ${msg.name} <${msg.email}>\n${href}`,
  });
}

/** Admin notification: a new account was created, or an account was verified. Fire-and-forget to every admin target. */
export async function accountEventEmail(kind: "registered" | "verified", user: { id: string; name: string; email: string; affiliation: string; role?: string; createdAt?: Date }, via?: string) {
  const { adminNotifyTargets } = await import("@/lib/admin-notify");
  const { fmtDateTime } = await import("@/lib/utils");
  const targets = (await adminNotifyTargets()).filter((t) => t.toLowerCase() !== user.email.toLowerCase());
  if (!targets.length) return;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const href = `${site()}/admin/users`;
  const title = kind === "registered" ? `New account: ${user.name}` : `Account verified: ${user.name}`;
  const rows = [
    ["Name", user.name],
    ["E-mail", user.email],
    ["Affiliation", user.affiliation],
    ...(user.role ? [["Role", user.role]] : []),
    ...(user.createdAt ? [["Joined", fmtDateTime(user.createdAt)]] : []),
    ...(via ? [["Verified via", via]] : []),
  ];
  const table = `<table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6d7a84">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}</table>`;
  await Promise.all(
    targets.map((to) =>
      sendMail({
        to,
        subject: `[SOC Benchmark] ${title}`,
        html: layout(title, `<p>${kind === "registered" ? "Someone just created an account on the benchmark site. They still need to verify their e-mail before they can submit." : "This account has completed e-mail verification and can now submit models."}</p>${table}${button(href, "Open user list")}`),
        text: `${title}\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${href}`,
      }),
    ),
  );
}

/** Role change: tell the person, CC every other administrator so the whole admin group sees who granted/revoked what. */
export async function roleChangedEmail(user: { name: string; email: string }, role: "USER" | "ADMIN", byName: string) {
  const { adminNotifyTargets } = await import("@/lib/admin-notify");
  const cc = (await adminNotifyTargets()).filter((t) => t.toLowerCase() !== user.email.toLowerCase());
  const granted = role === "ADMIN";
  const href = `${site()}/admin`;
  return sendMail({
    to: addr(user.name, user.email),
    cc: cc.join(", ") || undefined,
    subject: granted ? "You are now an administrator of the Battery SOC Benchmark" : "Your administrator access on the Battery SOC Benchmark was removed",
    html: layout(
      granted ? "You have administrator access" : "Administrator access removed",
      granted
        ? `<p>Hi ${user.name},</p><p><strong>${byName}</strong> made you an administrator. You can now moderate submissions, manage contests and users, read the contact inbox, watch the evaluation workers and change the scoring weights. Admin accounts also have no submission rate limits.</p><p style="font-size:13px;color:#6d7a84">All administrators are copied on this message.</p>${button(href, "Open the admin panel")}`
        : `<p>Hi ${user.name},</p><p><strong>${byName}</strong> removed your administrator access. Your account, submissions and collaborations are unaffected.</p><p style="font-size:13px;color:#6d7a84">All administrators are copied on this message.</p>`,
    ),
    text: granted ? `${byName} made you an administrator: ${href}` : `${byName} removed your administrator access.`,
  });
}
