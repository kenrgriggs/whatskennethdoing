"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCategoryStyle, normalizeCategory } from "@/lib/activity-types";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
type SortDirection = "asc" | "desc";
type DisplayDensity = "compact" | "comfort";
type ColumnKey =
  | "title"
  | "startedAt"
  | "endedAt"
  | "duration"
  | "status"
  | "project"
  | "notes"
  | "type";
type EditableColumnKey = Exclude<ColumnKey, "duration">;

type ActivityEvent = {
  id: string;
  userUpn: string;
  title: string;
  type: string;
  status: TaskStatus;
  project: string | null;
  notes: string | null;
  referenceId: string | null;
  startedAt: string;
  endedAt: string | null;
};

type EventDraft = {
  title: string;
  startTime: string;
  endTime: string;
  status: TaskStatus;
  project: string;
  notes: string;
  category: string;
};

type HistoryCardProps = {
  refreshToken?: number;
};

type ColumnDef = {
  key: ColumnKey;
  label: string;
  minWidth: number;
  defaultWidth: number;
  maxWidth: number;
  align?: "left" | "right" | "center";
  filterPlaceholder?: string;
};

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
];

const STATUS_GROUPS: Array<{ label: string; values: TaskStatus[] }> = [
  { label: "To-do", values: ["NOT_STARTED"] },
  { label: "In progress", values: ["IN_PROGRESS", "ON_HOLD"] },
  { label: "Complete", values: ["COMPLETED"] },
];

const RECORDS_PER_PAGE_OPTIONS = [10, 25, 50, 100];
const REFRESH_FREQUENCY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "Off", value: 0 },
  { label: "1 minute", value: 60_000 },
  { label: "3 minutes", value: 180_000 },
  { label: "5 minutes", value: 300_000 },
];
const DEFAULT_RECORDS_PER_PAGE = 10;
const DENSITY_ROW_HEIGHT: Record<DisplayDensity, number> = {
  compact: 38,
  comfort: 46,
};

function getStatusPillClassName(status: TaskStatus) {
  switch (status) {
    case "NOT_STARTED":
      return "border-zinc-500/50 bg-zinc-500/25 text-zinc-100";
    case "IN_PROGRESS":
      return "border-blue-500/50 bg-blue-500/25 text-blue-100";
    case "ON_HOLD":
      return "border-amber-500/50 bg-amber-500/25 text-amber-100";
    case "COMPLETED":
      return "border-emerald-500/50 bg-emerald-500/25 text-emerald-100";
    default:
      return "border-white/25 bg-white/10 text-foreground";
  }
}

function getStatusDotClassName(status: TaskStatus) {
  switch (status) {
    case "NOT_STARTED":
      return "bg-zinc-300";
    case "IN_PROGRESS":
      return "bg-blue-300";
    case "ON_HOLD":
      return "bg-amber-300";
    case "COMPLETED":
      return "bg-emerald-300";
    default:
      return "bg-white";
  }
}

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: "title",
    label: "Task",
    minWidth: 170,
    defaultWidth: 300,
    maxWidth: 600,
    filterPlaceholder: "Filter...",
  },
  {
    key: "startedAt",
    label: "Start Time",
    minWidth: 140,
    defaultWidth: 185,
    maxWidth: 320,
    filterPlaceholder: "Filter...",
  },
  {
    key: "endedAt",
    label: "End Time",
    minWidth: 140,
    defaultWidth: 185,
    maxWidth: 320,
    filterPlaceholder: "Filter...",
  },
  {
    key: "duration",
    label: "Duration",
    minWidth: 95,
    defaultWidth: 120,
    maxWidth: 180,
    align: "right",
    filterPlaceholder: "e.g. 30m",
  },
  {
    key: "status",
    label: "Status",
    minWidth: 120,
    defaultWidth: 150,
    maxWidth: 220,
  },
  {
    key: "project",
    label: "Project",
    minWidth: 120,
    defaultWidth: 190,
    maxWidth: 380,
    filterPlaceholder: "Filter...",
  },
  {
    key: "type",
    label: "Category",
    minWidth: 120,
    defaultWidth: 170,
    maxWidth: 260,
    filterPlaceholder: "Filter...",
  },
  {
    key: "notes",
    label: "Description",
    minWidth: 170,
    defaultWidth: 320,
    maxWidth: 720,
    filterPlaceholder: "Filter...",
  },
];

const COLUMN_ORDER_STORAGE_KEY = "whatskennethdoing.history.columnOrder.v2";

const COLUMN_BY_KEY = COLUMN_DEFS.reduce(
  (out, def) => {
    out[def.key] = def;
    return out;
  },
  {} as Record<ColumnKey, ColumnDef>,
);

const DEFAULT_COLUMN_WIDTHS = COLUMN_DEFS.reduce(
  (out, def) => {
    out[def.key] = def.defaultWidth;
    return out;
  },
  {} as Record<ColumnKey, number>,
);

const DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map((def) => def.key);

const EMPTY_FILTERS = COLUMN_DEFS.reduce(
  (out, def) => {
    out[def.key] = "";
    return out;
  },
  {} as Record<ColumnKey, string>,
);

function normalizeColumnOrder(candidate: unknown): ColumnKey[] {
  if (!Array.isArray(candidate)) return DEFAULT_COLUMN_ORDER;

  const allowed = new Set<ColumnKey>(DEFAULT_COLUMN_ORDER);
  const deduped: ColumnKey[] = [];

  for (const item of candidate) {
    if (typeof item !== "string") continue;
    const key = item as ColumnKey;
    if (!allowed.has(key)) continue;
    if (deduped.includes(key)) continue;
    deduped.push(key);
  }

  for (const key of DEFAULT_COLUMN_ORDER) {
    if (!deduped.includes(key)) deduped.push(key);
  }

  return deduped;
}

function formatStatusLabel(status: TaskStatus | string) {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return option?.label ?? status;
}

function toDatetimeLocalValue(value: Date | string | null) {
  if (!value) return "";
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

function formatDateTime(value: string | null) {
  if (!value) return "active";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function durationLabel(start: Date, end: Date) {
  const totalSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function toDraft(event: ActivityEvent): EventDraft {
  return {
    title: event.title,
    startTime: toDatetimeLocalValue(event.startedAt),
    endTime: toDatetimeLocalValue(event.endedAt),
    status: event.status,
    project: event.project ?? "",
    notes: event.notes ?? "",
    category: event.type,
  };
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function clampWidth(key: ColumnKey, width: number) {
  const def = COLUMN_BY_KEY[key];
  return Math.max(def.minWidth, Math.min(def.maxWidth, Math.round(width)));
}

function eventValueForColumn(
  event: ActivityEvent,
  key: ColumnKey,
  nowTick: number,
) {
  const start = new Date(event.startedAt);
  const end = event.endedAt ? new Date(event.endedAt) : new Date(nowTick);

  switch (key) {
    case "title":
      return event.title;
    case "startedAt":
      return formatDateTime(event.startedAt);
    case "endedAt":
      return formatDateTime(event.endedAt);
    case "duration":
      return durationLabel(start, end);
    case "status":
      return formatStatusLabel(event.status);
    case "project":
      return event.project ?? "";
    case "notes":
      return event.notes ?? "";
    case "type":
      return event.type;
    default:
      return "";
  }
}

function toEditableColumnKey(key: ColumnKey): EditableColumnKey {
  if (key === "duration") return "startedAt";
  return key;
}

export function HistoryCard({ refreshToken = 0 }: HistoryCardProps) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EventDraft>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<ColumnKey, string>>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<ColumnKey>("startedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [openFilterKey, setOpenFilterKey] = useState<ColumnKey | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [draggingColumnKey, setDraggingColumnKey] = useState<ColumnKey | null>(
    null,
  );
  const [dragOverColumnKey, setDragOverColumnKey] = useState<ColumnKey | null>(
    null,
  );
  const [editFocusTarget, setEditFocusTarget] = useState<{
    id: string;
    key: EditableColumnKey;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(
    DEFAULT_COLUMN_WIDTHS,
  );
  const [nowTick, setNowTick] = useState(Date.now());
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false);
  const [recordsPerPage, setRecordsPerPage] = useState(DEFAULT_RECORDS_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshFrequencyMs, setRefreshFrequencyMs] = useState(0);
  const [displayDensity, setDisplayDensity] = useState<DisplayDensity>("compact");
  const loadedColumnOrderRef = useRef(false);

  const resizingStateRef = useRef<{
    key: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const saveEditingRowIfNeededRef = useRef<() => Promise<void>>(async () => {});
  const headerRowRef = useRef<HTMLTableRowElement | null>(null);
  const firstBodyRowRef = useRef<HTMLTableRowElement | null>(null);
  const [measuredHeaderRowHeight, setMeasuredHeaderRowHeight] = useState(0);
  const [measuredBodyRowHeight, setMeasuredBodyRowHeight] = useState(0);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/activity/events", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load events");

      const data = (await res.json()) as { events: ActivityEvent[] };
      const nextEvents = data.events ?? [];
      setEvents(nextEvents);

      const nextDrafts: Record<string, EventDraft> = {};
      for (const event of nextEvents) {
        nextDrafts[event.id] = toDraft(event);
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function setDraftPatch(id: string, patch: Partial<EventDraft>) {
    setDrafts((previous) => {
      const existing = previous[id];
      if (!existing) return previous;
      return {
        ...previous,
        [id]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function rowHasChanges(event: ActivityEvent) {
    const draft = drafts[event.id];
    if (!draft) return false;

    return (
      draft.title.trim() !== event.title ||
      (draft.category.trim() || "") !== event.type ||
      draft.status !== event.status ||
      (draft.project.trim() || "") !== (event.project ?? "") ||
      (draft.notes.trim() || "") !== (event.notes ?? "") ||
      draft.startTime !== toDatetimeLocalValue(event.startedAt) ||
      draft.endTime !== toDatetimeLocalValue(event.endedAt)
    );
  }

  function startEditing(event: ActivityEvent, focusKey?: ColumnKey) {
    setDrafts((previous) => ({
      ...previous,
      [event.id]: previous[event.id] ?? toDraft(event),
    }));
    setEditingId(event.id);
    setOpenStatusMenuId(null);
    if (focusKey) {
      setEditFocusTarget({
        id: event.id,
        key: toEditableColumnKey(focusKey),
      });
    }
  }

  function cancelEditing(event: ActivityEvent) {
    setDrafts((previous) => ({
      ...previous,
      [event.id]: toDraft(event),
    }));
    setEditingId(null);
    setOpenStatusMenuId(null);
  }

  async function saveRow(event: ActivityEvent) {
    const draft = drafts[event.id];
    if (!draft || !rowHasChanges(event)) {
      setEditingId(null);
      setOpenStatusMenuId(null);
      return;
    }

    setSavingById((previous) => ({ ...previous, [event.id]: true }));
    setError(null);

    try {
      const res = await fetch("/api/activity/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: event.id,
          title: draft.title.trim(),
          category: draft.category.trim(),
          status: draft.status,
          project: draft.project.trim(),
          notes: draft.notes.trim(),
          startTime: draft.startTime || undefined,
          endTime: draft.endTime || "",
        }),
      });

      if (!res.ok) {
        let message = `Failed to save row (${res.status})`;
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

      const data = (await res.json()) as { event: ActivityEvent };
      const updated = data.event;

      setEvents((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDrafts((previous) => ({
        ...previous,
        [updated.id]: toDraft(updated),
      }));
      setEditingId(null);
      setOpenStatusMenuId(null);
    } finally {
      setSavingById((previous) => ({ ...previous, [event.id]: false }));
    }
  }

  async function saveEditingRowIfNeeded() {
    if (!editingId) return;
    if (savingById[editingId]) return;
    const event = events.find((item) => item.id === editingId);
    if (!event) {
      setEditingId(null);
      return;
    }
    await saveRow(event);
  }

  function beginResize(key: ColumnKey, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[key];

    resizingStateRef.current = { key, startX, startWidth };

    function onMouseMove(moveEvent: MouseEvent) {
      const active = resizingStateRef.current;
      if (!active) return;

      const delta = moveEvent.clientX - active.startX;
      setColumnWidths((previous) => ({
        ...previous,
        [active.key]: clampWidth(active.key, active.startWidth + delta),
      }));
    }

    function onMouseUp() {
      resizingStateRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function autoFitColumn(key: ColumnKey) {
    const def = COLUMN_BY_KEY[key];
    let longest = def.label.length;

    for (const event of events) {
      const text = eventValueForColumn(event, key, nowTick).trim();
      if (text.length > longest) longest = text.length;
    }

    const roughWidth = longest * 7.2 + 24;
    setColumnWidths((previous) => ({
      ...previous,
      [key]: clampWidth(key, roughWidth),
    }));
  }

  function setFilterValue(key: ColumnKey, value: string) {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function toggleSort(nextKey: ColumnKey) {
    if (sortKey === nextKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  useEffect(() => {
    saveEditingRowIfNeededRef.current = saveEditingRowIfNeeded;
  });

  async function copyTextToClipboard(text: string) {
    if (!text) return;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    if (typeof document === "undefined") return;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function moveColumn(sourceKey: ColumnKey, targetKey: ColumnKey) {
    if (sourceKey === targetKey) return;

    setColumnOrder((previous) => {
      if (!previous.includes(sourceKey) || !previous.includes(targetKey)) {
        return previous;
      }

      const withoutSource = previous.filter((key) => key !== sourceKey);
      const targetIndex = withoutSource.indexOf(targetKey);
      if (targetIndex < 0) return previous;

      withoutSource.splice(targetIndex, 0, sourceKey);
      return withoutSource;
    });
  }

  useEffect(() => {
    refresh();
  }, [refreshToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      if (!raw) {
        loadedColumnOrderRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      setColumnOrder(normalizeColumnOrder(parsed));
    } catch {
      // ignore storage parse issues
    } finally {
      loadedColumnOrderRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loadedColumnOrderRef.current) return;

    try {
      window.localStorage.setItem(
        COLUMN_ORDER_STORAGE_KEY,
        JSON.stringify(columnOrder),
      );
    } catch {
      // ignore storage write issues
    }
  }, [columnOrder]);

  useEffect(() => {
    const ticker = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (!openFilterKey && !openStatusMenuId && !tableSettingsOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest('[data-filter-popover="true"]') ||
        target.closest('[data-filter-btn="true"]') ||
        target.closest('[data-status-menu="true"]') ||
        target.closest('[data-status-btn="true"]') ||
        target.closest('[data-table-settings="true"]') ||
        target.closest('[data-table-settings-btn="true"]')
      ) {
        return;
      }
      setOpenFilterKey(null);
      setOpenStatusMenuId(null);
      setTableSettingsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenFilterKey(null);
        setOpenStatusMenuId(null);
        setTableSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openFilterKey, openStatusMenuId, tableSettingsOpen]);

  useEffect(() => {
    if (!editingId) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(`[data-row-id="${editingId}"]`) ||
        target.closest('[data-filter-popover="true"]') ||
        target.closest('[data-filter-btn="true"]') ||
        target.closest('[data-status-menu="true"]') ||
        target.closest('[data-status-btn="true"]') ||
        target.closest('[data-table-settings="true"]') ||
        target.closest('[data-table-settings-btn="true"]')
      ) {
        return;
      }
      void saveEditingRowIfNeededRef.current();
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [editingId]);

  useEffect(() => {
    if (!editFocusTarget || editingId !== editFocusTarget.id) return;

    const selector = `[data-editor-id="${editFocusTarget.id}"][data-editor-key="${editFocusTarget.key}"]`;
    const target = document.querySelector<HTMLElement>(selector);
    if (target) {
      target.focus();
      setEditFocusTarget(null);
    }
  }, [editFocusTarget, editingId]);

  const categoryOptions = useMemo(() => {
    const out = new Set<string>();
    for (const event of events) {
      const value = event.type.trim();
      if (value) out.add(value);
    }
    return Array.from(out).sort(compareText);
  }, [events]);

  const orderedColumnDefs = useMemo(
    () => columnOrder.map((key) => COLUMN_BY_KEY[key]).filter(Boolean),
    [columnOrder],
  );

  const columnFilterValues = useMemo(() => {
    const out = {} as Record<ColumnKey, string[]>;

    for (const def of COLUMN_DEFS) {
      if (def.key === "status") {
        out.status = STATUS_OPTIONS.map((option) => option.label);
        continue;
      }

      const seen = new Set<string>();
      const values: string[] = [];
      for (const event of events) {
        const value = eventValueForColumn(event, def.key, nowTick).trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(value);
      }

      out[def.key] = values.sort(compareText).slice(0, 40);
    }

    return out;
  }, [events, nowTick]);

  const filteredSortedEvents = useMemo(() => {
    const filtered = events.filter((event) => {
      for (const def of COLUMN_DEFS) {
        const filter = filters[def.key].trim().toLowerCase();
        if (!filter) continue;

        if (def.key === "status") {
          const statusLabel = formatStatusLabel(event.status).toLowerCase();
          const statusKey = event.status.toLowerCase();
          if (!statusLabel.includes(filter) && !statusKey.includes(filter)) {
            return false;
          }
          continue;
        }

        const value = eventValueForColumn(event, def.key, nowTick).toLowerCase();
        if (!value.includes(filter)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aValue = eventValueForColumn(a, sortKey, nowTick);
      const bValue = eventValueForColumn(b, sortKey, nowTick);
      const base = compareText(aValue, bValue);
      return sortDirection === "asc" ? base : -base;
    });

    return sorted;
  }, [events, filters, sortKey, sortDirection, nowTick]);

  const sortColumnOptions = useMemo(
    () => COLUMN_DEFS.map((def) => ({ key: def.key, label: def.label })),
    [],
  );

  const totalRecords = filteredSortedEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = totalRecords === 0 ? 0 : (safePage - 1) * recordsPerPage;
  const pageEnd = Math.min(totalRecords, pageStart + recordsPerPage);
  const pagedEvents = filteredSortedEvents.slice(pageStart, pageEnd);
  const fallbackBodyRowHeight = DENSITY_ROW_HEIGHT[displayDensity];
  const fallbackHeaderRowHeight = displayDensity === "compact" ? 40 : 48;
  const bodyRowHeight = measuredBodyRowHeight || fallbackBodyRowHeight;
  const headerRowHeight = measuredHeaderRowHeight || fallbackHeaderRowHeight;
  const visibleRowCount = Math.max(1, pagedEvents.length);
  const tableViewportHeight = Math.ceil(
    headerRowHeight + bodyRowHeight * visibleRowCount + 2,
  );
  const cellPaddingClass =
    displayDensity === "compact" ? "px-2 py-1.5" : "px-2.5 py-2.5";

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [recordsPerPage, filters, sortKey, sortDirection]);

  useEffect(() => {
    if (!refreshFrequencyMs) return;

    const timer = setInterval(() => {
      if (editingId) return;
      void refresh();
    }, refreshFrequencyMs);

    return () => clearInterval(timer);
  }, [refreshFrequencyMs, editingId, refreshToken]);

  useEffect(() => {
    const headerHeight = headerRowRef.current?.getBoundingClientRect().height ?? 0;
    const rowHeight = firstBodyRowRef.current?.getBoundingClientRect().height ?? 0;

    if (headerHeight > 0 && Math.abs(headerHeight - measuredHeaderRowHeight) > 0.5) {
      setMeasuredHeaderRowHeight(headerHeight);
    }
    if (rowHeight > 0 && Math.abs(rowHeight - measuredBodyRowHeight) > 0.5) {
      setMeasuredBodyRowHeight(rowHeight);
    }
  }, [
    measuredHeaderRowHeight,
    measuredBodyRowHeight,
    displayDensity,
    recordsPerPage,
    pageStart,
    pageEnd,
    columnOrder,
    columnWidths,
  ]);

  function renderHeader(def: ColumnDef) {
    const active = sortKey === def.key;
    const sortArrow = sortDirection === "asc" ? "A-Z" : "Z-A";
    const filterValue = filters[def.key];
    const filterActive = Boolean(filterValue.trim());
    const isDragOver =
      dragOverColumnKey === def.key && draggingColumnKey !== def.key;
    const matchingFilterValues = (columnFilterValues[def.key] ?? []).filter((value) =>
      value.toLowerCase().includes(filterValue.trim().toLowerCase()),
    );

    return (
      <th
        key={def.key}
        className={[
          "group relative border-b border-r border-white/10 bg-white/[0.03] px-2 py-1.5 text-left font-medium last:border-r-0 transition-colors hover:bg-white/[0.08]",
          "cursor-move select-none",
          isDragOver ? "shadow-[inset_3px_0_0_0_rgba(255,255,255,0.55)]" : "",
        ].join(" ")}
        draggable
        onDragStart={(event) => {
          setDraggingColumnKey(def.key);
          setDragOverColumnKey(def.key);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", def.key);
        }}
        onDragOver={(event) => {
          if (!draggingColumnKey || draggingColumnKey === def.key) return;
          event.preventDefault();
          setDragOverColumnKey(def.key);
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const fallback = event.dataTransfer.getData("text/plain");
          const source = draggingColumnKey ?? (fallback as ColumnKey);
          if (!source) return;
          moveColumn(source, def.key);
          setDraggingColumnKey(null);
          setDragOverColumnKey(null);
        }}
        onDragEnd={() => {
          setDraggingColumnKey(null);
          setDragOverColumnKey(null);
        }}
      >
        <button
          type="button"
          className={[
            "inline-flex w-full items-center gap-1 pr-10 text-[15px] leading-tight font-bold text-left rounded-sm px-1 py-0.5 transition-colors",
            active ? "text-foreground" : "text-muted-foreground",
          ].join(" ")}
          onClick={() => toggleSort(def.key)}
        >
          <span>{def.label}</span>
          {active ? <span className="text-[11px]">{sortArrow}</span> : null}
        </button>

        <button
          type="button"
          data-filter-btn="true"
          aria-label={`Filter ${def.label}`}
          className={[
            "absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-foreground",
            filterActive ? "text-foreground" : "",
          ].join(" ")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenFilterKey((previous) => (previous === def.key ? null : def.key));
          }}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M3 5h14l-5 6v4l-4 2v-6L3 5Z" />
          </svg>
        </button>

        {openFilterKey === def.key ? (
          <div
            data-filter-popover="true"
            className="absolute right-3 top-full z-40 mt-1 w-64 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-2 shadow-2xl backdrop-blur"
          >
            <div className="mb-1 text-[11px] font-medium text-muted-foreground/90">
              {def.label} Filter
            </div>

            {def.key === "status" ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className={[
                    "flex w-full items-center rounded-md border px-2 py-1 text-left text-xs transition-colors",
                    filters.status
                      ? "border-white/20 bg-white/5 text-foreground hover:bg-white/10"
                      : "border-blue-500/40 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30",
                  ].join(" ")}
                  onClick={() => setFilterValue("status", "")}
                >
                  All
                </button>

                {STATUS_GROUPS.map((group) => (
                  <div
                    key={`status-group-${group.label}`}
                    className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                      {group.label}
                    </div>
                    <div className="mt-1 space-y-1">
                      {group.values.map((statusValue) => {
                        const activeStatus = filters.status === statusValue;
                        return (
                          <button
                            key={`status-filter-${statusValue}`}
                            type="button"
                            className={[
                              "w-full rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                              activeStatus ? "bg-white/10" : "hover:bg-white/5",
                            ].join(" ")}
                            onClick={() => {
                              setFilterValue("status", statusValue);
                              setOpenFilterKey(null);
                            }}
                          >
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                                getStatusPillClassName(statusValue),
                              ].join(" ")}
                            >
                              <span
                                className={[
                                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                                  getStatusDotClassName(statusValue),
                                ].join(" ")}
                              />
                              {formatStatusLabel(statusValue)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <input
                className="mb-1 w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs outline-none transition-colors focus:border-white/40 focus:bg-white/[0.08]"
                value={filters[def.key]}
                onChange={(event) => setFilterValue(def.key, event.target.value)}
                placeholder="Type to filter..."
              />
            )}

            {def.key !== "status" ? (
              <div className="max-h-40 space-y-0.5 overflow-auto">
                {matchingFilterValues.slice(0, 20).map((value) => (
                  <button
                    key={`${def.key}-${value}`}
                    type="button"
                    className="w-full truncate rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-white/10"
                    title={value}
                    onClick={() => {
                      setFilterValue(def.key, value);
                      setOpenFilterKey(null);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-2 flex justify-between gap-2">
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
                onClick={() => setFilterValue(def.key, "")}
              >
                Clear
              </button>
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
                onClick={() => setOpenFilterKey(null)}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          aria-label={`Resize ${def.label} column`}
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 hover:opacity-100"
          onMouseDown={(event) => beginResize(def.key, event)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            autoFitColumn(def.key);
          }}
        />
      </th>
    );
  }

  function renderCellActions(event: ActivityEvent, key: ColumnKey, value: string) {
    return (
      <span className="pointer-events-none absolute right-1 top-1/2 inline-flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="pointer-events-auto rounded border border-white/20 bg-black/40 p-0.5 text-white/80 hover:bg-black/70 hover:text-white"
          aria-label="Copy cell value"
          title="Copy"
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await copyTextToClipboard(value);
            } catch {
              // no-op
            }
          }}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
            <path d="M13 7V4.8A1.8 1.8 0 0 0 11.2 3H4.8A1.8 1.8 0 0 0 3 4.8v6.4A1.8 1.8 0 0 0 4.8 13H7" />
          </svg>
        </button>
        <button
          type="button"
          className="pointer-events-auto rounded border border-white/20 bg-black/40 p-0.5 text-white/80 hover:bg-black/70 hover:text-white"
          aria-label="Edit row at this column"
          title="Edit"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startEditing(event, key);
          }}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path d="m4 13.5 8.9-8.9a1.7 1.7 0 0 1 2.4 0l.1.1a1.7 1.7 0 0 1 0 2.4L6.5 16H4v-2.5Z" />
            <path d="M11.6 5.9 14 8.3" />
          </svg>
        </button>
      </span>
    );
  }

  function renderBodyCell(
    key: ColumnKey,
    event: ActivityEvent,
    draft: EventDraft,
    isEditing: boolean,
    saving: boolean,
    duration: string,
    isActive: boolean,
    categoryStyle: ReturnType<typeof getCategoryStyle>,
  ) {
    switch (key) {
      case "title":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                className="w-full border border-white/25 bg-transparent px-1.5 py-0.5 text-[14px] outline-none"
                value={draft.title}
                onChange={(e) => setDraftPatch(event.id, { title: e.target.value })}
                disabled={saving}
                data-editor-id={event.id}
                data-editor-key="title"
              />
            ) : (
              <>
                <div className="truncate font-medium" title={event.title}>
                  {event.title}
                </div>
                {renderCellActions(event, "title", event.title)}
              </>
            )}
          </td>
        );
      case "startedAt":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                type="datetime-local"
                className="w-full border border-white/25 bg-transparent px-1.5 py-0.5 text-[14px] outline-none"
                value={draft.startTime}
                onChange={(e) => setDraftPatch(event.id, { startTime: e.target.value })}
                disabled={saving}
                data-editor-id={event.id}
                data-editor-key="startedAt"
              />
            ) : (
              <>
                <span className="text-[14px]">{formatDateTime(event.startedAt)}</span>
                {renderCellActions(
                  event,
                  "startedAt",
                  formatDateTime(event.startedAt),
                )}
              </>
            )}
          </td>
        );
      case "endedAt":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                type="datetime-local"
                className="w-full border border-white/25 bg-transparent px-1.5 py-0.5 text-[14px] outline-none"
                value={draft.endTime}
                onChange={(e) => setDraftPatch(event.id, { endTime: e.target.value })}
                disabled={saving}
                data-editor-id={event.id}
                data-editor-key="endedAt"
              />
            ) : (
              <>
                <span className="text-[14px]">{formatDateTime(event.endedAt)}</span>
                {renderCellActions(event, "endedAt", formatDateTime(event.endedAt))}
              </>
            )}
          </td>
        );
      case "duration":
        return (
          <td
            key={`${event.id}-${key}`}
            className={`group relative border-r border-white/10 ${cellPaddingClass} pr-10 text-right text-[14px] text-muted-foreground whitespace-nowrap`}
          >
            {duration}
            {isActive ? " active" : ""}
            {renderCellActions(
              event,
              "duration",
              `${duration}${isActive ? " active" : ""}`,
            )}
          </td>
        );
      case "status":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <div className="relative" data-status-menu="true">
                <button
                  type="button"
                  data-status-btn="true"
                  className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-[14px] transition-colors hover:bg-white/10"
                  onClick={() =>
                    setOpenStatusMenuId((previous) =>
                      previous === event.id ? null : event.id,
                    )
                  }
                  disabled={saving}
                  data-editor-id={event.id}
                  data-editor-key="status"
                >
                  <span
                    className={[
                      "inline-flex items-center rounded-full border px-1.5 py-0 text-xs leading-4",
                      getStatusPillClassName(draft.status),
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "mr-1 inline-block h-1 w-1 rounded-full",
                        getStatusDotClassName(draft.status),
                      ].join(" ")}
                    />
                    {formatStatusLabel(draft.status)}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  >
                    <path d="m5 7 5 6 5-6" />
                  </svg>
                </button>

                {openStatusMenuId === event.id ? (
                  <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-2 shadow-2xl backdrop-blur">
                    {STATUS_GROUPS.map((group) => (
                      <div
                        key={`status-edit-group-${group.label}`}
                        className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
                      >
                        <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                          {group.label}
                        </div>
                        <div className="mt-1 space-y-1">
                          {group.values.map((statusValue) => {
                            const activeStatus = draft.status === statusValue;
                            return (
                              <button
                                key={`status-edit-${event.id}-${statusValue}`}
                                type="button"
                                className={[
                                  "w-full rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                                  activeStatus ? "bg-white/10" : "hover:bg-white/5",
                                ].join(" ")}
                                onClick={() => {
                                  setDraftPatch(event.id, { status: statusValue });
                                  setOpenStatusMenuId(null);
                                }}
                              >
                                <span
                                  className={[
                                    "inline-flex items-center rounded-full border px-1.5 py-0 text-xs leading-4",
                                    getStatusPillClassName(statusValue),
                                  ].join(" ")}
                                >
                                  <span
                                    className={[
                                      "mr-1 inline-block h-1 w-1 rounded-full",
                                      getStatusDotClassName(statusValue),
                                    ].join(" ")}
                                  />
                                  {formatStatusLabel(statusValue)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-1.5 py-0 text-xs leading-4",
                    getStatusPillClassName(event.status),
                  ].join(" ")}
                >
                  <span
                    className={[
                      "mr-1 inline-block h-1 w-1 rounded-full",
                      getStatusDotClassName(event.status),
                    ].join(" ")}
                  />
                  {formatStatusLabel(event.status)}
                </span>
                {renderCellActions(event, "status", formatStatusLabel(event.status))}
              </>
            )}
          </td>
        );
      case "project":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                className="w-full border border-white/25 bg-transparent px-1.5 py-0.5 text-[14px] outline-none"
                value={draft.project}
                onChange={(e) => setDraftPatch(event.id, { project: e.target.value })}
                disabled={saving}
                data-editor-id={event.id}
                data-editor-key="project"
              />
            ) : (
              <>
                <div className="truncate text-[14px]" title={event.project ?? ""}>
                  {event.project ?? ""}
                </div>
                {renderCellActions(event, "project", event.project ?? "")}
              </>
            )}
          </td>
        );
      case "notes":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <textarea
                className="h-14 w-full resize-none border border-white/25 bg-transparent px-1.5 py-0.5 text-[14px] outline-none"
                value={draft.notes}
                onChange={(e) => setDraftPatch(event.id, { notes: e.target.value })}
                disabled={saving}
                data-editor-id={event.id}
                data-editor-key="notes"
              />
            ) : (
              <>
                <div className="truncate text-[14px]" title={event.notes ?? ""}>
                  {event.notes ?? ""}
                </div>
                {renderCellActions(event, "notes", event.notes ?? "")}
              </>
            )}
          </td>
        );
      case "type":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                className="w-full border border-white/25 bg-transparent px-1.5 py-0.5 text-[14px] outline-none"
                value={draft.category}
                onChange={(e) => setDraftPatch(event.id, { category: e.target.value })}
                list="history-category-options"
                disabled={saving}
                data-editor-id={event.id}
                data-editor-key="type"
              />
            ) : (
              <>
                <span
                  className="inline-flex items-center rounded-md border px-1.5 py-0 text-xs leading-4 font-medium"
                  style={categoryStyle.badgeStyle}
                  title={event.type}
                >
                  {event.type}
                </span>
                {renderCellActions(event, "type", event.type)}
              </>
            )}
          </td>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-0 flex-col space-y-3 rounded-xl bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">History</h2>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            data-table-settings-btn="true"
            className="px-2.5 py-1 rounded-lg border text-xs"
            onClick={() => setTableSettingsOpen((previous) => !previous)}
          >
            Table Settings
          </button>
          <button
            type="button"
            className="px-2.5 py-1 rounded-lg border text-xs"
            onClick={async () => {
              await saveEditingRowIfNeeded();
              await refresh();
            }}
            disabled={loading}
          >
            Refresh
          </button>

          {tableSettingsOpen ? (
            <div
              data-table-settings="true"
              className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-3 shadow-2xl backdrop-blur"
            >
              <div className="mb-2 text-sm font-medium">Table Settings</div>
              <div className="space-y-3 text-xs">
                <label className="block space-y-1">
                  <span className="text-muted-foreground">Records Per Page</span>
                  <select
                    className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 outline-none transition-colors focus:border-white/40 focus:bg-white/[0.08]"
                    value={recordsPerPage}
                    onChange={(event) => setRecordsPerPage(Number(event.target.value))}
                  >
                    {RECORDS_PER_PAGE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Sort By Column</span>
                  <div className="flex gap-2">
                    <select
                      className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 outline-none transition-colors focus:border-white/40 focus:bg-white/[0.08]"
                      value={sortKey}
                      onChange={(event) => setSortKey(event.target.value as ColumnKey)}
                    >
                      {sortColumnOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-md border border-white/20 px-2 py-1"
                      onClick={() =>
                        setSortDirection((previous) =>
                          previous === "asc" ? "desc" : "asc",
                        )
                      }
                      aria-label="Toggle sort direction"
                      title={
                        sortDirection === "asc"
                          ? "Ascending"
                          : "Descending"
                      }
                    >
                      {sortDirection === "asc" ? "A-Z" : "Z-A"}
                    </button>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Refresh Frequency</span>
                  <select
                    className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 outline-none transition-colors focus:border-white/40 focus:bg-white/[0.08]"
                    value={refreshFrequencyMs}
                    onChange={(event) =>
                      setRefreshFrequencyMs(Number(event.target.value))
                    }
                  >
                    {REFRESH_FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1">
                  <span className="text-muted-foreground">Display Density</span>
                  <div className="grid grid-cols-2 gap-1 rounded-md border border-white/20 bg-white/5 p-1">
                    <button
                      type="button"
                      className={[
                        "rounded px-2 py-1",
                        displayDensity === "compact"
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "hover:bg-white/10",
                      ].join(" ")}
                      onClick={() => setDisplayDensity("compact")}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      className={[
                        "rounded px-2 py-1",
                        displayDensity === "comfort"
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "hover:bg-white/10",
                      ].join(" ")}
                      onClick={() => setDisplayDensity("comfort")}
                    >
                      Comfort
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : filteredSortedEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rows match your filters.</p>
      ) : (
        <div
          className="app-scrollbar min-h-0 overflow-auto rounded-lg border border-white/10"
          style={{ height: `${tableViewportHeight}px` }}
        >
          <table className="w-max min-w-full border-collapse text-[14px] leading-5">
            <colgroup>
              {orderedColumnDefs.map((def) => (
                <col key={def.key} style={{ width: `${columnWidths[def.key]}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr ref={headerRowRef}>
                {orderedColumnDefs.map((def) => renderHeader(def))}
              </tr>
            </thead>
            <tbody>
              {pagedEvents.map((event, index) => {
                const draft = drafts[event.id] ?? toDraft(event);
                const categoryStyle = getCategoryStyle(normalizeCategory(draft.category));
                const rowBg = categoryStyle.rowStyle.backgroundColor;
                const saving = Boolean(savingById[event.id]);
                const isEditing = editingId === event.id;

                const start = parseDatetimeLocal(draft.startTime) ?? new Date(event.startedAt);
                const end = parseDatetimeLocal(draft.endTime) ?? new Date(nowTick);
                const duration = durationLabel(start, end);
                const isActive = !draft.endTime;

                return (
                  <tr
                    key={event.id}
                    ref={index === 0 ? firstBodyRowRef : null}
                    data-row-id={event.id}
                    style={{ backgroundColor: rowBg }}
                    className="border-b border-white/10 align-top"
                  >
                    {orderedColumnDefs.map((def) =>
                      renderBodyCell(
                        def.key,
                        event,
                        draft,
                        isEditing,
                        saving,
                        duration,
                        isActive,
                        categoryStyle,
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="history-category-options">
            {categoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
      )}

      {!loading && !error && filteredSortedEvents.length > 0 ? (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {pageStart + 1} - {pageEnd} of {totalRecords}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
              onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </button>
            <span>
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 disabled:opacity-40"
              onClick={() =>
                setCurrentPage((previous) => Math.min(totalPages, previous + 1))
              }
              disabled={safePage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
