import { p, readCsv, writeCsv, type CsvRow } from './util.js';

export const RESOURCE_COLUMNS = [
  'sal_id', 'svc_id', 'org_id', 'org_name', 'service_name', 'location_name', 'category', 'what', 'eligibility',
  'address_1', 'city', 'zip', 'lat', 'lon', 'phone', 'phone_label', 'phone2', 'phone2_label', 'phone2_source_url', 'website',
  'availability', 'hours_text', 'flags', 'notice', 'status', 'checked_at_entry', 'entry_method',
  'source_type', 'source_name', 'source_url', 'internal_note',
];
export const RESOURCES = p('data/seed/resources.csv');
export const readResources = (): CsvRow[] => readCsv(RESOURCES);
export const writeResources = (rows: CsvRow[]) => writeCsv(RESOURCES, rows, RESOURCE_COLUMNS);

/**
 * Hosts that refuse this pipeline's fetcher, kept as data because a steward adds to it when a site starts
 * refusing — never a list inside the code. A page on one of these can only be read by a person in a browser,
 * so a row entered on or after `refusing_since` can never honestly claim entry_method "auto_check"
 * (validate.ts checks exactly that, and pipeline/src/page-match.ts explains what "could not be read" means).
 */
export const SCRIPT_REFUSING_HOSTS = p('data/seed/script-refusing-hosts.csv');
export const readScriptRefusingHosts = (): CsvRow[] => readCsv(SCRIPT_REFUSING_HOSTS);
