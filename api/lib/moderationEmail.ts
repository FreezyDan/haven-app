import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../queries/connection";
import { env } from "./env";

export type ModerationEmailResult = {
  sent: boolean;
  reason?: "not-configured" | "no-author-email" | "provider-error" | "network-error";
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Send the exact moderator message with Haven's intro and sign-off. */
export async function sendModerationEmailToAuthor(
  authorId: number,
  body: string,
): Promise<ModerationEmailResult> {
  if (!env.resendApiKey || !env.resendFromEmail) {
    return { sent: false, reason: "not-configured" };
  }
  const author = await getDb().query.users.findFirst({
    where: eq(schema.users.id, authorId),
    columns: { email: true },
  });
  if (!author?.email) return { sent: false, reason: "no-author-email" };

  const text = [
    "Hello,",
    "",
    "Below is a message from a fellow moderator from Haven:",
    "",
    body,
    "",
    "Thanks and regards,",
    "Haven Moderation",
  ].join("\n");
  const html = [
    "<p>Hello,</p>",
    "<p>Below is a message from a fellow moderator from Haven:</p>",
    `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    "<p>Thanks and regards,<br>Haven Moderation</p>",
  ].join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.resendFromEmail,
        to: [author.email],
        subject: "A message from Haven Moderation",
        text,
        html,
      }),
    });
    if (!response.ok) return { sent: false, reason: "provider-error" };
    return { sent: true };
  } catch {
    return { sent: false, reason: "network-error" };
  }
}
