import { sendEmail } from "../utils/email";
import { logger } from "./logger";

// ── Signup OTP ────────────────────────────────────────────────────────────────

export async function sendSignupOtpEmail(
  to: string,
  code: string,
  name: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not set — skipping signup OTP email");
    return;
  }

  const result = await sendEmail({
    to,
    subject: "Verify your PACTSWAP Account",
    html: `
      <div style="background:#090909;color:#fff;padding:40px;font-family:Inter,sans-serif;max-width:520px;margin:auto;border-radius:12px;">
        <div style="margin-bottom:28px;">
          <svg width="36" height="36" viewBox="0 0 100 100" fill="none" style="vertical-align:middle;margin-right:10px;">
            <path d="M50 5 L90 25 L90 55 C90 80 50 95 50 95 C50 95 10 80 10 55 L10 25 L50 5 Z" fill="#F5C242"/>
          </svg>
          <span style="font-size:20px;font-weight:700;vertical-align:middle;letter-spacing:1px;">PACTSWAP</span>
        </div>

        <h2 style="color:#F5C242;margin:0 0 8px;">Hi ${name} 👋</h2>
        <p style="color:#aaa;margin:0 0 24px;line-height:1.6;">
          Use the code below to verify your email and activate your PACTSWAP account.
          This code expires in <strong style="color:#fff;">10 minutes</strong>.
        </p>

        <div style="background:#141414;border:1.5px solid #F5C242;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="margin:0 0 8px;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Verification Code</p>
          <span style="font-size:42px;font-weight:800;letter-spacing:14px;color:#F5C242;font-family:monospace;">${code}</span>
        </div>

        <p style="color:#666;font-size:13px;line-height:1.6;">
          Never share this code with anyone. PACTSWAP will never ask for it.<br/>
          If you didn't request this, you can safely ignore this email.
        </p>

        <hr style="border:none;border-top:1px solid #222;margin:28px 0;" />
        <p style="color:#444;font-size:12px;margin:0;">Trade with Trust. <strong style="color:#F5C242;">PACTSWAP</strong></p>
      </div>
    `,
  });

  if (!result.success) {
    throw new Error(
      typeof result.error === "object" && result.error !== null && "message" in result.error
        ? String((result.error as { message: unknown }).message)
        : "Failed to send signup OTP email",
    );
  }
}

// ── New order notification ────────────────────────────────────────────────────

export async function sendNewOrderEmail(
  to: string,
  sellerName: string,
  buyerName: string,
  amountUsdt: number,
  priceNaira: number,
  orderId: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not set — skipping new order email");
    return;
  }

  const ngnTotal = (amountUsdt * priceNaira).toLocaleString("en-NG");
  const appUrl = process.env.APP_URL ?? "https://pactswap.replit.app";

  const result = await sendEmail({
    to,
    subject: "🔔 New Buy Order on PACTSWAP",
    html: `
      <div style="background:#090909;color:#fff;padding:40px;font-family:Inter,sans-serif;max-width:520px;margin:auto;border-radius:12px;">
        <div style="margin-bottom:28px;">
          <svg width="36" height="36" viewBox="0 0 100 100" fill="none" style="vertical-align:middle;margin-right:10px;">
            <path d="M50 5 L90 25 L90 55 C90 80 50 95 50 95 C50 95 10 80 10 55 L10 25 L50 5 Z" fill="#F5C242"/>
          </svg>
          <span style="font-size:20px;font-weight:700;vertical-align:middle;letter-spacing:1px;">PACTSWAP</span>
        </div>

        <h2 style="color:#F5C242;margin:0 0 8px;">New Order, ${sellerName}!</h2>
        <p style="color:#aaa;margin:0 0 24px;line-height:1.6;">
          <strong style="color:#fff;">${buyerName}</strong> has initiated a trade on your listing.
          Lock the USDT in escrow to confirm the trade.
        </p>

        <div style="background:#141414;border:1.5px solid #F5C242;border-radius:10px;padding:24px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#888;font-size:13px;padding:6px 0;">Amount</td>
              <td style="color:#F5C242;font-weight:700;font-size:18px;text-align:right;">${amountUsdt.toFixed(2)} USDT</td>
            </tr>
            <tr>
              <td style="color:#888;font-size:13px;padding:6px 0;">Rate</td>
              <td style="color:#fff;font-weight:600;text-align:right;">₦${priceNaira.toLocaleString()} / USDT</td>
            </tr>
            <tr>
              <td style="color:#888;font-size:13px;padding:6px 0;">Buyer pays</td>
              <td style="color:#fff;font-weight:600;text-align:right;">₦${ngnTotal}</td>
            </tr>
          </table>
        </div>

        <a href="${appUrl}/orders/${orderId}"
           style="display:block;background:#F5C242;color:#000;font-weight:700;font-size:15px;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;margin-bottom:24px;">
          View Trade →
        </a>

        <p style="color:#666;font-size:13px;line-height:1.6;">
          Lock the USDT in escrow as soon as possible to keep the trade moving.
        </p>

        <hr style="border:none;border-top:1px solid #222;margin:28px 0;" />
        <p style="color:#444;font-size:12px;margin:0;">Trade with Trust. <strong style="color:#F5C242;">PACTSWAP</strong></p>
      </div>
    `,
  });

  if (!result.success) {
    // Non-fatal — log only
    console.log("New order email error:", result.error);
  }
}
