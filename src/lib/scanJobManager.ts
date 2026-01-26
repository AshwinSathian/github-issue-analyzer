import { randomBytes } from 'crypto';

export type ScanJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ScanJobDetails = {
  jobId: string;
  repo: string;
  status: ScanJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  issuesFetched?: number;
  errorMessage?: string;
};

const jobs = new Map<string, ScanJobDetails>();

const nowIso = () => new Date().toISOString();

const createJobId = (): string => randomBytes(16).toString('hex');

export const createScanJob = (repo: string): ScanJobDetails => {
  const jobId = createJobId();
  const timestamp = nowIso();
  const job: ScanJobDetails = {
    jobId,
    repo,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  jobs.set(jobId, job);

  return { ...job };
};

export const getScanJob = (jobId: string): ScanJobDetails | null => {
  const job = jobs.get(jobId);
  return job ? { ...job } : null;
};

export const updateScanJob = (
  jobId: string,
  updates: Partial<Omit<ScanJobDetails, 'jobId' | 'repo'>>,
): void => {
  const job = jobs.get(jobId);

  if (!job) {
    return;
  }

  const updatedJob: ScanJobDetails = {
    ...job,
    ...updates,
    updatedAt: nowIso(),
  };

  jobs.set(jobId, updatedJob);
};
