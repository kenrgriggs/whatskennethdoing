"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCategoryStyle, normalizeCategory } from "@/lib/activity-types";

// HistoryCard responsibilities:
// - load + render event history
// - support sorting/filtering/paging/resizing
// - provide in-cell editing with floating menus and autosave behavior
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

type StatusMenuPosition = {
  left: number;
  top: number;
  openUp: boolean;
};

type TableSettingsMenuKey =
  | "recordsPerPage"
  | "sortByColumn"
  | "refreshFrequency";

type SavedHistoryView = {
  id: string;
  name: string;
  filters: Record<ColumnKey, string>;
};

type ViewDialogState =
  | {
      kind: "rename";
      viewId: string;
      draftName: string;
      error: string | null;
    }
  | {
      kind: "delete";
      viewId: string;
    };

type BatchEditField = "status" | "category" | "project";

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

const BATCH_EDIT_FIELD_OPTIONS: Array<{ value: BatchEditField; label: string }> = [
  { value: "status", label: "Status" },
  { value: "category", label: "Category" },
  { value: "project", label: "Project" },
];
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
const HISTORY_VIEWS_STORAGE_KEY = "whatskennethdoing.history.savedViews.v1";
const DEFAULT_VIEW_ID = "__all_tasks__";

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

function cloneFilters(filters: Partial<Record<ColumnKey, string>>) {
  const next = { ...EMPTY_FILTERS };
  for (const def of COLUMN_DEFS) {
    const value = filters[def.key];
    if (typeof value === "string") next[def.key] = value;
  }
  return next;
}

function areFiltersEqual(
  a: Record<ColumnKey, string>,
  b: Record<ColumnKey, string>,
) {
  for (const def of COLUMN_DEFS) {
    if ((a[def.key] ?? "") !== (b[def.key] ?? "")) return false;
  }
  return true;
}

function normalizeSavedHistoryViews(candidate: unknown): SavedHistoryView[] {
  if (!Array.isArray(candidate)) return [];

  const out: SavedHistoryView[] = [];
  const seen = new Set<string>();

  for (const item of candidate) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    const filtersCandidate =
      record.filters && typeof record.filters === "object"
        ? (record.filters as Partial<Record<ColumnKey, string>>)
        : {};

    out.push({
      id,
      name,
      filters: cloneFilters(filtersCandidate),
    });
  }

  return out;
}

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

function renderColumnHeaderIcon(key: ColumnKey) {
  const iconClassName = "h-3.5 w-3.5 shrink-0";

  switch (key) {
    case "title":
      return (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[10px] font-semibold leading-none tracking-tight">
          Aa
        </span>
      );
    case "startedAt":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="6.5" />
          <path d="M10 6.5v3.8l2.8 1.5" />
        </svg>
      );
    case "endedAt":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <rect x="3.5" y="4.5" width="13" height="12" rx="2" />
          <path d="M6.5 3v3M13.5 3v3M3.5 8h13" />
          <path d="m7.7 12 1.7 1.7 2.9-3.2" />
        </svg>
      );
    case "duration":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="M6.5 3.5h7M6.5 16.5h7" />
          <path d="M7 3.5c.2 2.7 1.6 3.9 3 5 1.4 1.1 2.8 2.3 3 5" />
          <path d="M13 3.5c-.2 2.7-1.6 3.9-3 5-1.4 1.1-2.8 2.3-3 5" />
        </svg>
      );
    case "status":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="m5.5 7 4.5 5 4.5-5" />
          <path d="m5.5 11 4.5 5 4.5-5" />
        </svg>
      );
    case "project":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="M6 14 14 6" />
          <path d="M8 6h6v6" />
        </svg>
      );
    case "notes":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="6.8" />
          <path d="M10 6.8v6.4M6.8 10h6.4" />
        </svg>
      );
    case "type":
      return (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="M10 16.5c3.8-1.6 6-4.5 6-8V5.3L10 3.5 4 5.3v3.2c0 3.5 2.2 6.4 6 8Z" />
          <circle cx="10" cy="9.5" r="1.7" />
        </svg>
      );
    default:
      return null;
  }
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
  const [statusMenuPosition, setStatusMenuPosition] =
    useState<StatusMenuPosition | null>(null);
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState<string | null>(null);
  const [categoryMenuPosition, setCategoryMenuPosition] =
    useState<StatusMenuPosition | null>(null);
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
  const [editingKey, setEditingKey] = useState<EditableColumnKey | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(
    DEFAULT_COLUMN_WIDTHS,
  );
  const [nowTick, setNowTick] = useState(Date.now());
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false);
  const [openTableSettingsMenu, setOpenTableSettingsMenu] =
    useState<TableSettingsMenuKey | null>(null);
  const [recordsPerPage, setRecordsPerPage] = useState(DEFAULT_RECORDS_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshFrequencyMs, setRefreshFrequencyMs] = useState(0);
  const [displayDensity, setDisplayDensity] = useState<DisplayDensity>("compact");
  const [savedViews, setSavedViews] = useState<SavedHistoryView[]>([]);
  const [savedViewsLoaded, setSavedViewsLoaded] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(DEFAULT_VIEW_ID);
  const [openViewMenuId, setOpenViewMenuId] = useState<string | null>(null);
  const [viewMenuPosition, setViewMenuPosition] =
    useState<StatusMenuPosition | null>(null);
  const [viewDialog, setViewDialog] = useState<ViewDialogState | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [batchEditField, setBatchEditField] = useState<BatchEditField>("status");
  const [batchEditText, setBatchEditText] = useState("");
  const [batchEditStatus, setBatchEditStatus] = useState<TaskStatus>("IN_PROGRESS");
  const [batchSaving, setBatchSaving] = useState(false);
  const loadedColumnOrderRef = useRef(false);
  const loadedSavedViewsRef = useRef(false);
  const hydratedViewFromUrlRef = useRef(false);

  const resizingStateRef = useRef<{
    key: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const saveEditingRowIfNeededRef = useRef<() => Promise<void>>(async () => {});
  const statusButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const categoryButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const viewMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headerRowRef = useRef<HTMLTableRowElement | null>(null);
  const firstBodyRowRef = useRef<HTMLTableRowElement | null>(null);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const selectAllVisibleRef = useRef<HTMLInputElement | null>(null);
  const [measuredHeaderRowHeight, setMeasuredHeaderRowHeight] = useState(0);
  const [measuredBodyRowHeight, setMeasuredBodyRowHeight] = useState(0);
  const [tableHeightCompensation, setTableHeightCompensation] = useState(0);

  function getStatusMenuPositionFromTrigger(
    trigger: HTMLElement,
  ): StatusMenuPosition {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeightEstimate = 230;
    const viewportPadding = 8;
    const horizontalMin = viewportPadding;
    const horizontalMax = Math.max(
      viewportPadding,
      window.innerWidth - menuWidth - viewportPadding,
    );
    const left = Math.min(Math.max(rect.left, horizontalMin), horizontalMax);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < menuHeightEstimate && spaceAbove > spaceBelow;
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    return { left, top, openUp };
  }

  function getViewMenuPositionFromTrigger(
    trigger: HTMLElement,
  ): StatusMenuPosition {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 248;
    const menuHeightEstimate = 280;
    const viewportPadding = 8;
    const horizontalMin = viewportPadding;
    const horizontalMax = Math.max(
      viewportPadding,
      window.innerWidth - menuWidth - viewportPadding,
    );
    const left = Math.min(
      Math.max(rect.left - menuWidth + rect.width, horizontalMin),
      horizontalMax,
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < menuHeightEstimate && spaceAbove > spaceBelow;
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    return { left, top, openUp };
  }

    // Reload canonical event data and reset drafts to server values.
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
    const nextKey = toEditableColumnKey(focusKey ?? "title");

    setDrafts((previous) => ({
      ...previous,
      [event.id]: previous[event.id] ?? toDraft(event),
    }));
    setEditingId(event.id);
    setEditingKey(nextKey);
    setOpenStatusMenuId(nextKey === "status" ? event.id : null);
    setOpenCategoryMenuId(null);
    setEditFocusTarget({
      id: event.id,
      key: nextKey,
    });
  }

  // Persist one edited row and synchronize local event/draft state with API response.
  async function saveRow(event: ActivityEvent) {
    const draft = drafts[event.id];
    if (!draft || !rowHasChanges(event)) {
      setEditingId(null);
      setEditingKey(null);
      setOpenStatusMenuId(null);
        setOpenCategoryMenuId(null);
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
      setEditingKey(null);
      setOpenStatusMenuId(null);
        setOpenCategoryMenuId(null);
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
      setEditingKey(null);
      return;
    }
    await saveRow(event);
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((previous) => {
      if (previous.includes(rowId)) {
        return previous.filter((id) => id !== rowId);
      }
      return [...previous, rowId];
    });
  }

  function toggleVisiblePageSelection() {
    const pageIds = pagedEvents.map((event) => event.id);
    if (!pageIds.length) return;

    const allSelected = pageIds.every((id) => selectedRowIdSet.has(id));
    setSelectedRowIds((previous) => {
      if (allSelected) {
        return previous.filter((id) => !pageIds.includes(id));
      }

      const next = new Set(previous);
      for (const id of pageIds) next.add(id);
      return Array.from(next);
    });
  }

  async function applyBatchEdit() {
    if (batchSaving || selectedRowIds.length === 0) return;

    const selectedEvents = events.filter((event) => selectedRowIdSet.has(event.id));
    if (selectedEvents.length === 0) {
      setSelectedRowIds([]);
      return;
    }

    if (batchEditField === "category" && !batchEditText.trim()) {
      setError("Category cannot be empty when applying a bulk edit.");
      return;
    }

    setBatchSaving(true);
    setError(null);

    const results = await Promise.all(
      selectedEvents.map(async (event) => {
        try {
          const payload: Record<string, string> = { id: event.id };
          if (batchEditField === "status") {
            payload.status = batchEditStatus;
          } else if (batchEditField === "category") {
            payload.category = batchEditText.trim();
          } else {
            payload.project = batchEditText.trim();
          }

          const res = await fetch("/api/activity/events", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            let message = `Failed to update row (${res.status})`;
            try {
              const body = (await res.json()) as { error?: string };
              if (body.error) message = body.error;
            } catch {
              const text = await res.text();
              if (text) message = text;
            }
            return { id: event.id, ok: false as const, message };
          }

          const data = (await res.json()) as { event: ActivityEvent };
          return { id: event.id, ok: true as const, event: data.event };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return { id: event.id, ok: false as const, message };
        }
      }),
    );

    const updated = results.filter((result) => result.ok).map((result) => result.event);
    const failed = results.filter((result) => !result.ok);

    if (updated.length) {
      const updatedById = new Map(updated.map((event) => [event.id, event]));
      setEvents((previous) =>
        previous.map((event) => updatedById.get(event.id) ?? event),
      );
      setDrafts((previous) => {
        const next = { ...previous };
        for (const event of updated) {
          next[event.id] = toDraft(event);
        }
        return next;
      });
      setEditingId(null);
      setEditingKey(null);
      setOpenStatusMenuId(null);
      setOpenCategoryMenuId(null);
    }

    if (failed.length > 0) {
      const failedIds = failed.map((result) => result.id);
      setSelectedRowIds(failedIds);
      setError(`Updated ${updated.length} row(s). ${failed.length} row(s) failed.`);
    } else {
      setSelectedRowIds([]);
      if (batchEditField !== "status") {
        setBatchEditText("");
      }
      setError(null);
    }

    setBatchSaving(false);
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

  function applySavedView(viewId: string) {
    if (viewId === DEFAULT_VIEW_ID) {
      setFilters(cloneFilters({}));
      setActiveViewId(DEFAULT_VIEW_ID);
      setOpenFilterKey(null);
      return;
    }

    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;
    setFilters(cloneFilters(view.filters));
    setActiveViewId(view.id);
    setOpenFilterKey(null);
  }

  function getUniqueSavedViewName(baseName: string, excludeViewId?: string) {
    const existingNames = new Set(
      savedViews
        .filter((item) => item.id !== excludeViewId)
        .map((item) => item.name.toLowerCase()),
    );
    let nextName = baseName;
    let suffix = 2;
    while (existingNames.has(nextName.toLowerCase())) {
      nextName = `${baseName} ${suffix}`;
      suffix += 1;
    }
    return nextName;
  }

  function createSavedViewId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `view-${Date.now()}`;
  }

  function addSavedViewFromCurrentFilters() {
    const existing = savedViews.find((item) => areFiltersEqual(item.filters, filters));
    if (existing) {
      setActiveViewId(existing.id);
      return;
    }

    const nextView: SavedHistoryView = {
      id: createSavedViewId(),
      name: getUniqueSavedViewName(`View ${savedViews.length + 1}`),
      filters: cloneFilters(filters),
    };

    setSavedViews((previous) => [...previous, nextView]);
    setActiveViewId(nextView.id);
    setOpenFilterKey(null);
  }

  function renameSavedView(viewId: string) {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;

    setViewDialog({
      kind: "rename",
      viewId,
      draftName: view.name,
      error: null,
    });
  }

  function submitViewDialog() {
    if (!viewDialog) return;

    if (viewDialog.kind === "delete") {
      const targetId = viewDialog.viewId;
      setSavedViews((previous) => previous.filter((item) => item.id !== targetId));

      if (activeViewId === targetId) {
        setFilters(cloneFilters({}));
        setActiveViewId(DEFAULT_VIEW_ID);
        setOpenFilterKey(null);
      }

      setViewDialog(null);
      return;
    }

    const baseName = viewDialog.draftName.trim();
    if (!baseName) {
      setViewDialog((previous) => {
        if (!previous || previous.kind === "delete") return previous;
        return {
          ...previous,
          error: "Name is required.",
        };
      });
      return;
    }

    const nextName = getUniqueSavedViewName(baseName, viewDialog.viewId);

    const targetId = viewDialog.viewId;
    setSavedViews((previous) =>
      previous.map((item) =>
        item.id === targetId
          ? {
              ...item,
              name: nextName,
            }
          : item,
      ),
    );
    setViewDialog(null);
  }

  function duplicateSavedView(viewId: string) {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;

    const nextView: SavedHistoryView = {
      id: createSavedViewId(),
      name: getUniqueSavedViewName(`${view.name} Copy`),
      filters: cloneFilters(view.filters),
    };

    setSavedViews((previous) => [...previous, nextView]);
    setFilters(cloneFilters(nextView.filters));
    setActiveViewId(nextView.id);
    setOpenFilterKey(null);
  }

  function deleteSavedView(viewId: string) {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;

    setViewDialog({
      kind: "delete",
      viewId,
    });
  }

  function editSavedViewFilters(viewId: string) {
    applySavedView(viewId);
  }

  async function copySavedViewLink(viewId: string) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("historyView", viewId);
    await copyTextToClipboard(url.toString());
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
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(HISTORY_VIEWS_STORAGE_KEY);
      if (!raw) {
        loadedSavedViewsRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      setSavedViews(normalizeSavedHistoryViews(parsed));
    } catch {
      // ignore storage parse issues
    } finally {
      loadedSavedViewsRef.current = true;
      setSavedViewsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loadedSavedViewsRef.current) return;

    try {
      window.localStorage.setItem(
        HISTORY_VIEWS_STORAGE_KEY,
        JSON.stringify(savedViews),
      );
    } catch {
      // ignore storage write issues
    }
  }, [savedViews]);

  useEffect(() => {
    const ticker = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (hydratedViewFromUrlRef.current) return;
    if (!savedViewsLoaded) return;
    if (typeof window === "undefined") return;

    const requestedViewId = new URL(window.location.href).searchParams.get("historyView");
    if (!requestedViewId) {
      hydratedViewFromUrlRef.current = true;
      return;
    }

    const requestedView = savedViews.find((item) => item.id === requestedViewId);
    if (requestedView) {
      setFilters(cloneFilters(requestedView.filters));
      setActiveViewId(requestedView.id);
      setOpenFilterKey(null);
    }

    hydratedViewFromUrlRef.current = true;
  }, [savedViewsLoaded, savedViews]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (activeViewId && activeViewId !== DEFAULT_VIEW_ID) {
      url.searchParams.set("historyView", activeViewId);
    } else {
      url.searchParams.delete("historyView");
    }
    window.history.replaceState(null, "", url.toString());
  }, [activeViewId]);

  useEffect(() => {
    if (activeViewId === null) {
      if (areFiltersEqual(filters, EMPTY_FILTERS)) {
        setActiveViewId(DEFAULT_VIEW_ID);
      }
      return;
    }

    if (activeViewId === DEFAULT_VIEW_ID) {
      if (!areFiltersEqual(filters, EMPTY_FILTERS)) {
        setActiveViewId(null);
      }
      return;
    }

    const activeView = savedViews.find((item) => item.id === activeViewId);
    if (!activeView) {
      setActiveViewId(areFiltersEqual(filters, EMPTY_FILTERS) ? DEFAULT_VIEW_ID : null);
      return;
    }

    if (!areFiltersEqual(filters, activeView.filters)) {
      setActiveViewId(null);
    }
  }, [activeViewId, filters, savedViews]);

  useEffect(() => {
    if (!openFilterKey && !openStatusMenuId && !openCategoryMenuId && !openViewMenuId && !tableSettingsOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest('[data-filter-popover="true"]') ||
        target.closest('[data-filter-btn="true"]') ||
        target.closest('[data-status-menu="true"]') ||
        target.closest('[data-status-btn="true"]') ||
        target.closest('[data-category-menu="true"]') ||
        target.closest('[data-category-btn="true"]') ||
        target.closest('[data-view-menu="true"]') ||
        target.closest('[data-view-options-btn="true"]') ||
        target.closest('[data-view-dialog="true"]') ||
        target.closest('[data-table-settings="true"]') ||
        target.closest('[data-table-settings-btn="true"]')
      ) {
        return;
      }
      setOpenFilterKey(null);
      setOpenStatusMenuId(null);
      setOpenCategoryMenuId(null);
      setOpenViewMenuId(null);
      setTableSettingsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenFilterKey(null);
        setOpenStatusMenuId(null);
        setOpenCategoryMenuId(null);
        setOpenViewMenuId(null);
        setTableSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openFilterKey, openStatusMenuId, openCategoryMenuId, openViewMenuId, tableSettingsOpen]);

  useEffect(() => {
    if (!tableSettingsOpen) {
      setOpenTableSettingsMenu(null);
    }
  }, [tableSettingsOpen]);

  useEffect(() => {
    if (!openTableSettingsMenu) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest('[data-table-settings-select-menu="true"]') ||
        target.closest('[data-table-settings-select-btn="true"]')
      ) {
        return;
      }
      setOpenTableSettingsMenu(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenTableSettingsMenu(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openTableSettingsMenu]);

  useEffect(() => {
    if (!openStatusMenuId) {
      setStatusMenuPosition(null);
      return;
    }

    const statusMenuId = openStatusMenuId;

    function updateStatusMenuPosition() {
      const trigger = statusButtonRefs.current[statusMenuId];
      if (!trigger) {
        setOpenStatusMenuId(null);
        setOpenCategoryMenuId(null);
        return;
      }
      setStatusMenuPosition(getStatusMenuPositionFromTrigger(trigger));
    }

    updateStatusMenuPosition();
    window.addEventListener("resize", updateStatusMenuPosition);
    window.addEventListener("scroll", updateStatusMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateStatusMenuPosition);
      window.removeEventListener("scroll", updateStatusMenuPosition, true);
    };
  }, [openStatusMenuId]);

  useEffect(() => {
    if (!openCategoryMenuId) {
      setCategoryMenuPosition(null);
      return;
    }

    const categoryMenuId = openCategoryMenuId;

    function updateCategoryMenuPosition() {
      const trigger = categoryButtonRefs.current[categoryMenuId];
      if (!trigger) {
        setOpenCategoryMenuId(null);
        return;
      }
      setCategoryMenuPosition(getStatusMenuPositionFromTrigger(trigger));
    }

    updateCategoryMenuPosition();
    window.addEventListener("resize", updateCategoryMenuPosition);
    window.addEventListener("scroll", updateCategoryMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateCategoryMenuPosition);
      window.removeEventListener("scroll", updateCategoryMenuPosition, true);
    };
  }, [openCategoryMenuId]);

  useEffect(() => {
    if (!openViewMenuId) {
      setViewMenuPosition(null);
      return;
    }

    const viewMenuId = openViewMenuId;

    function updateViewMenuPosition() {
      const trigger = viewMenuButtonRefs.current[viewMenuId];
      if (!trigger) {
        setOpenViewMenuId(null);
        return;
      }
      setViewMenuPosition(getViewMenuPositionFromTrigger(trigger));
    }

    updateViewMenuPosition();
    window.addEventListener("resize", updateViewMenuPosition);
    window.addEventListener("scroll", updateViewMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateViewMenuPosition);
      window.removeEventListener("scroll", updateViewMenuPosition, true);
    };
  }, [openViewMenuId]);

  useEffect(() => {
    if (!viewDialog) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewDialog(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [viewDialog]);

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
        target.closest('[data-category-menu="true"]') ||
        target.closest('[data-category-btn="true"]') ||
        target.closest('[data-view-menu="true"]') ||
        target.closest('[data-view-options-btn="true"]') ||
        target.closest('[data-view-dialog="true"]') ||
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
    if (editingKey !== editFocusTarget.key) return;

    const selector = `[data-editor-id="${editFocusTarget.id}"][data-editor-key="${editFocusTarget.key}"]`;
    const target = document.querySelector<HTMLElement>(selector);
    if (target) {
      target.focus();
      setEditFocusTarget(null);
    }
  }, [editFocusTarget, editingId, editingKey]);

  useEffect(() => {
    setSelectedRowIds((previous) =>
      previous.filter((id) => events.some((event) => event.id === id)),
    );
  }, [events]);


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
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectedRowCount = selectedRowIds.length;
  const visibleRowIds = pagedEvents.map((event) => event.id);
  const allVisibleRowsSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedRowIdSet.has(id));
  const someVisibleRowsSelected =
    visibleRowIds.some((id) => selectedRowIdSet.has(id)) && !allVisibleRowsSelected;
  const fallbackBodyRowHeight = DENSITY_ROW_HEIGHT[displayDensity];
  const fallbackHeaderRowHeight = displayDensity === "compact" ? 40 : 48;
  const bodyRowHeight = measuredBodyRowHeight || fallbackBodyRowHeight;
  const headerRowHeight = measuredHeaderRowHeight || fallbackHeaderRowHeight;
  const visibleRowCount = Math.max(1, pagedEvents.length);
  const tableViewportHeight = Math.ceil(
    headerRowHeight + bodyRowHeight * visibleRowCount + 2,
  );
  const tableViewportOuterHeight = tableViewportHeight + tableHeightCompensation;
  const cellPaddingClass =
    displayDensity === "compact" ? "px-2 py-1.5" : "px-2.5 py-2.5";
  const editControlClass =
    "w-full appearance-none border-0 bg-transparent px-0 py-0 text-[14px] leading-5 text-white caret-white outline-none ring-0 transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-0 disabled:opacity-70";
  const editTextareaClass = `${editControlClass} h-16 resize-none`;
  const tableSettingsTriggerClass =
    "inline-flex w-full items-center justify-between gap-2 rounded-md border border-white/25 bg-black/35 px-2.5 py-1.5 text-left text-[13px] leading-5 transition-colors hover:bg-black/55";
  const tableSettingsMenuClass =
    "absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-1 shadow-2xl backdrop-blur";
  const selectedSortLabel =
    sortColumnOptions.find((option) => option.key === sortKey)?.label ??
    "Start Time";
  const selectedRefreshLabel =
    REFRESH_FREQUENCY_OPTIONS.find((option) => option.value === refreshFrequencyMs)
      ?.label ?? "Off";
  const hasUnsavedFilters = activeViewId === null && !areFiltersEqual(filters, EMPTY_FILTERS);
  const openStatusDraft = openStatusMenuId ? drafts[openStatusMenuId] : null;
  const statusMenuPortal =
    openStatusMenuId && statusMenuPosition && openStatusDraft
      ? createPortal(
          <div
            data-status-menu="true"
            className="fixed z-[90] w-56 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-2 shadow-2xl backdrop-blur"
            style={{
              left: statusMenuPosition.left + "px",
              top: statusMenuPosition.top + "px",
              transform: statusMenuPosition.openUp ? "translateY(-100%)" : "none",
            }}
          >
            {STATUS_GROUPS.map((group) => (
              <div
                key={"status-edit-group-" + group.label}
                className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
              >
                <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {group.label}
                </div>
                <div className="mt-1 space-y-1">
                  {group.values.map((statusValue) => {
                    const activeStatus = openStatusDraft.status === statusValue;
                    return (
                      <button
                        key={"status-edit-" + openStatusMenuId + "-" + statusValue}
                        type="button"
                        className={[
                          "w-full rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                          activeStatus ? "bg-white/10" : "hover:bg-white/5",
                        ].join(" ")}
                        onClick={() => {
                          setDraftPatch(openStatusMenuId, { status: statusValue });
                          setOpenStatusMenuId(null);
        setOpenCategoryMenuId(null);
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
          </div>,
          document.body,
        )
      : null;

  const openCategoryDraft = openCategoryMenuId ? drafts[openCategoryMenuId] : null;
  const categoryMenuValues =
    openCategoryDraft
      ? (() => {
          const seen = new Set<string>();
          const values: string[] = [];
          const draftCategory = openCategoryDraft.category.trim();

          if (draftCategory) {
            values.push(draftCategory);
            seen.add(draftCategory.toLowerCase());
          }

          for (const category of categoryOptions) {
            const normalized = category.trim();
            if (!normalized) continue;
            const lookup = normalized.toLowerCase();
            if (seen.has(lookup)) continue;
            seen.add(lookup);
            values.push(normalized);
          }

          return values;
        })()
      : [];

  const categoryMenuPortal =
    openCategoryMenuId && categoryMenuPosition && openCategoryDraft
      ? createPortal(
          <div
            data-category-menu="true"
            className="fixed z-[90] w-56 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-2 shadow-2xl backdrop-blur"
            style={{
              left: categoryMenuPosition.left + "px",
              top: categoryMenuPosition.top + "px",
              transform: categoryMenuPosition.openUp ? "translateY(-100%)" : "none",
            }}
          >
            <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Category
            </div>
            <div className="app-scrollbar max-h-56 space-y-1 overflow-y-auto">
              {categoryMenuValues.length ? (
                categoryMenuValues.map((category) => {
                  const active =
                    openCategoryDraft.category.trim().toLowerCase() ===
                    category.toLowerCase();
                  const style = getCategoryStyle(normalizeCategory(category)).badgeStyle;

                  return (
                    <button
                      key={"category-edit-" + openCategoryMenuId + "-" + category}
                      type="button"
                      className={[
                        "flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                        active ? "bg-white/10" : "hover:bg-white/5",
                      ].join(" ")}
                      onClick={() => {
                        setDraftPatch(openCategoryMenuId, { category });
                        setOpenCategoryMenuId(null);
                      }}
                    >
                      <span
                        className="inline-flex items-center rounded-md border px-1.5 py-0 text-xs leading-4 font-medium"
                        style={style}
                      >
                        {category}
                      </span>
                      {active ? <span className="text-zinc-300">Selected</span> : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-1 py-1 text-xs text-muted-foreground">
                  No categories available yet.
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  const openViewMenu = openViewMenuId
    ? savedViews.find((item) => item.id === openViewMenuId) ?? null
    : null;

  const viewMenuPortal =
    openViewMenu && viewMenuPosition
      ? createPortal(
          <div
            data-view-menu="true"
            className="fixed z-[95] w-64 rounded-xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-2 shadow-2xl backdrop-blur"
            style={{
              left: viewMenuPosition.left + "px",
              top: viewMenuPosition.top + "px",
              transform: viewMenuPosition.openUp ? "translateY(-100%)" : "none",
            }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10"
              onClick={() => {
                renameSavedView(openViewMenu.id);
                setOpenViewMenuId(null);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="m4 13 8.7-8.7 2 2L6 15H4v-2Z" />
                <path d="M11.7 4l2.3 2.3" />
              </svg>
              Rename
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10"
              onClick={() => {
                editSavedViewFilters(openViewMenu.id);
                setOpenViewMenuId(null);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h12M4 10h8M4 14h6" />
                <circle cx="14.5" cy="10" r="1.2" />
              </svg>
              Edit filters
            </button>

            <div className="my-1 border-t border-white/10" />

            <div className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-300">
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                  <path d="M4.5 15.5h11v-8l-5.5-3-5.5 3v8Z" />
                </svg>
                Source
              </span>
              <span className="inline-flex items-center gap-1 truncate text-xs text-zinc-400">
                Local
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="m8 5 5 5-5 5" />
                </svg>
              </span>
            </div>

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10"
              onClick={async () => {
                await copySavedViewLink(openViewMenu.id);
                setOpenViewMenuId(null);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M8 12.5 12.5 8M6.2 13.8l-1.5 1.5a2.2 2.2 0 0 1-3.1-3.1l2.7-2.7a2.2 2.2 0 0 1 3.1 0" />
                <path d="M13.8 6.2l1.5-1.5a2.2 2.2 0 1 1 3.1 3.1l-2.7 2.7a2.2 2.2 0 0 1-3.1 0" />
              </svg>
              Copy link to view
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10"
              onClick={() => {
                duplicateSavedView(openViewMenu.id);
                setOpenViewMenuId(null);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <rect x="6" y="6" width="10" height="10" rx="2" />
                <path d="M4 12V5a1 1 0 0 1 1-1h7" />
              </svg>
              Duplicate view
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-200 transition-colors hover:bg-red-500/20"
              onClick={() => {
                deleteSavedView(openViewMenu.id);
                setOpenViewMenuId(null);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4.5 5.5h11" />
                <path d="M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
                <path d="M6.5 5.5l.8 10a1 1 0 0 0 1 .9h3.4a1 1 0 0 0 1-.9l.8-10" />
              </svg>
              Delete view
            </button>
          </div>,
          document.body,
        )
      : null;

  const viewDialogTarget =
    viewDialog
      ? savedViews.find((item) => item.id === viewDialog.viewId) ?? null
      : null;

  const viewDialogPortal =
    viewDialog
      ? createPortal(
          <div
            data-view-dialog="true"
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setViewDialog(null);
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 p-4 shadow-2xl backdrop-blur">
              <h3 className="text-xl font-semibold tracking-tight">
                {viewDialog.kind === "delete"
                  ? "Delete this view?"
                  : "Rename view"}
              </h3>

              {viewDialog.kind === "delete" ? (
                <p className="mt-2 text-sm text-zinc-300">
                  Delete view &quot;{viewDialogTarget?.name ?? "this view"}&quot;?
                </p>
              ) : (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitViewDialog();
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    className="w-full rounded-md border border-white/20 bg-black/35 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-300/50"
                    value={viewDialog.draftName}
                    onChange={(event) =>
                      setViewDialog((previous) => {
                        if (!previous || previous.kind === "delete") return previous;
                        return {
                          ...previous,
                          draftName: event.target.value,
                          error: null,
                        };
                      })
                    }
                  />
                  {viewDialog.error ? (
                    <p className="text-xs text-red-300">{viewDialog.error}</p>
                  ) : null}
                </form>
              )}

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                    viewDialog.kind === "delete"
                      ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                      : "border-cyan-300/35 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25",
                  ].join(" ")}
                  onClick={submitViewDialog}
                >
                  {viewDialog.kind === "delete"
                    ? "Delete view"
                    : "Save name"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10"
                  onClick={() => setViewDialog(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

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

  // Add only enough extra height to account for horizontal scrollbar thickness,
  // so vertical scrolling doesn't appear just to reveal the last row.
  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;

    const hasHorizontalOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
    if (!hasHorizontalOverflow) {
      if (tableHeightCompensation !== 0) {
        setTableHeightCompensation(0);
      }
      return;
    }

    const styles = window.getComputedStyle(viewport);
    const borderTop = parseFloat(styles.borderTopWidth || "0");
    const borderBottom = parseFloat(styles.borderBottomWidth || "0");
    const scrollbarHeight = Math.max(
      0,
      Math.ceil(viewport.offsetHeight - viewport.clientHeight - borderTop - borderBottom),
    );

    if (Math.abs(scrollbarHeight - tableHeightCompensation) > 0.5) {
      setTableHeightCompensation(scrollbarHeight);
    }
  }, [
    tableHeightCompensation,
    tableViewportHeight,
    columnOrder,
    columnWidths,
    recordsPerPage,
    displayDensity,
    pageStart,
    pageEnd,
  ]);

  // Header cell renderer handles sorting, filtering, dragging, and resizing affordances.
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
            "inline-flex w-full items-center gap-1.5 pr-10 text-[15px] leading-tight font-bold text-left rounded-sm px-1 py-0.5 transition-colors",
            active ? "text-foreground" : "text-muted-foreground",
          ].join(" ")}
          onClick={() => toggleSort(def.key)}
        >
          {renderColumnHeaderIcon(def.key)}
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
      <span className="pointer-events-none absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="pointer-events-auto rounded-md border border-white/25 bg-black/55 p-1 text-white/80 shadow-sm transition-colors hover:bg-black/80 hover:text-white"
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
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
            <path d="M13 7V4.8A1.8 1.8 0 0 0 11.2 3H4.8A1.8 1.8 0 0 0 3 4.8v6.4A1.8 1.8 0 0 0 4.8 13H7" />
          </svg>
        </button>
        <button
          type="button"
          className="pointer-events-auto rounded-md border border-white/25 bg-black/55 p-1 text-white/80 shadow-sm transition-colors hover:bg-black/80 hover:text-white"
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
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="m4 13.5 8.9-8.9a1.7 1.7 0 0 1 2.4 0l.1.1a1.7 1.7 0 0 1 0 2.4L6.5 16H4v-2.5Z" />
            <path d="M11.6 5.9 14 8.3" />
          </svg>
        </button>
      </span>
    );
  }

    // Body cell renderer switches between display mode and single-cell edit mode.
  function renderBodyCell(
    key: ColumnKey,
    event: ActivityEvent,
    draft: EventDraft,
    isRowEditing: boolean,
    saving: boolean,
    duration: string,
    isActive: boolean,
    categoryStyle: ReturnType<typeof getCategoryStyle>,
  ) {
    const isEditing = isRowEditing && editingKey === toEditableColumnKey(key);

    switch (key) {
      case "title":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                className={editControlClass}
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
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                type="datetime-local"
                className={editControlClass}
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
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                type="datetime-local"
                className={editControlClass}
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
            className={[`border-r border-white/10 ${cellPaddingClass} text-right text-[14px] text-muted-foreground whitespace-nowrap`, isEditing ? "bg-black/80 text-white" : "group relative pr-10"].join(" ")}
          >
            {duration}
            {isActive ? " active" : ""}
            {!isEditing
              ? renderCellActions(
                  event,
                  "duration",
                  `${duration}${isActive ? " active" : ""}`,
                )
              : null}
          </td>
        );
      case "status":
        return (
          <td
            key={`${event.id}-${key}`}
            className={[
              `border-r border-white/10 ${cellPaddingClass}`,
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <div className="relative" data-status-menu="true">
                <button
                  type="button"
                  data-status-btn="true"
                  ref={(node) => {
                    statusButtonRefs.current[event.id] = node;
                  }}
                  className="inline-flex w-full items-center justify-between gap-2 bg-transparent px-0 py-0 text-[14px] leading-5 outline-none ring-0 transition-colors hover:text-white focus:outline-none focus:ring-0"
                  onClick={(clickEvent) => {
                    if (openStatusMenuId === event.id) {
                      setOpenStatusMenuId(null);
        setOpenCategoryMenuId(null);
                      return;
                    }
                    setStatusMenuPosition(
                      getStatusMenuPositionFromTrigger(clickEvent.currentTarget),
                    );
                    setOpenCategoryMenuId(null);
                    setOpenStatusMenuId(event.id);
                  }}
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
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <input
                className={editControlClass}
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
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <textarea
                className={editTextareaClass}
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
              isEditing ? "bg-black/80 text-white" : "group relative pr-10",
            ].join(" ")}
          >
            {isEditing ? (
              <div className="relative" data-category-menu="true">
                <button
                  type="button"
                  data-category-btn="true"
                  ref={(node) => {
                    categoryButtonRefs.current[event.id] = node;
                  }}
                  className="inline-flex w-full items-center justify-between gap-2 bg-transparent px-0 py-0 text-[14px] leading-5 outline-none ring-0 transition-colors hover:text-white focus:outline-none focus:ring-0"
                  onClick={(clickEvent) => {
                    if (openCategoryMenuId === event.id) {
                      setOpenCategoryMenuId(null);
                      return;
                    }
                    setCategoryMenuPosition(
                      getStatusMenuPositionFromTrigger(clickEvent.currentTarget),
                    );
                    setOpenStatusMenuId(null);
                    setOpenCategoryMenuId(event.id);
                  }}
                  disabled={saving}
                  data-editor-id={event.id}
                  data-editor-key="type"
                >
                  <span
                    className="inline-flex items-center rounded-md border px-1.5 py-0 text-xs leading-4 font-medium"
                    style={categoryStyle.badgeStyle}
                  >
                    {draft.category || "Uncategorized"}
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
              </div>
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
    <div className="flex min-h-0 flex-col space-y-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold tracking-tight">History</h2></div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            data-table-settings-btn="true"
            className="rounded-lg border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
            onClick={() => setTableSettingsOpen((previous) => !previous)}
          >
            Table Settings
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
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
                  <div className="relative">
                    <button
                      type="button"
                      data-table-settings-select-btn="true"
                      className={tableSettingsTriggerClass}
                      onClick={() =>
                        setOpenTableSettingsMenu((previous) =>
                          previous === "recordsPerPage" ? null : "recordsPerPage",
                        )
                      }
                    >
                      <span>{recordsPerPage}</span>
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
                    {openTableSettingsMenu === "recordsPerPage" ? (
                      <div
                        data-table-settings-select-menu="true"
                        className={tableSettingsMenuClass}
                      >
                        {RECORDS_PER_PAGE_OPTIONS.map((value) => {
                          const active = recordsPerPage === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              className={[
                                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                active
                                  ? "bg-white/10 text-white"
                                  : "text-zinc-200 hover:bg-white/5",
                              ].join(" ")}
                              onClick={() => {
                                setRecordsPerPage(value);
                                setOpenTableSettingsMenu(null);
                              }}
                            >
                              <span>{value}</span>
                              {active ? (
                                <span className="text-[11px] text-zinc-300">Selected</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-muted-foreground">Sort By Column</span>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <button
                        type="button"
                        data-table-settings-select-btn="true"
                        className={tableSettingsTriggerClass}
                        onClick={() =>
                          setOpenTableSettingsMenu((previous) =>
                            previous === "sortByColumn" ? null : "sortByColumn",
                          )
                        }
                      >
                        <span className="truncate">{selectedSortLabel}</span>
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        >
                          <path d="m5 7 5 6 5-6" />
                        </svg>
                      </button>
                      {openTableSettingsMenu === "sortByColumn" ? (
                        <div
                          data-table-settings-select-menu="true"
                          className={`${tableSettingsMenuClass} app-scrollbar max-h-56 overflow-y-auto`}
                        >
                          {sortColumnOptions.map((option) => {
                            const active = sortKey === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                className={[
                                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                  active
                                    ? "bg-white/10 text-white"
                                    : "text-zinc-200 hover:bg-white/5",
                                ].join(" ")}
                                onClick={() => {
                                  setSortKey(option.key);
                                  setOpenTableSettingsMenu(null);
                                }}
                              >
                                <span className="truncate">{option.label}</span>
                                {active ? (
                                  <span className="text-[11px] text-zinc-300">Selected</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
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
                  <div className="relative">
                    <button
                      type="button"
                      data-table-settings-select-btn="true"
                      className={tableSettingsTriggerClass}
                      onClick={() =>
                        setOpenTableSettingsMenu((previous) =>
                          previous === "refreshFrequency"
                            ? null
                            : "refreshFrequency",
                        )
                      }
                    >
                      <span>{selectedRefreshLabel}</span>
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
                    {openTableSettingsMenu === "refreshFrequency" ? (
                      <div
                        data-table-settings-select-menu="true"
                        className={tableSettingsMenuClass}
                      >
                        {REFRESH_FREQUENCY_OPTIONS.map((option) => {
                          const active = refreshFrequencyMs === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={[
                                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                active
                                  ? "bg-white/10 text-white"
                                  : "text-zinc-200 hover:bg-white/5",
                              ].join(" ")}
                              onClick={() => {
                                setRefreshFrequencyMs(option.value);
                                setOpenTableSettingsMenu(null);
                              }}
                            >
                              <span>{option.label}</span>
                              {active ? (
                                <span className="text-[11px] text-zinc-300">Selected</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
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

      <div className="px-1">
        <div className="app-scrollbar flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            className={[
              "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              activeViewId === DEFAULT_VIEW_ID
                ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-100"
                : "border-transparent bg-transparent text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white",
            ].join(" ")}
            onClick={() => applySavedView(DEFAULT_VIEW_ID)}
          >
            All Tasks
          </button>

          {savedViews.map((view) => {
            const isActive = activeViewId === view.id;
            const isMenuOpen = openViewMenuId === view.id;

            return (
              <div
                key={view.id}
                className={[
                  "group inline-flex items-center rounded-md border transition-colors",
                  isActive || isMenuOpen
                    ? "border-white/20 bg-white/10"
                    : "border-transparent bg-transparent hover:border-white/20 hover:bg-white/8",
                ].join(" ")}
              >
                <button
                  type="button"
                  className={[
                    "shrink-0 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "text-cyan-100"
                      : "text-zinc-200 hover:text-white",
                  ].join(" ")}
                  onClick={() => applySavedView(view.id)}
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  data-view-options-btn="true"
                  ref={(node) => {
                    viewMenuButtonRefs.current[view.id] = node;
                  }}
                  className={[
                    "inline-flex h-full items-center rounded-r-md border-l px-2 transition-all",
                    isMenuOpen
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-transparent text-zinc-300 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                  aria-label={`Open options for ${view.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (openViewMenuId === view.id) {
                      setOpenViewMenuId(null);
                      return;
                    }
                    setViewMenuPosition(getViewMenuPositionFromTrigger(event.currentTarget));
                    setOpenViewMenuId(view.id);
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
                    <circle cx="5" cy="10" r="1" fill="currentColor" stroke="none" />
                    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            );
          })}

          {hasUnsavedFilters ? (
            <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-100">
              Unsaved filters
            </span>
          ) : null}

          <button
            type="button"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/25 bg-black/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
            onClick={addSavedViewFromCurrentFilters}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M10 4v12M4 10h12" />
            </svg>
            Add View
          </button>
        </div>
      </div>

      {selectedRowCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs">
          <span className="font-medium text-cyan-100">{selectedRowCount} selected</span>

          <select
            value={batchEditField}
            onChange={(event) => setBatchEditField(event.target.value as BatchEditField)}
            className="rounded-md border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs text-white outline-none"
            disabled={batchSaving}
          >
            {BATCH_EDIT_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {batchEditField === "status" ? (
            <select
              value={batchEditStatus}
              onChange={(event) => setBatchEditStatus(event.target.value as TaskStatus)}
              className="rounded-md border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs text-white outline-none"
              disabled={batchSaving}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={batchEditText}
              onChange={(event) => setBatchEditText(event.target.value)}
              placeholder={batchEditField === "category" ? "Category" : "Project (empty clears)"}
              className="min-w-44 rounded-md border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none"
              disabled={batchSaving}
            />
          )}

          <button
            type="button"
            className="rounded-md border border-cyan-300/35 bg-cyan-400/20 px-2.5 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-400/30 disabled:opacity-60"
            onClick={() => {
              void applyBatchEdit();
            }}
            disabled={batchSaving || selectedRowCount === 0}
          >
            {batchSaving ? "Applying..." : "Apply to selected"}
          </button>

          <button
            type="button"
            className="rounded-md border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/10"
            onClick={() => setSelectedRowIds([])}
            disabled={batchSaving}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-muted-foreground">Loading history...</p>
      ) : error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : filteredSortedEvents.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-muted-foreground">No rows match your filters.</p>
      ) : (
        <div
          ref={tableViewportRef}
          className="app-scrollbar relative min-h-0 overflow-x-auto overflow-y-visible rounded-xl border border-white/10 bg-black/20"
          style={{ height: `${tableViewportOuterHeight}px` }}
        >
          <table className="w-max min-w-full border-collapse text-[14px] leading-5">
            <colgroup>
              <col style={{ width: "44px" }} />
              {orderedColumnDefs.map((def) => (
                <col key={def.key} style={{ width: `${columnWidths[def.key]}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr ref={headerRowRef}>
                <th className="border-b border-r border-white/10 bg-white/[0.03] px-2 py-1.5 text-left">
                  <input
                    ref={(node) => {
                      selectAllVisibleRef.current = node;
                      if (node) node.indeterminate = someVisibleRowsSelected;
                    }}
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border border-white/25 bg-black/40 align-middle"
                    checked={allVisibleRowsSelected}
                    onChange={toggleVisiblePageSelection}
                    disabled={!visibleRowIds.length}
                    aria-label="Select all rows on this page"
                  />
                </th>
                {orderedColumnDefs.map((def) => renderHeader(def))}
              </tr>
            </thead>
            <tbody>
              {pagedEvents.map((event, index) => {
                const draft = drafts[event.id] ?? toDraft(event);
                const categoryStyle = getCategoryStyle(normalizeCategory(draft.category));
                const rowBg = categoryStyle.rowStyle.backgroundColor;
                const saving = Boolean(savingById[event.id]);
                const isRowEditing = editingId === event.id;

                const start = parseDatetimeLocal(draft.startTime) ?? new Date(event.startedAt);
                const end = parseDatetimeLocal(draft.endTime) ?? new Date(nowTick);
                const duration = durationLabel(start, end);
                const isActive = !draft.endTime;
                const isSelected = selectedRowIdSet.has(event.id);

                return (
                  <tr
                    key={event.id}
                    ref={index === 0 ? firstBodyRowRef : null}
                    data-row-id={event.id}
                    style={{ backgroundColor: rowBg }}
                    className="border-b border-white/10 align-top"
                  >
                    <td className={`border-r border-white/10 ${cellPaddingClass} text-center`}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border border-white/25 bg-black/45 align-middle"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(event.id)}
                        aria-label={`Select task ${event.title}`}
                      />
                    </td>
                    {orderedColumnDefs.map((def) =>
                      renderBodyCell(
                        def.key,
                        event,
                        draft,
                        isRowEditing,
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
        </div>
      )}

      {!loading && !error && filteredSortedEvents.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
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
      {statusMenuPortal}
      {categoryMenuPortal}
      {viewMenuPortal}
      {viewDialogPortal}
    </div>
  );
}



