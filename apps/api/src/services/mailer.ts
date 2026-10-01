import nodemailer from "nodemailer";
import { env } from "../config/env";
import { AppError } from "../common/http/app-error";
import { emailTemplate } from "./email-template";

function createTransporter() {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new AppError(
      503,
      "Email service is not configured",
      "MAILER_NOT_CONFIGURED"
    );
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD
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
    from: `"${env.MAIL_FROM_NAME}" <${env.SMTP_USER}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? emailTemplate(input)
  });
}
