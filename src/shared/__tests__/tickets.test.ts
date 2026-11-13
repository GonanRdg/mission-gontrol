import { describe, expect, it } from "vitest";
import { DEFAULT_TICKET_FILTERS, matchTicket, ticketImplementationPrompt, type TicketSummary } from "../tickets";

const ticket = (patch: Partial<TicketSummary> = {}): TicketSummary => ({ id: "APP-3", key: "APP-3", title: "Restore context", description: "Keep sessions available", url: "https://example.atlassian.net/browse/APP-3", status: "Open", done: false, type: "Task", priority: "", assignee: null, labels: [], metadata: [], parentId: null, ...patch });
const filters = { ...DEFAULT_TICKET_FILTERS, keywords: ["Mission-Control"] };
describe("repo ticket matching", () => {
  it("matches title and description phrases but complete label and metadata values", () => {
    expect(matchTicket(ticket({ title: "Fix mission-control startup" }), filters)?.location).toBe("Title");
    expect(matchTicket(ticket({ description: "The MISSION-CONTROL repo" }), filters)?.location).toBe("Description");
    expect(matchTicket(ticket({ labels: ["mission-control-ui"] }), filters)).toBeNull();
    expect(matchTicket(ticket({ metadata: ["mission-control"] }), filters)?.location).toBe("Repository field");
  });
  it("inherits a match from an epic through an otherwise unmatched story", () => {
    const ancestors = new Map([["APP-2", ticket({ id: "APP-2", key: "APP-2", parentId: "APP-1" })], ["APP-1", ticket({ id: "APP-1", key: "APP-1", labels: ["mission-control"] })]]);
    expect(matchTicket(ticket({ parentId: "APP-2" }), filters, ancestors)).toEqual({ location: "Label", keyword: "mission-control", ancestor: "APP-1" });
    expect(matchTicket(ticket({ parentId: "APP-2" }), { ...filters, ancestors: false }, ancestors)).toBeNull();
    expect(matchTicket(ticket({ parentId: "APP-2", metadata: ["mission-control"] }), filters, ancestors)?.ancestor).toBeUndefined();
  });
  it("honors disabled locations, missing parents, and hierarchy cycles", () => {
    const parent = ticket({ id: "APP-2", parentId: "APP-2" });
    expect(matchTicket(ticket({ parentId: "APP-2" }), filters, new Map([[parent.id, parent]]))).toBeNull();
    expect(matchTicket(ticket({ parentId: "missing" }), filters)).toBeNull();
    expect(matchTicket(ticket({ labels: ["mission-control"] }), { ...filters, labels: false })).toBeNull();
  });
});
describe("ticket terminal handoff", () => {
  it("builds the exact implementation request without submission or explicit skill names", () => {
    const prompt = ticketImplementationPrompt("https://example.atlassian.net/browse/APP-3");
    expect(prompt).toBe("Implement ticket https://example.atlassian.net/browse/APP-3");
    expect(prompt).not.toMatch(/[\r\n\x1b]/);
  });
  it.each(["javascript:alert(1)", "https://user:secret@example.com/issue", "https://example.com/issue\r\nrun", "file:///tmp/ticket"])("rejects unsafe handoff URLs", url => { expect(() => ticketImplementationPrompt(url)).toThrow(); });
});
