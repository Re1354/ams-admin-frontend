import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Ban,
  Eye,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Undo2,
  Video,
} from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import PaginationControls, {
  DEFAULT_PAGINATION,
  paginationFromDrf,
  type PaginationMeta,
} from "../components/PaginationControls";
import { CONDUCT_STYLES, NO_CAMERA_TEXT, flagCountLabel } from "../components/ExamConductBadge";
import {
  DEFAULT_ORDERING,
  ProctoringSortControls,
  type SessionOrdering,
} from "../components/ProctoringSortControls";
import {
  ProctoringSessionDetail,
  examLabel,
  formatDateTime,
  type ProctoringSessionRow,
} from "../components/ProctoringSessionDetail";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { formatSemesterLabel } from "../lib/semester";
import { admissionResultsAPI, departmentAPI, proctoringAPI } from "../services/api";

const PAGE_SIZE = 25;
const POLL_MS = 10000;
const ALL = "all";
const MIN_CODE_LENGTH = 6;

type ConductFilter = "all" | "live" | "reported" | "clear" | "not_monitored" | "banned";

const CONDUCT_FILTERS: { value: ConductFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "live", label: "Live now" },
  { value: "reported", label: "Reported" },
  { value: "clear", label: "Clear" },
  { value: "not_monitored", label: "Not monitored (no camera)" },
  { value: "banned", label: "Banned" },
];

interface DepartmentOption {
  id: number;
  department_name: string;
  department_shortname?: string;
}

interface UnlockCodeStatus {
  is_set: boolean;
  changed_at: string | null;
  changed_by: string | null;
}

type BulkAction = "ban" | "unban";

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
  }
  return typeof error === "string" && error ? error : fallback;
}

function beep() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio is blocked until the user interacts with the page; the pop-up still shows.
  }
}

function loadSeen(key: string): number[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

function saveSeen(key: string, ids: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage blocked: alerts may repeat after a reload, nothing else breaks.
  }
}

export function ProctoringDashboard() {
  const { user } = useAuth();
  const { canRead, canEdit, canWrite } = usePermissions();
  const hasAccess = canRead() || canEdit() || canWrite();
  const canManage = canEdit() || canWrite();
  const [searchParams, setSearchParams] = useSearchParams();

  const [semesters, setSemesters] = useState<string[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [semester, setSemester] = useState<string>(ALL);
  const [departmentId, setDepartmentId] = useState<string>(ALL);
  const [conductFilter, setConductFilter] = useState<ConductFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [ordering, setOrdering] = useState<SessionOrdering>(DEFAULT_ORDERING);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<ProctoringSessionRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [summary, setSummary] = useState<{ reported: number; active: number }>({ reported: 0, active: 0 });

  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [unlockStatus, setUnlockStatus] = useState<UnlockCodeStatus | null>(null);
  const [newCode, setNewCode] = useState("");
  const [isSavingCode, setIsSavingCode] = useState(false);

  const detailParam = searchParams.get("session");
  const detailId = detailParam && /^\d+$/.test(detailParam) ? Number(detailParam) : null;
  const seenKey = `amsProctorSeenReports:${user?.id ?? "anon"}`;

  const openDetail = useCallback(
    (sessionId: number) => {
      const next = new URLSearchParams(searchParams);
      next.set("session", String(sessionId));
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const closeDetail = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("session");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Filter options (semesters from exams and thresholds; departments in the user's scope).
  useEffect(() => {
    if (!hasAccess) return;
    admissionResultsAPI
      .getSemesterOptions({})
      .then((response: { semesters?: string[] }) => setSemesters(response?.semesters || []))
      .catch(() => setSemesters([]));
    departmentAPI
      .getAllDepartments()
      .then((response: { data?: DepartmentOption[] }) => setDepartments(response?.data || []))
      .catch(() => setDepartments([]));
  }, [hasAccess]);

  // Search waits until typing pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchText.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = { page, ordering };
    if (semester !== ALL) params.semester = semester;
    if (departmentId !== ALL) params.department_id = departmentId;
    if (conductFilter !== "all") params.conduct = conductFilter;
    if (search) params.search = search;
    return params;
  }, [page, semester, departmentId, conductFilter, search, ordering]);

  // Only a response for the current filters may update the table (a quiet poll can race a filter change).
  const latestQueryKey = useRef("");

  const loadSessions = useCallback(
    async (quiet = false) => {
      const queryKey = JSON.stringify(queryParams);
      latestQueryKey.current = queryKey;
      if (!quiet) {
        setIsLoading(true);
      }
      try {
        const response = await proctoringAPI.listSessions(queryParams);
        if (queryKey !== latestQueryKey.current) return;
        setRows(response?.results || []);
        setPagination(paginationFromDrf(response, page, PAGE_SIZE));
        setLoadError(null);
      } catch (error) {
        if (!quiet && queryKey === latestQueryKey.current) {
          setRows([]);
          setPagination(DEFAULT_PAGINATION);
          setLoadError(errorMessage(error, "Could not load proctoring sessions."));
        }
      } finally {
        if (!quiet && queryKey === latestQueryKey.current) {
          setIsLoading(false);
        }
      }
    },
    [queryParams, page],
  );

  useEffect(() => {
    if (!hasAccess) return;
    setSelectedIds([]);
    loadSessions();
  }, [hasAccess, loadSessions]);

  const loadUnlockStatus = useCallback(async () => {
    try {
      setUnlockStatus(await proctoringAPI.getUnlockCode());
    } catch {
      setUnlockStatus(null);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) loadUnlockStatus();
  }, [hasAccess, loadUnlockStatus]);

  // Poll for new reports: pop-up + beep, and refresh the table quietly.
  const loadSessionsRef = useRef(loadSessions);
  loadSessionsRef.current = loadSessions;
  const openDetailRef = useRef(openDetail);
  openDetailRef.current = openDetail;

  useEffect(() => {
    if (!hasAccess) return;
    let stopped = false;

    const poll = async () => {
      try {
        const data: { reported_ids: number[]; active_count: number } = await proctoringAPI.getSummary();
        if (stopped) return;
        const reportedIds = data?.reported_ids || [];
        setSummary({ reported: reportedIds.length, active: Number(data?.active_count || 0) });
        let seen = loadSeen(seenKey);
        if (seen === null) {
          seen = reportedIds;
          saveSeen(seenKey, seen);
        }
        const seenSet = new Set(seen);
        const fresh = reportedIds.filter((id) => !seenSet.has(id));
        if (fresh.length > 0) {
          saveSeen(seenKey, [...seen, ...fresh]);
          beep();
          const latest = fresh[fresh.length - 1];
          toast(
            (t) => (
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm">
                  {fresh.length === 1 ? "New proctoring report." : `${fresh.length} new proctoring reports.`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toast.dismiss(t.id);
                    openDetailRef.current(latest);
                  }}
                >
                  Open report
                </Button>
              </div>
            ),
            { duration: 15000 },
          );
        }
        loadSessionsRef.current(true);
      } catch {
        // Keep polling; a failed poll only delays alerts.
      }
    };

    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [hasAccess, seenKey]);

  const selectableRows = rows.filter((row) => !row.admitted);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.id));
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const banTargets = selectedRows.filter((row) => !row.admitted && row.conduct !== "banned");
  const unbanTargets = selectedRows.filter((row) => row.conduct === "banned");
  const actionTargets = bulkAction === "ban" ? banTargets : unbanTargets;

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? selectableRows.map((row) => row.id) : []);
  };

  const resetFilters = () => {
    setSemester(ALL);
    setDepartmentId(ALL);
    setConductFilter("all");
    setSearchText("");
    setSearch("");
    setOrdering(DEFAULT_ORDERING);
    setPage(1);
  };

  const openBulk = (action: BulkAction) => {
    setReason("");
    setBulkAction(action);
  };

  const submitBulk = async () => {
    if (!bulkAction || actionTargets.length === 0) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Please give a reason.");
      return;
    }
    setIsSubmitting(true);
    try {
      const ids = actionTargets.map((row) => row.id);
      const response =
        bulkAction === "ban" ? await proctoringAPI.ban(ids, trimmed) : await proctoringAPI.unban(ids, trimmed);
      if (bulkAction === "ban" && response?.skipped_admitted?.length) {
        toast(response.message, { icon: <AlertTriangle className="h-5 w-5 text-amber-600" />, duration: 8000 });
      } else {
        toast.success(response?.message || "Done.");
      }
      setBulkAction(null);
      setSelectedIds([]);
      await loadSessions();
    } catch (error) {
      toast.error(errorMessage(error, "The request failed. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveCode = async () => {
    const code = newCode.trim();
    if (code.length < MIN_CODE_LENGTH) {
      toast.error(`The code must have at least ${MIN_CODE_LENGTH} characters.`);
      return;
    }
    setIsSavingCode(true);
    try {
      const response = await proctoringAPI.setUnlockCode(code);
      toast.success(response?.message || "Support unlock code changed.");
      setNewCode("");
      await loadUnlockStatus();
    } catch (error) {
      toast.error(errorMessage(error, "Could not change the code."));
    } finally {
      setIsSavingCode(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h3 className="mb-2 text-lg font-semibold text-gray-800">Access Denied</h3>
          <p className="text-gray-600">You do not have permission to view proctoring reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Camera and screen checks during the written exam. Reported after more than 3 counted flags (2 if the camera
          was covered).
        </p>
        <Button type="button" variant="outline" onClick={() => loadSessions()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          className={`cursor-pointer border-2 transition-all ${
            conductFilter === "live" ? "border-[#2E3094] bg-[#2E3094]/5" : "border-gray-200 hover:border-gray-300"
          }`}
          onClick={() => {
            setConductFilter(conductFilter === "live" ? "all" : "live");
            setPage(1);
          }}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live now</p>
              <p className="mt-1 text-2xl font-bold text-[#2E3094]">{summary.active}</p>
              <p className="mt-0.5 text-xs text-slate-500">Exams in progress</p>
            </div>
            <div className="rounded-xl bg-indigo-100 p-3 text-[#2E3094]">
              <Video className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer border-2 transition-all ${
            conductFilter === "reported" ? "border-red-600 bg-red-50/60" : "border-gray-200 hover:border-gray-300"
          }`}
          onClick={() => {
            setConductFilter(conductFilter === "reported" ? "all" : "reported");
            setPage(1);
          }}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reported</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{summary.reported}</p>
              <p className="mt-0.5 text-xs text-slate-500">More than 3 counted flags (2 if camera covered)</p>
            </div>
            <div className="rounded-xl bg-red-100 p-3 text-red-700">
              <ShieldAlert className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Semester</Label>
              <Select
                value={semester}
                onValueChange={(value) => {
                  setSemester(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All semesters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All semesters</SelectItem>
                  {semesters.map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatSemesterLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Department</Label>
              <Select
                value={departmentId}
                onValueChange={(value) => {
                  setDepartmentId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={String(department.id)}>
                      {department.department_shortname || department.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Exam Conduct</Label>
              <Select
                value={conductFilter}
                onValueChange={(value) => {
                  setConductFilter(value as ConductFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {CONDUCT_FILTERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="proctoring-search" className="text-xs text-slate-600">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="proctoring-search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Name, username or application serial"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <ProctoringSortControls
            ordering={ordering}
            onOrderingChange={(value) => {
              setOrdering(value);
              setPage(1);
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
              {selectedIds.length > 0 ? (
                <span className="text-sm text-slate-600">{selectedIds.length} selected</span>
              ) : null}
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={banTargets.length === 0}
                  onClick={() => openBulk("ban")}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Ban{banTargets.length ? ` (${banTargets.length})` : ""}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={unbanTargets.length === 0}
                  onClick={() => openBulk("unban")}
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Unban{unbanTargets.length ? ` (${unbanTargets.length})` : ""}
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loadError ? (
            <p className="p-6 text-center text-sm text-red-600">{loadError}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManage ? (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                          disabled={selectableRows.length === 0}
                          aria-label="Select students on this page"
                        />
                      </TableHead>
                    ) : null}
                    <TableHead>SL</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Application Serial</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-center">Flags</TableHead>
                    <TableHead>Exam Conduct</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-center">Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 11 : 10} className="py-10 text-center text-slate-500">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 11 : 10} className="py-10 text-center text-sm text-slate-500">
                        No proctoring sessions match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => {
                      const style = CONDUCT_STYLES[row.conduct];
                      const name = row.student.full_name || row.student.username;
                      return (
                        <TableRow key={row.id} className={row.conduct === "reported" ? "bg-red-50/40" : ""}>
                          {canManage ? (
                            <TableCell>
                              {row.admitted ? (
                                <Checkbox disabled aria-label={`${name} is admitted`} />
                              ) : (
                                <Checkbox
                                  checked={selectedIds.includes(row.id)}
                                  onCheckedChange={(checked) => toggleRow(row.id, Boolean(checked))}
                                  aria-label={`Select ${name}`}
                                />
                              )}
                            </TableCell>
                          ) : null}
                          <TableCell>{(pagination.current_page - 1) * pagination.page_size + index + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium text-gray-900">{name}</p>
                            <p className="text-sm text-gray-500">@{row.student.username}</p>
                          </TableCell>
                          <TableCell className="font-medium">{row.student.f_id || "-"}</TableCell>
                          <TableCell>{row.student.department_shortname || "-"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{examLabel(row.exam)}</TableCell>
                          <TableCell>
                            {row.status === "active" ? (
                              <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-[#2E3094]">
                                In progress
                              </Badge>
                            ) : (
                              <span className="text-sm text-slate-600">Finished</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-semibold" title={flagCountLabel(row.flag_count)}>
                            {row.flag_count}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge
                                variant="outline"
                                className={style.className}
                                title={row.camera_off ? NO_CAMERA_TEXT : undefined}
                              >
                                {style.label}
                              </Badge>
                              {row.admitted ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-300 bg-emerald-100 text-emerald-800"
                                  title="Already admitted; cannot be banned."
                                >
                                  Admitted
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-slate-600">
                            {formatDateTime(row.started_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openDetail(row.id)}
                              aria-label={`Open proctoring report for ${name}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <PaginationControls
            pagination={pagination}
            onPageChange={setPage}
            isLoading={isLoading}
            itemLabel="sessions"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Support unlock code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Support staff type this code on a student's screen to turn off the full screen lock, or to let a student
            continue without a camera. It lasts until the student logs out and is recorded in the report.
          </p>
          <p className="text-sm">
            {unlockStatus === null
              ? "Status unavailable."
              : unlockStatus.is_set
                ? `Code is set. Last changed ${formatDateTime(unlockStatus.changed_at)}${
                    unlockStatus.changed_by ? ` by ${unlockStatus.changed_by}` : ""
                  }.`
                : "No code is set yet. Support unlock does not work until a code is set."}
          </p>
          {canManage ? (
            <div className="flex max-w-md flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                autoComplete="new-password"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                placeholder={`New code (at least ${MIN_CODE_LENGTH} characters)`}
                aria-label="New support unlock code"
              />
              <Button type="button" onClick={saveCode} disabled={isSavingCode || !newCode.trim()}>
                {isSavingCode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save code
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={bulkAction !== null} onOpenChange={(open) => !open && !isSubmitting && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "ban"
                ? `Ban ${actionTargets.length} student(s)?`
                : `Unban ${actionTargets.length} student(s)?`}
            </DialogTitle>
            <DialogDescription>
              {bulkAction === "ban"
                ? "A banned student becomes Not Selected in Results for this semester, even with top marks, and Override Selection is blocked until the ban is lifted. Admitted students cannot be banned."
                : "The ban is lifted and the student's result is calculated again as usual."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-y-auto rounded border border-slate-200 p-2 text-sm">
            {actionTargets.map((row) => (
              <div key={row.id}>
                {row.student.full_name || row.student.username}{" "}
                <span className="text-slate-500">(@{row.student.username})</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="proctoring-reason">Reason (required)</Label>
            <Textarea
              id="proctoring-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={bulkAction === "ban" ? "Why is this student banned?" : "Why is the ban lifted?"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkAction(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={bulkAction === "ban" ? "destructive" : "default"}
              onClick={submitBulk}
              disabled={isSubmitting || !reason.trim()}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {bulkAction === "ban" ? "Ban" : "Unban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProctoringSessionDetail sessionId={detailId} onClose={closeDetail} />
    </div>
  );
}

export default ProctoringDashboard;
