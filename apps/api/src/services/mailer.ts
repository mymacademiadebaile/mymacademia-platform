import nodemailer from "nodemailer";
import { env } from "../config/env";
import { AppError } from "../common/http/app-error";

function createTransporter() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new AppError(
      503,
      "Email service is not configured",
      "MAILER_NOT_CONFIGURED"
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD
    }
  });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: env.MAIL_FROM ?? env.GMAIL_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}
