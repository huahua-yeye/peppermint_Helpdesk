import cors from "@fastify/cors";
import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import multer from "fastify-multer";
import fs from "fs";

import { exec } from "child_process";
import { track } from "./lib/hog";
import { getEmails } from "./lib/imap";
import { checkToken } from "./lib/jwt";
import { prisma } from "./prisma";
import { registerRoutes } from "./routes";

// Ensure the directory exists
const logFilePath = "./logs.log"; // Update this path to a writable location

// Create a writable stream
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Initialize Fastify with logger
const server: FastifyInstance = Fastify({
  logger: {
    stream: logStream, // Use the writable stream
  },
  disableRequestLogging: true,
  trustProxy: true,
});
server.register(cors, {
  origin: "*",

  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
});

server.register(multer.contentParser);

registerRoutes(server);

server.get(
  "/",
  {
    schema: {
      tags: ["health"], // This groups the endpoint under a category
      description: "Health check endpoint",
      response: {
        200: {
          type: "object",
          properties: {
            healthy: { type: "boolean" },
          },
        },
      },
    },
  },
  async function (request, response) {
    response.send({ healthy: true });
  }
);

// JWT authentication hook
server.addHook("preHandler", async function (request: any, reply: any) {
  try {
    if (request.url === "/api/v1/auth/login" && request.method === "POST") {
      return true;
    }
    if (
      request.url === "/api/v1/ticket/public/create" &&
      request.method === "POST"
    ) {
      return true;
    }
    const bearer = request.headers.authorization!.split(" ")[1];
    checkToken(bearer);
  } catch (err) {
    reply.status(401).send({
      message: "Unauthorized",
      success: false,
    });
  }
});

const start = async () => {
  try {
    // 开发模式下若使用 db:push，migrate deploy 可能失败 (P3005)，此时跳过并继续
    const runPrismaSetup = () =>
      new Promise<void>((resolve) => {
        exec("npx prisma migrate deploy", (err, stdout, stderr) => {
          if (err && !String(stderr || "").includes("P3005")) {
            console.error("prisma migrate deploy:", err);
          }
          if (stdout) console.log(stdout);
          if (stderr && !String(stderr).includes("P3005")) console.error(stderr);

          exec("npx prisma db seed", (seedErr, seedOut, seedErrOut) => {
            if (seedErr) {
              console.warn("prisma db seed (可忽略，若已初始化):", seedErr.message);
            }
            if (seedOut) console.log(seedOut);
            resolve();
          });
        });
      });

    await runPrismaSetup();

    // connect to database
    await prisma.$connect();
    server.log.info("Connected to Prisma");

    const port = 5003;

    server.listen(
      { port: Number(port), host: "0.0.0.0" },
      async (err, address) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }

        const client = track();

        client.capture({
          event: "server_started",
          distinctId: "uuid",
        });

        client.shutdownAsync();
        console.info(`Server listening on ${address}`);
      }
    );

    setInterval(() => getEmails(), 10000); // Call getEmails every minute
  } catch (err) {
    server.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

start();
