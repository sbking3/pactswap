import nodemailer from "nodemailer";
import { logger } from "./logger";

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

export async function sendOtpEmail(to: string, code: string, name: string): Promise<void> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    logger.warn("Email credentials not configured — skipping email send");
    return;
  }
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"PACTSWAP" <${process.env.EMAIL_USER}>`,
    to,
    subject: "PACTSWAP — Your Verification Code",
    html: `
      <div style="background:#090909;color:#fff;padding:40px;font-family:Inter,sans-serif;max-width:500px;margin:auto;border-radius:12px;">
        <div style="margin-bottom:24px;">
          <svg width="40" height="40" viewBox="0 0 100 100" fill="none" style="vertical-align:middle;margin-right:8px;">
            <path d="M50 5 L90 25 L90 55 C90 80 50 95 50 95 C50 95 10 80 10 55 L10 25 L50 5 Z" fill="#F5C242"/>
          </svg>
          <span style="font-size:22px;font-weight:700;vertical-align:middle;">PACTSWAP</span>
        </div>
        <h2 style="color:#F5C242;">Hello, ${name}</h2>
        <p style="color:#aaa;">Your PACTSWAP verification code is:</p>
        <div style="background:#141414;border:1px solid #F5C242;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
          <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#F5C242;">${code}</span>
        </div>
        <p style="color:#aaa;font-size:14px;">This code expires in 10 minutes. Never share it with anyone.</p>
        <p style="color:#555;font-size:12px;margin-top:24px;">Trade with Trust. PACTSWAP.</p>
      </div>
    `,
  });
}
