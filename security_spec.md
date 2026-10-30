# YUAI Firestore Security Specification (Phase 0 TDD & Red Team Audit)

## 1. Data Invariants
1. **Master Source of Truth**: `/datasets/{datasetId}` is the parent resource owned exclusively by `ownerId == request.auth.uid`.
2. **Relational Sync (Master Gate)**: `/datasets/{datasetId}/queries/{queryId}` can only be read, created, or deleted if the parent `/datasets/{datasetId}` document exists and its `ownerId == request.auth.uid`.
3. **Verified Identity**: All writes and reads require `request.auth != null && request.auth.token.email_verified == true`.
4. **Strict Keys & Anti-Update-Gap**: Every create and update operation enforces `isValidDataset` or `isValidQueryLog` with strict `.hasAll()` and `.hasOnly()` key checks and explicit string/integer size bounds.
5. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation, `createdAt` is immutable on update, and `updatedAt` must equal `request.time` on update.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing on Dataset Create**: `ownerId: "victim_uid_999"` when `request.auth.uid == "attacker_uid"`.
2. **Unverified Email Write**: Valid dataset payload sent by user with `email_verified: false`.
3. **Shadow Field Injection on Dataset Create**: Payload includes `"isAdmin": true` alongside valid fields.
4. **Update-Gap Value Poisoning**: Updating `trendsSummary` on `/datasets/{datasetId}` with a 50,000-character string or integer `12345`.
5. **Immutable Field Mutation**: Updating `ownerId` or `createdAt` on an existing `/datasets/{datasetId}` document.
6. **Client Timestamp Forgery**: Creating a dataset with a backdated `createdAt` timestamp != `request.time`.
7. **ID Poisoning Attack**: Creating a dataset with a 500-character or special-character document ID `datasetId`.
8. **Orphaned Subcollection Write**: Creating `/datasets/non_existent_id/queries/q1` where parent dataset does not exist.
9. **Cross-Tenant Subcollection Write**: Creating `/datasets/victim_dataset_id/queries/q1` where `victim_dataset_id` belongs to another user.
10. **Blanket List Query Scraping**: Executing a collection `list` query on `/datasets` without filtering `where('ownerId', '==', request.auth.uid)`.
11. **QueryLog Mutation**: Attempting an `update` on `/datasets/{datasetId}/queries/{queryId}` after creation.
12. **Boundary Overflow on Query Question**: Creating a `QueryLog` with a 5,000-character `question` (exceeding max 2,000).

## 3. Red Team Audit & Conflict Report
- **Shadow Update Test**: Passed. `isValidDataset` enforces `.hasOnly(...)` and `allow update` restricts `affectedKeys().hasOnly(...)`.
- **Email Spoofing Test**: Passed. `isSignedIn()` mandates `request.auth.token.email_verified == true`.
- **PII Blanket Test**: Passed. No public profile collection; all documents require `ownerId == request.auth.uid`.
- **Query Trust Test**: Passed. Both `allow list` rules enforce `resource.data.ownerId == request.auth.uid` without `get()` cost explosions.
