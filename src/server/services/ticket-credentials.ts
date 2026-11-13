import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { resolveUserDataDir } from "~/db/client";

type Credentials = { accessToken: string; refreshToken: string; expiresAt: number; cloudId: string; workspaceUrl: string };
function paths() {
  const root = join(resolveUserDataDir(), "ticket-auth");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  return { key: join(root, "key"), token: join(root, "jira.enc") };
}
function key(): Buffer {
  const path = paths().key;
  if (!existsSync(path)) {
    try { writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  chmodSync(path, 0o600);
  return readFileSync(path);
}
export function readTicketCredentials(): Credentials | null {
  const path = paths().token;
  if (!existsSync(path)) return null;
  const data = readFileSync(path);
  const cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8")) as Credentials;
}
export function writeTicketCredentials(value: Credentials): void {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  const path = paths().token;
  const temporary = `${path}.${randomBytes(6).toString("hex")}`;
  writeFileSync(temporary, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
  renameSync(temporary, path);
}
export function clearTicketCredentials(): void {
  const path = paths().token;
  if (existsSync(path)) unlinkSync(path);
}
