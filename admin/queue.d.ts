// Types for admin/queue.js, so the Worker's tests can check the steward page's rules.
export interface QueueReport { id: string; target_id: string; kind: string; submitted_at: string; detail?: string | null; suggested?: string | null; photo_key?: string | null }
export interface ReportGroup { target_id: string; reports: QueueReport[]; phones: number; hot: boolean }
export interface Task { id: string; target_id: string; result: string; detail: string; checked_on: string }
export declare const esc: (s: unknown) => string;
export declare const CLOSED: string[];
export declare const CONFIRM: string[];
export declare function groupReports(reports: QueueReport[], closedPhones?: Record<string, number>): ReportGroup[];
export declare function settleBody(group: ReportGroup, status: string, reason_code: string): { target_id: string; ids: string[]; status: string; reason_code: string };
export declare function taskItem(t: Task, names: Map<string, { name?: string }>): string;
