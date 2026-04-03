import { jwtVerify, createRemoteJWKSet } from "jose";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
}

interface Todo {
  id: string;
  user_email: string;
  title: string;
  completed: number;
  created_at: string;
}

// Extract the authenticated user's email from the Cloudflare Access JWT.
// If TEAM_DOMAIN is not configured, falls back to a dev header for local testing.
async function getUserEmail(request: Request, env: Env): Promise<string | null> {
  // Local dev fallback: if no TEAM_DOMAIN set, accept a plain header
  if (!env.TEAM_DOMAIN) {
    return request.headers.get("X-Dev-User") ?? "dev@localhost";
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)
    );
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    });
    return (payload.email as string) ?? null;
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function generateId(): string {
  return crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Only handle /api/* routes in the Worker; everything else → static assets
    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Authenticate the user
    const userEmail = await getUserEmail(request, env);
    if (!userEmail) {
      return json({ error: "Unauthorized" }, 401);
    }

    const method = request.method.toUpperCase();

    // GET /api/todos — list all todos for this user
    if (pathname === "/api/todos" && method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM todos WHERE user_email = ? ORDER BY created_at DESC"
      )
        .bind(userEmail)
        .all<Todo>();
      return json(results);
    }

    // POST /api/todos — create a new todo
    if (pathname === "/api/todos" && method === "POST") {
      const body = await request.json<{ title?: string }>();
      const title = body?.title?.trim();
      if (!title) {
        return json({ error: "title is required" }, 400);
      }
      const id = generateId();
      const created_at = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO todos (id, user_email, title, completed, created_at) VALUES (?, ?, ?, 0, ?)"
      )
        .bind(id, userEmail, title, created_at)
        .run();
      return json({ id, user_email: userEmail, title, completed: 0, created_at }, 201);
    }

    // PATCH /api/todos/:id — update title and/or toggle completed
    const patchMatch = pathname.match(/^\/api\/todos\/([^/]+)$/);
    if (patchMatch && method === "PATCH") {
      const id = patchMatch[1];
      const body = await request.json<{ title?: string; completed?: boolean }>();

      // Ensure this todo belongs to the authenticated user
      const existing = await env.DB.prepare(
        "SELECT * FROM todos WHERE id = ? AND user_email = ?"
      )
        .bind(id, userEmail)
        .first<Todo>();

      if (!existing) {
        return json({ error: "Not found" }, 404);
      }

      const newTitle = body.title?.trim() ?? existing.title;
      const newCompleted =
        body.completed !== undefined ? (body.completed ? 1 : 0) : existing.completed;

      await env.DB.prepare(
        "UPDATE todos SET title = ?, completed = ? WHERE id = ? AND user_email = ?"
      )
        .bind(newTitle, newCompleted, id, userEmail)
        .run();

      return json({ ...existing, title: newTitle, completed: newCompleted });
    }

    // DELETE /api/todos/:id
    const deleteMatch = pathname.match(/^\/api\/todos\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
      const id = deleteMatch[1];
      const result = await env.DB.prepare(
        "DELETE FROM todos WHERE id = ? AND user_email = ?"
      )
        .bind(id, userEmail)
        .run();

      if (result.meta.changes === 0) {
        return json({ error: "Not found" }, 404);
      }
      return json({ deleted: true });
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
