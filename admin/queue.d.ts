// Types for admin/queue.js, so the Worker's tests can check the steward page's rules.
export interface QueueReport { id: string; target_id: string; kind: string; submitted_at: string; detail?: string | null; suggested?: string | null; photo_key?: string | null }
export interface ReportGroup { target_id: string; reports: QueueReport[]; phones: number; hot: boolean; owner_at: string | null }
/** A listing as the steward page knows it from the bundle, for asking the people who run it (docs/14). */
export interface AskRow { id: string; name: string; category: string; source_url?: string; website?: string; scheduled?: boolean }
export interface OwnerLink { target_id: string; made_at: string; expires_at: string; used_at: string | null; answer: string | null }
export declare const askable: (row: AskRow) => boolean;
export declare const cadenceDays: (row: AskRow) => number;
export declare function ownerDue(rows: AskRow[], links: OwnerLink[], now: Date): { row: AskRow; last: OwnerLink | null }[];
export declare function ownerEmail(name: string, link: string, expiresAt: string, sourceUrl: string): string;
export interface Task { id: string; target_id: string; result: string; detail: string; checked_on: string }
export declare const esc: (s: unknown) => string;
export declare const CLOSED: string[];
export declare const CONFIRM: string[];
export declare function groupReports(reports: QueueReport[], closedPhones?: Record<string, number>, ownerSaidOpen?: Record<string, string>): ReportGroup[];
export declare function settleBody(group: ReportGroup, status: string, reason_code: string): { target_id: string; ids: string[]; status: string; reason_code: string };
export declare function taskItem(t: Task, names: Map<string, { name?: string }>): string;
