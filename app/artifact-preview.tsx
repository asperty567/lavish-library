'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api-client';

export default function ArtifactPreview({ id, title, exists, scannedAt }: { id: string; title: string; exists: boolean; scannedAt: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState(exists ? 'pending' : 'missing');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await apiFetch(`/artifacts/preview?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Preview unavailable');
        let retry = false;
        if (response.headers.get('content-type')?.startsWith('image/png')) {
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          const next = URL.createObjectURL(blob);
          setImage(next);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = next;
          retry = response.headers.get('x-lavish-preview-stale') === 'true';
          setStatus(retry ? 'stale' : 'ready');
        } else {
          const result = await response.json();
          if (controller.signal.aborted) return;
          setImage(null);
          setStatus(result.status);
          retry = result.status === 'pending';
        }
        timer = setTimeout(() => void load(), retry ? 2000 : 30_000);
      } catch {
        if (!controller.signal.aborted) {
          setImage(null); setStatus('failed');
          timer = setTimeout(() => void load(), 30_000);
        }
      }
    }
    if (exists) void load();
    return () => { controller.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, exists, scannedAt]);

  return <div className="artifact-preview">
    {/* The authenticated PNG is a local object URL. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img src={image} alt={`Preview of ${title}`} onError={() => { setImage(null); setStatus('failed'); }} /> : <div className="preview-fallback"><span aria-hidden="true">◇</span><strong>{status === 'missing' ? 'Source file missing' : status === 'pending' ? 'Preparing preview…' : 'Preview unavailable'}</strong><small>{status === 'missing' ? 'View history for recovery options' : status === 'pending' ? 'Captured locally in the background' : 'Open the artifact to view it'}</small></div>}
    {status === 'stale' && image && <span className="preview-refreshing">Updating preview…</span>}
  </div>;
}
