#!/usr/bin/env node
/**
 * Root `npm install` convenience for local development:
 *   1. installs + builds the React client (client/dist)
 *   2. installs the Python AI dependencies (Whisper, OpenCV, ONNX, yt-dlp)
 *
 * The Docker image performs both steps itself in dedicated, cacheable layers
 * (a Node build stage for the client, a Python virtualenv for the AI stack),
 * and at the moment the root `npm ci` runs there the client source isn't even
 * copied into the image yet. The Dockerfile therefore sets
 * OPENCLIP_DOCKER_BUILD=1, and this script steps aside instead of running a
 * second, conflicting install/build.
 */
const { spawnSync } = require('child_process');
const path = require('path');

if (process.env.OPENCLIP_DOCKER_BUILD === '1') {
  console.log('[postinstall] OPENCLIP_DOCKER_BUILD=1: client build and Python deps are handled by the Dockerfile stages.');
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args) {
  console.log(`[postinstall] ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  return r.status === 0;
}

if (!run(npm, ['--prefix', 'client', 'install'])) process.exit(1);
if (!run(npm, ['--prefix', 'client', 'run', 'build'])) process.exit(1);

const requirements = path.join('server', 'requirements.txt');
const pipOk =
  run('pip3', ['install', '--no-cache-dir', '-r', requirements]) ||
  run('pip', ['install', '--no-cache-dir', '-r', requirements]);

if (!pipOk) {
  // Kept non-fatal for local setups (as before): the web UI still builds, but
  // local transcription/tracking need these packages. Install them manually:
  console.warn(`\n[postinstall] WARNING: Python dependencies were not installed. Run: pip3 install -r ${requirements}\n`);
}
