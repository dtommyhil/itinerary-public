import 'server-only';
import nodemailer from 'nodemailer';
let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
export async function sendAuthEmail(to: string, subject: string, url: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? '587');
  const from = process.env.EMAIL_FROM;
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Configure SMTP_HOST, SMTP_PORT and EMAIL_FROM');
  transport ??= nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: process.env.NODE_ENV === 'production' && port !== 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 10000,
  });
  await transport.sendMail({
    from,
    to,
    subject,
    text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.`,
  });
}
