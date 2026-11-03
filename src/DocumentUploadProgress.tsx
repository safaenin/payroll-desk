import { useEffect, useRef } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
export type UploadProgress = { name: string; employee: string; stage: 'upload' | 'link' };
export default function DocumentUploadProgress({ progress }: { progress: UploadProgress }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal document-upload-progress"
      aria-labelledby="upload-title"
      aria-describedby="upload-description"
      onCancel={(e) => e.preventDefault()}
    >
      <div role="status" aria-live="polite">
        <LoaderCircle className="upload-spinner" size={30} aria-hidden="true" />
        <h2 id="upload-title">
          {progress.stage === 'upload' ? 'Uploading document' : 'Saving employee document'}
        </h2>
        <p id="upload-description">Please keep this window open until the upload finishes.</p>
        <div className="upload-file-summary">
          <strong>{progress.name}</strong>
          <span>{progress.employee}</span>
        </div>
        <ol className="upload-steps">
          <li className={progress.stage === 'link' ? 'complete' : 'current'}>
            {progress.stage === 'link' ? (
              <Check size={18} />
            ) : (
              <LoaderCircle className="upload-spinner" size={18} />
            )}
            <span>
              {progress.stage === 'link'
                ? 'Uploaded to Google Drive'
                : 'Preparing folder and uploading to Google Drive…'}
            </span>
          </li>
          <li className={progress.stage === 'link' ? 'current' : ''}>
            {progress.stage === 'link' ? (
              <LoaderCircle className="upload-spinner" size={18} />
            ) : (
              <span className="upload-step-dot" />
            )}
            <span>
              {progress.stage === 'link'
                ? 'Saving the employee link and updating the checklist…'
                : 'Save employee link and update checklist'}
            </span>
          </li>
        </ol>
      </div>
    </dialog>
  );
}
