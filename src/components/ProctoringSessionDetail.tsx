import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { CONDUCT_STYLES, type ExamConductStatus } from "./ExamConductBadge";
import { proctoringAPI } from "../services/api";

export const RULE_LABELS: Record<string, string> = {
  LOOK_AWAY: "Looked away from the screen",
  MULTIPLE_PEOPLE: "More than one person",
  PHONE: "Mobile phone",
  OTHER_DEVICE: "Other device",
  BOOK: "Book",
  TAB_SWITCH: "Left the exam window",
  FULLSCREEN_EXIT: "Left full screen",
  CAMERA_OFF: "Camera off or covered",
  LEFT_EXAM: "Left the exam page",
  PROCTORING_OFFLINE: "Proctoring offline (not counted)",
  SUPPORT_UNLOCK: "Support unlock (not counted)",
};

const UNLOCK_PURPOSE_LABELS: Record<string, string> = {
  fullscreen: "Full screen lock turned off",
  camera: "Continued without camera",
};

export interface ProctoringStudent {
  id: number;
  username: string;
  full_name: string | null;
  f_id: string | null;
  department_shortname: string | null;
}

export interface ProctoringExam {
  id: number;
  department: string | null;
  semester: string | null;
  faculty: string | null;
}

export interface ProctoringSessionRow {
  id: number;
  student: ProctoringStudent;
  exam: ProctoringExam;
  status: "active" | "finished";
  flag_count: number;
  conduct: ExamConductStatus;
  /** Taken without camera (support staff code): conduct is "not monitored". */
  camera_off?: boolean;
  admitted: boolean;
  started_at: string;
  ended_at: string | null;
  reported_at: string | null;
}

interface ProctoringFlag {
  id: number;
  code: string;
  counted: boolean;
  detail: Record<string, unknown> | null;
  occurred_at: string;
  has_snapshot: boolean;
}

interface ProctoringBanRow {
  id: number;
  exam_id: number;
  reason: string;
  banned_by: string | null;
  banned_at: string;
  lifted_at: string | null;
  lifted_by: string | null;
  lift_reason: string;
}

interface ProctoringSessionDetailData extends ProctoringSessionRow {
  consent_at: string | null;
  user_agent: string;
  flags: ProctoringFlag[];
  unlock_events: { id: number; purpose: string; created_at: string }[];
  bans: ProctoringBanRow[];
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString();
}

export function examLabel(exam: ProctoringExam): string {
  return [exam.department, exam.semester].filter(Boolean).join(", ") || `Exam ${exam.id}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
  }
  return typeof error === "string" ? error : fallback;
}

/** Loads one snapshot through the authenticated API and shows it from an object URL. */
function SnapshotImage({ flagId, alt }: { flagId: number; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    proctoringAPI
      .getSnapshotBlob(flagId)
      .then((blob: Blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [flagId]);

  if (failed) {
    return <span className="text-xs text-slate-400">Photo unavailable</span>;
  }
  if (!url) {
    return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} className="w-40 rounded border border-slate-200" />
    </a>
  );
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <>-</>;
  }
  if (typeof value === "number") {
    return <>{Number.isInteger(value) ? value : value.toFixed(2)}</>;
  }
  if (typeof value === "object") {
    return <>{JSON.stringify(value)}</>;
  }
  return <>{String(value)}</>;
}

interface ProctoringSessionDetailProps {
  sessionId: number | null;
  onClose: () => void;
}

export function ProctoringSessionDetail({ sessionId, onClose }: ProctoringSessionDetailProps) {
  const [data, setData] = useState<ProctoringSessionDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (sessionId === null) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    setIsLoading(true);
    setError(null);
    proctoringAPI
      .getSession(sessionId)
      .then((body: ProctoringSessionDetailData) => active && setData(body))
      .catch((err: unknown) => active && setError(errorMessage(err, "Could not load this report.")))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [sessionId]);

  const conduct = data ? CONDUCT_STYLES[data.conduct] : null;

  return (
    <Dialog open={sessionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="proctoring-print w-[96vw] max-w-5xl sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .proctoring-print, .proctoring-print * { visibility: visible !important; }
            .proctoring-print {
              position: absolute !important; left: 0 !important; top: 0 !important;
              transform: none !important; width: 100% !important; max-width: none !important;
              max-height: none !important; overflow: visible !important; box-shadow: none !important;
              border: none !important;
            }
            .proctoring-no-print { display: none !important; }
          }
        `}</style>
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle>
                Proctoring report: {data?.student.full_name || data?.student.username || "..."}
              </DialogTitle>
              <DialogDescription>
                {data
                  ? `Username ${data.student.username} | Application Serial ${data.student.f_id || "-"} | ${examLabel(data.exam)}`
                  : "Loading report"}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="proctoring-no-print"
              onClick={() => window.print()}
              disabled={!data}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print report
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading report...
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="w-36 text-slate-500">Exam Conduct</span>
                {conduct ? (
                  <Badge variant="outline" className={conduct.className}>
                    {conduct.label}
                  </Badge>
                ) : null}
                {data.admitted ? (
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
                    Admitted
                  </Badge>
                ) : null}
              </div>
              {data.camera_off ? (
                <div className="flex gap-2 sm:col-span-2">
                  <span className="w-36 shrink-0 text-slate-500">Camera</span>
                  <span className="font-medium text-slate-700">Off (support staff code)</span>
                </div>
              ) : null}
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Session</span>
                <span>{data.status === "active" ? "In progress" : "Finished"}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Counted flags</span>
                <span>
                  <strong>{data.flag_count}</strong>{" "}
                  <span className="text-slate-500">(reported after more than 3)</span>
                </span>
              </div>
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Reported at</span>
                <span>{formatDateTime(data.reported_at)}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Consent given</span>
                <span>{formatDateTime(data.consent_at)}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Started</span>
                <span>{formatDateTime(data.started_at)}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Ended</span>
                <span>{formatDateTime(data.ended_at)}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-36 text-slate-500">Department</span>
                <span>{data.student.department_shortname || "-"}</span>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <span className="w-36 shrink-0 text-slate-500">Browser</span>
                <span className="break-all text-xs text-slate-500">{data.user_agent || "-"}</span>
              </div>
            </div>

            {data.bans.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Ban history</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Banned</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Lifted</TableHead>
                      <TableHead>Lift reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bans.map((ban) => (
                      <TableRow key={ban.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateTime(ban.banned_at)}
                          {ban.banned_by ? <div className="text-slate-500">by {ban.banned_by}</div> : null}
                        </TableCell>
                        <TableCell className="text-xs">{ban.reason}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {ban.lifted_at ? (
                            <>
                              {formatDateTime(ban.lifted_at)}
                              {ban.lifted_by ? <div className="text-slate-500">by {ban.lifted_by}</div> : null}
                            </>
                          ) : (
                            <span className="font-medium text-red-700">Active</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{ban.lift_reason || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {data.unlock_events.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Support unlocks</h3>
                <ul className="space-y-1 text-sm">
                  {data.unlock_events.map((event) => (
                    <li key={event.id}>
                      <span className="text-slate-500">{formatDateTime(event.created_at)}</span>{" "}
                      {UNLOCK_PURPOSE_LABELS[event.purpose] || event.purpose}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Timeline</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Measured</TableHead>
                    <TableHead>Photo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.flags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                        No flags recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.flags.map((flag, index) => (
                      <TableRow key={flag.id} className={flag.counted ? "" : "text-slate-400"}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatTime(flag.occurred_at)}</TableCell>
                        <TableCell>{RULE_LABELS[flag.code] || flag.code}</TableCell>
                        <TableCell className="text-xs">
                          {flag.detail && Object.keys(flag.detail).length > 0
                            ? Object.entries(flag.detail).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-slate-500">{key}:</span> <DetailValue value={value} />
                                </div>
                              ))
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {flag.has_snapshot ? (
                            <SnapshotImage flagId={flag.id} alt={`Snapshot at ${formatTime(flag.occurred_at)}`} />
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default ProctoringSessionDetail;
