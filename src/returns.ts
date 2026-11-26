/*
 * A submitted form the Auditor sends back to the candidate to correct (ipp_backend program/returns), possible while the
 * setting "Enable Rejection Email Notification and Resubmission" is on. The candidate gets an e-mail with the reason, corrects
 * the form on the portal and saves it, which resubmits it to the Auditor.
 */

/* /manage/settings/rejection */
export interface RejectionSettings {
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED' | 'NOT_SENT';

export interface FormReturn {
  seq: string;
  reason: string;
  by: string;
  at: string;
  email_status: EmailStatus;
  email_at: string | null;
  resubmitted_at: string | null;
}

/* /manage/applicants/:id/returns */
export interface Returns {
  enabled: boolean;
  open: FormReturn | null;
  can_return: boolean;
  returns: FormReturn[];
}

/* What the student portal gets with a form that was sent back (Application.returned). */
export interface Returned {
  reason: string;
  at: string;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

export const EMAIL_STATUS_TEXT: Record<EmailStatus, string> = {
  PENDING: 'E-mail being sent',
  SENT: 'E-mail sent to the candidate',
  FAILED: 'The e-mail could not be sent',
  NOT_SENT: 'No e-mail sent: no mail server is set up',
};

export const SETTING_TITLE = 'Enable Rejection Email Notification and Resubmission';
