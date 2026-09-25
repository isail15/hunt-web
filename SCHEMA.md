# Hunt package JSON schema (v1)

This is the file format exchanged between HuntManagement (the native app) and
this web editor. It describes exactly one `Event` (a single hunt day) and
everything needed to edit its Drives, Posts, Car/Hunter assignments, and
print the assignment report — matching the native app's own SwiftData model
field-for-field so a future native export/import can serialize this directly.

There is no server and no sync: HuntManagement exports this file, someone
edits it here and downloads an updated copy, and it gets imported back into
HuntManagement by hand. Only one person should be editing a given copy at a
time (see `sharing-and-platform-strategy.md`, Finding 3, in the HuntManagement
project).

```jsonc
{
  "packageVersion": 1,

  // Mirrors Event. No "id" yet because Event has no stable uuid in the
  // native model today (unlike Hunter/Location) — the native side will need
  // one added before real round-trip import can match this back to the same
  // Event record rather than creating a new one. Not a blocker for building
  // and testing this web editor itself.
  "event": {
    "date": "2026-10-18",           // Event.date, ISO 8601 date
    "locationName": "Ånnebo",       // Event.location?.name
    "huntType": "Klövvilt",         // Event.huntType (free text, nullable)
    "comment": null                 // Event.comment (nullable)
  },

  // Catalog of Drive names this property uses. Matched by name on import;
  // a name not already in HuntManagement's Drive catalog is created there
  // (mirrors Drive.name — Drives themselves are a small, mostly-fixed set).
  "drives": [
    { "name": "Kräpplan" },
    { "name": "Runnebo" }
  ],

  // Mirrors EventDrive — which Drives run this Event, and in what order.
  // "localId" only exists inside this file, to link postAssignments to
  // their drive; it is not a native model field.
  //
  // driveOrder is a relative sort key only — never a display-ready
  // number, and never assumed to start at 1. The native app's own
  // driveOrder is 0-indexed (its first drive is 0), so a real export's
  // eventDrives commonly starts at 0, not 1, unlike the example below.
  // Both apps compute the shown "Såt N" label from a drive's position
  // after sorting by driveOrder, not from driveOrder's own value.
  "eventDrives": [
    { "localId": "ed1", "driveName": "Kräpplan", "driveOrder": 1, "reassemblyPoint": "Stora vägen" },
    { "localId": "ed2", "driveName": "Runnebo",  "driveOrder": 2, "reassemblyPoint": null }
  ],

  // Catalog of Posts referenced below. Matched by (postNumber + code) on
  // import; an unmatched combination is created as a new Post. Mirrors
  // Post's own fields (numberLabel = postNumber + code, displayLabel adds
  // " (type)").
  "posts": [
    { "postNumber": "18", "code": "T", "type": "T", "description": null, "isRetired": false },
    { "postNumber": "6",  "code": "B", "type": null, "description": null, "isRetired": false }
  ],

  // The full Hunter catalog (the wider pool, not just today's attendees) —
  // this is what a person is matched against by uuid whenever one is
  // picked. Matched by uuid — HuntingJournal's stable id, carried through
  // unchanged.
  "hunters": [
    { "uuid": "6b1f2e2a-0000-4000-8000-000000000001", "name": "Erik Andersson", "nickname": null }
  ],

  // Which of the hunters above are actually attending *this* event — a
  // plain array of Hunter uuids, mirroring the native EventAttendee join.
  // This is what narrows the Jägare picker in the web editor's
  // Passfördelning tab down to a short, relevant list instead of the
  // entire catalog. Missing on an older/native export that doesn't have
  // this concept yet → the web editor treats that as "everyone attends"
  // (falls back to every uuid in `hunters`) rather than showing an empty
  // list, then lets the person narrow it down themselves.
  "eventAttendees": [
    "6b1f2e2a-0000-4000-8000-000000000001"
  ],

  // Mirrors PostAssignment. Exactly one of hunterUUID / role / freeformName
  // should be set, matching the native rule that a slot is either a real
  // Hunter, one of the two fixed FunctionalRole values, or (web-editor-only,
  // see below) a typed-in name — never more than one of the three.
  "postAssignments": [
    {
      "id": "pa1",                  // local id, this file only
      "eventDriveLocalId": "ed1",
      "postNumber": "18",
      "postCode": "T",
      "assigneeType": "hunter",      // "hunter" | "role" | "freeform" | null (unassigned)
      "hunterUUID": "6b1f2e2a-0000-4000-8000-000000000001",
      "role": null,                  // "Hundförare" | "Utställare" when assigneeType is "role"
      "freeformName": null,          // typed name when assigneeType is "freeform" (see below)
      "car": "Buss",                 // PostAssignment.car, free text
      "carOrder": null,              // PostAssignment.carOrder — carried through, not yet used by this editor's report (matches native: report ignores carOrder today too)
      "comment": null,               // PostAssignment.comment — the result
      "sortOrder": 0
    }
  ]
}
```

## Round-trip notes

- **Export → edit → re-import is a full replace of this one Event's
  EventDrives/PostAssignments**, not a field-by-field merge. That's simplest
  and safest given there's no live sync: whatever is in the file when it
  comes back replaces what HuntManagement had for that Event. Only one
  editable copy should be "checked out" at a time.
- **Drive and Post are catalog data**, shared across every Event, so import
  matches them by natural key (name; postNumber+code) rather than replacing
  them — creating a new catalog entry only when the name/number truly isn't
  known yet.
- **Hunter is never created from this file** — only matched by uuid against
  HuntingJournal's roster, consistent with `huntingjournal-integration.md`
  (HuntingJournal owns people; HuntManagement/this editor only reference
  them). The one deliberate exception is `assigneeType: "freeform"`: when
  the person editing needs to assign someone who isn't in `hunters` at all
  (a genuinely new hunter, or one who just wasn't included in this
  particular export), they can type a plain name straight onto the post
  instead of being stuck. That name round-trips as free text, not a real
  Hunter — importing it back into HuntManagement still needs a manual step
  to turn it into an actual Hunter record (or match it to an existing one)
  before it becomes a normal `hunterUUID` assignment.
- **Native-side export/import isn't built yet.** This schema is designed so
  that work is mostly plumbing (Codable structs mirroring the case above)
  when it happens — see `sharing-and-platform-strategy.md`.
