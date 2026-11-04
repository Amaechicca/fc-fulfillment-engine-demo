/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PLACEHOLDER DATA — every row in this file is FAKE SAMPLE DATA.          ║
 * ║  Names like "Example Member 3" are not people. Links point at EXAMPLE    ║
 * ║  ids that open nothing real. Numbers are made up.                        ║
 * ║                                                                          ║
 * ║  Real data is injected at publish time from data/sf-data.real.js, which  ║
 * ║  is gitignored and must NEVER be committed. See ../README.md.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The page reads exactly one global: window.SF_DATA. The schema is below and
 * is checked by validateData() in js/sf-model.js (also run by `npm test` and by
 * scripts/bundle.mjs before a publish).
 *
 * SCHEMA (schemaVersion 2)
 * ------------------------
 * placeholder   boolean   true here. The page shows a "Sample data" banner while true.
 * schemaVersion 2
 * region        string    "South Florida"
 * director      string    first name shown in the greeting
 * generatedAt   ISO time  when this file was produced
 *
 * sources[]     one per communication source (a building each in the town)
 *   id          'gmail' | 'slack' | 'fathom' | 'ghl' | 'whatsapp' | 'plaud'
 *   name, role  display name and one-line purpose
 *   asOf        ISO time of the last successful data read from it (null = never)
 *   future      true = not built yet (Plaud). Always shown "not connected".
 *   check       the LAST health check. There is no heartbeat: nothing is ever shown as "online now".
 *     ranAt     ISO time it ran (null = never ran)
 *     live      true only if it actually called the source (not a cache, export or inference)
 *     succeeded true / false / null
 *     detail    what was checked, in words
 *     axes      optional, tracked separately where the check supports it, each true / false / null:
 *               { authenticated, reachable, contentReadable, ingesting }
 *     → the page shows exactly one of:
 *       "Last verified reachable <time>"   live check succeeded (no matter how long ago: never "online")
 *       "Signed in; content unreadable"    authenticated but contentReadable false (GHL always, when its check succeeds)
 *       "Offline (check failed at <time>)" live check failed, or authenticated/reachable is false
 *       "Status unknown"                   never checked, not a live check, or no result
 *       "Not connected (coming soon)"      future: true (Plaud)
 *   coverage    { complete: boolean, note } — complete:false shows a warning. GHL always
 *               shows "content coverage incomplete" no matter what this says.
 *
 * items[]       queue items. Rows that share an issueKey are the SAME issue seen in several
 *               sources; the page merges them into one item (sources listed together).
 *   id, issueKey
 *   queue       'to_send' | 'pending' | 'new_members' | 'at_risk'
 *   member      member name (hidden behind "Member A/B/…" while Hide names is on)
 *   summary     one or two sentences. Do not put names here; write {member} instead.
 *   state       message status: 'to-send' | 'draft-ready' | 'held' | 'queued' | 'sent' | 'error'
 *               (required for to_send / pending). ONLY the data sets this: the page never changes
 *               it, not after Send and not after Save.
 *   hold_reason why it is held (required when state is 'held'; Send is disabled and this shows)
 *   error       what went wrong (state 'error')
 *   -- message fields (the Send / Save payload, see README "window.SF_ACTIONS") --
 *   draft_id    the real draft's id (null when there is no draft, e.g. already sent)
 *   thread_id   the conversation id
 *   recipient   who it goes to
 *   account     which mailbox / workspace it goes out from
 *   body        the full visible draft text
 *   version     content hash of body: 'sha256:' + first 16 hex chars of SHA-256(UTF-8 body).
 *               The page recomputes it and disables Send if it does not match.
 *   dedup_key   draft_id + ':' + version (so a wrapper can refuse a double send of the same text)
 *   --
 *   channel     the channel the message goes out on / came in on (a source id)
 *   source      the source this row was read from (a source id)
 *   asOf        ISO time this row was read
 *   threadUrl   link to the conversation (optional)
 *   sentAt      ISO time sent (pending items)
 *   severity    'high' | 'medium' | 'low' (at_risk)
 *   overdue     boolean (new_members: onboarding step late)
 *   nextStep    what to do next, in words
 *   facts[]     optional [{ label, value }] shown on the situation card
 *
 * renewal       the renewal race. Progress comes ONLY from renewed vs churned counts.
 *   target      75 (percent). The goal is ABOVE the target: exactly 75% is not achieved.
 *   current     { label, periodStart, periodEnd, renewed, churned, open, source, asOf }
 *   prior       { label, month, renewed, churned, source, asOf }   (last COMPLETED month)
 *   decided rate = renewed / (renewed + churned). Message counts never enter it. The goal is met
 *   only when the rate is strictly above target. There is no minimum sample size.
 *   earlySample optional boolean on current/prior: shows a "tiny early sample" label next to the
 *               rate. A label only: it never changes, hides or gates the rate or the goal.
 *
 * audits[]      { id, at, check, result: 'pass' | 'fail', source, detail }
 *
 * events        two tracks that are never merged:
 *   rd[]        Regional Director events. These do NOT go on the club app.
 *   club[]      main club events (the ones on the club app)
 *     each      { id, title, startsAt, location, themes[], status: 'scheduled'|'confirmed'|'canceled'|'held',
 *                 source, asOf }
 *   feedback[]  member feedback signals the suggestion panel clusters by theme:
 *               { id, member, verified (is a verified member), theme, channel (source id), at, note }
 *   cluster     { minMembers: 3, windowDays: 60 } — a HEURISTIC (rule of thumb, not a rule) for when
 *               a theme in feedback is strong enough to suggest an event. Themes below it show as
 *               "early signal" with their evidence and no proposed event.
 *   ideas[]     event ideas per theme, used ONLY when that theme's feedback meets the heuristic:
 *               { theme, title, why, proposedStart, proposedEnd, format, mayBringNewMembers }
 *   asOf, source
 *
 * bookings[]    member meeting bookings: { id, member, startsAt, kind, status:
 *               'booked'|'confirmed'|'completed'|'no-show'|'canceled'|'rescheduled', source, asOf }
 */
window.SF_DATA = {
  placeholder: true,
  schemaVersion: 2,
  region: 'South Florida',
  director: 'Chauncey',
  generatedAt: '2026-11-04T14:30:00Z',

  sources: [
    { id: 'gmail', name: 'Gmail', role: 'Email threads and drafts', asOf: '2026-11-04T14:20:00Z',
      check: { ranAt: '2026-11-04T14:20:00Z', live: true, succeeded: true, detail: 'Sample: listed the 5 newest threads.',
        axes: { authenticated: true, reachable: true, contentReadable: true, ingesting: null } },
      coverage: { complete: true } },
    { id: 'slack', name: 'Slack', role: 'Member channels and DMs', asOf: '2026-11-03T22:05:00Z',
      check: { ranAt: '2026-11-04T14:21:00Z', live: true, succeeded: false, detail: 'Sample: the read timed out after 8 s.',
        axes: { authenticated: null, reachable: false, contentReadable: null, ingesting: null } },
      coverage: { complete: true } },
    { id: 'fathom', name: 'Fathom', role: 'Call recordings and summaries', asOf: '2026-11-04T12:40:00Z',
      check: { ranAt: null, live: false, succeeded: null, detail: 'Sample: no health check has run.' },
      coverage: { complete: true } },
    { id: 'ghl', name: 'GHL', role: 'GoHighLevel CRM: contacts, calendar, SMS', asOf: '2026-11-04T14:10:00Z',
      check: { ranAt: '2026-11-04T14:10:00Z', live: true, succeeded: true, detail: 'Sample: signed in and listed contacts; message bodies came back empty.',
        axes: { authenticated: true, reachable: true, contentReadable: false, ingesting: null } },
      coverage: { complete: false, note: 'Message bodies and some conversation types are not readable yet.' } },
    { id: 'whatsapp', name: 'WhatsApp', role: 'Member WhatsApp threads', asOf: '2026-11-04T09:00:00Z',
      check: { ranAt: null, live: false, succeeded: null, detail: 'Sample: no health check has run. Rows come from a manual export.' },
      coverage: { complete: true } },
    { id: 'plaud', name: 'Plaud', role: 'In-person meeting recorder', asOf: null, future: true,
      check: { ranAt: null, live: false, succeeded: null, detail: 'Coming soon. Not connected.' },
      coverage: { complete: false, note: 'Not connected.' } },
  ],

  items: [
    // ---- Messages to send ----
    { id: 'm1', issueKey: 'example-member-1:renewal-check-in', queue: 'to_send', member: 'Example Member 1',
      summary: '{member} renews in 12 days. A short check-in is drafted and ready to review.',
      state: 'draft-ready', channel: 'gmail', source: 'gmail', asOf: '2026-11-04T14:20:00Z',
      draft_id: 'r-EXAMPLE-DRAFT-001', thread_id: 'EXAMPLE-THREAD-001', recipient: 'member1@example.com', account: 'rd-southflorida@example.com',
      body: 'Hi there,\n\nYour renewal is coming up on the 16th. Do you have 15 minutes this week to look back at the year and plan the next one?\n\nBest,\nChauncey',
      version: 'sha256:3e3c633229a51544', dedup_key: 'r-EXAMPLE-DRAFT-001:sha256:3e3c633229a51544',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-001',
      nextStep: 'Read the draft, edit it here, send.', facts: [{ label: 'Renewal date', value: 'Nov 16 (sample)' }] },
    { id: 'm2', issueKey: 'example-member-2:intro-follow-up', queue: 'to_send', member: 'Example Member 2',
      summary: '{member} asked for an intro to a sample marketing agency.',
      state: 'to-send', channel: 'whatsapp', source: 'whatsapp', asOf: '2026-11-04T09:00:00Z',
      threadUrl: 'https://example.com/whatsapp/EXAMPLE-CHAT-002', nextStep: 'Send the intro reply.' },
    { id: 'm2b', issueKey: 'example-member-2:intro-follow-up', queue: 'to_send', member: 'Example Member 2',
      summary: '{member} asked for an intro to a sample marketing agency (same ask, also by email).',
      state: 'to-send', channel: 'gmail', source: 'gmail', asOf: '2026-11-04T13:55:00Z',
      draft_id: 'r-EXAMPLE-DRAFT-002', thread_id: 'EXAMPLE-THREAD-002', recipient: 'member2@example.com', account: 'rd-southflorida@example.com',
      body: 'Happy to connect you. I am copying a sample agency founder who has helped two members with paid social. I will let you two take it from here.',
      version: 'sha256:390f989470ba37d9', dedup_key: 'r-EXAMPLE-DRAFT-002:sha256:390f989470ba37d9',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-002' },
    { id: 'm3', issueKey: 'example-member-3:event-recap', queue: 'to_send', member: 'Example Member 3',
      summary: 'Event recap for {member}.',
      state: 'held', hold_reason: 'Photo release not confirmed yet (audit a7).', channel: 'gmail', source: 'gmail', asOf: '2026-11-04T11:15:00Z',
      draft_id: 'r-EXAMPLE-DRAFT-003', thread_id: 'EXAMPLE-THREAD-003', recipient: 'member3@example.com', account: 'rd-southflorida@example.com',
      body: 'Thanks for coming on Thursday! The photos are attached. It was great to see you there.',
      version: 'sha256:978aec693d861e1a', dedup_key: 'r-EXAMPLE-DRAFT-003:sha256:978aec693d861e1a',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-003', nextStep: 'Wait for the release, then send.' },
    { id: 'm4', issueKey: 'example-member-4:welcome-packet', queue: 'to_send', member: 'Example Member 4',
      summary: 'Welcome packet to {member} bounced back from the address on file.',
      state: 'error', error: 'Sample: 550 mailbox unavailable.', channel: 'gmail', source: 'gmail', asOf: '2026-11-04T10:02:00Z',
      draft_id: 'r-EXAMPLE-DRAFT-004', thread_id: 'EXAMPLE-THREAD-004', recipient: 'member4@example.com', account: 'rd-southflorida@example.com',
      body: 'Welcome to the club! Here is everything you need for your first 30 days.',
      version: 'sha256:9d7c1c734dd00590', dedup_key: 'r-EXAMPLE-DRAFT-004:sha256:9d7c1c734dd00590',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-004', nextStep: 'Confirm the right email in GHL, then resend.' },
    { id: 'm5', issueKey: 'example-member-6:dinner-invite', queue: 'to_send', member: 'Example Member 6',
      summary: 'Dinner invite to {member} is queued.',
      state: 'queued', channel: 'gmail', source: 'gmail', asOf: '2026-11-04T14:05:00Z',
      draft_id: 'r-EXAMPLE-DRAFT-005', thread_id: 'EXAMPLE-THREAD-005', recipient: 'member6@example.com', account: 'rd-southflorida@example.com',
      body: 'Would you join a small members dinner on the 20th? Six people, one table, no agenda.',
      version: 'sha256:8f7ec677f8d280a4', dedup_key: 'r-EXAMPLE-DRAFT-005:sha256:8f7ec677f8d280a4',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-005' },

    // ---- Messages pending (sent, waiting on a reply) ----
    { id: 'p1', issueKey: 'example-member-5:mastermind-seat', queue: 'pending', member: 'Example Member 5',
      summary: 'Offered {member} a mastermind seat. No reply yet.', state: 'sent', channel: 'gmail', source: 'gmail',
      sentAt: '2026-10-30T15:00:00Z', asOf: '2026-11-04T14:20:00Z',
      thread_id: 'EXAMPLE-THREAD-006', recipient: 'member5@example.com', account: 'rd-southflorida@example.com',
      body: 'A seat opened in the Thursday mastermind group. Want it?',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-006', nextStep: 'Nudge on Thursday if still quiet.' },
    { id: 'p2', issueKey: 'example-member-7:payment-link', queue: 'pending', member: 'Example Member 7',
      summary: 'Sent {member} the renewal payment link by text.', state: 'sent', channel: 'ghl', source: 'ghl',
      sentAt: '2026-11-03T18:30:00Z', asOf: '2026-11-04T14:10:00Z', thread_id: 'EXAMPLE-CONVO-007', recipient: '+1 555 0100 (sample)', account: 'GHL sample location',
      body: 'Here is the renewal link we talked about: https://example.com/pay/EXAMPLE', threadUrl: 'https://example.com/ghl/EXAMPLE-CONVO-007' },
    { id: 'p3', issueKey: 'example-member-8:speaker-ask', queue: 'pending', member: 'Example Member 8',
      summary: 'Asked {member} to speak at the December breakfast.', state: 'sent', channel: 'slack', source: 'slack',
      sentAt: '2026-11-02T16:00:00Z', asOf: '2026-11-03T22:05:00Z', thread_id: 'EXAMPLE-SLACK-0008', recipient: '@example-member-8', account: 'Example workspace',
      body: 'Would you share your hiring story at the December breakfast? 10 minutes, then Q&A.', threadUrl: 'https://example.slack.com/archives/EXAMPLE/p0008' },

    // ---- New members ----
    { id: 'n1', issueKey: 'example-member-9:new', queue: 'new_members', member: 'Example Member 9',
      summary: '{member} joined Nov 1. Welcome call not booked yet.', source: 'ghl', asOf: '2026-11-04T14:10:00Z', overdue: true,
      nextStep: 'Book the welcome call this week.', facts: [{ label: 'Joined', value: 'Nov 1 (sample)' }, { label: 'Industry', value: 'Sample: home services' }] },
    { id: 'n2', issueKey: 'example-member-10:new', queue: 'new_members', member: 'Example Member 10',
      summary: '{member} joined Oct 29. Welcome call done; intro to 2 members promised.', source: 'fathom', asOf: '2026-11-04T12:40:00Z',
      threadUrl: 'https://example.com/fathom/EXAMPLE-CALL-010', nextStep: 'Send the two intros.', facts: [{ label: 'Joined', value: 'Oct 29 (sample)' }] },
    { id: 'n3', issueKey: 'example-member-11:new', queue: 'new_members', member: 'Example Member 11',
      summary: '{member} joined Oct 27 and posted in the welcome channel.', source: 'slack', asOf: '2026-11-03T22:05:00Z',
      threadUrl: 'https://example.slack.com/archives/EXAMPLE/p0011', facts: [{ label: 'Joined', value: 'Oct 27 (sample)' }] },

    // ---- Complaining or at risk (the first issue is seen in three sources and merges into one) ----
    { id: 'r1a', issueKey: 'example-member-12:event-quality', queue: 'at_risk', member: 'Example Member 12', severity: 'high',
      summary: '{member} said the last two events felt off-topic and is unsure about renewing.',
      channel: 'fathom', source: 'fathom', asOf: '2026-11-04T12:40:00Z', threadUrl: 'https://example.com/fathom/EXAMPLE-CALL-012',
      nextStep: 'Call before the renewal date; ask what a good event looks like for them.' },
    { id: 'r1b', issueKey: 'example-member-12:event-quality', queue: 'at_risk', member: 'Example Member 12', severity: 'medium',
      summary: '{member} posted that events have been hit-or-miss.', channel: 'slack', source: 'slack', asOf: '2026-11-03T22:05:00Z',
      threadUrl: 'https://example.slack.com/archives/EXAMPLE/p0012' },
    { id: 'r1c', issueKey: 'example-member-12:event-quality', queue: 'at_risk', member: 'Example Member 12', severity: 'medium',
      summary: 'CRM note: {member} flagged as unsure about renewing.', channel: 'ghl', source: 'ghl', asOf: '2026-11-04T14:10:00Z' },
    { id: 'r2', issueKey: 'example-member-13:billing', queue: 'at_risk', member: 'Example Member 13', severity: 'medium',
      summary: '{member} was charged twice and asked for a refund.', channel: 'gmail', source: 'gmail', asOf: '2026-11-04T13:30:00Z',
      threadUrl: 'https://mail.google.com/mail/u/0/#inbox/EXAMPLE-THREAD-013', nextStep: 'Confirm the refund with billing, then reply.' },
    { id: 'r3', issueKey: 'example-member-14:quiet', queue: 'at_risk', member: 'Example Member 14', severity: 'low',
      summary: '{member} has not shown up in any channel for 45 days.', source: 'ghl', asOf: '2026-11-04T14:10:00Z',
      nextStep: 'Personal check-in.' },
  ],

  renewal: {
    target: 75,
    current: { label: 'November 2026, month to date', periodStart: '2026-11-01', periodEnd: '2026-11-30',
      renewed: 9, churned: 4, open: 14, earlySample: true, source: 'FC AI renewal book (sample)', asOf: '2026-11-04T14:00:00Z' },
    prior: { label: 'October 2026 (final)', month: '2026-10',
      renewed: 17, churned: 7, source: 'FC AI renewal book (sample)', asOf: '2026-11-01T13:00:00Z' },
  },

  audits: [
    { id: 'a1', at: '2026-11-04T14:20:00Z', check: 'Gmail live read', result: 'pass', source: 'Gmail', detail: 'Sample: 5 threads listed.' },
    { id: 'a2', at: '2026-11-04T14:21:00Z', check: 'Slack live read', result: 'fail', source: 'Slack', detail: 'Sample: timed out after 8 s.' },
    { id: 'a3', at: '2026-11-04T14:10:00Z', check: 'GHL message bodies readable', result: 'fail', source: 'GHL', detail: 'Sample: bodies missing for 3 of 5 conversations.' },
    { id: 'a4', at: '2026-11-04T14:00:00Z', check: 'Renewal counts match the renewal book', result: 'pass', source: 'FC AI', detail: 'Sample: 9 renewed + 4 churned + 14 open = 27 due.' },
    { id: 'a5', at: '2026-11-04T14:25:00Z', check: 'Duplicate issues merged across sources', result: 'pass', source: 'Page build', detail: 'Sample: 3 rows → 1 item for one member.' },
    { id: 'a7', at: '2026-11-04T11:15:00Z', check: 'Photo release on file before a recap goes out', result: 'fail', source: 'Gmail', detail: 'Sample: no release for Example Member 3, so that draft is held.' },
    { id: 'a6', at: '2026-11-04T14:26:00Z', check: 'No real names in committed data', result: 'pass', source: 'Page build', detail: 'Sample: placeholder file only.' },
  ],

  events: {
    cluster: { minMembers: 3, windowDays: 60 }, // heuristic, see schema above
    source: 'ClickUp events table + RD calendar (sample)',
    asOf: '2026-11-04T13:45:00Z',
    rd: [
      { id: 'e1', title: 'RD breakfast: Example Hotel, Brickell', startsAt: '2026-11-12T12:30:00Z', location: 'Miami (sample)',
        themes: ['networking'], status: 'confirmed', source: 'RD calendar (sample)', asOf: '2026-11-04T13:45:00Z' },
      { id: 'e2', title: 'New-member welcome coffee', startsAt: '2026-11-19T14:00:00Z', location: 'Fort Lauderdale (sample)',
        themes: ['onboarding'], status: 'scheduled', source: 'RD calendar (sample)', asOf: '2026-11-04T13:45:00Z' },
    ],
    club: [
      { id: 'e3', title: 'Club Mastermind Day (sample)', startsAt: '2026-11-21T15:00:00Z', location: 'Virtual',
        themes: ['mastermind'], status: 'confirmed', source: 'ClickUp events table (sample)', asOf: '2026-11-04T13:45:00Z' },
      { id: 'e4', title: 'Founders Summit (sample)', startsAt: '2026-12-05T16:00:00Z', location: 'Orlando (sample)',
        themes: ['conference'], status: 'scheduled', source: 'ClickUp events table (sample)', asOf: '2026-11-04T13:45:00Z' },
    ],
    feedback: [
      // a real cluster: 4 distinct verified members, 3 channels, all recent → becomes a suggestion
      { id: 'f1', member: 'Example Member 12', verified: true, theme: 'hiring', channel: 'fathom', at: '2026-11-03T16:00:00Z', note: 'Wants help hiring a first ops manager.' },
      { id: 'f2', member: 'Example Member 15', verified: true, theme: 'hiring', channel: 'slack', at: '2026-10-28T19:00:00Z', note: 'Asked who others use for recruiting.' },
      { id: 'f3', member: 'Example Member 16', verified: true, theme: 'hiring', channel: 'gmail', at: '2026-10-22T14:00:00Z', note: 'Struggling to hire salespeople.' },
      { id: 'f4', member: 'Example Member 9', verified: true, theme: 'hiring', channel: 'fathom', at: '2026-11-01T17:00:00Z', note: 'Mentioned hiring on the welcome call.' },
      { id: 'f5', member: 'Example Member 15', verified: true, theme: 'hiring', channel: 'whatsapp', at: '2026-10-30T12:00:00Z', note: 'Same member again: counts once.' },
      // below the heuristic: only 2 distinct verified members (+1 unverified) → an early signal, no suggestion
      { id: 'f6', member: 'Example Member 17', verified: true, theme: 'family-office', channel: 'slack', at: '2026-10-20T12:00:00Z', note: 'Curious about family office setups.' },
      { id: 'f7', member: 'Example Member 18', verified: true, theme: 'family-office', channel: 'gmail', at: '2026-10-25T12:00:00Z', note: 'Same topic.' },
      { id: 'f8', member: 'Example Guest 1', verified: false, theme: 'family-office', channel: 'whatsapp', at: '2026-10-26T12:00:00Z', note: 'Not a verified member: never counted.' },
    ],
    ideas: [
      { theme: 'hiring', title: 'Hiring your first A-players: member roundtable', format: 'In-person roundtable, members may bring one guest',
        proposedStart: '2026-12-03T23:00:00Z', proposedEnd: '2026-12-04T01:00:00Z', mayBringNewMembers: true,
        why: 'Guests who are hiring are the same profile as recent joins (sample reasoning).' },
      { theme: 'family-office', title: 'Family office 101', format: 'Virtual panel',
        proposedStart: '2026-12-10T22:00:00Z', proposedEnd: '2026-12-10T23:00:00Z', mayBringNewMembers: false, why: 'Sample idea.' },
    ],
  },

  bookings: [
    { id: 'b1', member: 'Example Member 10', startsAt: '2026-10-31T15:00:00Z', kind: 'Welcome call', status: 'completed', source: 'GHL calendar (sample)', asOf: '2026-11-04T14:10:00Z' },
    { id: 'b2', member: 'Example Member 14', startsAt: '2026-11-03T17:00:00Z', kind: 'Check-in', status: 'no-show', source: 'GHL calendar (sample)', asOf: '2026-11-04T14:10:00Z' },
    { id: 'b3', member: 'Example Member 12', startsAt: '2026-11-06T16:30:00Z', kind: 'Renewal conversation', status: 'confirmed', source: 'GHL calendar (sample)', asOf: '2026-11-04T14:10:00Z' },
    { id: 'b4', member: 'Example Member 1', startsAt: '2026-11-10T19:00:00Z', kind: 'Renewal conversation', status: 'booked', source: 'GHL calendar (sample)', asOf: '2026-11-04T14:10:00Z' },
    { id: 'b5', member: 'Example Member 7', startsAt: '2026-11-05T15:00:00Z', kind: 'Check-in', status: 'rescheduled', source: 'GHL calendar (sample)', asOf: '2026-11-04T14:10:00Z' },
  ],
};
