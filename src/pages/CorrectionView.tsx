import { useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, openFile } from '../api';
import { DocumentField } from '../components/DocumentField';
import { StepFields, useFocusWrong, useFormRules } from '../components/FormFields';
import { fmtDate, Notice } from '../components/ui';
import { buildModel } from '../form';
import { docName, useLang } from '../i18n';
import type { Returned } from '../returns';
import type { ApplicantDetail, Application, Form, Options } from '../types';
import { checkFields, fileIssue } from '../validation';

/* A submitted form the Auditor sent back (GET /application while it is with the candidate). */
export type ReturnedApplication = Application & {
  returned: Returned | null;
  locked_fields?: string[];
  documents?: ApplicantDetail['documents'];
};

/* Fields checked again when another one changed (as the API does). */
const RELATED: Record<string, string[]> = {
  disability_status: ['disability_type', 'disability_certificate_number'],
  grading_type: ['cgpa_scale', 'score'],
  cgpa_scale: ['score'],
  district_id: ['technology'],
  mobile_number: ['alternate_mobile_number'],
};

/*
 * The form the Auditor sent back to the candidate: the reason, then the form prefilled (both steps) and its documents. The
 * candidate corrects what the reason says and saves; saving sends only what changed (PUT /application/correction) and then
 * resubmits the form to the Auditor (POST /application/resubmit) — no separate step. A document is saved as soon as it is
 * chosen, like on the Auditor's own edit form.
 */
export default function CorrectionView({
  app,
  options,
  onApp,
  onDone,
}: {
  app: ReturnedApplication;
  options: Options;
  onApp: (a: Application) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const { lang, T } = useLang();
  const model = useMemo(() => buildModel(options, lang), [options, lang]);
  const returned = app.returned!;
  /* The saved values (own fields included); the Aadhaar number is changed only by typing a new one. */
  const [original] = useState<Form>(() => ({
    ...(Object.fromEntries((app.view_fields ?? []).map((f) => [f.key, f.value ?? ''])) as Form),
    ...app.form,
    aadhaar_number: '',
  }));
  const [form, setForm] = useState<Form>(original);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileDone, setFileDone] = useState('');

  const clearErrors = (...keys: string[]) => {
    if (keys.some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(keys.map((k) => [k, ''])) }));
  };
  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearErrors(key);
  };
  const rules = useFormRules({ form, model, set, clearErrors });
  const focusWrong = useFocusWrong();
  const locked = Object.fromEntries(
    (app.locked_fields ?? ['email']).map((k) => [
      k,
      k === 'email'
        ? T('हा आपला साइन-इन ईमेल आयडी आहे; तो बदलता येत नाही.', 'This is your sign-in e-mail ID; it cannot be changed.')
        : T('आपण बॅचमध्ये आहात: जिल्हा बदलता येत नाही.', 'You are in a batch: the district cannot be changed.'),
    ]),
  );
  const current = Object.fromEntries((app.view_fields ?? []).map((f) => [f.key, { value: f.value ?? '', text: f.text ?? '' }]));
  const changed = model.fields.filter((f) => !locked[f.key] && (form[f.key] ?? '') !== (original[f.key] ?? ''));
  const documents = app.documents ?? [];

  const wrong = (keys: string[]) =>
    T(`कृपया खूण केलेली माहिती दुरुस्त करा: ${keys.map(model.label).join(', ')}.`, `Please correct the highlighted fields: ${keys.map(model.label).join(', ')}.`);
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFailure('');
    const keys = new Set(changed.flatMap((f) => [f.key, ...(RELATED[f.key] ?? [])]));
    const local = checkFields(
      form,
      model.rules(
        model.fields.filter((f) => keys.has(f.key) && !locked[f.key]).map((f) => (f.key === 'aadhaar_number' ? { ...f, required: false } : f)),
        form,
      ),
      { T },
    );
    setErrors(local);
    if (Object.keys(local).length) {
      setFailure(wrong(Object.keys(local)));
      focusWrong(local, true);
      return toTop();
    }
    setBusy(true);
    try {
      if (changed.length)
        await api<Application>('/application/correction', {
          method: 'PUT',
          realm: 'student',
          body: { data: Object.fromEntries(changed.map((f) => [f.key, form[f.key] ?? ''])) },
        });
      await api<Application>('/application/resubmit', { method: 'POST', realm: 'student' });
      await onDone(
        T(
          'आपला दुरुस्त केलेला अर्ज जतन झाला आणि ऑडिटरकडे पुन्हा पाठवला गेला.',
          'Your corrected form is saved and has been sent back to the Auditor for review and approval.',
        ),
      );
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        const fields = err.fields();
        setErrors(fields);
        focusWrong(fields, true);
        setFailure(err.status === 422 && Object.keys(fields).length ? wrong(Object.keys(fields)) : err.message);
      } else setFailure(T('बदल जतन करता आले नाहीत', 'Could not save the changes'));
      toTop();
    }
  };

  const upload = async (code: string, file: File | undefined) => {
    const doc = documents.find((x) => x.code === code);
    if (!file || !doc) return;
    setFileDone('');
    const issue = fileIssue(file, doc);
    if (issue) return setErrors((e) => ({ ...e, [`files.${code}`]: issue }));
    setUploading(code);
    setErrors((e) => ({ ...e, [`files.${code}`]: '' }));
    try {
      const fd = new FormData();
      fd.append(code, file);
      const res = await api<Application>('/application/correction/documents', { method: 'POST', realm: 'student', body: fd });
      onApp(res.data);
      setFileDone(T(`${docName(doc, lang)} जतन झाले.`, `${docName(doc, lang)} saved.`));
    } catch (err) {
      setErrors((e) => ({ ...e, [`files.${code}`]: err instanceof ApiError ? (err.fields()[`files.${code}`] ?? err.message) : 'Upload failed' }));
    } finally {
      setUploading(null);
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="correction-title">
        <h2 id="correction-title">{T('आपला अर्ज दुरुस्तीसाठी परत पाठवला आहे', 'Your form was sent back for correction')}</h2>
        <Notice tone="warn">
          <b>{T('ऑडिटरने दिलेले कारण', 'Reason from the Auditor')}</b> ({fmtDate(returned.at)}):
          <br />
          <span style={{ whiteSpace: 'pre-line' }}>{returned.reason}</span>
        </Notice>
        <p className="sub">
          {T(
            'खालील माहिती दुरुस्त करा आणि "जतन करा आणि पुन्हा पाठवा" निवडा. जतन केल्यावर आपला अर्ज आपोआप ऑडिटरकडे तपासणी व मंजुरीसाठी पाठवला जाईल.',
            'Correct the details below and choose "Save and resubmit". Once saved, your form goes back to the Auditor automatically for review and approval.',
          )}
        </p>
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <form onSubmit={(e) => void save(e)} noValidate>
          {([1, 2] as const).map((step) => (
            <fieldset key={step} className="edit-step">
              <legend>{step === 1 ? T('टप्पा १ – मूलभूत माहिती', 'Step 1 – Basic Details') : T('टप्पा २ – मुख्य अर्ज', 'Step 2 – Main Form')}</legend>
              <StepFields
                step={step}
                model={model}
                form={form}
                errors={errors}
                rules={rules}
                locked={locked}
                current={current}
                aadhaarMasked={app.registration?.aadhaar_masked ?? null}
              />
            </fieldset>
          ))}
          <div className="actions">
            <button type="submit" className="btn" disabled={busy || uploading !== null}>
              {busy ? T('जतन होत आहे…', 'Saving…') : T('जतन करा आणि पुन्हा पाठवा', 'Save and resubmit')}
            </button>
          </div>
        </form>
      </section>
      {documents.length ? (
        <section className="card" aria-label={T('कागदपत्रे', 'Documents')}>
          <h3>{T('कागदपत्रे', 'Documents')}</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            {T(
              'आवश्यक असल्यास कागदपत्र बदला: निवडताच ते जतन होते. नंतर वर "जतन करा आणि पुन्हा पाठवा" निवडा.',
              'Replace a document if needed: it is saved as soon as you choose it. Then choose "Save and resubmit" above.',
            )}
          </p>
          {fileDone ? <Notice tone="ok">{fileDone}</Notice> : null}
          <div className="doc-list">
            {documents.map((d) => (
              <DocumentField
                key={d.code}
                type={{ code: d.code, is_mandatory: d.required, kind: d.kind }}
                name={docName(d, lang)}
                label={docName(d, lang)}
                file={d.file}
                fileError={errors[`files.${d.code}`]}
                uploading={uploading === d.code}
                onUpload={(code, f) => void upload(code, f)}
                onView={(code) =>
                  void openFile(`/application/documents/${encodeURIComponent(code)}/file`, 'student').catch(() =>
                    setErrors((e) => ({ ...e, [`files.${code}`]: T('फाइल उघडता आली नाही', 'Could not open the file') })),
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
