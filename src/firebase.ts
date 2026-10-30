import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validate connection to Firestore on boot as required
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_\-]+$/,
  ID_MAX_LEN: 128,
  NAME_MAX_LEN: 160,
  SHEET_MAX_LEN: 100,
  COLUMNS_SUMMARY_MAX_LEN: 15000,
  TRENDS_SUMMARY_MAX_LEN: 15000,
  QUESTION_MAX_LEN: 2000,
  ANSWER_MAX_LEN: 20000,
};

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, BLUEPRINT_LIMITS.ID_MAX_LEN);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export interface SyncedDatasetDoc {
  id: string;
  ownerId: string;
  name: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
  columnsSummary: string;
  trendsSummary: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SyncedQueryLogDoc {
  id: string;
  datasetId: string;
  ownerId: string;
  question: string;
  answer: string;
  createdAt?: Timestamp | null;
}

export async function signInWithGooglePopup(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };

export async function syncDatasetToCloud(params: {
  id: string;
  name: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
  columnsSummary: string;
  trendsSummary: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be signed in to synchronize datasets to the cloud.');
  }

  const datasetId = sanitizeId(params.id);
  const path = `datasets/${datasetId}`;

  const payload = {
    ownerId: user.uid,
    name: params.name.trim().slice(0, BLUEPRINT_LIMITS.NAME_MAX_LEN) || 'Untitled_Excel.xlsx',
    sheetName: params.sheetName.trim().slice(0, BLUEPRINT_LIMITS.SHEET_MAX_LEN) || 'Sheet1',
    rowCount: Math.max(0, Math.min(10000000, Math.floor(params.rowCount))),
    columnCount: Math.max(0, Math.min(10000, Math.floor(params.columnCount))),
    columnsSummary:
      params.columnsSummary.slice(0, BLUEPRINT_LIMITS.COLUMNS_SUMMARY_MAX_LEN) ||
      'No column summary available.',
    trendsSummary: params.trendsSummary.slice(0, BLUEPRINT_LIMITS.TRENDS_SUMMARY_MAX_LEN),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'datasets', datasetId), payload);
    return datasetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDatasetTrendsInCloud(
  datasetId: string,
  trendsSummary: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const cleanId = sanitizeId(datasetId);
  const path = `datasets/${cleanId}`;
  try {
    await updateDoc(doc(db, 'datasets', cleanId), {
      trendsSummary: trendsSummary.slice(0, BLUEPRINT_LIMITS.TRENDS_SUMMARY_MAX_LEN),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDatasetFromCloud(datasetId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const cleanId = sanitizeId(datasetId);
  const path = `datasets/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'datasets', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveQueryLogToCloud(params: {
  datasetId: string;
  question: string;
  answer: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const cleanDatasetId = sanitizeId(params.datasetId);
  const queryId = sanitizeId(`q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `datasets/${cleanDatasetId}/queries/${queryId}`;

  const payload = {
    datasetId: cleanDatasetId,
    ownerId: user.uid,
    question: params.question.trim().slice(0, BLUEPRINT_LIMITS.QUESTION_MAX_LEN) || 'Question',
    answer: params.answer.trim().slice(0, BLUEPRINT_LIMITS.ANSWER_MAX_LEN) || 'Answer',
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'datasets', cleanDatasetId, 'queries', queryId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserDatasets(
  userId: string,
  onData: (datasets: SyncedDatasetDoc[]) => void
): () => void {
  const path = 'datasets';
  const q = query(collection(db, 'datasets'), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SyncedDatasetDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SyncedDatasetDoc, 'id'>),
      }));
      items.sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeDatasetQueries(
  userId: string,
  datasetId: string,
  onData: (queries: SyncedQueryLogDoc[]) => void
): () => void {
  const cleanDatasetId = sanitizeId(datasetId);
  const path = `datasets/${cleanDatasetId}/queries`;
  const q = query(
    collection(db, 'datasets', cleanDatasetId, 'queries'),
    where('ownerId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SyncedQueryLogDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SyncedQueryLogDoc, 'id'>),
      }));
      items.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() ?? 0;
        const tB = b.createdAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
