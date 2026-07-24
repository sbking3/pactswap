import { Router } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { usersTable, emailOtpsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { signToken, verifySiweSignature } from "../lib/auth";
import { sendOtpEmail } from "../lib/email";
import { sendSignupOtpEmail } from "../lib/resend";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Signup OTP (Resend) ──────────────────────────────────────────────────────

// POST /api/auth/send-signup-otp
router.post("/auth/send-signup-otp", async (req, res) => {
  const { email, walletAddress, name } = req.body;
  if (!email || !walletAddress || !name) {
    res.status(400).json({ error: "email, walletAddress, and name are required" });
    return;
  }

  // Check email not taken by a different wallet
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0 && existing[0].walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(400).json({ error: "Email already registered to another wallet" });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Replace any existing signup OTP for this email
  await db.delete(emailOtpsTable).where(and(eq(emailOtpsTable.email, email), eq(emailOtpsTable.type, "signup")));
  await db.insert(emailOtpsTable).values({ email, code, type: "signup", expiresAt, attempts: 0 });

  const emailConfigured = !!process.env.RESEND_API_KEY;

  if (emailConfigured) {
    try {
      await sendSignupOtpEmail(email, code, name);
      res.json({ message: "Verification code sent to your email" });
    } catch (err: any) {
      const errMsg = err?.message ?? "Failed to send email";
      logger.error({ err: errMsg, email }, "Resend send failed");
      res.status(500).json({ error: errMsg });
    }
  } else {
    res.json({
      message: "OTP generated (email not configured — code returned for development)",
      devCode: code,
    });
  }
});

// POST /api/auth/verify-signup-otp
router.post("/auth/verify-signup-otp", async (req, res) => {
  const { email, code, walletAddress, name, phone, country } = req.body;
  if (!email || !code || !walletAddress || !name) {
    res.status(400).json({ error: "email, code, walletAddress, and name are required" });
    return;
  }

  const now = new Date();

  // Find the signup OTP record
  const otps = await db
    .select()
    .from(emailOtpsTable)
    .where(and(eq(emailOtpsTable.email, email), eq(emailOtpsTable.type, "signup")));

  if (otps.length === 0) {
    res.status(400).json({ error: "No pending verification found. Please request a new code." });
    return;
  }

  const otp = otps[0];

  // Check if blocked
  if (otp.blockedUntil && otp.blockedUntil > now) {
    const minsLeft = Math.ceil((otp.blockedUntil.getTime() - now.getTime()) / 60000);
    res.status(429).json({ error: `Too many wrong attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`, blockedUntil: otp.blockedUntil });
    return;
  }

  // Check expiry
  if (otp.expiresAt < now) {
    await db.delete(emailOtpsTable).where(eq(emailOtpsTable.id, otp.id));
    res.status(400).json({ error: "Code expired. Please request a new one." });
    return;
  }

  // Wrong code
  if (otp.code !== code) {
    const newAttempts = (otp.attempts ?? 0) + 1;
    const MAX_ATTEMPTS = 3;
    if (newAttempts >= MAX_ATTEMPTS) {
      const blockedUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 min block
      await db.update(emailOtpsTable)
        .set({ attempts: newAttempts, blockedUntil })
        .where(eq(emailOtpsTable.id, otp.id));
      res.status(429).json({ error: "Too many wrong attempts. Blocked for 5 minutes.", blockedUntil, attemptsLeft: 0 });
    } else {
      await db.update(emailOtpsTable)
        .set({ attempts: newAttempts })
        .where(eq(emailOtpsTable.id, otp.id));
      const attemptsLeft = MAX_ATTEMPTS - newAttempts;
      res.status(400).json({ error: "Invalid code.", attemptsLeft });
    }
    return;
  }

  // ✅ Code correct — delete OTP and create/upsert user
  await db.delete(emailOtpsTable).where(eq(emailOtpsTable.id, otp.id));

  const existingUsers = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress.toLowerCase()));
  let user;
  if (existingUsers.length > 0) {
    const updated = await db
      .update(usersTable)
      .set({ emailVerified: true, name, ...(phone ? { phone } : {}), ...(country ? { country } : {}) })
      .where(eq(usersTable.walletAddress, walletAddress.toLowerCase()))
      .returning();
    user = updated[0];
  } else {
    const created = await db
      .insert(usersTable)
      .values({
        walletAddress: walletAddress.toLowerCase(),
        name,
        email,
        emailVerified: true,
        kycLevel: 1,
        kycStatus: "approved",
        phone: phone ?? null,
        country: country ?? "Nigeria",
      })
      .returning();
    user = created[0];
  }

  const token = signToken({ userId: user.id, walletAddress: user.walletAddress, address: user.walletAddress, chainId: 56 });
  res.json({ user, token });
});

// ─── Legacy OTP (nodemailer) ──────────────────────────────────────────────────

// POST /api/auth/send-otp
router.post("/auth/send-otp", async (req, res) => {
  const { email, walletAddress, name } = req.body;
  if (!email || !walletAddress || !name) {
    res.status(400).json({ error: "email, walletAddress, and name are required" });
    return;
  }

  // Check if email already taken by another wallet
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0 && existing[0].walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(400).json({ error: "Email already registered to another wallet" });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Delete old OTPs for this email
  await db.delete(emailOtpsTable).where(eq(emailOtpsTable.email, email));

  await db.insert(emailOtpsTable).values({ email, code, expiresAt });

  const emailConfigured = !!process.env.RESEND_API_KEY;

  // Respond immediately — don't block on SMTP
  // If email isn't configured (dev/staging), return the code directly in the response
  res.json({
    message: emailConfigured ? "OTP sent to your email" : "OTP generated (email not configured — code returned for development)",
    ...(!emailConfigured && { devCode: code }),
  });

  // Send email in the background after responding
  if (emailConfigured) {
    sendOtpEmail(email, code, name).catch((err) => {
      console.error("[OTP] Email send failed:", err?.message);
      console.info(`[OTP] Code for ${email}: ${code}`);
    });
  }
});

// POST /api/auth/verify-otp
router.post("/auth/verify-otp", async (req, res) => {
  const { email, code, walletAddress, name, phone, country } = req.body;
  if (!email || !code || !walletAddress || !name) {
    res.status(400).json({ error: "email, code, walletAddress, and name are required" });
    return;
  }

  const now = new Date();
  const otps = await db
    .select()
    .from(emailOtpsTable)
    .where(and(eq(emailOtpsTable.email, email), eq(emailOtpsTable.code, code), gt(emailOtpsTable.expiresAt, now)));

  if (otps.length === 0) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  // Delete used OTP
  await db.delete(emailOtpsTable).where(eq(emailOtpsTable.email, email));

  // Upsert user
  const existingUsers = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress.toLowerCase()));
  let user;
  if (existingUsers.length > 0) {
    const updated = await db
      .update(usersTable)
      .set({ emailVerified: true, name, ...(phone ? { phone } : {}), ...(country ? { country } : {}) })
      .where(eq(usersTable.walletAddress, walletAddress.toLowerCase()))
      .returning();
    user = updated[0];
  } else {
    const created = await db
      .insert(usersTable)
      .values({
        walletAddress: walletAddress.toLowerCase(),
        name,
        email,
        emailVerified: true,
        kycLevel: 1, // email verified = level 1
        kycStatus: "approved",
        phone: phone ?? null,
        country: country ?? "Nigeria",
      })
      .returning();
    user = created[0];
  }

  const token = signToken({ userId: user.id, walletAddress: user.walletAddress, address: user.walletAddress, chainId: 56 });
  res.json({ user, token });
});

// POST /api/auth/register — instant registration, no OTP required
router.post("/auth/register", async (req, res) => {
  const { walletAddress, name, email, phone, country } = req.body;
  if (!walletAddress || !name || !email) {
    res.status(400).json({ error: "walletAddress, name, and email are required" });
    return;
  }

  // Check email not taken by a different wallet
  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (byEmail.length > 0 && byEmail[0].walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(400).json({ error: "Email already registered to another wallet" });
    return;
  }

  // Check wallet not already registered
  const byWallet = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress.toLowerCase()));
  if (byWallet.length > 0) {
    res.status(400).json({ error: "Wallet already registered. Please log in instead." });
    return;
  }

  const created = await db.insert(usersTable).values({
    walletAddress: walletAddress.toLowerCase(),
    name,
    email,
    emailVerified: false,
    kycLevel: 0,
    kycStatus: "none",
    phone: phone ?? null,
    country: country ?? "Nigeria",
  }).returning();

  const user = created[0];
  const token = signToken({ userId: user.id, walletAddress: user.walletAddress, address: user.walletAddress, chainId: 56 });
  res.status(201).json({ user, token });
});

// POST /api/auth/siwe
router.post("/auth/siwe", async (req, res) => {
  const { walletAddress, message, signature, totpCode } = req.body;
  if (!walletAddress || !message || !signature) {
    res.status(400).json({ error: "walletAddress, message, and signature are required" });
    return;
  }

  const valid = verifySiweSignature(message, signature, walletAddress);
  if (!valid) {
    res.status(401).json({ error: "Invalid wallet signature" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress.toLowerCase()));
  if (users.length === 0) {
    res.status(401).json({ error: "Wallet not registered. Please sign up first." });
    return;
  }

  const user = users[0];
  if (user.isBanned) {
    res.status(403).json({ error: "Your account has been banned" });
    return;
  }

  // 2FA check
  if (user.twoFactorEnabled) {
    if (!totpCode) {
      res.json({ requires2FA: true, token: null, user: null });
      return;
    }
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token: totpCode,
      window: 1,
    });
    if (!verified) {
      res.status(401).json({ error: "Invalid 2FA code" });
      return;
    }
  }

  const token = signToken({ userId: user.id, walletAddress: user.walletAddress, address: user.walletAddress, chainId: 56 });
  res.json({ user, token, requires2FA: false });
});

// POST /api/auth/2fa/setup
router.post("/auth/2fa/setup", requireAuth, async (req, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];
  const secret = speakeasy.generateSecret({ name: `PACTSWAP (${user.email})`, issuer: "PACTSWAP" });
  // Store temp secret (not enabled yet)
  await db.update(usersTable).set({ twoFactorSecret: secret.base32 }).where(eq(usersTable.id, user.id));
  const qrCodeUrl = secret.otpauth_url!;
  const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);
  res.json({ secret: secret.base32, qrCodeUrl, qrCodeDataUrl });
});

// POST /api/auth/2fa/enable
router.post("/auth/2fa/enable", requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: "TOTP token required" });
    return;
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0 || !users[0].twoFactorSecret) {
    res.status(400).json({ error: "2FA not set up yet. Call /setup first." });
    return;
  }
  const verified = speakeasy.totp.verify({
    secret: users[0].twoFactorSecret,
    encoding: "base32",
    token,
    window: 1,
  });
  if (!verified) {
    res.status(400).json({ error: "Invalid TOTP token" });
    return;
  }
  await db.update(usersTable).set({ twoFactorEnabled: true }).where(eq(usersTable.id, req.user!.userId));
  res.json({ message: "2FA enabled successfully" });
});

// POST /api/auth/2fa/disable
router.post("/auth/2fa/disable", requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: "TOTP token required" });
    return;
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0 || !users[0].twoFactorSecret) {
    res.status(400).json({ error: "2FA not enabled" });
    return;
  }
  const verified = speakeasy.totp.verify({
    secret: users[0].twoFactorSecret,
    encoding: "base32",
    token,
    window: 1,
  });
  if (!verified) {
    res.status(400).json({ error: "Invalid TOTP token" });
    return;
  }
  await db.update(usersTable).set({ twoFactorEnabled: false, twoFactorSecret: null }).where(eq(usersTable.id, req.user!.userId));
  res.json({ message: "2FA disabled" });
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];
  // Don't expose 2FA secret
  res.json({ ...user, twoFactorSecret: undefined });
});

// POST /api/auth/logout
router.post("/auth/logout", (_req, res) => {
  res.json({ message: "Logged out" });
});

export default router;
