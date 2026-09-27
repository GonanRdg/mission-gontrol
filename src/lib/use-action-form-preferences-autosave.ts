import { useCallback, useEffect, useRef } from "react";
import type { ActionFormPreferences } from "~/shared/action-form-preferences";

export function useActionFormPreferencesAutosave(
  preferences: ActionFormPreferences,
  save: (preferences: ActionFormPreferences) => Promise<void>,
  delayMs = 300,
): void {
  const serialized = JSON.stringify(preferences);
  const preferencesRef = useRef(preferences);
  const saveRef = useRef(save);
  const savedRef = useRef(serialized);
  const pendingRef = useRef<{ serialized: string; preferences: ActionFormPreferences } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const failureCountRef = useRef(0);
  const mountedRef = useRef(true);
  const delayRef = useRef(delayMs);
  const flushRef = useRef<() => void>(() => undefined);
  preferencesRef.current = preferences;
  saveRef.current = save;
  delayRef.current = delayMs;

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending || inFlightRef.current) return;
    if (pending.serialized === savedRef.current) {
      pendingRef.current = null;
      return;
    }
    inFlightRef.current = true;
    let failed = false;
    void saveRef
      .current(pending.preferences)
      .then(() => {
        savedRef.current = pending.serialized;
        failureCountRef.current = 0;
        if (pendingRef.current?.serialized === pending.serialized) pendingRef.current = null;
      })
      .catch(() => {
        failed = true;
        failureCountRef.current += 1;
      })
      .finally(() => {
        inFlightRef.current = false;
        if (!pendingRef.current) return;
        if (failed && failureCountRef.current >= 3) return;
        const wait = failed
          ? Math.max(delayRef.current, 2_000)
          : mountedRef.current
            ? delayRef.current
            : 0;
        timerRef.current = setTimeout(() => flushRef.current(), wait);
      });
  }, []);
  flushRef.current = flush;

  useEffect(() => {
    if (serialized === savedRef.current && !inFlightRef.current) {
      pendingRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    pendingRef.current = { serialized, preferences: preferencesRef.current };
    failureCountRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [delayMs, flush, serialized]);

  useEffect(
    () => () => {
      flush();
      mountedRef.current = false;
    },
    [flush],
  );
}
