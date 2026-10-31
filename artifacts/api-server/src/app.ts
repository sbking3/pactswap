import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the Replit reverse proxy so rate-limit can correctly identify IPs
// from X-Forwarded-For (prevents ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        // Wallet connections (WalletConnect relay, BSC RPC) need outbound https/wss
        connectSrc: ["'self'", "https:", "wss:"],
        frameSrc: ["'self'", "https:"],
        objectSrc: ["'none'"],
      },
    },
  }),
);

// Rate limiting: 5 requests per 10 seconds per IP
const limiter = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
  // Relax limits slightly for GET endpoints in dev
  skip: (req) => process.env.NODE_ENV === "development" && req.method === "GET",
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to auth and mutation endpoints
app.use("/api/auth", limiter);
app.use("/api/kyc", limiter);

app.use("/api", router);

// Serve the built frontend (single-service deploy). Skipped when the build is absent.
const webDir = process.env.WEB_DIST_DIR
  ? path.resolve(process.env.WEB_DIST_DIR)
  : path.resolve(process.cwd(), "../pactswap/dist/public");
if (fs.existsSync(path.join(webDir, "index.html"))) {
  app.use(express.static(webDir, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDir, "index.html"));
  });
}

export default app;
