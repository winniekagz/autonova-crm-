# Flow: Sales activities (visit and call reports)

**Implementation status:** 🟡 Implemented and tested (SOW §4.3), with the owner's governance decisions of 2026-11-09 applied: reports against a lead, hybrid attendees (outside attendees can be linked to a contact later), structured notes, optional GPS check-in, attachments on private local storage, audited field-level edits, Director-only archive with a reason, legal holds, and a reviewed (never automatic) retention process for GPS and voice notes. Not built: an object-storage provider, malware scanning, a retention scheduler (by decision), a retention screen in the web app (command line only), retention of photos and documents, offline drafts, follow-up tasks (SOW §4.10), a cross-lead activity report.

## Purpose

§4.3. Keep a structured history of every interaction with a lead. A report never changes the lead's stage.

## Decisions

Owner decisions (2026-11-09) are marked **Decided**. The rest were settled while building and remain open for confirmation.

| Question                     | Decision and rationale                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who can edit a report        | **Decided.** Its **creator** and any **Director**, and the caller must also be allowed to see the lead (lead scope is checked first, so a stranger gets `404`). Every edit is audited with actor, timestamp (the audit row's `occurred_at`) and **changed fields** (see Audit of edits). Rationale: the person who wrote a record is accountable for it, and Directors supervise. |
| Who can archive or delete    | **Decided.** **Directors only**, with a **required reason** (1 to 500 characters), for reports and for attachments. Archived, never hard-deleted: the application database role has no `DELETE`. Restoring a report is also Director-only. Rationale: removing a record from view is a supervisory act, and the reason keeps the history explainable.                             |
| Attendees                    | **Decided.** Hybrid kept: a **contact of the lead's company**, or an **outside person** (name and organisation). An outside attendee **never creates a CRM contact**. It can later be **linked** to an existing contact of the lead's company (same rights as editing); the name as first recorded is kept (`recordedAs`) with who linked it and when. A contact is listed once.  |
| File limits and types        | **Decided.** Photos 10 MB (JPEG, PNG, WebP); documents 25 MB (PDF, DOCX, XLSX, CSV); voice notes 20 MB (MP3, M4A, WAV, WebM); 50 MB in total of active files per report (configurable) and 20 files. **Real content is verified**, not the extension or declared type.                                                                                                            |
| Storage provider             | **Decided: none chosen yet.** The `FileStorage` interface and the private local-disk adapter stay, and the adapter is replaceable. **Object storage is a production requirement** for multi-instance or ephemeral deployments (see Storage).                                                                                                                                      |
| GPS and voice-note retention | **Decided.** 12 months each, configurable. GPS only by an explicit user action on a site visit; voice recording is user-initiated and participants must be told; no background tracking. Holds and approved exceptions are supported. Retention is a reviewed, audited process with **no automatic deletion job** (see Retention).                                                |
| Activity relationships       | Linked to the **lead only**. The company and contacts come from the lead, so nothing is duplicated; a contact attendee must belong to the lead's company (database trigger).                                                                                                                                                                                                      |
| Date semantics               | `occurred_at` is an **instant** (`timestamptz`) chosen on Nairobi's clock (UTC+3, no DST); distinct from `created_at` and `updated_at`. It cannot be more than 5 minutes in the future.                                                                                                                                                                                           |
| Follow-up                    | **Next steps is text on the report.** No task entity: the lead's `nextAction`/`nextActionAt` and its reminder worker remain the only follow-up mechanism (SOW §4.10).                                                                                                                                                                                                             |
| Offline drafts               | **Not built** (`docs/01-requirements.md` Q35: Phase 3, PRD conflict). Nothing here silently promises it.                                                                                                                                                                                                                                                                          |
| Malware scanning             | **Not built** (S8 open). Files are served only as downloads to authorised users.                                                                                                                                                                                                                                                                                                  |

### Where the decisions changed earlier behaviour

| Earlier behaviour                                                          | Now                                                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Creators could archive their own reports and remove files; reason optional | Director only; reason required. Business Development **lost** `activities:archive` (a deliberate permission change). |
| HEIC photos and OGG voice notes accepted                                   | **Refused.** They are not in the decided lists; WAV was added.                                                       |
| Voice notes up to 25 MB, documents up to 20 MB                             | Voice notes 20 MB, documents 25 MB (the earlier values were the wrong way round against the decision).               |
| No total per report                                                        | 50 MB total (active files only; configurable).                                                                       |
| Edit audit recorded only a list of field names                             | Records the changed fields with before and after.                                                                    |
| Replacing attendees recreated every row                                    | Rows that stay are kept, so a linked attendee keeps its recorded name and link history.                              |
| `activities:retention` did not exist                                       | New, Director-only (my design choice, to confirm): placing and lifting holds, and approving retention.               |
| Reports archived before this change have no reason                         | The "reason required" database checks are `NOT VALID`, so old rows stay valid; new archives need a reason.           |

## Data model (migrations `20261108210000_activities_and_attachments` and `20261109090000_activity_governance`)

- `activities`: lead (immutable, `RESTRICT`), type (`VISIT`/`CALL`/`DEMO`/`MEETING`), `occurred_at`, location, optional `latitude`/`longitude` (`DECIMAL(9,6)`), discussion (required), pain points, current tools, next steps, archive columns, created/updated-by and timestamps.
- `activity_attendees`: activity (`CASCADE`), optional contact (`RESTRICT`) or `external_name` + organisation.
- `activity_attachments`: activity, category (`PHOTO`/`VOICE_NOTE`/`DOCUMENT`), sanitised `file_name`, random `storage_key` (UUID, unique), sniffed `mime_type`, `size_bytes`, `sha256`, uploader, `archived_at`. **No bytes in PostgreSQL.**
- Governance columns (second migration): `activities.gps_recorded_at` (the retention clock; backfilled from `created_at`), `gps_cleared_at`, `archived_reason`, and a hold (`hold_reference`, `hold_reason`, `hold_placed_at`, `hold_placed_by_user_id`); `activity_attendees.linked_at`, `linked_by_user_id`; `activity_attachments.recording_notice_given`, `archived_by_user_id`, `archived_reason`, and a purge record (`purged_at`, `purged_by_user_id`, `purge_reason`, `purge_reference`).
- Constraints: GPS latitude and longitude set together, within range, and **only on `VISIT`**, with `gps_recorded_at` set exactly when coordinates exist; discussion not blank; size 1 byte to **100 MB** (a hard ceiling; the API enforces the configured per-category limit); storage key shape; archive columns set together; a hold is complete or absent; a purged file must already be archived and carries who, why and the approval reference; the recording notice exists only on voice notes; an attendee is a contact, an outside person, or an outside person later linked (keeping its recorded name).
- The reason-required checks on existing archives are `NOT VALID`: old rows keep no reason, new ones must have one.
- Triggers: an activity never moves to another lead; a contact attendee must belong to the company of the activity's lead.
- Indexes: `activities(lead_id, occurred_at DESC, id DESC)` serves the timeline with a stable tie-break; `activities(created_by_user_id)`; `activity_attendees(activity_id)` and `(contact_id)` ("is this contact used"); `activity_attachments(activity_id, archived_at)`; unique `storage_key`.
- Deliberately not indexed: `type` alone and `occurred_at` alone. The timeline always filters by lead first, and a lead has few reports, so a type filter within it is cheap; an index nothing needs only slows writes. Revisit when a cross-lead activity report exists (SOW §6).

## API (see [api-reference](../api-reference.md))

All routes sit under `/leads/{leadId}/activities`, so the lead's visibility is checked first and an activity is only ever found through its own lead: a wrong lead id, another user's lead and an unknown id all answer `404`. Routes: list (paginated, `type` filter), create, read, `PATCH`, `archive` and `restore` (Director), `attendees/{attendeeId}/link`, `hold` (place with `POST`, lift with `DELETE`; Director), and attachments (list, upload, download, remove (Director)). There is deliberately **no HTTP route that purges or deletes in bulk**: retention runs from the command line (see Retention).

## Permissions

`activities:list`, `activities:read`, `activities:create`, `activities:update` for Director and Business Development; `activities:archive` and `activities:retention` for **Director only**. These are the _kind_ of action; whether a user may do it to _this_ report is decided by lead access (read, list, create), by creator-or-Director (update, upload, link an attendee), and by Director (archive, restore, remove a file, hold, retention). Every attachment operation re-checks lead access, then the activity, then the attachment id within that activity; downloads are not exempt. Technical Lead and Finance have none until S1 is decided.

## Attachments

- Pipeline: caller may change the report → per-category size and extension checked → **real bytes sniffed** (`file-type`; the browser's MIME type and the client's name are not trusted; CSV must be plain text and not look like markup) → total and count checked **under a row lock** on the activity, so simultaneous uploads cannot exceed them → stored under a random UUID key → metadata row and audit event commit together. If the commit fails the bytes are removed, so a failed upload leaves neither a record nor an orphan file.
- Limits (configurable in `apps/api/.env`): `ATTACHMENT_PHOTO_MAX_MB` 10, `ATTACHMENT_DOCUMENT_MAX_MB` 25, `ATTACHMENT_VOICE_NOTE_MAX_MB` 20, `ACTIVITY_ATTACHMENT_TOTAL_MAX_MB` 50 (active files only: removing one frees room). The web app shows the shared defaults and how much of the 50 MB is used; the server is authoritative. No SVG, HTML, HEIC, OGG or executables.
- **Voice notes** need `recordingNoticeGiven=true` on upload: the person confirms everyone present was told the conversation is recorded. Without it the upload is refused (`VALIDATION_FAILED` when absent, `RECORDING_NOTICE_REQUIRED` when false). The confirmation is stored on the file and in the audit event. The system cannot verify it; it records the uploader's statement.
- Download is an authenticated API call (the web app fetches it with the bearer token); the file is sent as an attachment with `nosniff`, never inline. The storage directory is private and is never served by the web app.
- Removing an attachment (Director, reason required) archives its metadata with who and why: it disappears from the list and cannot be downloaded, and the active total drops. **The bytes stay on disk** until the retention process purges them; the row, size and hash always remain.
- Audit: `attachment.uploaded`, `attachment.archived`, `attachment.purged` (business, in the transaction) and `attachment.downloaded` (security category). File content and names are never copied into the audit trail.

## Audit of edits

`activity.updated` records the **changed fields only**, as `old_values` and `new_values`, plus a `changedFields` list; the actor and `occurred_at` are on the audit row. Short fields (`type`, `occurredAt`, `location`) record before and after. Long free text (`discussion`, `painPoints`, `currentTools`, `nextSteps`) records only its **length** (`discussionLength`), because the audit table is append-only and copying personal detail into it could never be cleaned. A check-in is recorded as set or removed (`checkIn`), never as coordinates. Attendees record a count. An edit that changes nothing records an empty `changedFields`. Other audited actions: `activity.created`, `activity.archived` and `activity.restored` (reason on archive), `activity.attendee_linked` (ids only), `activity.hold_placed` and `activity.hold_lifted` (with reason), `activity.gps_cleared`, and the `attachment.*` events above.

## GPS check-in

Optional and for site visits only. The browser asks for one position, only when the user presses "Check in here", after a plain explanation, and nothing is watched or guessed from the IP address; there is **no background location tracking**. A refusal, a timeout or no GPS support shows a message and the report can still be saved. The user must also accept the found position ("Use this location"). The server refuses coordinates on any other type, and a database CHECK repeats it. Coordinates are stored to 6 decimals (about 11 cm) and are visible to anyone who may read the report until retention clears them. **No accuracy is stored and nothing verifies the position is real**: it is a record of what the device reported, not proof of presence.

## Retention

Decided: GPS coordinates and voice notes are kept **12 months**, configurable (`RETENTION_GPS_MONTHS`, `RETENTION_VOICE_NOTE_MONTHS`, 1 to 120). Nothing runs automatically, because no reviewed policy has authorised unattended deletion. The process has two explicit steps:

1. **Review** (changes nothing): `pnpm --silent --filter @autonova/api run retention:review > due.json` lists every check-in and voice note past its period, its age in months, and whether a hold protects it.
2. **Approve and purge**: a Director edits `due.json` down to the approved items and runs `retention:purge` with `RETENTION_APPROVER_EMAIL`, `RETENTION_REFERENCE`, `RETENTION_REASON` and `RETENTION_ITEMS_FILE` set (see `apps/api/src/cli/retention.ts`). The approver must be an **active Director**; the list must be explicit (1 to 100 items, never "everything"); a reference (policy or ticket) and a reason are required.

What a purge does, per item and in its own transaction: locks the activity (so a hold placed at the same moment wins), **skips held reports**, re-checks the item is really past its period, then

- GPS: clears the coordinates and the retention clock and sets `gps_cleared_at`; the report shows "Cleared under the retention policy";
- voice note: archives the file if needed, records the purge (who, why, reference, when), and **deletes the stored bytes** before the transaction commits, so a file that cannot be deleted rolls the item back and stays visible. The row, size and hash remain as evidence.

Each item writes `activity.gps_cleared` or `attachment.purged` to the audit trail with the approver, reference and reason, and **never the content or file name**. The command prints a summary (`purged`, `skippedHeld`, `skippedNotDue`, `failed`) and exits non-zero if anything failed.

**Holds and exceptions.** A Director can place a hold on a report with a reference (matter or approval number) and a reason, and lift it with a reason. Both are audited and shown on the report. A held report is never purged. This covers legal holds and approved retention exceptions; the system does not decide whether a hold is justified.

**Assumptions to confirm.** The 12-month clock runs from when the check-in was captured (`gps_recorded_at`; a new check-in on an edit restarts it) and from when the voice note was uploaded (`created_at`), not from the visit date. Retention for **photos, documents and the bytes of removed files** was not decided, so the process does not touch them; those bytes stay until a decision is made (S7). Review is a command-line step; a Director screen can follow once the policy is reviewed.

## Storage

Files go through a `FileStorage` interface (`put`, `open`, `remove`) with one adapter: a private local directory (`FILE_STORAGE_DIR`, a Docker volume in compose). Keys are random UUIDs and the adapter refuses anything else, so a key cannot address a path. The adapter is replaceable by changing the module's provider. **No object-storage provider has been chosen.** Local disk is fine for development and a single host; it is **not suitable** for multi-instance or ephemeral deployments (a container restarted on another node loses or never sees the files), and it is not covered by the database backup unless the volume is included. **Object storage is therefore a production deployment requirement** for those environments, and the new adapter's `remove` must implement the purge.

## Rate limits and caching

Existing throttler: report creation 60 per minute, attachment upload 30 per minute, per address, on top of the global 300 per minute. Downloads use the global limit. No caching: the timeline is permission-sensitive and changes whenever someone records a report; it is paginated, column-selected and index-backed, with attachments only counted, never loaded for the list.

## Known limitations and open decisions

- **Storage is a local directory** (see Storage). Production needs an object store (S9).
- **No malware scanning** (S8).
- **Retention is manual and command-line only.** No scheduler by decision; no screen yet. Photos, documents and removed files' bytes have no retention rule (S7). The start of the 12-month clock is an assumption (see Retention).
- **The recording notice is a statement by the uploader**, not something the system can verify; participants are not notified by the system itself.
- A file larger than the limit is read into memory before it is refused (the per-request cap is the largest configured category, 25 MB by default).
- Offline drafts, follow-up tasks and a cross-lead activity view are not built.
- A report's discussion is visible to everyone who can read the lead, including Directors.
