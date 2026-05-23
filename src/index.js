/// <reference types="@fastly/js-compute" />
import { createFanoutHandoff } from "fastly:fanout";

/**
 * Fastly Compute — Producción sin simulador
 *
 * Usa createFanoutHandoff para todas las rutas SSE.
 * El origin es un servidor minimalista que SOLO responde headers GRIP.
 * Los eventos los publica cualquier sistema externo al API de Fastly.
 */

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function handleRequest(event) {
  const req = event.request;
  const url = new URL(req.url);

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", edge: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Rutas SSE → handoff a Fanout
    // El origin responde con Grip-Hold + Grip-Channel
    if (url.pathname === "/stream/live" ||
        url.pathname.startsWith("/stream/match/")) {
      return createFanoutHandoff(req, "origin");
    }

    // API REST → proxy al origin con CORS
    const beresp = await fetch(req, { backend: "origin" });
    const headers = new Headers(beresp.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
    return new Response(beresp.body, { status: beresp.status, headers });

  } catch (err) {
    console.error("[Edge] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}
