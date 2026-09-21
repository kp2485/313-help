// Transit tab content. Every fact and link below was read on the owner's official page on the
// `checked` date (sources in docs/02). Fares and phone numbers change: re-check before a release.
// We link out to trip planners rather than embed them: the app sends nothing about the rider.
// Text here is English-only content, like listings; UI chrome lives in strings/en.json.

interface Section {
  title: string; body?: string;
  facts?: { icon: string; text: string }[];
  phones?: { label: string; number: string }[];
  /** `system` marks the one link that is an owner's own trip planner (or, for the two free rail lines, its own
   *  site): the subway map style's route card carries the same link, so there is one source of truth. */
  links?: { label: string; url: string; system?: 'ddot' | 'smart' | 'qline' | 'dpm' }[];
}

export const TRANSIT: { checked: string; sections: Section[]; bike: { body: string; label: string; url: string } } = {
  // Not moved to 2026-09-20: only the Transit app's label changed that day. The fares and phone numbers below
  // were last read on the date here, and this date is what the screen shows.
  checked: '2026-09-18',
  sections: [
    // The Transit app's own words for what it does, and nothing about a partnership: SMART's page lists it among
    // third-party apps that get SMART data, and DDOT's page could not be read (research/2026-09-20/transit-app.md).
    { title: 'Plan a trip', body: 'See which bus to take and when it comes.',
      links: [
        { label: 'DDOT trip planner', url: 'http://myddotbus.com/map?selector=tripplanner', system: 'ddot' },
        { label: 'When is my bus coming?', url: 'http://www.myddotbus.com/home' },
        { label: 'Transit app: live DDOT and SMART buses on your phone', url: 'https://transitapp.com/' },
        { label: 'Bus routes and schedules', url: 'https://detroitmi.gov/departments/detroit-department-transportation/bus-schedules' },
      ] },
    { title: 'What it costs', body: 'One pass works on DDOT and SMART buses.',
      facts: [
        { icon: 'ticket', text: '4 hours: $2. All day: $5. 7 days: $22. 31 days: $70.' },
        { icon: 'ticket', text: 'Age 65 and up, people with disabilities, and people on Medicare pay less: 50 cents for 4 hours. You need a reduced fare ID from Rosa Parks Transit Center.' },
        { icon: 'people', text: 'Students in kindergarten through 12th grade ride DDOT free. Small children ride free with an adult.' },
        { icon: 'check', text: 'The People Mover and the QLINE streetcar are free to ride.' },
      ],
      links: [
        { label: 'Fares and how to pay', url: 'https://detroitmi.gov/departments/detroit-department-transportation/transportation-fares' },
        { label: 'Where to buy a pass', url: 'https://detroitmi.gov/webapp/where-buy-transit-passes-map' },
        { label: 'Buy a pass on your phone (Token Transit)', url: 'https://tokentransit.com/app' },
      ] },
    { title: 'Talk to a person',
      phones: [
        { label: 'DDOT customer service', number: '313-933-1300' },
        { label: 'DDOT Paratransit rides', number: '313-774-5555' },
        { label: 'SMART suburban buses', number: '866-962-5515' },
      ] },
    { title: 'Other ways to get around',
      links: [
        { label: 'People Mover (free)', url: 'https://www.thepeoplemover.com/', system: 'dpm' },
        { label: 'QLINE streetcar (free)', url: 'https://qlinedetroit.com/', system: 'qline' },
        { label: 'SMART trip planner', url: 'https://www.smartbus.org/Schedules/Trip-Planner', system: 'smart' },
      ] },
  ],
  bike: { body: 'MoGo bike share has a $5 a year pass for people who get food assistance, Medicaid, or other state benefits. You sign up with MoGo, not here.', label: 'MoGo Access Pass', url: 'https://mogodetroit.org/pricing/' },
};

/** The address the Map tab already gives for an agency's trip planner, by the `system` a `.net.json` file names. */
export const plannerFor = (system: string): string | undefined => TRANSIT.sections.flatMap((s) => s.links ?? []).find((l) => l.system === system)?.url;
