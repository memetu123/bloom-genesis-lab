import { serve } from "https://deno.land/std@0.168.0/http/server.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.slice("Bearer ".length);

    // Verify the JWT by calling the auth endpoint directly (avoids edge-runtime session quirks)
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });

    if (!userResp.ok) {
      const t = await userResp.text();
      console.error("Invalid token:", t);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = await userResp.json();
    const userId = user?.id;
    if (!userId) {
      console.error("Invalid token: missing user id");
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", userId);

    const { goalType, pillarName, parentGoalTitle, visionTitle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const goalTypeLabel = goalType === "three_year" ? "3-year" : goalType === "one_year" ? "1-year" : "90-day";
    
    let contextDescription = "";
    if (goalType === "three_year" && visionTitle) {
      contextDescription = `Their vision is: "${visionTitle}"`;
    } else if (goalType === "one_year" && parentGoalTitle) {
      contextDescription = `Their 3-year goal is: "${parentGoalTitle}"`;
    } else if (goalType === "ninety_day" && parentGoalTitle) {
      contextDescription = `Their 1-year milestone is: "${parentGoalTitle}"`;
    }

    const systemPrompt = `You are a helpful life planning assistant. Generate a single, specific, actionable goal example.
Keep the example concise (under 15 words). Do not include any explanation, just the example goal text.
Make it realistic and achievable for the time horizon specified.`;

    const userPrompt = `Generate a ${goalTypeLabel} goal example for someone focused on "${pillarName}".
${contextDescription}

Return ONLY the goal text, nothing else. Example format: "Complete a 5K run under 30 minutes"`;

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
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
