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
  /* The mobile number the OTP was texted to, masked (+91XXXXXX1234). */
  mobile_masked?: string | null;
  otp_expires_in: number;
  resend_after: number;
}

export interface Ref {
  id: string;
  code: string;
  name: string;
}
/* A document on step 3, in the order the server lists them; required = is_mandatory. */
export interface DocumentType extends Ref {
  is_mandatory: boolean;
  /* No longer used: the server now sends null for every type; kept for compatibility, nothing renders from it. */
  barcode?: 'required' | 'optional' | null;
  /* Accepted formats and size, from the server: PDF / JPG / JPEG / PNG up to 5 MB, the Applicant Video MP4 up to 50 MB. */
  formats?: string[];
  max_mb?: number;
}
/* A centre that can be chosen in step 2 (active centres only). */
export interface CentreOption {
  id: string;
  name: string;
  code: string;
  district_name: string;
}
/* A technology (approved track, T01–T12) offered at a centre: GET /centres/:centreId/technologies. */
export interface TechnologyOption {
  code: string;
  name: string;
}
/* A state / district / taluka (active, A–Z). */
export interface GeoRef {
  id: string;
  name: string;
  code: string;
}
export interface Options {
  regions: Ref[];
  castes: Ref[];
  educations: Ref[];
  document_types: DocumentType[];
  religions: string[];
  tracks: { code: string; name: string }[];
  genders: string[];
  marital_statuses: string[];
  districts: GeoRef[];
  centres: CentreOption[];
  grading_types: { code: string; name: string }[];
  cgpa_scales: number[];
  qualification_classes: string[];
  /* Contact for queries, shown after submitting: set by the EDP admins on /manage/settings; message may hold {email} / {mobile}. */
  support?: { message: string; email: string | null; mobile: string | null };
  /* The congratulations dialog shown once the account is created, and the Help button's details; both from /manage/settings. */
  welcome?: WelcomeContent;
  help?: HelpContent;
}

/* The congratulations dialog the portal shows once the mobile OTP is verified and the account exists. */
export interface WelcomeContent {
  enabled: boolean;
  title: string;
  message: string;
  /* Blank: the portal uses its own button text, in the language the student chose. */
  button_label: string;
}

/* One line of the Help panel: a name and its value (an email address or a phone number becomes a link). */
export interface HelpField {
  label: string;
  value: string;
}
/* The Help button in the portal's bottom-right corner. */
export interface HelpContent {
  enabled: boolean;
  title: string;
  intro: string;
  fields: HelpField[];
}
/* How many name / value lines the Help panel holds (amrut-kalash-api EDP_HELP_FIELDS). */
export const HELP_FIELDS = 4;

/* When a settings row was last saved, and by whom; null = the API's defaults are in use. */
export interface SavedMeta {
  updated_at: string | null;
  updated_by: string | null;
}
/* GET / PUT /manage/settings/support (the support contact line). */
export interface SupportSettings extends SavedMeta {
  message: string;
  email: string | null;
  mobile: string | null;
}
/* GET / PUT /manage/settings/welcome and /manage/settings/help. */
export type WelcomeSettings = WelcomeContent & SavedMeta;
export type HelpSettings = HelpContent & SavedMeta;

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
  'gender',
  'marital_status',
  'permanent_address',
  'landmark',
  'district_id',
  'taluka_id',
  'pin_code',
  'alternate_mobile_number',
  'alternate_email',
  'disability_status',
  'disability_type',
  'disability_certificate_number',
] as const;
export const MAIN_FIELDS = [
  'region_id',
  'centre_id',
  'technology',
  'education_id',
  'qualification_name',
  'qualification_stream',
  'qualification_board',
  'qualification_completed_on',
  'grading_type',
  'cgpa_scale',
  'score',
  'qualification_class',
] as const;
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
  /* Still returned by the server; not used by the portal. */
  barcodes?: Record<string, string>;
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
/* One student in the tracking panel: GET /manage/applicants/:id (account id). */
export interface ApplicantDetail {
  account: {
    id: string;
    name: string;
    email: string;
    mobile_number: string;
    created_at: string;
    email_verified_at: string | null;
    last_login_at: string | null;
  };
  status: 'DRAFT' | 'SUBMITTED';
  steps: { basic_completed_at: string | null; main_completed_at: string | null; submitted_at: string | null };
  registration: { registration_id: string; registration_number: string | null } | null;
  aadhaar_masked: string | null;
  /* Every field as a string, '' when empty (aadhaar_number is always ''; see aadhaar_masked). */
  form: Form;
  /* Names for the ids and codes in the form; null when unknown. */
  display: Partial<
    Record<
      'caste' | 'course_centre' | 'education' | 'centre' | 'district' | 'taluka' | 'religion' | 'technology' | 'gender' | 'marital_status',
      string | null
    >
  >;
  /* The portal's documents, in order. */
  documents: { code: string; name: string; required: boolean; file: StoredFile | null }[];
}
export interface Summary {
  total: number;
  counts: Record<Stage, number>;
  stages: { code: Stage; label: string; count: number }[];
  /* Students per current follow-up status; NONE = not followed up yet. */
  follow_ups: Record<FollowUpStatus | 'NONE', number>;
}

/* Center Master (the tracking panel's /manage/centres; the same shape as in the Kalash admin panel). */
export interface CentreTechnology {
  code: string;
  name: string;
  /* false when the track was deactivated after allocation: it can no longer be allocated. */
  usable: boolean;
}
export interface Centre {
  id: string;
  name: string;
  code: string;
  stateId: string;
  stateName: string;
  stateCode: string;
  stateIsActive: boolean;
  districtId: string;
  districtName: string;
  districtCode: string;
  districtIsActive: boolean;
  talukaId: string | null;
  talukaName: string | null;
  talukaCode: string | null;
  talukaIsActive: boolean | null;
  address: string | null;
  pinCode: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  /* Allocated technologies, T01→T12. */
  technologies: CentreTechnology[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* Tracking panel accounts: an ADMIN may change things; a VIEWER can only view and download. */
export type ManageRole = 'ADMIN' | 'VIEWER';
export const MANAGE_ROLE_LABEL: Record<ManageRole, string> = { ADMIN: 'Admin', VIEWER: 'Viewer' };

/* The signed-in tracking panel account (GET /manage/me, the login answer). */
export interface Admin {
  id: string;
  name: string;
  email: string;
  role: ManageRole;
}

/* A tracking panel account in Users (GET /manage/users). */
export interface ManageUser {
  id: string;
  name: string;
  email: string;
  role: ManageRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}
