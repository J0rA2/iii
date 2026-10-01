/**
 * Minimal in-memory background job runner.
 *
 * Long operations (download, normalize, transcribe, score, render) can take
 * many minutes on a small cloud instance. Holding one HTTP request open for
 * that long breaks on mobile Safari (the request dies when the phone locks or
 * the tab is backgrounded). Instead the client starts a job, gets a jobId
 * back immediately, and polls GET /api/jobs/:id until it is done.
 *
 * Jobs live in process memory: a restart/redeploy forgets them, which matches
 * the ephemeral filesystem the uploaded files live on anyway.
 */
const crypto = require('crypto');

const jobs = new Map();
const JOB_TTL_MS = 6 * 60 * 60 * 1000; // keep finished job records for 6h

function publicView(job) {
  return {
    id: job.id,
    type: job.type,
    state: job.state, // queued | running | done | error
    step: job.step,
    message: job.message,
    percent: job.percent,
    result: job.state === 'done' ? job.result : null,
    error: job.state === 'error' ? job.error : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

/**
 * Runs heavy jobs one at a time so two uploads never fight over the same
 * CPU/RAM (Whisper + FFmpeg on a single small instance would OOM).
 */
let chain = Promise.resolve();

function createJob(type, worker) {
  const id = crypto.randomBytes(9).toString('hex');
  const job = {
    id,
    type,
    state: 'queued',
    step: 0,
    message: 'Waiting for the previous job to finish...',
    percent: 0,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(id, job);

  const update = (patch) => {
    Object.assign(job, patch, { updatedAt: Date.now() });
  };

  chain = chain.then(async () => {
    update({ state: 'running', message: 'Starting...' });
    try {
      const result = await worker(update);
      update({ state: 'done', percent: 100, result, message: 'Done' });
    } catch (err) {
      console.error(`[job ${id}] ${type} failed:`, err);
      update({ state: 'error', error: err && err.message ? err.message : String(err) });
    }
  });

  return publicView(job);
}

function getJob(id) {
  const job = jobs.get(id);
  return job ? publicView(job) : null;
}

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if ((job.state === 'done' || job.state === 'error') && job.updatedAt < cutoff) jobs.delete(id);
  }
}, 15 * 60 * 1000).unref();

module.exports = { createJob, getJob };
