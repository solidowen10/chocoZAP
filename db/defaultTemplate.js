// db/defaultTemplate.js
// The default 5-stage pipeline with sub-steps, seeded for every new org.
// Admins can rename, reorder, add, or remove stages/sub-steps afterward
// via the Admin > Pipeline screen -- nothing here is hard-coded elsewhere.

module.exports = [
  {
    key: 'scouting',
    name: 'Scouting',
    color: '#8b5cf6',
    substeps: [
      'Target district identified',
      'Candidate sites shortlisted',
      'Site visits completed',
      'Foot traffic / catchment analysis',
      'Landlord contact made',
    ],
  },
  {
    key: 'confirmed',
    name: 'Confirmed',
    color: '#3b82f6',
    substeps: [
      'Lease terms agreed',
      'Lease signed',
      'Deposit paid',
      'Site handover date set',
    ],
  },
  {
    key: 'planning',
    name: 'Planning',
    color: '#f59e0b',
    substeps: [
      'Floor plan drafted',
      'Equipment list finalized',
      'Budget approved',
      'Contractor selected',
      'Permits filed',
    ],
  },
  {
    key: 'building',
    name: 'Building',
    color: '#ef4444',
    substeps: [
      'Demolition / prep complete',
      'Electrical & plumbing rough-in',
      'Flooring installed',
      'Equipment delivered',
      'Equipment installed',
      'Signage installed',
      'Final inspection passed',
    ],
  },
  {
    key: 'grand_opening',
    name: 'Grand Opening',
    color: '#10b981',
    substeps: [
      'Staff hired & trained',
      'Soft opening completed',
      'Marketing launch',
      'Grand opening event',
      'Handover to operations team',
    ],
  },
];
