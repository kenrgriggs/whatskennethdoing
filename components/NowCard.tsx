"use client";

import { useEffect, useMemo, useState } from "react";

type ActivityType = "TICKET" | "PROJECT" | "ADMIN" | "MEETING";

type ActiveActivity = {
  id: string;
  userUpn: string;
  title: string;
  type: ActivityType;
  referenceId: string | null;
  startedAt: string;
  lastHeartbeatAt: string;
};

export function NowCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<ActiveActivity | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ActivityType>("ADMIN");

  const isActive = useMemo(() => {
    if (!current) return false;
    // MVP: treat any current activity as "active"
    return true;
  }, [current]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/activity/current", { cache: "no-store" });
      const data = (await res.json()) as { current: ActiveActivity | null };
      setCurrent(data.current);
    } finally {
      setLoading(false);
    }
  }

  async function setActivity() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/activity/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type }),
      });
      if (!res.ok) throw new Error("Failed to set activity");
      const data = (await res.json()) as { active: ActiveActivity };
      setCurrent(data.active);
      setTitle("");
    } finally {
      setSaving(false);
    }
  }

  async function stopActivity() {
    setSaving(true);
    try {
      const res = await fetch("/api/activity/stop", { method: "POST" });
      if (!res.ok) throw new Error("Failed to stop activity");
      setCurrent(null);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Now</h2>
        <span
          className={[
            "h-3 w-3 rounded-full",
            isActive ? "bg-green-500" : "bg-zinc-500",
          ].join(" ")}
          title={isActive ? "Active" : "Inactive"}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : current ? (
        <div className="space-y-1">
          <div className="text-sm font-medium">{current.title}</div>
          <div className="text-xs text-muted-foreground">
            {current.type}
            {current.referenceId ? ` • ${current.referenceId}` : ""}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No active activity yet.</p>
      )}

      <div className="space-y-3">
        <div className="grid gap-2">
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="What are you working on?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
          />
          <select
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
            disabled={saving}
          >
            <option value="TICKET">Ticket</option>
            <option value="PROJECT">Project</option>
            <option value="ADMIN">Admin</option>
            <option value="MEETING">Meeting</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            onClick={setActivity}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving..." : "Set Activity"}
          </button>

          <button
            className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50"
            onClick={stopActivity}
            disabled={saving || !current}
          >
            Stop
          </button>

          <button
            className="ml-auto px-4 py-2 rounded-lg border text-sm disabled:opacity-50"
            onClick={refresh}
            disabled={saving}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}