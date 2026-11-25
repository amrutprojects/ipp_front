import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, openFile } from '../../api';
import { DocumentField } from '../../components/DocumentField';
import { StepFields, useFormRules } from '../../components/FormFields';
import { Notice, useOptions } from '../../components/ui';
import { buildModel } from '../../form';
import type { ApplicantDetail, Form, Options } from '../../types';
import { checkFields, fileIssue } from '../../validation';
import { ManageShell } from './ManageLayout';

/* Why a field cannot be changed here. */
const LOCKED_WHY: Record<string, string> = {
  district_id: 'The student is in a batch: the district cannot be changed.',
  email: 'The student signs in with this email ID; it cannot be changed.',
};
/* Fields checked again when another one changed. */
const RELATED: Record<string, string[]> = {
  disability_status: ['disability_type', 'disability_certificate_number'],
  grading_type: ['cgpa_scale', 'score'],
  cgpa_scale: ['score'],
  district_id: ['technology'],
  mobile_number: ['alternate_mobile_number'],
};

/*
 * Edit form (/manage/applicants/:id/edit, admins only): the Auditor changes a submitted form until its final approval —
 * the student's own form (same fields, choices and checks, from the masters), prefilled. Only what changed is sent, and the
 * API records it; the Aadhaar number is changed only by entering a new one. Documents can be replaced or added.
 */
export default function EditFormPage() {
  const { id = '' } = useParams();
  const options = useOptions();
  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setDetail(null);
    setError('');
    api<ApplicantDetail>(`/manage/applicants/${encodeURIComponent(id)}`, { realm: 'manage' })
      .then((r) => live && setDetail(r.data))
      .catch((e: Error) => {
        if (!live) return;
        setError(e instanceof ApiError && e.status === 404 ? 'This student was not found.' : e.message || 'Could not load the student');
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <ManageShell>
      <p className="mt8">
        <Link to={`/manage/applicants/${encodeURIComponent(id)}`}>← Back to the student</Link>
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!error && (!detail || !options) ? <div className="loading">Loading…</div> : null}
      {detail && !detail.can_edit ? <Notice tone="warn">This form cannot be changed (it is not submitted, or it is finally approved).</Notice> : null}
      {detail?.can_edit && options ? <EditForm key={id} id={id} detail={detail} options={options} onDetail={setDetail} /> : null}
    </ManageShell>
  );
}

function EditForm({
  id,
  detail,
  options,
  onDetail,
}: {
  id: string;
  detail: ApplicantDetail;
  options: Options;
  onDetail: (d: ApplicantDetail) => void;
}) {
  const navigate = useNavigate();
  /* The panel is in English. */
  const model = useMemo(() => buildModel(options, 'en'), [options]);
  /* The saved values (own fields included); the Aadhaar number is never sent here. */
  const [original] = useState<Form>(() => ({
    ...(Object.fromEntries((detail.view_fields ?? []).map((f) => [f.key, f.value ?? ''])) as Form),
    ...detail.form,
    aadhaar_number: '',
    email: detail.form.email || detail.account.email,
  }));
  const [form, setForm] = useState<Form>(original);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileDone, setFileDone] = useState('');

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearErrors(key);
  };
  const clearErrors = (...keys: string[]) => {
    if (keys.some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(keys.map((k) => [k, ''])) }));
  };
  const rules = useFormRules({ form, model, set, clearErrors });
  const locked = Object.fromEntries([...detail.locked_fields, 'email'].map((k) => [k, LOCKED_WHY[k] ?? 'This field cannot be changed.']));
  const current = Object.fromEntries((detail.view_fields ?? []).map((f) => [f.key, { value: f.value ?? '', text: f.text ?? '' }]));

  const changed = model.fields.filter((f) => !locked[f.key] && (form[f.key] ?? '') !== (original[f.key] ?? ''));

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFailure('');
    if (!changed.length) return setFailure('Nothing to save: nothing was changed.');
    const keys = new Set(changed.flatMap((f) => [f.key, ...(RELATED[f.key] ?? [])]));
    const local = checkFields(
      form,
      model.rules(
        model.fields.filter((f) => keys.has(f.key) && !locked[f.key]).map((f) => (f.key === 'aadhaar_number' ? { ...f, required: false } : f)),
        form,
      ),
    );
    setErrors(local);
    if (Object.keys(local).length) {
      setFailure(`Please correct the highlighted fields: ${Object.keys(local).map(model.label).join(', ')}.`);
      return toTop();
    }
    setBusy(true);
    try {
      await api<ApplicantDetail>(`/manage/applicants/${encodeURIComponent(id)}/form`, {
        method: 'PUT',
        realm: 'manage',
        body: { data: Object.fromEntries(changed.map((f) => [f.key, form[f.key] ?? ''])) },
      });
      navigate(`/manage/applicants/${encodeURIComponent(id)}`, { state: { flash: 'Changes saved.' } });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        const fields = err.fields();
        setErrors(fields);
        setFailure(
          err.status === 422 && Object.keys(fields).length
            ? `Please correct the highlighted fields: ${Object.keys(fields).map(model.label).join(', ')}.`
            : err.message,
        );
      } else setFailure('Could not save the changes');
      toTop();
    }
  };

  const upload = async (code: string, file: File | undefined) => {
    const doc = detail.documents.find((x) => x.code === code);
    if (!file || !doc) return;
    setFileDone('');
    const issue = fileIssue(file, doc);
    if (issue) return setErrors((e) => ({ ...e, [`files.${code}`]: issue }));
    setUploading(code);
    setErrors((e) => ({ ...e, [`files.${code}`]: '' }));
    try {
      const fd = new FormData();
      fd.append(code, file);
      await api(`/manage/applicants/${encodeURIComponent(id)}/documents`, { method: 'POST', realm: 'manage', body: fd });
      const res = await api<ApplicantDetail>(`/manage/applicants/${encodeURIComponent(id)}`, { realm: 'manage' });
      onDetail(res.data);
      setFileDone(`${doc.name} saved. It has to be verified again.`);
    } catch (err) {
      setErrors((e) => ({ ...e, [`files.${code}`]: err instanceof ApiError ? (err.fields()[`files.${code}`] ?? err.message) : 'Upload failed' }));
    } finally {
      setUploading(null);
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="edit-title">
        <h2 id="edit-title">Edit form – {detail.account.name}</h2>
        <p className="sub">
          Change what is wrong and save. Every change is recorded and shown on the student&apos;s page. Fields marked * are mandatory.
        </p>
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <form onSubmit={(e) => void save(e)} noValidate>
          {([1, 2] as const).map((step) => (
            <fieldset key={step} className="edit-step">
              <legend>{step === 1 ? 'Step 1 – Basic Details' : 'Step 2 – Main Form'}</legend>
              <StepFields
                step={step}
                model={model}
                form={form}
                errors={errors}
                rules={rules}
                locked={locked}
                current={current}
                aadhaarMasked={detail.aadhaar_masked}
              />
            </fieldset>
          ))}
          <div className="actions">
            <Link className="btn ghost" to={`/manage/applicants/${encodeURIComponent(id)}`}>
              Cancel
            </Link>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : `Save changes${changed.length ? ` (${changed.length})` : ''}`}
            </button>
          </div>
        </form>
      </section>
      <section className="card" aria-label="Documents">
        <h3>Documents</h3>
        <p className="hint" style={{ marginTop: -6 }}>
          A document is saved as soon as it is chosen; a replaced one has to be verified again.
        </p>
        {fileDone ? <Notice tone="ok">{fileDone}</Notice> : null}
        <div className="doc-list">
          {detail.documents.map((d) => (
            <DocumentField
              key={d.code}
              type={{ code: d.code, is_mandatory: d.required, kind: d.kind }}
              name={d.name}
              label={d.name}
              file={d.file}
              fileError={errors[`files.${d.code}`]}
              uploading={uploading === d.code}
              onUpload={(code, f) => void upload(code, f)}
              onView={(code) =>
                void openFile(`/manage/applicants/${encodeURIComponent(id)}/documents/${encodeURIComponent(code)}/file`, 'manage').catch(() =>
                  setErrors((e) => ({ ...e, [`files.${code}`]: 'Could not open the file' })),
                )
              }
            />
          ))}
        </div>
      </section>
    </>
  );
}
