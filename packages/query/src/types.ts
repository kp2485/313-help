// Shapes shared by the pipeline (which writes the bundle) and the clients (which read it).
// Spec: schema/query-spec.md. Fixtures: schema/fixtures/*.json.

export type Availability = 'scheduled' | 'always' | 'call_first' | 'unknown';
export type RowStatus = 'active' | 'suspended' | 'archived';
export type VerifyMethod = 'phone' | 'in_person' | 'web' | 'community_confirm' | 'owner_attest' | 'auto_check';
export type SourceType =
  | 'watched_page' | 'open_data' | 'partner_feed' | 'press_release'
  | 'seed_list' | 'community' | 'owner_feed';

/** HSDS schedule fields, wall-clock in America/Detroit. Dates are YYYY-MM-DD, times HH:MM (24h). */
export interface Schedule {
  freq?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  /** Comma-separated iCal BYDAY: "MO,WE" or "2TU" or "-1FR". */
  byday?: string;
  /** Comma-separated days of month: "1,15". */
  bymonthday?: string;
  dtstart: string;
  until?: string;
  valid_from?: string;
  valid_to?: string;
  opens_at: string;
  /** If closes_at <= opens_at the window runs past midnight into the next day. */
  closes_at: string;
  description?: string;
}

/** Dated facts. The device turns these into a badge; nothing here is a verdict. */
export interface Facts {
  checked_at_entry?: string | null;
  entry_method?: VerifyMethod | null;
  last_confirmed_at?: string | null;
  last_confirm_method?: VerifyMethod | null;
  reports: {
    /** Open closed/moved reports (distinct nonces). */
    closed_open: number;
    closed_last_at?: string | null;
    /** Different phones that said "still open" after the latest closed report (review 18). */
    open_after_closed?: number;
    /** Open wrong hours/phone/info reports. */
    wrong_open: number;
  };
  source: { type: SourceType; name: string; url?: string; last_edited?: string | null };
}

export interface BundleRow {
  id: string;
  name: string;
  org: string;
  category: string;
  what: string;
  eligibility?: string;
  address?: { line1: string; city: string; zip?: string };
  lat?: number;
  lon?: number;
  phones: { number: string; label?: string }[];
  website?: string;
  availability: Availability;
  /** Hours exactly as the source states them, when we could not turn them into a schedule. Shown as-is; never used for open-now. */
  hours_text?: string;
  /** Short plain-language heads-up, e.g. "Enrollment is full. You can join the waitlist." */
  notice?: string;
  schedules: Schedule[];
  flags: string[];
  languages?: string[];
  status: RowStatus;
  archived?: { at: string; reason: string; replacement_id?: string } | null;
  facts: Facts;
}

export interface Alert {
  id: string;
  kind: 'activation' | 'cancellation' | 'notice';
  category: string;
  title: string;
  body_plain?: string;
  /** ISO instants with offset. */
  starts_at: string;
  ends_at: string;
  /** Row ids (sal_) this alert applies to. Cancellations suppress their occurrences. */
  targets?: string[];
  locations?: string[];
  actions?: { label: string; tel?: string; url?: string }[];
  source?: { type: string; url?: string };
  status: 'draft' | 'published' | 'expired' | 'retracted';
}

/** Minutes on a floating Detroit wall clock (as if the wall time were UTC). */
export type WallMinutes = number;

export interface Occurrence {
  date: string;       // local date the window opens
  opens_at: string;
  closes_at: string;
  start: WallMinutes;
  end: WallMinutes;
  /** This window opens on a holiday, so its hours are the usual ones and not a promise. Labelled, never dropped. */
  holiday?: boolean;
}

export type OpenState = 'open' | 'closes_soon' | 'closed' | 'call_first' | 'unknown' | 'not_listed' | 'holiday';

export interface OpenResult {
  state: OpenState;
  /** Wall-clock HH:MM the current window closes (open/closes_soon only). */
  closes_at?: string;
  minutes_left?: number;
  next?: { date: string; opens_at: string; closes_at: string } | null;
  /** True when a window that would be open right now was cancelled by an alert. */
  cancelled_now?: boolean;
  /** `holiday` only: what the schedule says about today, offered as usual hours and never as "open". */
  usual_hours?: { opens_at: string; closes_at: string };
}

export type BadgeLevel =
  | 'confirmed' | 'entry_checked' | 'source_listed' | 'never_checked'
  | 'reported_once' | 'reported_closed' | 'archived';

export interface Badge {
  level: BadgeLevel;
  /** Key into strings/en.json; params fill the template. Text never lives in code. */
  key: string;
  params: Record<string, string | number>;
  /** 0 is freshest. Used as a sort key only; never shown. */
  tier: number;
}
