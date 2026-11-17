import { useLang } from '../i18n';
import type { WelcomeContent } from '../types';
import { Modal } from './ui';

/*
 * The congratulations dialog, shown once the mobile OTP is verified and the account exists (ApplicationPage, arriving
 * from /verify). Its wording comes from the tracking panel (/manage/settings → Welcome message, sent with GET
 * /edp/options); until an admin saves one, the portal's own text is used, in the language the student chose.
 */
export function WelcomeDialog({ welcome, onClose }: { welcome?: WelcomeContent; onClose: () => void }) {
  const { T } = useLang();
  /* Switched off in the tracking panel: the student goes straight to the form. */
  if (welcome?.enabled === false) return null;

  const title = welcome?.title?.trim() || T('अभिनंदन! आपले खाते तयार झाले आहे', 'Congratulations! Your account is created');
  const message =
    welcome?.message?.trim() ||
    T(
      'आपला मोबाईल क्रमांक पडताळला गेला असून आपले खाते तयार झाले आहे. आता तीन टप्प्यांत फॉर्म भरा, कागदपत्रे अपलोड करा आणि अर्ज सबमिट करा.',
      'Your mobile number is verified and your account is ready. Fill in the form in three steps, upload your documents and submit your application.',
    );
  const button = welcome?.button_label?.trim() || T('फॉर्म भरायला सुरुवात करा', 'Start filling my form');

  return (
    <Modal title={title} onClose={onClose} closeLabel={T('बंद करा', 'Close')}>
      <div className="welcome">
        <span className="welcome-tick" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <p>{message}</p>
      </div>
      <div className="actions">
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          {button}
        </button>
      </div>
    </Modal>
  );
}
