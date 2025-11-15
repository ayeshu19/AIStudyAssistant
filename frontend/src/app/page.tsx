"use client";

import { useState, useEffect } from "react";
import { simplifyRaw } from "../lib/api";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  grade?: 1 | 2 | 3;
  meta?: any;
  pending?: boolean;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [grade, setGrade] = useState<1 | 2 | 3>(1);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

  // Track which assistant message is currently being spoken
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Available browser voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // "auto" = choose based on grade; otherwise use the selected voiceURI
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("auto");

  // Load voices from Web Speech API
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const loaded = synth.getVoices();
      if (loaded && loaded.length > 0) {
        setVoices(loaded);
      }
    };

    loadVoices();
    synth.onvoiceschanged = loadVoices;

    return () => {
      // ts-expect-error: some browsers don't like assigning null
      synth.onvoiceschanged = null;
    };
  }, []);

  // Helper: pick best voice for this grade + selection
  const getVoiceForGrade = (g: 1 | 2 | 3): SpeechSynthesisVoice | undefined => {
    if (!voices.length) return undefined;

    // If user manually selected a voice → always use that
    if (selectedVoiceId !== "auto") {
      const manual = voices.find((v) => v.voiceURI === selectedVoiceId);
      if (manual) return manual;
    }

    // Auto mode: choose based on grade
    const englishVoices = voices.filter((v) =>
      v.lang.toLowerCase().startsWith("en")
    );

    const pickByName = (
      list: SpeechSynthesisVoice[],
      tokens: string[]
    ): SpeechSynthesisVoice | undefined => {
      const lowerTokens = tokens.map((t) => t.toLowerCase());
      return (
        list.find((v) => {
          const name = v.name.toLowerCase();
          return lowerTokens.some((t) => name.includes(t));
        }) || undefined
      );
    };

    if (g === 1) {
      // Kid-friendly / soft voice
      return (
        pickByName(englishVoices, ["child", "kid", "kids", "girl", "female"]) ||
        englishVoices[0] ||
        voices[0]
      );
    }

    if (g === 2) {
      // Teacher voice: neutral and clear
      return (
        pickByName(englishVoices, ["aria", "zira", "samantha", "teacher"]) ||
        englishVoices[0] ||
        voices[0]
      );
    }

    // Grade 3: professional (male / narrator style if available)
    return (
      pickByName(englishVoices, [
        "male",
        "guy",
        "christopher",
        "daniel",
        "george",
        "narrator",
      ]) ||
      englishVoices[0] ||
      voices[0]
    );
  };

  // Core function that actually speaks text
  const speakText = (opts: {
    text: string;
    grade: 1 | 2 | 3;
    msgId?: string; // only set for real assistant messages (for toggle)
  }) => {
    if (typeof window === "undefined") return;

    const synth = window.speechSynthesis;
    if (!synth) {
      alert("Speech is not supported in this browser.");
      return;
    }

    const { text, grade: g, msgId } = opts;

    // If this same message is already speaking → stop it (toggle)
    if (msgId && speakingId === msgId) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }

    // Stop any existing speech before starting a new one
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);

    // Grade-based rate & pitch
    if (g === 1) {
      // Slow, playful, kid-friendly
      utter.rate = 0.85;
      utter.pitch = 1.2;
    } else if (g === 2) {
      // Neutral teacher
      utter.rate = 1.0;
      utter.pitch = 1.0;
    } else {
      // Grade 3: slightly faster, more serious
      utter.rate = 1.15;
      utter.pitch = 0.95;
    }

    // Select voice based on grade + manual dropdown
    const voice = getVoiceForGrade(g);
    if (voice) {
      utter.voice = voice;
    }

    utter.onend = () => {
      if (msgId) {
        setSpeakingId((current) => (current === msgId ? null : current));
      }
    };
    utter.onerror = () => {
      if (msgId) {
        setSpeakingId((current) => (current === msgId ? null : current));
      }
    };

    if (msgId) {
      setSpeakingId(msgId);
    } else {
      setSpeakingId(null);
    }

    synth.speak(utter);
  };

  // Called when user clicks 🔊 on an assistant message
  const speak = (msg: Msg) => {
    const g = msg.grade ?? 1;
    speakText({ text: msg.text, grade: g, msgId: msg.id });
  };

  // Preview voice button: speak a short sample for current grade + selected voice
  const previewVoice = () => {
    const g = grade;
    let sample = "Hi! This is how I will read your lessons for you.";

    if (g === 2) {
      sample = "Hello! I will explain your topics clearly like this.";
    } else if (g === 3) {
      sample =
        "This is the professional voice that will read your advanced explanations.";
    }

    speakText({ text: sample, grade: g });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const usedGrade = grade;
    const assistantId = crypto.randomUUID();

    // For each new request, overwrite previous messages
    setMessages([
      { id: crypto.randomUUID(), role: "user", text, grade: usedGrade },
      {
        id: assistantId,
        role: "assistant",
        text: "…simplifying",
        grade: usedGrade,
        pending: true,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const res = await simplifyRaw({ text, grade: usedGrade });
      console.log("API simplified ->", res);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: res.simplified || "(empty response)",
                meta: res.checks,
                pending: false,
              }
            : m
        )
      );
    } catch (e: any) {
      console.error("simplify error", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: `Error: ${e?.message || "Failed to reach backend"}`,
                pending: false,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) void send();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #eef2ff 0%, #f9fafb 50%, #e5e7eb 100%)",
        padding: "2rem 1rem",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, -system-ui, sans-serif',
      }}
    >
      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 24,
          padding: "1.75rem 1.75rem 2.25rem",
          boxShadow:
            "0 20px 40px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.25)",
        }}
      >
        {/* Subtle top badge */}
        <div
          style={{
            fontSize: 12,
            color: "#4b5563",
            padding: "4px 10px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#f3f4ff",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "999px",
              background: "#22c55e",
            }}
          />
          AI Study Assistant · Live
        </div>

        <h1
          style={{
            fontSize: 30,
            fontWeight: 700,
            marginBottom: 6,
            color: "#111827",
          }}
        >
          AI Study Assistant
        </h1>
        <p style={{ marginBottom: 20, color: "#4b5563", fontSize: 14 }}>
          Paste a complex paragraph, choose a learning level, and get a clearer,
          fact-preserving explanation tailored for students.
        </p>

        {/* Controls row */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {[1, 2, 3].map((g) => (
            <button
              key={g}
              onClick={() => setGrade(g as 1 | 2 | 3)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: grade === g ? "1px solid #111827" : "1px solid #e5e7eb",
                background: grade === g ? "#111827" : "#ffffff",
                color: grade === g ? "#ffffff" : "#111827",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                boxShadow:
                  grade === g
                    ? "0 8px 18px rgba(15, 23, 42, 0.18)"
                    : "0 0 0 rgba(0,0,0,0)",
                transition: "all 0.15s ease",
              }}
            >
              Grade {g}
            </button>
          ))}

          {/* Voice selection */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexGrow: 1,
              minWidth: 220,
            }}
          >
            <label
              style={{
                fontSize: 13,
                color: "#4b5563",
                whiteSpace: "nowrap",
              }}
            >
              Voice:
            </label>
            <select
              value={selectedVoiceId}
              onChange={(e) => setSelectedVoiceId(e.target.value)}
              style={{
                flexGrow: 1,
                padding: "6px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                fontSize: 13,
                background: "#ffffff",
              }}
            >
              <option value="auto">Auto (match grade)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={previewVoice}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              🔉 Preview
            </button>
          </div>

          <label
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 13,
              color: "#4b5563",
            }}
          >
            <input
              type="checkbox"
              checked={showChecks}
              onChange={(e) => setShowChecks(e.target.checked)}
            />
            Show fact checks
          </label>
        </div>

        {/* Input form */}
        <form onSubmit={onSubmit}>
          <textarea
            placeholder="Paste complex paragraph here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              fontSize: 14,
              outline: "none",
              resize: "vertical",
              lineHeight: 1.5,
              color: "#111827",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                border: "none",
                background:
                  loading || !input.trim()
                    ? "#9ca3af"
                    : "linear-gradient(135deg, #111827, #1f2937)",
                color: "#ffffff",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading ? 0.85 : 1,
                fontSize: 14,
                fontWeight: 500,
                boxShadow:
                  loading || !input.trim()
                    ? "none"
                    : "0 12px 22px rgba(15, 23, 42, 0.3)",
                transition: "all 0.15s ease",
              }}
            >
              {loading ? "Simplifying..." : "Simplify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setInput("");
                setMessages([]);
                // also stop any ongoing speech
                if (typeof window !== "undefined" && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
                setSpeakingId(null);
              }}
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: 14,
                color: "#374151",
              }}
            >
              Clear
            </button>
          </div>
        </form>

        {/* Messages */}
        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                whiteSpace: "pre-wrap",
                padding: 14,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: m.role === "user" ? "#f9fafb" : "#f5f3ff",
                boxShadow: "0 6px 14px rgba(15, 23, 42, 0.06)",
              }}
            >
              {m.role === "assistant" ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <strong
                      style={{
                        fontSize: 13,
                        color: "#4b5563",
                      }}
                    >
                      Assistant (Grade {m.grade ?? "?"})
                      {m.pending ? " • typing…" : ""}
                    </strong>
                    <button
                      type="button"
                      aria-label={
                        speakingId === m.id ? "Stop speaking" : "Speak response"
                      }
                      onClick={() => speak(m)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 18,
                        lineHeight: 1,
                        color: "#4b5563",
                      }}
                    >
                      {speakingId === m.id ? "⏹" : "🔊"}
                    </button>
                  </div>
                  <div style={{ fontSize: 14, color: "#111827" }}>{m.text}</div>
                </>
              ) : (
                <>
                  <strong
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 13,
                      color: "#6b7280",
                    }}
                  >
                    You {m.grade ? `(Grade ${m.grade})` : ""}
                  </strong>
                  <div style={{ fontSize: 14, color: "#111827" }}>{m.text}</div>
                </>
              )}

              {showChecks && m.meta && m.role === "assistant" && (
                <details style={{ marginTop: 8 }}>
                  <summary
                    style={{
                      fontSize: 12,
                      color: "#4b5563",
                      cursor: "pointer",
                    }}
                  >
                    Fact checks
                  </summary>
                  <pre
                    style={{
                      fontSize: 11,
                      overflowX: "auto",
                      marginTop: 6,
                      background: "#f9fafb",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {JSON.stringify(m.meta, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
