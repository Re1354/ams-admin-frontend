import { Link } from "react-router-dom";

import { Badge } from "./ui/badge";
import { useAuth } from "../contexts/AuthContext";
import { useMenu } from "../contexts/MenuContext";

export type ExamConductStatus = "clear" | "reported" | "banned" | "not_monitored";

export interface ExamConduct {
  status: ExamConductStatus;
  flag_count: number;
  session_id: number | null;
}

export const PROCTORING_LINK = "/proctoring";

export const CONDUCT_STYLES: Record<ExamConductStatus, { label: string; className: string }> = {
  clear: { label: "Clear", className: "bg-green-100 text-green-800 border-green-300" },
  reported: { label: "Reported", className: "bg-red-100 text-red-700 border-red-300" },
  banned: { label: "Banned", className: "bg-red-900 text-white border-red-950" },
  not_monitored: { label: "Not monitored", className: "bg-slate-100 text-slate-600 border-slate-300" },
};

export function flagCountLabel(count: number): string {
  return count === 1 ? "1 flag" : `${count} flags`;
}

/** True when the signed-in user may open the Proctoring menu. */
export function useCanOpenProctoring(): boolean {
  const { menuItems } = useMenu();
  const { isSuperAdmin } = useAuth();
  if (isSuperAdmin) {
    return true;
  }
  return menuItems.some((item) => item.link === PROCTORING_LINK && item.permissions?.read);
}

interface ExamConductBadgeProps {
  conduct?: ExamConduct | null;
  /** Link to the student's proctoring report when the user can open the Proctoring menu. */
  linkToReport?: boolean;
}

/**
 * Read-only "Exam Conduct" value for the result boards.
 * A missing value (older backend, or no proctoring data) shows "Not monitored", never "Clear".
 */
export function ExamConductBadge({ conduct, linkToReport = true }: ExamConductBadgeProps) {
  const canOpen = useCanOpenProctoring();
  const status: ExamConductStatus =
    conduct && conduct.status in CONDUCT_STYLES ? conduct.status : "not_monitored";
  const style = CONDUCT_STYLES[status];
  const flagCount = Number(conduct?.flag_count ?? 0);
  const title = status === "not_monitored" ? "No proctoring session" : flagCountLabel(flagCount);

  const badge = (
    <Badge variant="outline" className={`whitespace-nowrap ${style.className}`} title={title}>
      {style.label}
    </Badge>
  );

  if (linkToReport && canOpen && conduct?.session_id) {
    return (
      <Link
        to={`${PROCTORING_LINK}?session=${conduct.session_id}`}
        className="inline-block hover:opacity-80"
        aria-label={`${style.label}: open proctoring report`}
      >
        {badge}
      </Link>
    );
  }
  return badge;
}

export default ExamConductBadge;
