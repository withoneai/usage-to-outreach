import * as gmail from "@withone/sdk/gmail";
import { connections, oneClient } from "./config.js";

/** Creates a Gmail draft. Never sends: a human reviews and hits send themselves. */
export async function createDraft(to: string, subject: string, body: string): Promise<string> {
  const raw = Buffer.from(
    [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n"),
  ).toString("base64url");

  const res = await oneClient()
    .connection(connections.gmail())
    .run(gmail.createUsersDraft({ path: { userId: "me" }, body: { message: { raw } } }));
  return (res.data as { id?: string })?.id ?? "";
}

/** A cheap liveness probe for `npm run check`: the authenticated profile. */
export async function probeGmail(): Promise<string> {
  const res = await oneClient().connection(connections.gmail()).run(gmail.getUsersProfile({ path: { userId: "me" } }));
  const data = res.data as { emailAddress?: string };
  if (!data.emailAddress) throw new Error("Gmail answered, but not with a profile.");
  return data.emailAddress;
}
