// frontend/src/lib/api.ts

export type SimplifyPayload = {
  text: string;
  grade: 1 | 2 | 3;
  max_new_tokens?: number;
};

export type SimplifyResponse = {
  simplified: string;
  grade: number;
  checks: any;
};

const API_URL = "http://127.0.0.1:8000/simplify";
const TIMEOUT_MS = 45000;

export async function simplify(payload: SimplifyPayload): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`Backend error: ${res.status} ${msg}`);
    }

    const data = (await res.json()) as SimplifyResponse;
    return data.simplified;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function simplifyRaw(
  payload: SimplifyPayload
): Promise<SimplifyResponse> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Backend error: ${res.status} ${msg}`);
  }
  return (await res.json()) as SimplifyResponse;
}
