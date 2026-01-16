import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache JWKS to avoid fetching on every request
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

async function verifyToken(token: string): Promise<{ userId: string } | { error: string }> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    
    if (!payload.sub) {
      return { error: "Token missing sub claim" };
    }
    
    return { userId: payload.sub };
  } catch (err) {
    console.error("JWT verification failed:", err);
    return { error: err instanceof Error ? err.message : "Token verification failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_MISSING_HEADER" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice("Bearer ".length);
    const result = await verifyToken(token);
    
    if ("error" in result) {
      console.error("Token verification failed:", result.error);
      return new Response(JSON.stringify({ error: "Invalid token", code: "AUTH_INVALID_TOKEN" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", result.userId);

    const { pillarName, ninetyDayGoal } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a helpful life planning assistant. Generate a single, specific, actionable weekly habit or commitment example.
Keep the example concise (under 10 words). Do not include any explanation, just the example commitment text.
Make it a small, repeatable action that someone could do multiple times per week.`;

    const userPrompt = `Generate a weekly commitment example for someone focused on "${pillarName}".
Their 90-day goal is: "${ninetyDayGoal}"

Return ONLY the commitment text, nothing else. Example format: "Practice Spanish vocabulary for 20 minutes"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMIT" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required", code: "PAYMENT_REQUIRED" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const example = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ example }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
