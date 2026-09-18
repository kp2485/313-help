// "Help paying for food" (docs/05): programs, not places, so these are link-outs to the owner's own site
// (docs/02: "Link-outs, not locations"). Each page was opened on the `checked` date. We state only what the
// owner's page says, and we never ask anything about the person: applying happens on the State's site.

export const FOOD_BENEFITS: { checked: string; items: { title: string; body: string; label: string; url: string }[] } = {
  checked: '2026-09-18',
  items: [
    { title: 'Food money on a Bridge Card (SNAP)', body: 'Money each month to buy groceries. You apply with the State of Michigan.',
      label: 'Apply on MI Bridges', url: 'https://newmibridges.michigan.gov/' },
    { title: 'WIC', body: 'Healthy food and support if you are pregnant or have a child under 5.',
      label: 'Michigan WIC', url: 'https://www.michigan.gov/mdhhs/assistance-programs/wic' },
    { title: 'Double Up Food Bucks', body: 'If you have a Bridge Card, you get twice the fruits and vegetables at stores and markets that take part.',
      label: 'Find a Double Up location', url: 'https://doubleupfoodbucks.org/' },
  ],
};
