// Transit tab content. Every fact and link below was read on the owner's official page on the
// `checked` date (sources in docs/02). Fares and phone numbers change: re-check before a release.
// We link out to trip planners rather than embed them: the app sends nothing about the rider.
// Text here is English-only content, like listings; UI chrome lives in strings/en.json.

interface Section {
  title: string; body?: string;
  facts?: { icon: string; text: string }[];
  phones?: { label: string; number: string }[];
  links?: { label: string; url: string }[];
}

export const TRANSIT: { checked: string; sections: Section[]; bike: { body: string; label: string; url: string } } = {
  checked: '2026-09-18',
  sections: [
    { title: 'Plan a trip', body: 'See which bus to take and when it comes.',
      links: [
        { label: 'DDOT trip planner', url: 'http://myddotbus.com/map?selector=tripplanner' },
        { label: 'When is my bus coming?', url: 'http://www.myddotbus.com/home' },
        { label: 'Transit app', url: 'https://transitapp.com/' },
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
        { label: 'People Mover (free)', url: 'https://www.thepeoplemover.com/' },
        { label: 'QLINE streetcar (free)', url: 'https://qlinedetroit.com/' },
        { label: 'SMART trip planner', url: 'https://www.smartbus.org/Schedules/Trip-Planner' },
      ] },
  ],
  bike: { body: 'MoGo bike share has a $5 a year pass for people who get food assistance, Medicaid, or other state benefits. You sign up with MoGo, not here.', label: 'MoGo Access Pass', url: 'https://mogodetroit.org/pricing/' },
};
