# Hunt package JSON schema (v1)

This is the file format exchanged between HuntManagement (the native app) and
this web editor. It describes exactly one `Event` (a single hunt day) and
everything needed to edit its Drives, Posts, Car/Hunter assignments, and
print the assignment report — matching the native app's own SwiftData model
field-for-field so the native export/import serializes this directly.

There is no sync. The package travels one of two ways: through the **drop
box** (a tiny versioned store, see "Drop box API" below — the normal path
from 2026-09-29), or as a file / old-style `#d=` link that is imported by
hand (the fallback for a day with no signal). Either way an import is a full
replace of that Event's drives and assignments, and the drop box's version
check is what stops two editors from silently overwriting each other (see
`hunt-drop-box-plan.md` in the HuntManagement project).

```jsonc
{
  "packageVersion": 1,

  // Event.uuid. REQUIRED by the native importer (HuntPackageHandoff decodes
  // it as a non-optional UUID): import matches the existing Event by this
  // value and only creates a new Event when no Event has it. Swift encodes
  // UUIDs as uppercase strings. The web editor never reads or changes it —
  // it just carries it through, since it keeps every field it was given.
  "eventUUID": "3F2B6C1E-8A4D-4E7B-9C21-5D6E7F8A9B0C",

  // Mirrors Event.
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
- **Native export/import exists**: `Models/HuntPackageHandoff.swift` in
  HuntManagement (`export` / `run`), with Codable DTOs mirroring the example
  above. Since 2026-09-29 its export includes `eventAttendees`, so real hunts
  narrow the Jägare list as intended.
- **Unknown fields survive the web editor.** It edits the loaded object in
  place and writes the whole thing back, so a field it doesn't know about
  (like `eventUUID`) comes back unchanged. Keep it that way: dropping
  `eventUUID` would make the native import fail.

## Drop box API (frozen contract, 2026-09-29)

This section is the contract between hunt-web and the native app. Both sides
are built against **this text**, not against the design notes; any change to
the Worker has to be written here first. Design reasoning:
`hunt-drop-box-plan.md`; deployment log and test results:
`hunt-dropbox-worker.md` (both in the HuntManagement project). Worker source:
`worker/index.js` in this repo.

**Base URL:** `https://hunt-dropbox.itunes-usa.workers.dev`

The Worker stores one opaque JSON package per hunt, with a version counter.
It never looks inside `payload` — no schema validation, nothing to migrate
when the package format above changes.

### Token and link

- `token` = 22 characters of base64url: `/^[A-Za-z0-9_-]{22}$/` (16 random
  bytes, unpadded). Anything else gets 404 without touching storage.
- **The native app originates every token**, once per hunt, and keeps it as
  `Event.shareToken` so the same hunt keeps the same drop box. The web editor
  never invents one; it only uses what its link gave it.
- Share link: `http://hunt.bergvik.org/#h=<token>` (becomes `https://` once
  HTTPS is enabled on the site). The token sits in the fragment, so it is
  never sent to the web host. The token is the only credential: anyone with
  the link can read and write that one hunt.

### Stored envelope

```json
{
  "version": 6,
  "updatedAt": "2026-09-29T14:12:03.512Z",
  "updatedBy": "Stefan (web)",
  "payload": { "packageVersion": 1, "eventUUID": "…", "event": { } }
}
```

- `version`: integer, 1 for the first write, +1 on every accepted write.
- `updatedAt`: set by the Worker, ISO 8601 UTC **with milliseconds**. Swift:
  use an `ISO8601DateFormatter` with `.withFractionalSeconds` (the default
  formatter rejects this string).
- `updatedBy`: the writer's own label, trimmed, max 80 characters; `"okänd"`
  when missing or blank. Suggested forms: `"Fredrik (Mac)"`, `"Stefan (web)"`.
- `payload`: the package exactly as written. It must be a JSON object;
  anything else is refused.

### Endpoints

| Request | Success | Other outcomes |
|---|---|---|
| `GET /h/<token>` | **200** the whole envelope | **404** `{"error":"not_found"}` if nothing is stored |
| `GET /h/<token>/meta` | **200** `{"version","updatedAt","updatedBy"}` (no payload) | **404** as above |
| `PUT /h/<token>` body `{"baseVersion":N,"updatedBy":"…","payload":{…}}` | **200** `{"version":N+1}` | **409** conflict, **400**, **413** (see below) |
| `DELETE /h/<token>` with header `X-Admin-Key` | **200** `{"deleted":true}` | **403** `{"error":"forbidden"}` without the right key |

Use `Content-Type: application/json` on PUT. Every response is JSON with
`Cache-Control: no-store`. Any other path gives **404** `not_found`; any
other method gives **405** `method_not_allowed`.

### Versioning rules

- `baseVersion` is the version your data was based on: the `version` from
  your last successful GET, or from your last successful PUT's response.
  **`0` means "create"** — the first push of a brand-new token. Missing is
  treated as 0; it must otherwise be a non-negative integer.
- If `baseVersion` isn't the stored version, nothing is written and the
  answer is **409** with the current state, so the client can say who
  changed it and when:
  `{"error":"conflict","version":7,"updatedAt":"…","updatedBy":"Fredrik (Mac)"}`
  (just `"version":0` when nothing is stored, e.g. the hunt was deleted or
  never created). The right response is to fetch first, never to retry with a bumped
  `baseVersion` — that would overwrite the other person's work.
- The check is a real compare-and-swap on R2 (conditional write on the
  object's etag), verified on production: 12 simultaneous writes on the same
  base produce exactly one 200 and eleven 409s, for creates and updates alike.
- A PUT replaces the whole payload. There is no merge and no partial update.

### Errors

| Status | `error` | Cause |
|---|---|---|
| 400 | `bad_json` | body isn't valid JSON |
| 400 | `bad_body` | body is JSON but not an object |
| 400 | `bad_base_version` | `baseVersion` present but not a non-negative integer |
| 400 | `missing_payload` | `payload` missing, null, or not an object |
| 403 | `forbidden` | DELETE without the correct `X-Admin-Key` |
| 404 | `not_found` | nothing stored for this token, malformed token, or unknown path |
| 405 | `method_not_allowed` | e.g. PUT on `/meta` |
| 409 | `conflict` | stale `baseVersion` (body carries the current meta, see above) |
| 413 | `too_large` | body over 2,000,000 bytes (a real hunt is ~40 KB) |

### Operational rules

- **Polling** hits `/meta` only, so a change check never downloads the hunt.
  Suggested moments: on open, when the app or tab comes back to the
  foreground, after your own successful push, and at a slow interval (a few
  minutes) while focused. If a newer version arrives while you have unsent
  local edits, tell the person to send (or resolve) first; never offer to
  discard their edits.
- **CORS**: browsers may call the Worker only from `http://hunt.bergvik.org`
  and `https://hunt.bergvik.org` (Worker var `ALLOWED_ORIGIN`). The native app
  isn't subject to CORS.
- **Expiry**: an R2 lifecycle rule deletes a hunt **400 days after its last
  write**. A hunt that keeps being edited never expires.
- **DELETE is admin-only.** `ADMIN_KEY` is a Worker secret held by Fredrik;
  it must never be built into the native app or the web page.
- Nothing can be listed: there is no endpoint that enumerates tokens.
