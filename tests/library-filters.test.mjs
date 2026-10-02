import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countLibraryFilters, filterLibraryArtifacts } from '../app/library-filters.ts';

const artifacts = [
  { projectId: 'alpha', title: 'Alpha live', description: 'Launch plan', file: '/alpha/live.html', sessionStatus: 'open' },
  { projectId: 'alpha', title: 'Alpha draft', description: 'Research notes', file: '/alpha/draft.html', sessionStatus: 'discovered' },
  { projectId: 'alpha', title: 'Alpha closed', description: 'Decision record', file: '/alpha/closed.html', sessionStatus: 'ended' },
  { projectId: 'beta', title: 'Beta live', description: 'Launch plan', file: '/beta/live.html', sessionStatus: 'open' },
  { projectId: 'beta', title: 'Beta draft', description: 'Research notes', file: '/beta/draft.html', sessionStatus: 'discovered' },
];

test('filters artifacts by project and status', () => {
  const result = filterLibraryArtifacts(artifacts, {
    selectedProject: 'alpha',
    query: '',
    statusFilter: 'live',
    serverRunning: true,
  });
  assert.deepEqual(result.map((artifact) => artifact.title), ['Alpha live']);
});

test('counts each selector within the selected project and search', () => {
  const counts = countLibraryFilters(artifacts, {
    selectedProject: 'alpha',
    query: 'launch',
    serverRunning: true,
  });
  assert.deepEqual(counts, { all: 1, live: 1, discovered: 0 });
});

test('reports no live artifacts while the Lavish server is stopped', () => {
  const counts = countLibraryFilters(artifacts, {
    selectedProject: 'all',
    query: '',
    serverRunning: false,
  });
  assert.equal(counts.live, 0);
});

test('retains an ended action context in Live without bypassing project or search', () => {
  const retain = (artifact) => artifact.file === '/alpha/closed.html';
  const filter = { selectedProject: 'alpha', query: '', statusFilter: 'live', serverRunning: true };
  assert.deepEqual(filterLibraryArtifacts(artifacts, filter, retain).map((artifact) => artifact.file),
    ['/alpha/live.html', '/alpha/closed.html']);
  assert.deepEqual(filterLibraryArtifacts(artifacts, { ...filter, query: 'launch' }, retain).map((artifact) => artifact.file),
    ['/alpha/live.html']);
  assert.deepEqual(filterLibraryArtifacts(artifacts, { ...filter, selectedProject: 'beta' }, retain).map((artifact) => artifact.file),
    ['/beta/live.html']);
});
