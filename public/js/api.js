// Every conversation with the server goes through this file. Each function
// sends one request and returns the data the server answered with.

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.status = status;
    this.data = data; // extra details from the server, e.g. which entry was overlapped
  }
}

async function request(method, path, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError("Can't reach the Time Clock server. Is it still running?", 0);
  }

  if (response.status === 204) return null; // success with nothing to send back
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error ?? "Something went wrong.", response.status, data);
  }
  return data;
}

// Builds "?from=...&projectId=..." and leaves out filters that weren't given.
function queryString(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) params.set(key, value);
  }
  return params.size ? `?${params}` : "";
}

export const api = {
  listProjects: () => request("GET", "/projects"),
  createProject: (project) => request("POST", "/projects", project),
  updateProject: (id, changes) => request("PATCH", `/projects/${id}`, changes),
  deleteProject: (id) => request("DELETE", `/projects/${id}`),

  getRunning: () => request("GET", "/timer"),
  clockIn: (projectId) => request("POST", "/timer/start", { projectId }),
  clockOut: (note) => request("POST", "/timer/stop", { note }),

  // Answers { entries, previousStart }. Filters: from, to (milliseconds), projectId.
  listEntries: (filters = {}) => request("GET", `/entries${queryString(filters)}`),
  createEntry: (entry) => request("POST", "/entries", entry),
  updateEntry: (id, changes) => request("PATCH", `/entries/${id}`, changes),
  deleteEntry: (id) => request("DELETE", `/entries/${id}`),
};
