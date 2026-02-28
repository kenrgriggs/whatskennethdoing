"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCategoryLabel,
  getCategoryStyle,
  normalizeCategory,
} from "@/lib/activity-types";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";

type ActiveActivity = {
  id: string;
  userUpn: string;
  title: string;
  type: string;
  status: TaskStatus;
  notes: string | null;
  referenceId: string | null;
  startedAt: string;
  lastHeartbeatAt: string;
};

// Shape of /api/activity/suggestions used to drive datalist + quick-fill UX.
type SuggestionsResponse = {
  titles: string[];
  categories: string[];
  taskNotes?: Array<{
    task: string;
    notes: string;
  }>;
};

type NowCardProps = {
  refreshToken?: number;
};

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
];

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatStatusLabel(status: TaskStatus | string | null | undefined) {
  const key = (status ?? "IN_PROGRESS").toString();
  const found = STATUS_OPTIONS.find((option) => option.value === key);
  return found?.label ?? key;
}

function mergeSuggestions(previous: string[], value: string) {
  const trimmed = value.trim();
  if (!trimmed) return previous;

  const exists = previous.some(
    (item) => item.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) return previous;

  return [trimmed, ...previous].slice(0, 100);
}

function uniqueSuggestions(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

function toDatetimeLocalValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function parseDatetimeLocal(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function NowCard({ refreshToken = 0 }: NowCardProps) {
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ActiveActivity | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<TaskStatus>("IN_PROGRESS");
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [taskNotesLookup, setTaskNotesLookup] = useState<Record<string, string>>(
    {},
  );
  const [nowTick, setNowTick] = useState(0);

  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryInputRef = useRef<HTMLInputElement | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  const elapsedLabel = useMemo(() => {
    if (!current?.startedAt) return null;
    if (!isClient) return null;
    const started = new Date(current.startedAt).getTime();
    return formatElapsed(nowTick - started);
  }, [current?.startedAt, nowTick, isClient]);

  const computedDurationLabel = useMemo(() => {
    const start = parseDatetimeLocal(startTime);
    if (!start) return "-";

    const explicitEnd = parseDatetimeLocal(endTime);
    if (explicitEnd) {
      return formatElapsed(explicitEnd.getTime() - start.getTime());
    }

    if (!isClient) return "-";
    const end = new Date(nowTick);
    return formatElapsed(end.getTime() - start.getTime());
  }, [startTime, endTime, nowTick, isClient]);

  const isActive = !!current;
  const currentCategory = current ? normalizeCategory(current.type) : null;
  const currentCategoryStyle = current ? getCategoryStyle(current.type) : null;
  const normalizedCategoryQuery = category.trim().toLowerCase();

  const knownCategories = useMemo(
    () => uniqueSuggestions(categorySuggestions),
    [categorySuggestions],
  );

  const matchingCategories = useMemo(() => {
    if (!normalizedCategoryQuery) return knownCategories;
    return knownCategories.filter((item) =>
      item.toLowerCase().includes(normalizedCategoryQuery),
    );
  }, [knownCategories, normalizedCategoryQuery]);

  const otherCategories = useMemo(() => {
    if (!normalizedCategoryQuery) return [];
    const matchingSet = new Set(
      matchingCategories.map((item) => item.toLowerCase()),
    );
    return knownCategories.filter((item) => !matchingSet.has(item.toLowerCase()));
  }, [knownCategories, matchingCategories, normalizedCategoryQuery]);

    // Refresh current active activity from the server.
  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/activity/current", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Failed to load current activity (${res.status})`);
        return;
      }

      const data = (await res.json()) as { current: ActiveActivity | null };
      setCurrent(data.current);

      if (data.current) {
        setStatus(data.current.status ?? "IN_PROGRESS");
        setCategory(data.current.type ?? "");
        setNotes(data.current.notes ?? "");
        setStartTime(toDatetimeLocalValue(data.current.startedAt));
        setEndTime("");
      }
    } finally {
      setLoading(false);
    }
  }

    // Best-effort suggestions; failures are intentionally non-blocking.
  async function loadSuggestions() {
    try {
      const res = await fetch("/api/activity/suggestions", { cache: "no-store" });
      if (!res.ok) return;

      const data = (await res.json()) as SuggestionsResponse;
      setTitleSuggestions(data.titles ?? []);
      setCategorySuggestions(data.categories ?? []);

      const lookup: Record<string, string> = {};
      for (const pair of data.taskNotes ?? []) {
        const taskName = pair.task?.trim();
        const noteValue = pair.notes?.trim();
        if (!taskName || !noteValue) continue;
        lookup[taskName.toLowerCase()] = noteValue;
      }
      setTaskNotesLookup(lookup);
    } catch {
      // Suggestions are best-effort only.
    }
  }

  function chooseCategory(value: string) {
    setCategory(value);
    setCategoryMenuOpen(false);
    requestAnimationFrame(() => categoryInputRef.current?.focus());
  }

  function maybeAutofillNotesFromTask() {
    if (notes.trim()) return;
    const taskKey = title.trim().toLowerCase();
    if (!taskKey) return;

    const existingNotes = taskNotesLookup[taskKey];
    if (!existingNotes) return;

    setNotes(existingNotes);
  }

  function closeTaskModal() {
    if (saving) return;
    setIsModalOpen(false);
    setCategoryMenuOpen(false);
  }

    // Creates a new task event (or an immediate start/end event when endTime is set).
  async function setActivity() {
    const normalizedTitle = title.trim();
    const normalizedCategory = category.trim();
    const normalizedNotes = notes.trim();

    if (!normalizedTitle || !normalizedCategory) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/activity/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          category: normalizedCategory,
          status,
          notes: normalizedNotes || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        }),
      });

      if (!res.ok) {
        let message = `Failed to set activity (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        setError(message);
        return;
      }

      const data = (await res.json()) as { active: ActiveActivity | null };
      setCurrent(data.active);

      setTitleSuggestions((previous) => mergeSuggestions(previous, normalizedTitle));
      setCategorySuggestions((previous) =>
        mergeSuggestions(previous, normalizedCategory),
      );

      setTitle("");
      setStatus(data.active ? data.active.status : "IN_PROGRESS");
      setStartTime(toDatetimeLocalValue(new Date()));
      setEndTime("");
      setIsModalOpen(false);
      setCategoryMenuOpen(false);
    } finally {
      setSaving(false);
    }
  }

    // Stops the current task by closing the open event and clearing active state.
  async function stopActivity() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/activity/stop", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Failed to stop activity (${res.status})`);
        return;
      }

      setCurrent(null);
      setEndTime(toDatetimeLocalValue(new Date()));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    setIsClient(true);
    setNowTick(Date.now());
    setStartTime((previous) => previous || toDatetimeLocalValue(new Date()));

    const ticker = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    refresh();
    loadSuggestions();
  }, [refreshToken]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!categoryMenuRef.current) return;
      if (!categoryMenuRef.current.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => taskInputRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;

    // Close modal quickly with Escape, unless a save request is in flight.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        setIsModalOpen(false);
        setCategoryMenuOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, saving]);

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Now</h2>
          <span
            className={[
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
              isActive
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                : "border-zinc-400/30 bg-zinc-500/10 text-zinc-300",
            ].join(" ")}
            title={isActive ? "Active" : "Inactive"}
          >
            <span
              className={[
                "h-2 w-2 rounded-full",
                isActive ? "bg-emerald-300" : "bg-zinc-400",
              ].join(" ")}
            />
            {isActive ? "Live" : "Idle"}
          </span>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : current ? (
            <div className="space-y-2">
              <div className="text-base font-semibold leading-snug text-balance">
                {current.title}
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                {currentCategory && currentCategoryStyle ? (
                  <span
                    className="inline-flex items-center rounded-md border px-2 py-0.5 font-medium"
                    style={currentCategoryStyle.badgeStyle}
                  >
                    <span
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                      style={currentCategoryStyle.dotStyle}
                    />
                    {getCategoryLabel(currentCategory)}
                  </span>
                ) : null}
                <span className="inline-flex items-center rounded-full border border-blue-400/35 bg-blue-500/15 px-2 py-0.5 font-medium text-blue-100">
                  {formatStatusLabel(current.status)}
                </span>
                {elapsedLabel ? (
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-medium">
                    Elapsed {elapsedLabel}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-muted-foreground">
              No active activity yet. Start one with the + button or the New Task button below.
            </p>
          )}
        </div>

        {error && !isModalOpen ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-red-400/35 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={stopActivity}
            disabled={saving || !current}
          >
            Stop
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-black/25 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
          >
            New Task
          </button>
        </div>
      </div>

      {isClient
        ? createPortal(
            <button
              type="button"
              aria-label="Create task"
              title="Create task"
              className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/40 bg-zinc-900/85 text-3xl leading-none text-cyan-100 shadow-lg shadow-cyan-900/30 backdrop-blur transition-colors hover:bg-cyan-500/20"
              onClick={() => {
                setError(null);
                setIsModalOpen(true);
              }}
            >
              +
            </button>,
            document.body,
          )
        : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeTaskModal}
            aria-label="Close task form"
          />

          <div className="relative z-10 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950/95 p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold tracking-tight">Create Task</h3>
              <button
                type="button"
                className="rounded-lg border border-white/20 bg-black/20 px-3 py-1.5 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
                onClick={closeTaskModal}
                disabled={saving}
              >
                Close
              </button>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void setActivity();
              }}
            >
              <div className="grid gap-2 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Task
                  </label>
                  <input
                    ref={taskInputRef}
                    className="w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm outline-none transition-colors focus:border-white/40 focus:bg-black/35"
                    placeholder="What are you working on?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={saving}
                    list="task-title-suggestions"
                    autoComplete="on"
                    name="taskTitle"
                  />
                  <datalist id="task-title-suggestions">
                    {titleSuggestions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Start time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm outline-none transition-colors focus:border-white/40 focus:bg-black/35"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    End time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm outline-none transition-colors focus:border-white/40 focus:bg-black/35"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Duration
                  </label>
                  <div className="w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-muted-foreground">
                    {computedDurationLabel}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Status
                  </label>
                  <select
                    className="w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm outline-none transition-colors focus:border-white/40 focus:bg-black/35"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    disabled={saving}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Notes/Description
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm outline-none transition-colors focus:border-white/40 focus:bg-black/35"
                    placeholder="Add details about this task"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onFocus={maybeAutofillNotesFromTask}
                    disabled={saving}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Category
                  </label>
                  <div className="relative group" ref={categoryMenuRef}>
                    <input
                      ref={categoryInputRef}
                      className="w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-white/40 focus:bg-black/35"
                      placeholder="Category (e.g. Ticket, Project, Personal)"
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setCategoryMenuOpen(true);
                      }}
                      onFocus={() => setCategoryMenuOpen(true)}
                      disabled={saving}
                      autoComplete="on"
                      name="category"
                    />

                    <button
                      type="button"
                      aria-label="Show categories"
                      className={[
                        "absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-opacity",
                        categoryMenuOpen
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      ].join(" ")}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCategoryMenuOpen((previous) => !previous);
                      }}
                      disabled={saving || knownCategories.length === 0}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className={[
                          "h-4 w-4 transition-transform",
                          categoryMenuOpen ? "rotate-180" : "",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        <path d="m5 7 5 6 5-6" />
                      </svg>
                    </button>

                    {categoryMenuOpen && knownCategories.length > 0 ? (
                      <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/15 bg-zinc-950/95 shadow-2xl backdrop-blur">
                        {normalizedCategoryQuery ? (
                          <>
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Matches
                            </div>
                            {matchingCategories.length > 0 ? (
                              matchingCategories.map((item) => (
                                <button
                                  key={`match-${item}`}
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    chooseCategory(item);
                                  }}
                                >
                                  {item}
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                No matching categories
                              </div>
                            )}

                            {otherCategories.length > 0 ? (
                              <>
                                <div className="mx-2 border-t" />
                                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Other Categories
                                </div>
                                {otherCategories.map((item) => (
                                  <button
                                    key={`other-${item}`}
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      chooseCategory(item);
                                    }}
                                  >
                                    {item}
                                  </button>
                                ))}
                              </>
                            ) : null}
                          </>
                        ) : (
                          knownCategories.map((item) => (
                            <button
                              key={`all-${item}`}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                chooseCategory(item);
                              }}
                            >
                              {item}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg border border-cyan-300/40 bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/30 disabled:opacity-50"
                  disabled={saving || !title.trim() || !category.trim()}
                >
                  {saving ? "Saving..." : "Set Activity"}
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-white/20 bg-black/20 px-4 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
                  onClick={closeTaskModal}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
