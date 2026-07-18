import { Router } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { usersTable, emailOtpsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { signToken, verifySiweSignature } from "../lib/auth";
import { sendOtpEmail } from "../lib/email";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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
  await sendOtpEmail(email, code, name);

  res.json({ message: "OTP sent to your email" });
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

  const token = signToken({ userId: user.id, walletAddress: user.walletAddress });
  res.json({ user, token });
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

  const token = signToken({ userId: user.id, walletAddress: user.walletAddress });
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
