// src/app/api/enhance/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

type EnhanceResult = {
  clean: string;
  detailed: string;
  extreme: string;
  negative: string;
  params: {
    aspectRatio?: string;
    notes?: string;
  };
};

/** JSON Schema strict output (NO zod) */
const OutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clean: { type: "string" },
    detailed: { type: "string" },
    extreme: { type: "string" },
    negative: { type: "string" },
    params: {
      type: "object",
      additionalProperties: false,
      properties: {
        aspectRatio: { type: "string" },
        notes: { type: "string" },
      },
      required: [],
    },
  },
  required: ["clean", "detailed", "extreme", "negative", "params"],
} as const;

const STYLE_MAP: Record<string, string> = {
  none: "",
  "game-2d-toon":
    "Art style: stylized 2D game illustration, clean bold outlines, cel shading, vibrant but controlled palette, NO photorealism.",
  "anime-cel":
    "Art style: anime game key art, crisp linework, cel shading, soft gradients, high readability, NO photorealism.",
  chibi:
    "Art style: chibi game character style, big head small body, cute proportions, clean outlines, simple shading.",
  "vector-logo":
    "Art style: professional vector logo, flat shapes, minimal gradients, strong silhouette, brand-ready, clean negative space.",
  "pixel-art":
    "Art style: retro pixel art, 16-bit/32-bit look, limited palette, crisp pixels, NO anti-aliasing, game sprite style.",
  "handpainted-fantasy":
    "Art style: hand-painted fantasy game concept art, painterly brushwork, cinematic lighting, stylized realism (NOT photo).",
  "3d-stylized-pbr":
    "Art style: stylized 3D game render (PBR), clean materials, soft studio lighting, slightly exaggerated shapes, NOT photoreal.",
  "3d-clay-vinyl":
    "Art style: 3D clay/vinyl toy look, smooth surfaces, soft subsurface feel, cute premium collectible vibe.",
  "ui-icon":
    "Art style: mobile game UI icon, high contrast, simple readable shape, clean edges, minimal background, glossy highlight.",
};

const STYLE_NEGATIVE: Record<string, string> = {
  none: "photorealistic, realistic skin pores, real photo, cinematic photo lighting",
  "game-2d-toon":
    "photorealistic, realistic, real photo, complex texture, noisy lighting, HDR photo, skin pores",
  "anime-cel": "photorealistic, real photo, detailed skin pores, camera noise, HDR photo",
  chibi: "photorealistic, realistic anatomy, adult proportions, real photo, creepy realism",
  "vector-logo":
    "photorealistic, 3d render, bevel, heavy texture, complex background, gradients everywhere",
  "pixel-art": "photorealistic, smooth gradients, anti-aliasing, high-res photo, blur",
  "handpainted-fantasy":
    "photorealistic, real photo, modern camera artifacts, lens dirt, over-sharp",
  "3d-stylized-pbr":
    "photorealistic, real photo, ultra realistic skin, documentary lighting, film grain",
  "3d-clay-vinyl":
    "photorealistic, hard-surface realism, sharp pores, gritty texture, harsh shadows",
  "ui-icon": "photorealistic, complex background, tiny unreadable details, low contrast, text",
};

const TARGET_GUIDE: Record<string, string> = {
  "nano-banana":
    "Target behavior: Nano Banana. Prompts should be game-asset friendly, stylized (not photoreal), strong shape language, controlled palette, clean shading, minimal camera/photography jargon.",
  chatgpt:
    "Target behavior: ChatGPT-style prompt. Use clear natural language, structured phrasing, avoid tag spam, focus on readability and production intent.",
  midjourney:
    "Target behavior: Midjourney. Keep it punchy, aesthetic keywords ok, but do NOT include MJ flags like --ar in prompt text.",
  "stable-diffusion":
    "Target behavior: Stable Diffusion. Use clear descriptive keywords, be explicit about style/material/lighting, negative is important.",
  dalle: "Target behavior: DALL·E. Use natural language, composition-first, avoid excessive tags.",
  generic: "Target behavior: Generic. Balanced and tool-agnostic.",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePossiblyJsonMessage(e: any): any {
  const msg = String(e?.message ?? e ?? "");
  try {
    return JSON.parse(msg);
  } catch {
    return null;
  }
}

function isOverloadedError(e: any): boolean {
  const msg = String(e?.message ?? e ?? "");
  if (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.toLowerCase().includes("overloaded")
  )
    return true;

  const j = parsePossiblyJsonMessage(e);
  if (j?.error?.code === 503 || j?.error?.status === "UNAVAILABLE") return true;
  return false;
}

function isQuotaExceededError(e: any): boolean {
  const msg = String(e?.message ?? e ?? "");
  if (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota")
  )
    return true;

  const j = parsePossiblyJsonMessage(e);
  if (j?.error?.code === 429) return true;
  if (j?.error?.status === "RESOURCE_EXHAUSTED") return true;
  return false;
}

function extractRetryAfterSeconds(e: any): number | null {
  const msg = String(e?.message ?? e ?? "");
  const m = msg.match(/retry in\s+([0-9.]+)s/i);
  if (m?.[1]) return Math.max(1, Math.ceil(Number(m[1])));

  const j = parsePossiblyJsonMessage(e);
  const details = j?.error?.details;
  if (Array.isArray(details)) {
    const retryInfo = details.find((d: any) =>
      String(d?.["@type"] ?? "").includes("RetryInfo")
    );
    const delay = retryInfo?.retryDelay; // "40s"
    if (typeof delay === "string") {
      const mm = delay.match(/([0-9.]+)s/i);
      if (mm?.[1]) return Math.max(1, Math.ceil(Number(mm[1])));
    }
  }
  return null;
}

function extractAspectRatio(text: string): string | undefined {
  if (!text) return;
  const mj = text.match(/--ar\s*([0-9]+\s*:\s*[0-9]+)/i);
  if (mj?.[1]) return mj[1].replace(/\s+/g, "");
  const plain = text.match(/\b([0-9]{1,2}\s*:\s*[0-9]{1,2})\b/);
  if (plain?.[1]) return plain[1].replace(/\s+/g, "");
  return;
}

function stripAspectRatioFlags(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*--ar\s*[0-9]+\s*:\s*[0-9]+\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeNegative(base: string, extra: string): string {
  const b = (base || "").trim();
  const e = (extra || "").trim();
  if (!b && !e) return "";
  if (!b) return e;
  if (!e) return b;

  const lower = b.toLowerCase();
  const parts = e
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const toAdd = parts.filter((p) => !lower.includes(p.toLowerCase()));
  return (b + ", " + toAdd.join(", ")).replace(/\s+/g, " ").trim();
}

function asString(v: any): string {
  return typeof v === "string" ? v : "";
}

function normalizeOutput(raw: any, artStyle: string): EnhanceResult {
  const r = raw && typeof raw === "object" ? raw : {};

  let clean = asString(r.clean);
  let detailed = asString(r.detailed) || clean;
  let extreme = asString(r.extreme) || detailed;

  let negative = asString(r.negative);

  // params
  let params: { aspectRatio?: string; notes?: string } = {};
  if (typeof r.params === "string") {
    params.notes = r.params;
  } else if (r.params && typeof r.params === "object" && !Array.isArray(r.params)) {
    const ar =
      typeof r.params.aspectRatio === "string"
        ? r.params.aspectRatio
        : typeof r.params.aspect_ratio === "string"
        ? r.params.aspect_ratio
        : undefined;

    const notes =
      typeof r.params.notes === "string"
        ? r.params.notes
        : typeof r.params.note === "string"
        ? r.params.note
        : undefined;

    if (ar) params.aspectRatio = ar;
    if (notes) params.notes = notes;
  }

  // pull aspect ratio from prompt if model put it there
  const arFromText =
    params.aspectRatio ||
    extractAspectRatio(extreme) ||
    extractAspectRatio(detailed) ||
    extractAspectRatio(clean);
  if (arFromText) params.aspectRatio = arFromText;

  clean = stripAspectRatioFlags(clean);
  detailed = stripAspectRatioFlags(detailed);
  extreme = stripAspectRatioFlags(extreme);

  // add style negative + baseline negative (no word "logo" to avoid breaking logo tasks)
  const extraNeg = STYLE_NEGATIVE[artStyle] ?? STYLE_NEGATIVE.none;
  negative = mergeNegative(negative, extraNeg);
  negative = mergeNegative(
    negative,
    "text, words, letters, watermark, signature, UI overlay, frame, border, blurry, low quality"
  );

  // ensure required fields exist (fallback)
  if (!clean) clean = "Describe the subject clearly in 1 sentence, stylized game asset.";
  if (!detailed) detailed = clean;
  if (!extreme) extreme = detailed;

  return { clean, detailed, extreme, negative, params };
}

async function getResponseText(response: any): Promise<string> {
  if (!response) return "";
  // @google/genai often provides response.text() (function) or response.text (string)
  if (typeof response.text === "function") {
    const t = response.text();
    return typeof t === "string" ? t : String(t ?? "");
  }
  if (typeof response.text === "string") return response.text;

  // fallback attempt
  const maybe =
    response?.response?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ??
    "";
  return String(maybe);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idea = body?.idea;
    const target = body?.target ?? "nano-banana";
    const artStyle = body?.artStyle ?? "none";

    if (!idea || typeof idea !== "string") {
      return NextResponse.json({ error: "Missing 'idea' string" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const targetGuide = TARGET_GUIDE[String(target)] ?? TARGET_GUIDE.generic;
    const styleLine = STYLE_MAP[String(artStyle)] ?? "";
    const styleNeg = STYLE_NEGATIVE[String(artStyle)] ?? STYLE_NEGATIVE.none;

    const prompt = `
You are a Prompt Enhancer for GAME ASSET image generation.
Target tool: ${target}
${targetGuide}
${styleLine ? styleLine : ""}

IMPORTANT OUTPUT RULES:
- Return ONLY valid JSON matching the schema.
- "params" MUST be an object (not a string or array).
- If you suggest aspect ratio, put it in params.aspectRatio like "1:1" or "16:9".
- Do NOT include Midjourney flags like "--ar" in any prompt text.

NEGATIVE GUIDANCE (include in "negative"):
${styleNeg}

SCHEMA:
{
  "clean": string,
  "detailed": string,
  "extreme": string,
  "negative": string,
  "params": { "aspectRatio"?: string, "notes"?: string }
}

User idea:
${idea}
`.trim();

    async function generateOnce(model: string) {
      return ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: OutputJsonSchema, // ✅ NO zod
        },
      });
    }

    async function generateWithRetry(model: string) {
      const delays = [0, 500, 1200, 2500, 4500, 8000];
      let lastErr: any = null;

      for (let i = 0; i < delays.length; i++) {
        try {
          if (delays[i] > 0) {
            const jitter = Math.floor(Math.random() * 200);
            await sleep(delays[i] + jitter);
          }
          return await generateOnce(model);
        } catch (e: any) {
          lastErr = e;
          if (isQuotaExceededError(e)) throw e; // let outer loop switch model
          if (!isOverloadedError(e)) throw e;   // other errors => stop
        }
      }
      throw lastErr;
    }

    const modelFallbacks = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

    let response: any = null;
    let lastErr: any = null;

    for (const m of modelFallbacks) {
      try {
        response = await generateWithRetry(m);
        break;
      } catch (e: any) {
        lastErr = e;
        if (isQuotaExceededError(e)) continue;
        if (isOverloadedError(e)) continue;
        throw e;
      }
    }

    if (!response) {
      if (lastErr && isQuotaExceededError(lastErr)) {
        const retryAfterSeconds = extractRetryAfterSeconds(lastErr);
        return NextResponse.json(
          { error: "Quota exceeded", detail: String(lastErr?.message ?? lastErr), retryAfterSeconds },
          {
            status: 429,
            headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
          }
        );
      }

      return NextResponse.json(
        { error: "Model overloaded", detail: String(lastErr?.message ?? lastErr) },
        { status: 503 }
      );
    }

    const rawText = await getResponseText(response);
    let parsed: any;
    try {
      parsed = JSON.parse(rawText || "{}");
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON output", detail: rawText },
        { status: 502 }
      );
    }

    const data = normalizeOutput(parsed, String(artStyle));
    return NextResponse.json(data);
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      const retryAfterSeconds = extractRetryAfterSeconds(err);
      return NextResponse.json(
        { error: "Quota exceeded", detail: String(err?.message ?? err), retryAfterSeconds },
        {
          status: 429,
          headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
        }
      );
    }
    if (isOverloadedError(err)) {
      return NextResponse.json(
        { error: "Model overloaded", detail: String(err?.message ?? err) },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Enhance failed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
