import EmailReplyParser from "email-reply-parser";
import Imap from "imap";
import { simpleParser } from "mailparser";
import { prisma } from "../../prisma";
import { EmailConfig, EmailQueue } from "../types/email";
import { AuthService } from "./auth.service";

/** 同一队列认证失败日志节流，避免定时拉信每几秒刷满终端 */
const IMAP_AUTH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const imapAuthFailureLastLog = new Map<string, number>();

function isImapAuthFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { textCode?: string }).textCode === "AUTHENTICATIONFAILED"
  );
}

function logImapAuthFailureHint(queueId: string, serviceType: string): void {
  const now = Date.now();
  const last = imapAuthFailureLastLog.get(queueId) ?? 0;
  if (now - last < IMAP_AUTH_FAILURE_COOLDOWN_MS) return;
  imapAuthFailureLastLog.set(queueId, now);
  console.warn(
    `[EmailQueue ${queueId}] IMAP 认证失败 (AUTHENTICATIONFAILED)，类型: ${serviceType || "unknown"}。请核对完整邮箱、密码/OAuth：Gmail 建议重新授权且 scope 含 https://mail.google.com/；Other 须用应用专用密码。无效队列可在 Admin → Email Queues 删除后重建。`
  );
}

function getReplyText(email: any): string {
  const parsed = new EmailReplyParser().read(email.text);
  // v2+ getVisibleText() strips hidden/signature/quoted fragments
  return typeof parsed.getVisibleText === "function"
    ? parsed.getVisibleText()
    : parsed
        .getFragments()
        .filter(
          (f: any) =>
            !f._isHidden && !f._isSignature && !f._isQuoted
        )
        .map((f: any) => f._content || f.content)
        .join("");
}

export class ImapService {
  private static async getImapConfig(queue: EmailQueue): Promise<EmailConfig> {
    switch (String(queue.serviceType || "").toLowerCase()) {
      case "gmail": {
        const validatedAccessToken = await AuthService.getValidAccessToken(
          queue
        );

        return {
          user: queue.username,
          host: queue.hostname,
          port: 993,
          tls: true,
          xoauth2: AuthService.generateXOAuth2Token(
            queue.username,
            validatedAccessToken
          ),
          tlsOptions: { rejectUnauthorized: false, servername: queue.hostname },
        };
      }
      case "other":
        return {
          user: queue.username,
          password: queue.password,
          host: queue.hostname,
          port: queue.tls ? 993 : 143,
          tls: queue.tls || false,
          tlsOptions: { rejectUnauthorized: false, servername: queue.hostname },
        };
      default:
        throw new Error("Unsupported service type");
    }
  }

  private static async processEmail(
    parsed: any,
    isReply: boolean
  ): Promise<void> {
    const { from, subject, text, html, textAsHtml } = parsed;

    console.log("isReply", isReply);

    if (isReply) {
      // First try to match UUID format
      const uuidMatch = subject.match(
        /(?:ref:|#)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      );
      console.log("UUID MATCH", uuidMatch);

      const ticketId = uuidMatch?.[1];

      console.log("TICKET ID", ticketId);

      if (!ticketId) {
        throw new Error(`Could not extract ticket ID from subject: ${subject}`);
      }

      const ticket = await prisma.ticket.findFirst({
        where: {
          id: ticketId,
        },
      });

      console.log("TICKET", ticket);

      if (!ticket) {
        throw new Error(`Ticket not found: ${ticketId}`);
      }

      const replyText = getReplyText(parsed);

      await prisma.comment.create({
        data: {
          text: text ? replyText : "No Body",
          userId: null,
          ticketId: ticket.id,
          reply: true,
          replyEmail: from.value[0].address,
          public: true,
        },
      });
    } else {
      const imapEmail = await prisma.imap_Email.create({
        data: {
          from: from.value[0].address,
          subject: subject || "No Subject",
          body: text || "No Body",
          html: html || "",
          text: textAsHtml,
        },
      });

      await prisma.ticket.create({
        data: {
          email: from.value[0].address,
          name: from.value[0].name,
          title: imapEmail.subject || "-",
          isComplete: false,
          priority: "low",
          fromImap: true,
          detail: html || textAsHtml,
        },
      });
    }
  }

  static async fetchEmails(): Promise<void> {
    const queues =
      (await prisma.emailQueue.findMany()) as unknown as EmailQueue[];
    /** 只拉「未读」且「最近 N 天内」的邮件；原先 UNSEEN + ON(今天) 过严，时区/跨日会导致永远匹配不到 */
    const since = new Date();
    since.setDate(since.getDate() - 14);

    for (const queue of queues) {
      try {
        const st = String(queue.serviceType || "").toLowerCase();
        if (st === "gmail") {
          const cid = String(queue.clientId ?? "").trim();
          const cs = String(queue.clientSecret ?? "").trim();
          const rt = String(queue.refreshToken ?? "").trim();
          if (!cid || !cs || !rt) {
            console.warn(
              `[EmailQueue ${queue.id}] 跳过拉取：Gmail OAuth 不完整（需 clientId、clientSecret、refreshToken）。请在 Admin → Email Queues 删除该队列后重新用 Google 流程创建并完成授权，或删除后改用 Other + 应用专用密码。`
            );
            continue;
          }
        }

        const imapConfig = await this.getImapConfig(queue);

        if (st === "other" && !imapConfig.password) {
          console.error("IMAP configuration is missing a password");
          throw new Error("IMAP configuration is missing a password");
        }

        // @ts-ignore
        const imap = new Imap(imapConfig);

        await new Promise((resolve, reject) => {
          imap.once("ready", () => {
            imap.openBox("INBOX", false, (err) => {
              if (err) {
                reject(err);
                return;
              }
              const searchCriteria: any[] = ["UNSEEN", ["SINCE", since]];
              imap.search(searchCriteria, (err, results) => {
                if (err) reject(err);
                if (!results?.length) {
                  console.log("No new messages");
                  imap.end();
                  resolve(null);
                  return;
                }

                const fetch = imap.fetch(results, { bodies: "" });
                /** fetch 的 end 会在「取流结束」时立刻触发，早于 simpleParser 异步完成；必须先等每封邮件处理完再 imap.end，否则会断开连接，只处理到第一封 */
                const perMessage: Promise<void>[] = [];

                fetch.on("message", (msg) => {
                  perMessage.push(
                    new Promise<void>((resolveMsg) => {
                      let attrs: { uid: number } | undefined;
                      let bodyFinished = false;

                      const tryMarkSeenAndResolve = () => {
                        if (!attrs || !bodyFinished) return;
                        imap.addFlags(attrs.uid, ["\\Seen"], () => {
                          console.log("Marked as read uid=", attrs!.uid);
                          resolveMsg();
                        });
                      };

                      msg.once("attributes", (a) => {
                        attrs = a as { uid: number };
                        tryMarkSeenAndResolve();
                      });

                      msg.on("body", (stream) => {
                        simpleParser(stream, async (err, parsed) => {
                          try {
                            if (err) {
                              console.error("simpleParser error:", err);
                              return;
                            }
                            const subj = parsed.subject || "";
                            const hasTicketUuid =
                              /(?:ref:|#)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.test(
                                subj
                              );
                            await ImapService.processEmail(parsed, hasTicketUuid);
                          } catch (e) {
                            console.error("processEmail failed:", e);
                          } finally {
                            bodyFinished = true;
                            tryMarkSeenAndResolve();
                          }
                        });
                      });
                    })
                  );
                });

                fetch.once("error", reject);
                fetch.once("end", () => {
                  Promise.all(perMessage)
                    .then(() => {
                      console.log("Done fetching and processing all messages");
                      imap.end();
                      resolve(null);
                    })
                    .catch((e) => {
                      console.error("fetch batch error:", e);
                      imap.end();
                      reject(e);
                    });
                });
              });
            });
          });

          imap.once("error", reject);
          imap.once("end", () => {
            console.log("Connection ended");
            resolve(null);
          });

          imap.connect();
        });
      } catch (error) {
        const st = String(queue.serviceType || "").toLowerCase();
        if (isImapAuthFailure(error)) {
          logImapAuthFailureHint(queue.id, st);
        } else {
          console.error(`Error processing queue ${queue.id}:`, error);
        }
      }
    }
  }
}
