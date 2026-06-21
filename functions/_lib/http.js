export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function errorJson(message, status = 400, extra = {}) {
  return json(
    {
      success: false,
      message,
      ...extra,
    },
    status,
  );
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
