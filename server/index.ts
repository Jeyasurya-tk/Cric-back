// Server Entry Point - Updated for separation and CORS
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { storage } from "./storage";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Enable CORS for all origins (useful for ngrok)
app.use(cors({
  origin: true, // Reflect request origin
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // MongoDB Connection
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in .env file");
  }

  try {
    await mongoose.connect(mongoUri, { autoIndex: true });
    log("Connected to MongoDB successfully");

    // Initialize Public Viewer
    const publicViewer = await storage.getUserByMobileNumber("0000000000");
    if (!publicViewer) {
      await storage.createUser({
        fullName: "Public Viewer",
        username: "public_viewer",
        mobileNumber: "0000000000",
        password: "public",
        role: "public",
        isApproved: true,
        isActive: true
      });
      log("Initialized Public Viewer account");
    }

    // Initialize Developer Account
    const developerAccount = await storage.getUserByMobileNumber("DEVILUPPER");
    if (!developerAccount) {
      await storage.createUser({
        fullName: "Developer",
        username: "DEVILUPPER",
        mobileNumber: "DEVILUPPER",
        password: "###DEVILUPPER###",
        role: "developer",
        isApproved: true,
        isActive: true
      });
      log("Initialized Developer account");
    }
  } catch (err) {
    console.error("\n❌ MONGODB CONNECTION ERROR");
    console.error("---------------------------");
    console.error(err);
    console.error("---------------------------");
    console.error("TIPS FOR FIXING:");
    console.error("1. Check your MONGODB_URI in the .env file.");
    console.error("2. Ensure your IP address is whitelisted in MongoDB Atlas.");
    console.error("3. If using SRV, check your DNS settings.");
    console.error("4. Try using a local MongoDB: MONGODB_URI=mongodb://0.0.0.0:27017/cricket\n");
    
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    } else {
      log("Warning: Server started without database connection. Most features will not work.", "error");
    }
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`backend serving on port ${port}`);
  });
})();
