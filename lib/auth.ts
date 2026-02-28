export type ViewerRole = "BASIC" | "MANAGER" | "OWNER";

// Subject = whose activity timeline is being tracked.
// Viewer = who is currently looking at the UI/API.
export function getUserUpn() {
  return getSubjectUpn();
}

export function getSubjectUpn() {
  // Always you, even when other people browse.
  return process.env.SUBJECT_UPN ?? "kenneth";
}

export function getViewerUpn() {
  // Later: Entra session or IIS header.
  return process.env.DEV_VIEWER_UPN ?? "unknown";
}

// Basic dev-time authorization model until real auth integration is added.
export function getViewerRole(): ViewerRole {
  const viewer = getViewerUpn().toLowerCase();
  const owner = (process.env.OWNER_UPN ?? "kenneth").toLowerCase();

  if (viewer === owner) return "OWNER";
  if (process.env.DEV_VIEWER_ROLE === "MANAGER") return "MANAGER";
  return "BASIC";
}