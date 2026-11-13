import { json, jsonError, noContent, parseJsonBody, rethrowUnlessDomain } from "./_helpers";
import * as tickets from "../services/tickets";

async function run(action: () => Promise<Response> | Response): Promise<Response> {
  try { return await action(); } catch (error) { return rethrowUnlessDomain(error); }
}
export async function connection(request: Request) {
  return run(async () => {
    if (request.method === "GET") return json(await tickets.getTicketConnection());
    const body = await parseJsonBody(request, tickets.ticketConnectionSchema);
    if (!body.ok) return body.response;
    tickets.saveTicketConnection(body.data); return json(await tickets.getTicketConnection());
  });
}
export async function connect() { return run(async () => json(await tickets.connectTickets())); }
export async function disconnect() { return run(() => { tickets.disconnectTickets(); return noContent(); }); }
export async function projects(request: Request) { return run(async () => json(await tickets.ticketProjects(new URL(request.url).searchParams.get("q")?.slice(0, 100) ?? ""))); }
export async function fields(projectId: string, request: Request) { return run(async () => json(await tickets.ticketFields(projectId, new URL(request.url).searchParams.get("project") ?? undefined))); }
export async function filters(projectId: string, request: Request) {
  return run(async () => {
    if (request.method === "GET") return json(tickets.getTicketFilters(projectId));
    const body = await parseJsonBody(request, tickets.ticketFiltersSchema);
    if (!body.ok) return body.response;
    tickets.saveTicketFilters(projectId, body.data); return json(body.data);
  });
}
export async function list(projectId: string, request: Request) {
  return run(async () => {
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    if (cursor && cursor.length > 12000) return jsonError(400, "Invalid ticket page");
    return json(await tickets.listTickets(projectId, cursor));
  });
}
export async function preview(projectId: string, request: Request) {
  return run(async () => {
    const body = await parseJsonBody(request, tickets.ticketFiltersSchema);
    if (!body.ok) return body.response;
    return json(await tickets.listTickets(projectId, undefined, body.data));
  });
}
export async function detail(projectId: string, id: string, request: Request) {
  return run(async () => {
    if (request.method === "GET") return json(await tickets.ticketDetail(projectId, id, new URL(request.url).searchParams.get("context") ?? undefined));
    const body = await parseJsonBody(request, tickets.ticketPatchSchema.extend({ context: tickets.ticketContextSchema }));
    if (!body.ok) return body.response;
    const { context, ...patch } = body.data;
    if (!Object.keys(patch).length) return jsonError(400, "Provide a ticket change");
    await tickets.updateTicket(projectId, id, patch, context); return noContent();
  });
}
export async function comments(projectId: string, id: string, request: Request) {
  return run(async () => {
    const body = await parseJsonBody(request, tickets.ticketCommentSchema.extend({ context: tickets.ticketContextSchema }));
    if (!body.ok) return body.response;
    await tickets.saveTicketComment(projectId, id, body.data.body, body.data.context, body.data.commentId); return noContent();
  });
}
