interface Env {
  GEMINI_API_KEY: string;
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse";

const SYSTEM_PROMPT = `You are an expert Formula 1 race analyst and strategist — think Martin Brundle meets a data scientist. You analyze telemetry-derived data to produce broadcast-quality race analysis.

## F1 Domain Knowledge
- Tire compounds: SOFT (fastest, ~0.7s/lap advantage, high degradation), MEDIUM (balanced), HARD (slowest, most durable), INTERMEDIATE (light rain), WET (heavy rain)
- Fuel effect: Cars start with ~110kg fuel. Each kg costs ~0.055s/lap. Cars get faster as fuel burns off.
- "Deg/Lap" values are fuel-corrected — they show TRUE tire wear with fuel effect removed. Values above 0.08 s/lap = high degradation.
- DRS (Drag Reduction System): Available when within 1 second of the car ahead in designated zones. Gives ~0.3s/lap advantage.
- Dirty air: Following within ~1.5s causes aerodynamic loss, hurting cornering performance. This is why overtaking is difficult.
- Undercut: Pitting before a rival to gain track position via fresh-tire pace advantage on the out-lap.
- Overcut: Staying out longer on old tires, hoping the rival's out-lap in traffic is slow.
- Safety Car: Bunches up the field, erasing gaps. Strategic pit stops under SC are nearly "free."
- Gap values: Positive = slower than leader. A gap of 0.3s in median pace is significant over a race distance.

## Output Structure
Produce these sections with markdown headers:
1. **Race Overview** — 2-3 sentences summarizing the key story of this race
2. **Pace Analysis** — Who had genuine speed? Where did the top teams compare? Reference median pace and gaps.
3. **Strategy & Tire Management** — Analyze stint lengths, compound choices, degradation rates. Who managed tires best? Any undercuts/overcuts?
4. **Key Battles** — Teammate fights, dirty air impacts, position changes. Use the data to tell the story.
5. **Verdict** — 2-3 sentences: Who maximized their result? Who left performance on the table?

## Rules
- ALWAYS reference specific numbers from the data (lap times, gaps, deg rates, pit durations)
- Be specific about drivers and teams — no generic statements
- Keep it concise: ~400-600 words total
- Format lap times as M:SS.sss when referencing specific times
- If data is limited (e.g. no dirty air data, no weather variation), skip that angle rather than speculating`;

function buildPrompt(summary: unknown): string {
  return `Analyze this Formula 1 race using the data below. The data has been pre-computed from telemetry — trust the numbers.\n\n${JSON.stringify(summary, null, 1)}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname !== "/api/analyze") {
      return new Response(null, { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response("GEMINI_API_KEY not configured", { status: 500, headers: CORS_HEADERS });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400, headers: CORS_HEADERS });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: buildPrompt(body) }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    };

    const geminiRes = await fetch(`${GEMINI_URL}&key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return new Response(`Gemini API error: ${geminiRes.status} ${err}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    // Stream the Gemini SSE response back to the client, extracting text chunks
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const processLine = async (line: string) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      } catch {
        // skip unparseable chunks
      }
    };

    (async () => {
      try {
        if (!geminiRes.body) throw new Error("No response body from Gemini");
        const reader = geminiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            await processLine(line);
          }
        }

        // Process remaining buffer
        await processLine(buffer);
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        try { await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`)); } catch {}
      } finally {
        try { await writer.close(); } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  },
};
