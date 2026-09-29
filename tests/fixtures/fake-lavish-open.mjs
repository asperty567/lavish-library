#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve(process.argv[2]);
const state = JSON.parse(await readFile(path.join(process.env.LAVISH_AXI_STATE_DIR, 'state.json'), 'utf8'));
const session = Object.values(state.sessions || {}).find((item) => path.resolve(item.file) === file);
const id = createHash('sha256').update(file).digest('hex').slice(0, 16);
const url = session?.url?.includes('/session/legacy') ? `http://127.0.0.1:4387/session/${id}`
  : session?.url || `http://127.0.0.1:4387/session/${id}`;
process.stdout.write(`session:\n  file: ${file}\n  url: ${JSON.stringify(url)}\n  status: ${process.env.FAKE_LAVISH_STATUS || 'opened'}\n`);
