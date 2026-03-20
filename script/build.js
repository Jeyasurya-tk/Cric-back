import { build as esbuild } from "esbuild";
import { rm } from "fs/promises";

async function buildServer() {
  await rm("dist", { recursive: true, force: true });

  console.log("building server...");

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: [
      "express",
      "mongoose",
      "pg",
      "drizzle-orm",
      "cors",
      "dotenv",
      "drizzle-zod",
      "express-session",
      "memorystore",
      "passport",
      "passport-local",
      "socket.io",
      "ws",
      "zod",
      "zod-validation-error",
      "connect-pg-simple"
    ],
    logLevel: "info",
  });
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
