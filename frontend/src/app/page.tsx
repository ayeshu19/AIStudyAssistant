"use client";

import { useState } from "react";
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
                      aria-label="Speak response"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 18,
                        lineHeight: 1,
                        color: "#4b5563",
                      }}
                      // You can add speech synthesis here later if you want
                    >
                      🎤
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
