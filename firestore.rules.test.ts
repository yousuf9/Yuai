/**
 * Dirty Dozen Security Specification Test Runner for YUAI Firestore Rules
 * Verifies that all 12 adversarial payloads described in security_spec.md are rejected.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Dataset Create',
    collectionPath: '/datasets/ds_spoof_1',
    operation: 'create',
    payload: { ownerId: 'victim_uid_999', name: 'Sales.xlsx' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    collectionPath: '/datasets/ds_unverified_2',
    operation: 'create',
    payload: { ownerId: 'attacker_uid', emailVerified: false },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Dataset Create',
    collectionPath: '/datasets/ds_shadow_3',
    operation: 'create',
    payload: { ownerId: 'attacker_uid', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Update-Gap Value Poisoning',
    collectionPath: '/datasets/ds_valid_4',
    operation: 'update',
    payload: { trendsSummary: 12345 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Immutable Field Mutation',
    collectionPath: '/datasets/ds_valid_5',
    operation: 'update',
    payload: { ownerId: 'new_owner_uid' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery',
    collectionPath: '/datasets/ds_time_6',
    operation: 'create',
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning Attack',
    collectionPath: '/datasets/invalid$id!@#',
    operation: 'create',
    payload: { ownerId: 'attacker_uid' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Subcollection Write',
    collectionPath: '/datasets/non_existent_id/queries/q1',
    operation: 'create',
    payload: { datasetId: 'non_existent_id', ownerId: 'attacker_uid', question: 'Q', answer: 'A' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Cross-Tenant Subcollection Write',
    collectionPath: '/datasets/victim_dataset_id/queries/q1',
    operation: 'create',
    payload: { datasetId: 'victim_dataset_id', ownerId: 'attacker_uid', question: 'Q', answer: 'A' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Blanket List Query Scraping',
    collectionPath: '/datasets',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'QueryLog Mutation After Creation',
    collectionPath: '/datasets/ds_valid_11/queries/q1',
    operation: 'update',
    payload: { answer: 'Tampered answer' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Boundary Overflow on Query Question',
    collectionPath: '/datasets/ds_valid_12/queries/q2',
    operation: 'create',
    payload: { question: 'x'.repeat(2500) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
