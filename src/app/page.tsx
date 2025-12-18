"use client";

import React, { useEffect, useMemo, useState } from "react";

type ArtStyleKey =
  | "none"
  | "game-2d-toon"
  | "anime-cel"
  | "chibi"
  | "vector-logo"
  | "pixel-art"
  | "handpainted-fantasy"
  | "3d-stylized-pbr"
  | "3d-clay-vinyl"
  | "ui-icon";

const ART_STYLES: { key: ArtStyleKey; label: string; hint: string }[] = [
  { key: "none", label: "No style", hint: "Don't force a style" },
  {
    key: "game-2d-toon",
    label: "Game 2D Toon",
    hint: "bold outlines + cel shading + vibrant colors",
  },
  {
    key: "anime-cel",
    label: "Anime Cel-shading",
    hint: "anime game art, clean linework",
  },
  { key: "chibi", label: "Chibi Game", hint: "big head, cute mascot proportions" },
  { key: "vector-logo", label: "Vector Logo", hint: "flat, brand-ready, strong silhouette" },
  { key: "pixel-art", label: "Pixel Art", hint: "retro 16/32-bit, limited palette" },
  {
    key: "handpainted-fantasy",
    label: "Hand-painted Fantasy",
    hint: "concept art, painterly rendering",
  },
  {
    key: "3d-stylized-pbr",
    label: "3D Stylized PBR",
    hint: "stylized 3D game render",
  },
  {
    key: "3d-clay-vinyl",
    label: "3D Clay/Vinyl",
    hint: "toy look, soft + slightly glossy",
  },
  { key: "ui-icon", label: "Game UI Icon", hint: "clean, readable at small size" },
];

type PresetKey =
  | "logo"
  | "chibi"
  | "ui-icon"
  | "background"
  | "character-splash"
  | "aso-screenshot";

type Preset = {
  key: PresetKey;
  label: string;
  recommendedArtStyle: ArtStyleKey;
  aspectRatio: string;
  template: string;
};

const BRAND = {
  name: "Prompt Enhancer",
  owner: "_dphuonggiao_", // change to your handle/brand
  initials: "PE",
  accent: "from-indigo-600 via-fuchsia-600 to-rose-500",
};

const PRESETS: Preset[] = [
  {
    key: "logo",
    label: "Logo",
    recommendedArtStyle: "vector-logo",
    aspectRatio: "1:1",
    template:
      "Game logo / brand mark. Vector-friendly. Strong silhouette, clean shapes, minimal gradients, centered, plain background. NO text unless explicitly requested.",
  },
  {
    key: "chibi",
    label: "Chibi",
    recommendedArtStyle: "chibi",
    aspectRatio: "1:1",
    template:
      "Full-body chibi game character. Big head small body (1:2). Clean outlines, simple cel shading, cute expression. Transparent background if possible.",
  },
  {
    key: "ui-icon",
    label: "UI Icon",
    recommendedArtStyle: "ui-icon",
    aspectRatio: "1:1",
    template:
      "Mobile game UI icon. Single object, high contrast, readable at small size. Simple background, glossy highlight, no text, no watermark.",
  },
  {
    key: "background",
    label: "Background",
    recommendedArtStyle: "game-2d-toon",
    aspectRatio: "16:9",
    template:
      "2D game background environment. No characters, no UI. Clean composition, depth layers, parallax-friendly. Stylized, not photoreal.",
  },
  {
    key: "character-splash",
    label: "Splash",
    recommendedArtStyle: "anime-cel",
    aspectRatio: "9:16",
    template:
      "Character key art / splash. One main character, dynamic pose, clear silhouette. Simple background, readable, stylized game art (not photo).",
  },
  {
    key: "aso-screenshot",
    label: "ASO",
    recommendedArtStyle: "game-2d-toon",
    aspectRatio: "9:16",
    template:
      "ASO screenshot background/composition. Leave empty space for headline text, clean layout, bright and readable. No UI clutter, stylized game look.",
  },
];

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

type TargetTool =
  | "nano-banana"
  | "chatgpt"
  | "midjourney"
  | "stable-diffusion"
  | "dalle"
  | "generic";

type TabKey = "clean" | "detailed" | "extreme" | "negative" | "params";

type AnalyzeMode = "recreate" | "style-only";
type FlowKey = "text" | "image";

type HistoryItem = {
  id: string;
  createdAt: number;
  flow: FlowKey;
  idea: string;
  target: TargetTool;
  artStyle: ArtStyleKey;
  mode?: AnalyzeMode;
  imageName?: string;
  result: EnhanceResult;
};

const HISTORY_KEY = "prompt-enhancer.history.v2";
const HISTORY_LIMIT = 30;

function safeJsonParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function Page() {
  const [flow, setFlow] = useState<FlowKey>("text");

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  const [artStyle, setArtStyle] = useState<ArtStyleKey>("none");
  const [idea, setIdea] = useState("");
  const [target, setTarget] = useState<TargetTool>("nano-banana");

  // Image analyze
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode>("recreate");

  const [tab, setTab] = useState<TabKey>("clean");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  // Load history once
  useEffect(() => {
    const loaded = safeJsonParse<HistoryItem[]>(localStorage.getItem(HISTORY_KEY), []);
    setHistory(Array.isArray(loaded) ? loaded : []);
  }, []);

  // Persist history
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // Preview image
  useEffect(() => {
    if (!refFile) {
      setRefPreview(null);
      return;
    }
    const url = URL.createObjectURL(refFile);
    setRefPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [refFile]);

  const canGenerate = useMemo(() => {
    if (loading) return false;
    if (flow === "text") return idea.trim().length > 0;
    return !!refFile; // image flow: idea is optional
  }, [flow, idea, refFile, loading]);

  const activeText = useMemo(() => {
    if (!result) return "";
    if (tab === "params") return JSON.stringify(result.params ?? {}, null, 2);
    return result[tab] ?? "";
  }, [result, tab]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1400);
  }

  async function copyText(text: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showToast("Copied ✅");
  }

  function applyPreset(p: Preset) {
    setActivePreset(p.key);
    setArtStyle(p.recommendedArtStyle);

    const block = `\n\n--- Preset: ${p.label} ---\n${p.template}\nAspect ratio: ${p.aspectRatio}\n`;
    setIdea((prev) => {
      const base = prev.trim();
      return base ? `${base}${block}` : block.trim();
    });

    showToast(`Preset applied: ${p.label}`);
  }

  function clearAll() {
    setIdea("");
    setResult(null);
    setError(null);
    setTab("clean");
    setRefFile(null);
    setAnalyzeMode("recreate");
    setActivePreset(null);
  }

  async function onGenerate() {
    if (!canGenerate) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let data: any;

      // helper: build friendly error message for BOTH routes
      const buildErrorMessage = async (res: Response) => {
        let json: any = null;
        try {
          json = await res.clone().json();
        } catch {}

        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfter =
          (json?.retryAfterSeconds ?? null) ||
          (retryAfterHeader ? Number(retryAfterHeader) : null) ||
          null;

        if (res.status === 503) {
          return "Model is overloaded. Try again in a few seconds.";
        }

        if (res.status === 429) {
          const secs = retryAfter ?? 60;
          return `Quota exceeded. Please retry in ${secs}s.`;
        }

        if (json?.error) {
          return `${json.error}${json.detail ? `: ${json.detail}` : ""}`;
        }

        return "Request failed";
      };

      if (flow === "text") {
        const res = await fetch("/api/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea, target, artStyle }),
        });

        if (!res.ok) {
          throw new Error(await buildErrorMessage(res));
        }

        data = await res.json();

        setHistory((prev) => {
          const item: HistoryItem = {
            id: makeId(),
            createdAt: Date.now(),
            flow: "text",
            idea,
            target,
            artStyle,
            result: data,
          };
          return [item, ...prev].slice(0, HISTORY_LIMIT);
        });
      } else {
        const form = new FormData();
        form.append("image", refFile as File);
        form.append("idea", idea); // optional
        form.append("target", target);
        form.append("artStyle", artStyle);
        form.append("mode", analyzeMode);

        const res = await fetch("/api/analyze", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          throw new Error(await buildErrorMessage(res));
        }

        data = await res.json();

        setHistory((prev) => {
          const item: HistoryItem = {
            id: makeId(),
            createdAt: Date.now(),
            flow: "image",
            idea,
            target,
            artStyle,
            mode: analyzeMode,
            imageName: refFile?.name,
            result: data,
          };
          return [item, ...prev].slice(0, HISTORY_LIMIT);
        });
      }

      setResult(data);
      setTab("clean");
      showToast("Done ✨");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }


  function useHistoryItem(item: HistoryItem) {
    setFlow(item.flow);
    setIdea(item.idea);
    setTarget(item.target);
    setArtStyle(item.artStyle);
    setAnalyzeMode(item.mode ?? "recreate");
    setResult(item.result);
    setTab("clean");
    setError(null);
    // Not restoring image file (avoid storage bloat)
    showToast("Loaded from history");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-rose-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 md:py-10 space-y-6">
        <Header />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="xl:col-span-3">
            <HistoryCard
              history={history}
              onUse={useHistoryItem}
              onDelete={(id) => setHistory((prev) => prev.filter((x) => x.id !== id))}
              onClear={() => setHistory([])}
            />
          </div>

          {/* Input */}
          <div className="xl:col-span-5">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <CardTitle title="Input" subtitle="Text → Prompt or Image Ref → Prompt" />
                <FlowSwitch flow={flow} setFlow={setFlow} />
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Target tool">
                  <select
                    className={selectClass}
                    value={target}
                    onChange={(e) => setTarget(e.target.value as TargetTool)}
                  >
                    <option value="nano-banana">Nano Banana (default)</option>
                    <option value="chatgpt">ChatGPT</option>
                    <option value="midjourney">Midjourney</option>
                    <option value="stable-diffusion">Stable Diffusion</option>
                    <option value="dalle">DALL·E</option>
                    <option value="generic">Generic</option>
                  </select>
                </Field>

                <Field label="Art style preset">
                  <select
                    className={selectClass}
                    value={artStyle}
                    onChange={(e) => setArtStyle(e.target.value as ArtStyleKey)}
                  >
                    {ART_STYLES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-slate-500">
                    {ART_STYLES.find((s) => s.key === artStyle)?.hint}
                  </div>
                </Field>
              </div>

              {/* Presets */}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">Presets (Game)</div>
                  <div className="text-xs text-slate-500">Auto-set style + append constraints</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESETS.map((p) => {
                    const active = activePreset === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => applyPreset(p)}
                        className={[
                          "rounded-full px-3 py-1.5 text-sm border transition",
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Click a preset to auto-pick style and append constraints to your idea.
                </div>
              </div>

              {/* Image Ref block */}
              {flow === "image" && (
                <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Reference image</div>
                      <div className="text-xs text-slate-500">
                        Upload a reference image to generate a prompt (Recreate / Style-only)
                      </div>
                    </div>

                    <select
                      className={selectClass}
                      value={analyzeMode}
                      onChange={(e) => setAnalyzeMode(e.target.value as AnalyzeMode)}
                      style={{ width: 180 }}
                    >
                      <option value="recreate">Recreate</option>
                      <option value="style-only">Style-only</option>
                    </select>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white file:font-medium hover:file:bg-indigo-700"
                        onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                      />
                      <div className="mt-2 text-xs text-slate-500">
                        Tip: Style-only returns a reusable style template you can apply to many
                        subjects.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 min-h-[120px] flex items-center justify-center">
                      {refPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={refPreview}
                          alt="preview"
                          className="max-h-[180px] w-auto rounded-xl shadow-sm"
                        />
                      ) : (
                        <div className="text-sm text-slate-500">No image</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Idea */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800">
                    {flow === "text" ? "Your idea" : "Idea (optional)"}
                  </label>
                  <span className="text-xs text-slate-500">{idea.trim().length} chars</span>
                </div>

                <textarea
                  className="mt-2 w-full min-h-[170px] resize-y rounded-3xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 shadow-sm"
                  placeholder={
                    flow === "text"
                      ? 'Example: "A cute premium fire dragon logo, simple, modern, bold shapes"'
                      : 'Optional: "Make a chibi bunny mage" (leave empty to recreate from the reference image)'
                  }
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                />

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={onGenerate}
                    disabled={!canGenerate}
                    className="inline-flex items-center justify-center rounded-full px-5 py-2.5 font-semibold text-white shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700"
                  >
                    {loading
                      ? "Generating..."
                      : flow === "text"
                      ? "Generate Prompt"
                      : "Analyze & Generate"}
                  </button>

                  <button
                    onClick={clearAll}
                    className="inline-flex items-center justify-center rounded-full px-5 py-2.5 font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
                  >
                    Clear
                  </button>

                  <div className="ml-auto text-xs text-slate-500">
                    Tip: clearer “style + subject + vibe” = better results.
                  </div>
                </div>

                {error && (
                  <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
                    <div className="text-sm font-semibold">Error</div>
                    <div className="text-sm mt-1 whitespace-pre-wrap">{error}</div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Output */}
          <div className="xl:col-span-4">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <CardTitle title="Output" subtitle="Clean / Detailed / Extreme / Negative / Params" />
                {result && (
                  <button
                    onClick={() => copyText(JSON.stringify(result, null, 2))}
                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 shadow-sm"
                  >
                    Copy JSON
                  </button>
                )}
              </div>

              {!result && !loading && <EmptyState />}

              {loading && <Skeleton />}

              {result && !loading && (
                <>
                  <Tabs tab={tab} setTab={setTab} />

                  <div className="mt-4 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                      <div className="text-sm font-semibold capitalize text-slate-800">{tab}</div>
                      <button
                        onClick={() => copyText(activeText)}
                        className="text-xs rounded-full bg-indigo-600 text-white px-3 py-1.5 hover:bg-indigo-700 shadow-sm"
                      >
                        Copy
                      </button>
                    </div>

                    <pre className="px-4 py-3 text-[13px] font-mono whitespace-pre-wrap leading-relaxed text-slate-900">
                      {activeText || "(empty)"}
                    </pre>
                  </div>

                  {result?.params?.notes && (
                    <div className="mt-4 rounded-3xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900">
                      <div className="text-sm font-semibold">Notes</div>
                      <div className="text-sm mt-1 whitespace-pre-wrap opacity-90">
                        {result.params.notes}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>

            <div className="text-xs text-slate-400 text-center pt-4">
              © {new Date().getFullYear()} {BRAND.owner} • {BRAND.name}
            </div>
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 text-white px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </main>
  );
}

const selectClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 shadow-sm";

function Header() {
  return (
    <div className="rounded-3xl bg-gradient-to-r from-indigo-200 via-fuchsia-200 to-rose-200 p-[1px] shadow-sm">
      <div className="rounded-3xl bg-white/80 backdrop-blur p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark size={44} />
            <div>
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                {BRAND.name}
              </div>
              <div className="text-sm text-slate-600">
                by <span className="font-semibold text-slate-800">{BRAND.owner}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 text-xs font-semibold">
              Text → Prompt
            </span>
            <span className="rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 text-xs font-semibold">
              Image → Prompt
            </span>
          </div>
        </div>

        <p className="mt-3 text-slate-700 max-w-3xl">
          Turn an <b>idea</b> or a <b>reference image</b> into production-ready prompts for game
          assets
        </p>
      </div>
    </div>
  );
}

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className={`shrink-0 rounded-2xl bg-gradient-to-br ${BRAND.accent} shadow-sm ring-1 ring-black/5`}
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full grid place-items-center text-white font-extrabold tracking-tight select-none">
        {BRAND.initials}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5 md:p-6">
      {children}
    </section>
  );
}

function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-500 mt-1">{subtitle}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function FlowSwitch({ flow, setFlow }: { flow: FlowKey; setFlow: (v: FlowKey) => void }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
      <button
        onClick={() => setFlow("text")}
        className={[
          "rounded-full px-3 py-1.5 text-sm font-semibold transition",
          flow === "text"
            ? "bg-white shadow-sm text-slate-900"
            : "text-slate-600 hover:text-slate-900",
        ].join(" ")}
      >
        Text
      </button>
      <button
        onClick={() => setFlow("image")}
        className={[
          "rounded-full px-3 py-1.5 text-sm font-semibold transition",
          flow === "image"
            ? "bg-white shadow-sm text-slate-900"
            : "text-slate-600 hover:text-slate-900",
        ].join(" ")}
      >
        Image Ref
      </button>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  const items: { key: TabKey; label: string }[] = [
    { key: "clean", label: "Clean" },
    { key: "detailed", label: "Detailed" },
    { key: "extreme", label: "Extreme" },
    { key: "negative", label: "Negative" },
    { key: "params", label: "Params" },
  ];

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((it) => {
        const active = tab === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={[
              "rounded-full px-3 py-1.5 text-sm font-semibold border transition",
              active
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
      <div>
          <div className="text-sm font-semibold text-slate-900">No output yet</div>
          <div className="text-sm mt-1">
            Choose <b>Text</b> or <b>Image Ref</b>, enter input, then click <b>Generate</b>.
          </div>
          <div className="text-xs text-slate-500 mt-2">
            If you see “overloaded”, try again in a few seconds.
          </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-4 space-y-3">
      <div className="h-8 rounded-2xl bg-slate-100 animate-pulse" />
      <div className="h-44 rounded-3xl bg-slate-100 animate-pulse" />
      <div className="h-28 rounded-3xl bg-slate-100 animate-pulse" />
    </div>
  );
}

function HistoryCard({
  history,
  onUse,
  onDelete,
  onClear,
}: {
  history: HistoryItem[];
  onUse: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">History</div>
          <div className="text-sm text-slate-500 mt-1">
            Saved {history.length}/{HISTORY_LIMIT} most recent runs (local)
          </div>
        </div>

        <button
          onClick={onClear}
          disabled={history.length === 0}
          className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          Clear
        </button>
      </div>

      {history.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No history yet. Generate once to save.
        </div>
      ) : (
        <div className="mt-4 space-y-3 max-h-[620px] overflow-auto pr-1">
          {history.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">{formatTime(item.createdAt)}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUse(item)}
                    className="text-xs rounded-full bg-indigo-600 text-white px-3 py-1.5 hover:bg-indigo-700 shadow-sm"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 text-slate-700 shadow-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-2 text-sm text-slate-900 whitespace-pre-wrap">
                {item.idea || (item.flow === "image" ? "(no idea — recreated from ref image)" : "")}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                  flow: {item.flow}
                </span>
                <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                  target: {item.target}
                </span>
                <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                  style: {item.artStyle}
                </span>
                {item.mode && (
                  <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                    mode: {item.mode}
                  </span>
                )}
                {item.imageName && (
                  <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                    img: {item.imageName}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
