// Creates or deletes the throwaway user the end-to-end tests sign in as.
// Runs under Bun (Prisma's generated client is ES modules, which
// Playwright's loader can't import):
//   bun e2e/test-user.ts setup | teardown

import "dotenv/config";

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";

import { PrismaClient } from "../lib/generated/prisma/client";
import { AUTH_FILE, TEST_USER } from "./constants";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Deleting the user also removes its profile, sessions, jobs and credits. */
const deleteUser = () => db.user.deleteMany({ where: { id: TEST_USER.id } });

async function setup() {
  await deleteUser(); // left over from a run that crashed
  await db.user.create({ data: { ...TEST_USER, emailVerified: true } });
  // A finished Set up, so the dashboard doesn't send it to onboarding.
  await db.profile.create({
    data: {
      userId: TEST_USER.id,
      cvText:
        "E2E Tester. Full-stack engineer, 4 years with React, Next.js and TypeScript.",
      cvFileName: "e2e-cv.pdf",
      cvPages: 1,
      repos: ["e2e-tester/demo-shop"],
    },
  });

  // A test-only Better Auth instance with the app's database and secret, so
  // the app accepts its session cookie. lib/auth.ts never has testUtils.
  const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3005",
    database: prismaAdapter(db, { provider: "postgresql" }),
    plugins: [testUtils()],
  });
  const ctx = await auth.$context;
  const cookies = await ctx.test.getCookies({
    userId: TEST_USER.id,
    domain: "localhost",
  });

  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify({ cookies, origins: [] }));
}

async function teardown() {
  await deleteUser();
  await rm(AUTH_FILE, { force: true });
}

const command = process.argv[2];
try {
  if (command === "setup") await setup();
  else if (command === "teardown") await teardown();
  else throw new Error("Usage: bun e2e/test-user.ts setup | teardown");
} finally {
  await db.$disconnect();
}
