import { getSessionCookie, saveSessionCookie } from "../storage/sessionStorage";
import { getServerUrl } from "../storage/serverStorage";

const SESSION_COOKIE_NAME = "mpp_session";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
};

export class MobileApiError extends Error {
  code: string;
  status: number;
  mustChangePassword: boolean;

  constructor(message: string, code = "api_error", status = 500, mustChangePassword = false) {
    super(message);
    this.name = "MobileApiError";
    this.code = code;
    this.status = status;
    this.mustChangePassword = mustChangePassword;
  }
}

function toUserMessage(error: unknown) {
  if (error instanceof MobileApiError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new MobileApiError("Server timed out. Check URL and network.", "timeout", 408);
  }

  return new MobileApiError("Server not reachable. Check URL and network.", "network_error", 0);
}

function extractSessionCookie(setCookie: string | null) {
  if (!setCookie) {
    return null;
  }

  const cookies = setCookie.split(/,(?=\s*[^;,=\s]+=[^;,]+)/);
  const sessionCookie = cookies
    .map((cookie) => cookie.trim().split(";")[0])
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));

  return sessionCookie ?? null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = await getServerUrl();

  if (!baseUrl) {
    throw new MobileApiError("Server URL is not saved.", "missing_server_url", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const cookie = await getSessionCookie();
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    const sessionCookie = extractSessionCookie(response.headers.get("set-cookie"));

    if (sessionCookie) {
      await saveSessionCookie(sessionCookie);
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok || payload?.ok === false) {
      const error = payload?.error ?? {};
      throw new MobileApiError(
        error.message ?? "Request failed.",
        error.code ?? "api_error",
        response.status,
        Boolean(error.mustChangePassword)
      );
    }

    return payload as T;
  } catch (error) {
    throw toUserMessage(error);
  } finally {
    clearTimeout(timeout);
  }
}
