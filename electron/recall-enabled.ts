import type { PtyHookEnv } from "./pty-hook-env";

export async function fetchRecallEnabled(_mcEnv: PtyHookEnv | null): Promise<boolean> {
  return false;
}
