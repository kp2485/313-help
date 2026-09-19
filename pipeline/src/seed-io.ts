import { p, readCsv, writeCsv, type CsvRow } from './util.js';

export const RESOURCE_COLUMNS = [
  'sal_id', 'svc_id', 'org_id', 'org_name', 'service_name', 'location_name', 'category', 'what', 'eligibility',
  'address_1', 'city', 'zip', 'lat', 'lon', 'phone', 'phone_label', 'phone2', 'phone2_label', 'website',
  'availability', 'hours_text', 'flags', 'notice', 'status', 'checked_at_entry', 'entry_method',
  'source_type', 'source_name', 'source_url', 'internal_note',
];
export const RESOURCES = p('data/seed/resources.csv');
export const readResources = (): CsvRow[] => readCsv(RESOURCES);
export const writeResources = (rows: CsvRow[]) => writeCsv(RESOURCES, rows, RESOURCE_COLUMNS);
