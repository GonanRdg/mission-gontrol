import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecallEnabled } from "../recall-enabled";

describe("Recall unavailable in Mission Gontrol", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never provisions Recall even if the server reports an old enabled setting", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ recallEnabled: true })));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchRecallEnabled({ apiUrl: "http://127.0.0.1:5174", token: "test" })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays disabled when no API is available", async () => {
    expect(await fetchRecallEnabled(null)).toBe(false);
  });
});
