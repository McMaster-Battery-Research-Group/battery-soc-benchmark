import nodemailer, { type Transporter } from "nodemailer";

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

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
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

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f7;font-family:Arial,Helvetica,sans-serif;color:#495965">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dbdbdd;border-radius:4px">
    <tr><td style="background:#7a003c;padding:18px 24px;color:#fff;font-weight:700;font-size:18px">Battery SOC Benchmark</td></tr>
    <tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px;color:#000">${title}</h1>${body}</td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #dbdbdd;font-size:12px;color:#6d7a84">McMaster Automotive Resource Centre · McMaster University · Hamilton, Ontario</td></tr>
  </table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#7a003c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600">${label}</a></p><p style="font-size:13px;color:#6d7a84">Or paste this link into your browser:<br>${href}</p>`;

export function verificationEmail(to: string, name: string, token: string) {
  const href = `${site()}/verify?token=${token}`;
  return sendMail({
    to,
    subject: "Verify your email — Battery SOC Benchmark",
    html: layout("Confirm your email address", `<p>Hi ${name},</p><p>Thanks for registering. Confirm your email to start submitting SOC estimation models for blinded evaluation.</p>${button(href, "Verify email")}<p style="font-size:13px">This link expires in 24 hours.</p>`),
    text: `Verify your email: ${href}`,
  });
}

export function passwordResetEmail(to: string, name: string, token: string) {
  const href = `${site()}/reset-password?token=${token}`;
  return sendMail({
    to,
    subject: "Reset your password — Battery SOC Benchmark",
    html: layout("Reset your password", `<p>Hi ${name},</p><p>We received a request to reset your password. If this wasn't you, you can ignore this email.</p>${button(href, "Choose a new password")}<p style="font-size:13px">This link expires in 1 hour.</p>`),
    text: `Reset your password: ${href}`,
  });
}

export function evaluationCompleteEmail(to: string, name: string, modelName: string, submissionId: string, ok: boolean, summary?: string) {
  const href = `${site()}/submissions/${submissionId}`;
  return sendMail({
    to,
    subject: ok ? `Evaluation complete: ${modelName}` : `Evaluation failed: ${modelName}`,
    html: layout(
      ok ? "Your model has been evaluated" : "Your evaluation could not be completed",
      `<p>Hi ${name},</p><p>${ok ? `<strong>${modelName}</strong> finished blinded evaluation. ${summary ?? ""}` : `<strong>${modelName}</strong> failed during evaluation. ${summary ?? ""}`}</p>${button(href, "View results")}`,
    ),
    text: `${ok ? "Evaluation complete" : "Evaluation failed"}: ${href}`,
  });
}
