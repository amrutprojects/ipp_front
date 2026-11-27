import { useRef, useState } from 'react';
import type { DocumentType, StoredFile } from '../types';
import { fileRule } from '../validation';

export const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/*
 * One document (step 3 of the student's form, and the tracking panel's Edit form): its label, a file area (click, Enter /
 * Space, or drop a file on it) showing the uploaded file's name or "No file chosen", View / Replace / Remove for an
 * uploaded file, and the error. `name` = its name in the chosen language, `label` = the same, saying when it is optional.
 */
export function DocumentField(props: {
  type: Pick<DocumentType, 'code' | 'is_mandatory' | 'kind' | 'formats' | 'max_mb'>;
  name: string;
  label: string;
  file: StoredFile | null | undefined;
  fileError?: string;
  uploading: boolean;
  onUpload: (code: string, f: File | undefined) => void;
  onView: (code: string) => void;
  /* Not given: the file can be replaced but not removed. */
  onRemove?: (code: string) => void;
}) {
  const { type: t, name, file, uploading } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const rule = fileRule(t);
  const id = `doc-${t.code}`;
  const pick = () => {
    if (!uploading) inputRef.current?.click();
  };
  const described = [`${id}-hint`, props.fileError ? `${id}-err` : ''].filter(Boolean).join(' ');
  return (
    <div className={`doc-field${props.fileError ? ' invalid' : ''}`}>
      <div className="label" id={`${id}-label`}>
        {props.label} {t.is_mandatory ? <span className="req">*</span> : null}
      </div>
      <button
        type="button"
        id={id}
        className={`dropzone${dragging ? ' dragging' : ''}${file ? ' has-file' : ''}`}
        aria-labelledby={`${id}-label ${id}-file ${id}-prompt`}
        aria-describedby={described}
        aria-invalid={!!props.fileError || undefined}
        aria-busy={uploading || undefined}
        disabled={uploading}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) props.onUpload(t.code, e.dataTransfer.files?.[0]);
        }}
      >
        <span className="dz-file" id={`${id}-file`} title={file?.original_name}>
          {uploading ? 'Uploading…' : (file?.original_name ?? 'No file chosen')}
        </span>
        {file && !uploading ? (
          <span className="dz-meta">
            <span aria-hidden="true">✓</span> Uploaded · {kb(file.size_bytes)}
          </span>
        ) : null}
        <span className="dz-prompt" id={`${id}-prompt`}>
          Click or drag file
        </span>
        <span className="dz-types">
          {rule.short} · max {rule.maxMb}MB
        </span>
      </button>
      {/* Below the box, together: a row of documents lines up by its labels, boxes and this (styles.css .doc-list). */}
      <div className="doc-below">
      <input
        ref={inputRef}
        type="file"
        accept={rule.accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Upload ${name}`}
        disabled={uploading}
        onChange={(e) => {
          props.onUpload(t.code, e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {uploading ? (
        <div className="hint" role="status">
          Uploading {name}…
        </div>
      ) : null}
      {file ? (
        <div className="doc-file-actions">
          <button type="button" className="btn ghost sm" aria-label={`View ${name}`} onClick={() => props.onView(t.code)}>
            View
          </button>
          <button type="button" className="btn ghost sm" aria-label={`Replace ${name}`} onClick={pick} disabled={uploading}>
            Replace
          </button>
          {props.onRemove ? (
            <button
              type="button"
              className="btn danger sm"
              aria-label={`Remove ${name}`}
              onClick={() => props.onRemove!(t.code)}
              disabled={uploading}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      <span className="hint" id={`${id}-hint`}>
        Accepted formats: {rule.formats.join(', ')} (max {rule.maxMb}MB)
      </span>
      {props.fileError ? (
        <span className="err" role="alert" id={`${id}-err`}>
          {props.fileError}
        </span>
      ) : null}
      </div>
    </div>
  );
}
