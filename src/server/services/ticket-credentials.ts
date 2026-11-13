import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  if (process.platform !== "darwin") throw new Error("Jira credential storage requires macOS Keychain.");
  const service = "com.missiongontrol.ticket-encryption";
  const account = createHash("sha256").update(resolveUserDataDir()).digest("hex");
  const read = () => {
    try {
      const value = execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("invalid key");
      return Buffer.from(value, "hex");
    } catch (error) {
      if ((error as { status?: number }).status === 44) return null;
      throw new Error("Cannot access Jira credentials in macOS Keychain. Unlock Keychain and retry.");
    }
  };
  const stored = read();
  if (stored) return stored;
  const legacyPath = paths().key;
  const value = existsSync(legacyPath) ? readFileSync(legacyPath) : randomBytes(32);
  if (value.length !== 32) throw new Error("Invalid legacy Jira encryption key.");
  try {
    // Interactive input keeps the key out of process arguments and error messages.
    execFileSync("/usr/bin/security", ["-i"], { input: `add-generic-password -s ${service} -a ${account} -w ${value.toString("hex")}\n`, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    throw new Error("Cannot save Jira credentials in macOS Keychain. Unlock Keychain and retry.");
  }
  const saved = read();
  if (!saved?.equals(value)) throw new Error("Could not verify Jira encryption key in macOS Keychain.");
  if (existsSync(legacyPath)) unlinkSync(legacyPath);
  return saved;
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
