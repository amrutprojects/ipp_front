export interface Account {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  mobile_number: string;
  email_verified: boolean;
}

export interface Session {
  token: string;
  expires_at: string;
  account: Account;
}

export interface OtpTiming {
  email: string;
  otp_expires_in: number;
  resend_after: number;
}

export interface Ref {
  id: string;
  code: string;
  name: string;
}
export interface DocumentType extends Ref {
  is_mandatory: boolean;
  barcode: 'required' | 'optional' | null;
}
export interface Options {
  regions: Ref[];
  castes: Ref[];
  educations: Ref[];
  document_types: DocumentType[];
  religions: string[];
  tracks: { code: string; name: string }[];
  /* Contact for queries, shown after submitting (EDP_SUPPORT_EMAIL / EDP_SUPPORT_MOBILE in the API's .env). */
  support?: { email: string | null; mobile: string | null };
}

export const BASIC_FIELDS = [
  'first_name',
  'last_name',
  'father_name',
  'mother_name',
  'email',
  'date_of_birth',
  'current_address',
  'aadhaar_number',
  'mobile_number',
  'religion',
  'caste_id',
] as const;
export const MAIN_FIELDS = ['region_id', 'technology', 'education_id'] as const;
export type FormField = (typeof BASIC_FIELDS)[number] | (typeof MAIN_FIELDS)[number];
export type Form = Record<FormField, string>;

export interface StoredFile {
  doc_type: string;
  name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  verified?: boolean;
}

/* SUBMITTED is final: a submitted form cannot be edited or resubmitted. */
export type ApplicationStatus = 'DRAFT' | 'SUBMITTED';
export interface Application {
  status: ApplicationStatus;
  current_step: number;
  steps: { basic_completed: boolean; main_completed: boolean };
  editable: boolean;
  submitted_at: string | null;
  form: Form;
  barcodes: Record<string, string>;
  draft_files: StoredFile[];
  submitted_files: StoredFile[];
  registration: {
    registration_id: string;
    registration_number: string | null;
    status: string;
    aadhaar_masked: string | null;
    display: Record<string, string | null>;
  } | null;
}

export interface Submitted {
  registration_id: string;
  registration_number: string | null;
  status: string;
}

export type Stage = 'OTP_PENDING' | 'VERIFIED' | 'BASIC_DONE' | 'MAIN_DONE' | 'SUBMITTED';

/* Follow-up statuses of the tracking panel (amrut-kalash-api EDP_FOLLOW_UP_STATUS). */
export const FOLLOW_UP_STATUS = {
  PENDING: 'Pending follow-up',
  CALLED: 'Follow-up call',
  SECOND_CALL: 'Second follow-up',
  FORM_FILLED: 'Form filled',
} as const;
export type FollowUpStatus = keyof typeof FOLLOW_UP_STATUS;
export const FOLLOW_UP_NOTE_MAX = 1000;
export interface FollowUp {
  status: FollowUpStatus;
  status_label: string;
  note: string | null;
  at: string;
  by: string | null;
}
export interface Applicant {
  id: string;
  name: string;
  email: string;
  mobile_number: string;
  stage: Stage;
  stage_label: string;
  account_created_at: string;
  otp_verified_at: string | null;
  last_login_at: string | null;
  basic_completed_at: string | null;
  main_completed_at: string | null;
  submitted_at: string | null;
  registration_id: string | null;
  registration_number: string | null;
  last_activity_at: string;
  /* The latest follow-up; null = not followed up yet. */
  follow_up: FollowUp | null;
}
export interface Summary {
  total: number;
  counts: Record<Stage, number>;
  stages: { code: Stage; label: string; count: number }[];
  /* Students per current follow-up status; NONE = not followed up yet. */
  follow_ups: Record<FollowUpStatus | 'NONE', number>;
}
