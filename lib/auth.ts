export type ViewerRole = "BASIC" | "MANAGER" | "OWNER";

// Back-compat for existing routes. Subject == the tracked person (you).
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

export function getViewerRole(): ViewerRole {
  const viewer = getViewerUpn().toLowerCase();
  const owner = (process.env.OWNER_UPN ?? "kenneth").toLowerCase();

  if (viewer === owner) return "OWNER";
  if (process.env.DEV_VIEWER_ROLE === "MANAGER") return "MANAGER";
  return "BASIC";
}