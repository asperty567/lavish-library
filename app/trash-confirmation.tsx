'use client';

import { useEffect, useRef } from 'react';

type Props = {
  readonly count: number;
  readonly activeCount: number;
  readonly busy: boolean;
  readonly error: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

export function TrashConfirmation({ count, activeCount, busy, error, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className="trash-confirmation" role="group" aria-label="Confirm move to Trash"
      onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancel(); }}>
      <p>{activeCount > 0
        ? count === 1
          ? 'This review is still open. End it and move the file to Trash?'
          : `${activeCount} of ${count} selected reviews are still open. End them and move the files to Trash?`
        : `Move ${count} selected ${count === 1 ? 'entry' : 'entries'} to Trash?`}</p>
      <p className="trash-detail">Files move to Mac Trash. Saved versions and review history stay on disk.</p>
      <div className="trash-confirmation-actions">
        <button className="trash-confirm" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Moving to Trash…' : activeCount > 0 ? 'End review and move to Trash' : 'Move to Trash'}
        </button>
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="trash-error" role="alert">{error}</p>}
    </div>
  );
}
