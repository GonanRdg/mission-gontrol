import { z } from "zod";
import { readJsonSetting, setSetting } from "./settings";
import {
  actionFormPreferencesSchema,
  type ActionFormPreferences,
} from "~/shared/action-form-preferences";

const ACTION_FORM_PREFERENCES_KEY = "action_form_preferences";
const MAX_ENTRIES = 500;

const storedEntrySchema = z
  .object({
    projectId: z.string().min(1),
    actionName: z.string().min(1).max(64),
    preferences: actionFormPreferencesSchema,
  })
  .strict();

const storeSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(storedEntrySchema).max(MAX_ENTRIES),
  })
  .strict();

type PreferenceStore = z.infer<typeof storeSchema>;

function readStore(): PreferenceStore {
  const parsed = storeSchema.safeParse(readJsonSetting<unknown>(ACTION_FORM_PREFERENCES_KEY));
  return parsed.success ? parsed.data : { version: 1, entries: [] };
}

export function readActionFormPreferences(
  projectId: string,
  actionName: string,
): ActionFormPreferences | null {
  return (
    readStore().entries.find(
      (entry) => entry.projectId === projectId && entry.actionName === actionName,
    )?.preferences ?? null
  );
}

export function writeActionFormPreferences(
  projectId: string,
  actionName: string,
  preferences: ActionFormPreferences,
): ActionFormPreferences {
  const entries = readStore().entries.filter(
    (entry) => entry.projectId !== projectId || entry.actionName !== actionName,
  );
  entries.push({ projectId, actionName, preferences });
  setSetting(
    ACTION_FORM_PREFERENCES_KEY,
    JSON.stringify({ version: 1, entries: entries.slice(-MAX_ENTRIES) } satisfies PreferenceStore),
  );
  return preferences;
}

export function deleteActionFormPreferences(projectId: string, actionName: string): void {
  const entries = readStore().entries.filter(
    (entry) => entry.projectId !== projectId || entry.actionName !== actionName,
  );
  setSetting(ACTION_FORM_PREFERENCES_KEY, JSON.stringify({ version: 1, entries } satisfies PreferenceStore));
}
