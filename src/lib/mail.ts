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

export function evaluationCompleteEmail(to: string, name: string, modelName: string, submissionId: string, ok: boolean, summary?: string, report?: Buffer) {
  const href = `${site()}/submissions/${submissionId}`;
  return sendMail({
    to: addr(name, to),
    subject: ok ? `Evaluation complete: ${modelName}` : `Evaluation failed: ${modelName}`,
    html: layout(
      ok ? "Your model has been evaluated" : "Your evaluation could not be completed",
      `<p>Hi ${name},</p><p>${ok ? `<strong>${modelName}</strong> finished blinded evaluation. ${summary ?? ""}` : `<strong>${modelName}</strong> failed during evaluation. ${summary ?? ""}`}</p>${button(href, "View results")}${report ? `<p style="font-size:13px;color:#6d7a84">The full report (summary, all test cases, time-domain traces and per-cycle errors) is attached as a PDF.</p>` : ""}`,
    ),
    text: `${ok ? "Evaluation complete" : "Evaluation failed"}: ${href}`,
    attachments: report ? [{ filename: `${modelName.replace(/[^a-z0-9]+/gi, "_")}-soc-benchmark-report.pdf`, content: report, contentType: "application/pdf" }] : undefined,
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

export function collaboratorDeclinedEmail(to: string, ownerName: string, collaboratorName: string, modelName: string, submissionId: string) {
  const href = `${site()}/submissions/${submissionId}`;
  return sendMail({
    to: addr(ownerName, to),
    subject: `${collaboratorName} declined co-authorship on "${modelName}"`,
    html: layout("Invitation declined", `<p>Hi ${ownerName},</p><p><strong>${collaboratorName}</strong> declined to be listed as a collaborator on <strong>${modelName}</strong> and has been removed from the submission.</p>${button(href, "View the submission")}`),
    text: `${collaboratorName} declined co-authorship on "${modelName}": ${href}`,
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
