// Thin fetch helper over the backend API.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options,
  });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  get: (path) => request(path),
  put: (path, value, headers = {}) =>
    request(path, {
      method: "PUT",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(value),
    }),
  post: (path, value, headers = {}) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(value),
    }),
};

export default api;
