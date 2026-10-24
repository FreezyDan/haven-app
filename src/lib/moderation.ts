/**
 * Haven safety-report store.
 *
 * Frontend-only for now: reports persist in localStorage and there is no real
 * authentication or staffed moderation pipeline behind this. The data model,
 * priority rules, dedupe, and status flow below are designed so a real backend
 * can take over the same shapes later.
 */

export type SafetyCategory =
  | 'self-harm'
  | 'abuse'
  | 'threats'
  | 'immediate-danger'
  | 'severe-distress'
  | 'harassment'
  | 'hate'
  | 'spam'
  | 'sexual-content'
  | 'impersonation'
  | 'private-info'
  | 'misinformation'
  | 'ip-violation'
  | 'other';

export type ReportPriority = 'high' | 'medium' | 'low';
export type ReportStatus = 'Pending' | 'Under Review' | 'Escalated' | 'Resolved';

export const SAFETY_CATEGORIES: {
  key: SafetyCategory;
  label: string;
  description: string;
  priority: ReportPriority;
}[] = [
  {
    key: 'self-harm',
    label: 'Possible self-harm or suicide risk',
    description: 'The post suggests someone may be thinking about harming themselves.',
    priority: 'high',
  },
  {
    key: 'immediate-danger',
    label: 'Immediate danger',
    description: 'Someone appears to be in danger right now.',
    priority: 'high',
  },
  {
    key: 'threats',
    label: 'Threats or violence',
    description: 'The post contains threats toward the author or someone else.',
    priority: 'high',
  },
  {
    key: 'abuse',
    label: 'Abuse or exploitation',
    description: 'The post describes or involves abuse, coercion, or exploitation.',
    priority: 'medium',
  },
  {
    key: 'severe-distress',
    label: 'Severe emotional distress',
    description: 'The author seems to be in overwhelming distress and may need urgent care.',
    priority: 'medium',
  },
  {
    key: 'other',
    label: 'Other safety concern',
    description: 'Something else about this post worries you.',
    priority: 'low',
  },
  /* General content-report categories (Report flow) */
  { key: 'harassment', label: 'Harassment or bullying', description: 'Targeted insults, mocking, or repeated unwanted contact.', priority: 'medium' },
  { key: 'hate', label: 'Hate speech or discrimination', description: 'Attacks based on identity.', priority: 'high' },
  { key: 'spam', label: 'Spam or scam', description: 'Misleading links or self-promotion.', priority: 'low' },
  { key: 'sexual-content', label: 'Sexual or explicit content', description: 'Nudity or unwanted sexual advances.', priority: 'medium' },
  { key: 'impersonation', label: 'Impersonation', description: 'Pretending to be someone else.', priority: 'medium' },
  { key: 'private-info', label: 'Sharing private information', description: 'Doxxing or personal details without consent.', priority: 'high' },
  { key: 'misinformation', label: 'Misinformation', description: 'Knowingly false or harmful claims.', priority: 'low' },
  { key: 'ip-violation', label: 'Intellectual property violation', description: 'Stolen content or art.', priority: 'low' },
];

export interface SafetyReport {
  id: string;
  postId: string;
  postSnapshot: { author: string; title: string; body: string };
  category: SafetyCategory;
  context: string;
  priority: ReportPriority;
  status: ReportStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  /** Opaque per-browser reporter tag — never tied to a profile or name. */
  reporterRef: string;
  /** Moderator action log, oldest first. */
  history: { at: string; action: string }[];
}

const REPORTS_KEY = 'haven.safetyReports';
const REPORTER_KEY = 'haven.reporterRef';

function readReports(): SafetyReport[] {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? '[]') as SafetyReport[];
  } catch {
    return [];
  }
}

function writeReports(reports: SafetyReport[]) {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch {
    /* storage full */
  }
}

/** Opaque anonymous reporter tag — protects reporter privacy by design. */
export function getReporterRef(): string {
  let ref = localStorage.getItem(REPORTER_KEY);
  if (!ref) {
    ref = `anon-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(REPORTER_KEY, ref);
  }
  return ref;
}

export function listReports(): SafetyReport[] {
  return readReports().sort((a, b) => {
    const rank: Record<ReportPriority, number> = { high: 0, medium: 1, low: 2 };
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function getOpenReportCount(): number {
  return readReports().filter((r) => r.status !== 'Resolved').length;
}

/**
 * File a safety report. Duplicate submissions from this browser for the same
 * post and category are refused while an earlier report is still open.
 */
export function fileSafetyReport(input: {
  postId: string;
  postSnapshot: SafetyReport['postSnapshot'];
  category: SafetyCategory;
  context: string;
}): { report: SafetyReport | null; duplicate: boolean } {
  const reports = readReports();
  const reporterRef = getReporterRef();
  const duplicate = reports.some(
    (r) =>
      r.postId === input.postId &&
      r.category === input.category &&
      r.reporterRef === reporterRef &&
      r.status !== 'Resolved',
  );
  if (duplicate) return { report: null, duplicate: true };

  const def = SAFETY_CATEGORIES.find((c) => c.key === input.category);
  const now = new Date().toISOString();
  const report: SafetyReport = {
    id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    postId: input.postId,
    postSnapshot: input.postSnapshot,
    category: input.category,
    context: input.context.trim().slice(0, 1000),
    priority: def?.priority ?? 'low',
    status: 'Pending',
    createdAt: now,
    updatedAt: now,
    reporterRef,
    history: [{ at: now, action: 'Report filed' }],
  };
  writeReports([report, ...reports]);
  return { report, duplicate: false };
}

export function updateReportStatus(id: string, status: ReportStatus, note?: string): SafetyReport[] {
  const now = new Date().toISOString();
  const reports = readReports().map((r) =>
    r.id === id
      ? {
          ...r,
          status,
          updatedAt: now,
          history: [...r.history, { at: now, action: note ?? `Status changed to ${status}` }],
        }
      : r,
  );
  writeReports(reports);
  return reports;
}

/** Log a moderator action (e.g. contacted the author) without changing status. */
export function logReportAction(id: string, action: string): SafetyReport[] {
  const now = new Date().toISOString();
  const reports = readReports().map((r) =>
    r.id === id ? { ...r, updatedAt: now, history: [...r.history, { at: now, action }] } : r,
  );
  writeReports(reports);
  return reports;
}
