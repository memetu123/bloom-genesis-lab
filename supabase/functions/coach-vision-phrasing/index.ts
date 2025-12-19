import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const systemPrompt = `You are a calm, thoughtful life planning coach. Your role is to help people articulate their life visions in ways that feel authentic and inspiring to them.

Guidelines:
- Be warm and human, never corporate or jargon-heavy
- Avoid metrics or numbers unless the user explicitly uses them
- Keep language simple and genuine
- Focus on identity and becoming ("who you want to be") rather than just achievements
- Offer variety: some options more aspirational/dreamy, some more grounded/concrete, some balanced
- Provide 3-5 options that feel meaningfully different
- If the draft is vague, ask ONE clarifying question to help refine

Always respond with valid JSON matching the exact schema provided.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { draft, pillar, tone } = await req.json();

    if (!draft || typeof draft !== "string" || draft.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Draft is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = `Help me refine this vision statement for my ${pillar ? `"${pillar}"` : "life"} pillar.

My rough draft: "${draft}"

${tone ? `Preferred tone: ${tone}` : ""}

Provide refined options that capture my intent while making the vision clear, inspiring, and personal.`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "provide_vision_suggestions",
              description: "Provide refined vision statement suggestions",
              parameters: {
                type: "object",
                properties: {
                  clarifying_question: {
                    type: "string",
                    description: "A single clarifying question if the draft is too vague, or null if not needed",
                    nullable: true,
                  },
                  recommended: {
                    type: "object",
                    properties: {
                      text: {
                        type: "string",
                        description: "The recommended refined vision statement",
                      },
                      rationale: {
                        type: "string",
                        description: "Brief explanation of why this version works well",
                      },
                    },
                    required: ["text", "rationale"],
                  },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: {
                          type: "string",
                          description: "An alternative vision statement",
                        },
                        style: {
                          type: "string",
                          enum: ["aspirational", "balanced", "concrete"],
                          description: "The style/tone of this option",
                        },
                        why_it_works: {
                          type: "string",
                          description: "Brief explanation of what makes this option effective",
                        },
                      },
                      required: ["text", "style", "why_it_works"],
                    },
                    description: "2-6 alternative options with different styles",
                  },
                  do_not_do: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-5 things to avoid when phrasing visions (optional tips)",
                  },
                },
                required: ["recommended", "options"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_vision_suggestions" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily unavailable. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data, null, 2));

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "provide_vision_suggestions") {
      throw new Error("Invalid response format from AI");
    }

    const suggestions = JSON.parse(toolCall.function.arguments);

    // Validate and ensure required fields
    if (!suggestions.recommended?.text || !suggestions.options) {
      throw new Error("Missing required fields in AI response");
    }

    return new Response(JSON.stringify(suggestions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in coach-vision-phrasing:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
