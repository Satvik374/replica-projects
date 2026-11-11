/* Alcove — the only place that talks to the Worker. */

export class ApiError extends Error {
  constructor(message, statusCode, field, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.status = statusCode;
    this.field = field;
    Object.assign(this, extra);
  }
}

export async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {}
  };
  if (options.body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) init.signal = options.signal;

  let response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new ApiError("You look offline. Check the connection and try again.", 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* an empty body is fine for some responses */
  }

  if (!response.ok) {
    throw new ApiError(
      (data && data.error) || "Something went wrong. Try again.",
      response.status,
      data && data.field,
      { usage: data && data.usage }
    );
  }
  return data || {};
}

export async function downloadFile(path, filename) {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new ApiError("The export could not be built.", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
