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
/* DOCUMENT = a scan or a photo; VIDEO = an MP4. */
export type DocumentKind = 'DOCUMENT' | 'VIDEO';
/* A document on step 3 (active ones, in order, from the Documents master); required = is_mandatory. */
export interface DocumentType extends Ref {
  name_mr?: string | null;
  is_mandatory: boolean;
  kind?: DocumentKind;
  /* No longer used: the server now sends null for every type; kept for compatibility, nothing renders from it. */
  barcode?: 'required' | 'optional' | null;
  /* Accepted formats and size when the server sends them; otherwise by kind: PDF / JPG / JPEG / PNG up to 5 MB, a video MP4 up to 50 MB. */
  formats?: string[];
  max_mb?: number;
}
/*
 * What a field asks for. Answers are text: TIME HH:MM, MONTH YYYY-MM, YEAR YYYY, a choice's value (DROPDOWN, RADIO), a JSON
 * array of them in the list's order (CHECKBOXES; '' = none), Yes / No (YES_NO), Yes or '' (CONSENT). A type this portal does
 * not know (from a newer API) is asked as TEXT.
 */
export type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'EMAIL'
  | 'MOBILE'
  | 'URL'
  | 'NUMBER'
  | 'DATE'
  | 'TIME'
  | 'MONTH'
  | 'YEAR'
  | 'DROPDOWN'
  | 'RADIO'
  | 'CHECKBOXES'
  | 'YES_NO'
  | 'CONSENT';
/* The ready-made checks and limits of a field, in the order they are made. */
export const RULE_TYPES = [
  'letters',
  'digits',
  'letters_digits',
  'no_spaces',
  'uppercase',
  'pin_code',
  'pan',
  'ifsc',
  'min_length',
  'max_length',
  'whole_number',
  'min_digits',
  'max_digits',
  'min_value',
  'max_value',
  'not_future',
  'not_past',
  'min_date',
  'max_date',
  'min_age',
  'max_age',
  'min_time',
  'max_time',
  'min_choices',
  'max_choices',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];
export interface ValidationRule {
  type: RuleType;
  /* The limit of min_… and max_…: a number; a day (YYYY-MM-DD) of min_date and max_date, HH:MM of min_time and max_time. */
  value?: number | string;
}
interface CheckMessages {
  message_en: string;
  message_mr: string | null;
}
/*
 * A check of the Auditor's own. REGEX: the whole answer must match. JS: a function, run by the server only; its source is
 * sent to the Form fields master, never to students.
 */
export type CustomCheck = CheckMessages & ({ kind: 'REGEX'; source: string; flags?: string } | { kind: 'JS'; source?: string });
/* What the answer to a field must be, beyond its type or format: each rule type once, then the custom checks. */
export interface FieldValidation {
  rules: ValidationRule[];
  custom: CustomCheck[];
}
/* A field of the form as the Form fields master defines it (GET /edp/options → fields: the active ones). */
export interface FieldConfig {
  key: string;
  step: number;
  label_en: string;
  label_mr: string | null;
  required: boolean;
  type: FieldType;
  /* An own field, added in the Form fields master. */
  custom: boolean;
  /* Checked and drawn by its type alone: an own field, or a known one given another type (absent from an older API: custom). */
  by_type?: boolean;
  order: number;
  /* The dropdown list its choices come from (FIELD:<key> for a field with choices of its own); null = none. */
  options_kind: string | null;
  help_en: string | null;
  help_mr: string | null;
  /* null (or absent, from an older API) = none. */
  validation?: FieldValidation | null;
}
/* A choice of a dropdown list (GET /edp/options → lists): the stored value and its names. */
export interface ListItem {
  value: string;
  name_en: string;
  name_mr: string | null;
}
/* A centre that can be chosen in step 2 (active centres only). */
export interface CentreOption {
  id: string;
  name: string;
  code: string;
  district_name: string;
}
/* A technology (T01, T02, …); which ones a student may choose depends on the student's district. */
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
  /* From the masters (tracking panel): the active fields in order, the dropdown lists, and the technologies per district. */
  fields?: FieldConfig[];
  lists?: Record<string, ListItem[]>;
  educational_statuses?: { code: string; name: string; name_mr?: string | null }[];
  technologies?: TechnologyOption[];
  /* Only districts with a selection; any other district offers every technology. */
  district_technologies?: Record<string, string[]>;
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
  /* Typed, not chosen from the Taluka master: optional free text. */
  'taluka',
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
  'educational_status',
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
/* The known fields, plus the own fields of the Form fields master under their keys (x_…). */
export type Form = Record<FormField, string> & { [key: string]: string };
/* The form as every login shows it: active fields in order, plus switched-off ones with a value; text = as people read it. */
export interface ViewField {
  key: string;
  step: number;
  label_en: string;
  label_mr: string | null;
  type: FieldType;
  value: string | null;
  text: string | null;
  custom: boolean;
}

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
  /* A submitted form, as every login shows it. */
  view_fields?: ViewField[];
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
  /* From the form; null = not filled yet. district_id: a batch is made of students of one district. */
  district_id: string | null;
  district: string | null;
  category: string | null;
  centre: string | null;
  /* Absent from an older API. */
  centre_id?: string | null;
  /* Uploaded documents, and how many of them the Auditor verified. */
  documents: { uploaded: number; verified: number };
  /* Every uploaded document is verified. */
  documents_verified: boolean;
  /* Finally approved (by Admin). */
  final_verified: boolean;
  last_activity_at: string;
  /* The latest follow-up; null = not followed up yet. */
  follow_up: FollowUp | null;
  /*
   * Submitted, with the Auditor (not approved yet, or sent back) and every uploaded document verified: the panel can
   * approve it. It then waits for a batch; a sent back student who is already in a batch goes straight back to the
   * Divisional Officer in that batch.
   */
  can_approve: boolean;
  /* Approved by the Auditor and waiting for a batch (stage BATCH, in no batch): it can be put into one. */
  can_batch: boolean;
  approval: Approval | null;
}

/*
 * Approval stages (amrut-kalash-api EDP_APPROVAL_STAGES): after the Auditor (this panel) approves, the form waits for a
 * batch (BATCH); the batch goes to the Divisional Officer (of its district) → COEP → Head Office (skipped while its
 * approval is optional) → Admin; APPROVED = final (then in the student register). A rejection sends the one student back
 * one stage, still in the same batch.
 */
export type ApprovalStage = 'BATCH' | 'DIVISION' | 'COEP' | 'HEAD_OFFICE' | 'ADMIN' | 'APPROVED';
export type StagePoint = 'AUDITOR' | ApprovalStage;
/* The summary's approval counts: with the Auditor (RETURNED = of those, sent back), or at a stage. */
export type ApprovalFilter = 'AWAITING' | 'RETURNED' | ApprovalStage;

/*
 * The list's "Stage of application" filter: how far the form got, then whom it is with (AUDITOR = submitted and waiting
 * for the Auditor, RETURNED = of those, sent back by the Divisional Officer; BATCH = approved, waiting for a batch).
 */
export const APPLICATION_STAGES = [
  'OTP_PENDING',
  'VERIFIED',
  'BASIC_DONE',
  'MAIN_DONE',
  'AUDITOR',
  'RETURNED',
  'BATCH',
  'DIVISION',
  'COEP',
  'HEAD_OFFICE',
  'ADMIN',
  'APPROVED',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
/* The Documents and Final verification filters. */
export type VerifiedFilter = 'VERIFIED' | 'NOT_VERIFIED';
export interface FilterChoice {
  id: string;
  name: string;
}
/* GET /manage/filters: the choices of the list's dropdown filters. */
export interface ListFilterOptions {
  districts: FilterChoice[];
  categories: FilterChoice[];
  centres: FilterChoice[];
  stages: { code: ApplicationStage; label: string }[];
}
export interface ApprovalEvent {
  action: 'APPROVE' | 'REJECT';
  from: { stage: StagePoint; name: string };
  to: { stage: StagePoint; name: string };
  /* A rejection's reason. */
  reason: string | null;
  by: string | null;
  at: string;
}
export interface Approval {
  /* null = with the Auditor (not approved yet, or sent back by the Divisional Officer). */
  stage: ApprovalStage | null;
  stage_label: string | null;
  stage_updated_at: string | null;
  /* The Auditor's latest approval. */
  approved_at: string | null;
  approved_by: string | null;
  /* The latest move: an approval to the next stage, or a rejection back one stage (with its reason). */
  last_event: ApprovalEvent | null;
  /* Finally approved: the student's record in the student register (REG-000123). */
  register_id: string | null;
  /* The batch the student is in (it stays the same when the student is sent back). */
  batch: { id: string; name: string } | null;
}

/*
 * Batches (/manage/batches): exactly the batch size of students of one district, at a Center Master centre. Making one
 * sends it to the Divisional Officer; from then on its students are fixed, and every stage approves it batch by batch.
 */
export type BatchPlace = Exclude<StagePoint, 'BATCH'>;
export type DeliveryMode = 'OFFLINE' | 'ONLINE' | 'BLENDED';
export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  OFFLINE: 'Offline (classroom)',
  ONLINE: 'Online',
  BLENDED: 'Blended',
};
export interface Batch {
  id: string;
  name: string;
  /*
   * An older API leaves these out: nothing is given then. code (IPP-B-0001) is made with the batch and never changes; the
   * technology is information only, the students of a batch may have chosen different ones.
   */
  code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  delivery_mode?: DeliveryMode | null;
  technology?: TechnologyOption | null;
  /* How many of its students chose another center than the batch's. */
  other_centre?: number;
  centre: { id: string; name: string | null; code: string | null };
  district: { id: string; name: string } | null;
  students: number;
  /* The batch size it was made with. */
  size: number;
  /* How many of its students are at each stage now; AUDITOR = sent back to the Auditor. */
  stages: Record<BatchPlace, number>;
  /* Students whose latest move was a rejection, not approved again yet. */
  rejected: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}
export interface BatchMember {
  id: string;
  name: string;
  email: string;
  mobile_number: string;
  registration_id: string | null;
  register_id: string | null;
  district: string | null;
  category: string | null;
  centre: string | null;
  /* Absent from an older API: the center and the technology the student chose. */
  centre_id?: string | null;
  technology?: string | null;
  documents_verified: boolean;
  final_verified: boolean;
  approval: Approval | null;
}
export interface BatchDetail extends Batch {
  members: BatchMember[];
}
/* GET / PUT /manage/settings/batch: the exact number of students of a new batch. */
export interface BatchSettings extends SavedMeta {
  size: number;
  /* Whether each student of a batch must have a district: the form requires it (absent from an older API: yes). */
  district_required?: boolean;
}
/* The Auditor's verification of one uploaded document: who and when. */
export interface DocumentCheck {
  verified: boolean;
  at: string | null;
  by: string | null;
}
/* POST /manage/applicants/:id/documents/:docType/verify. */
export interface DocumentCheckSaved extends DocumentCheck {
  documents: { uploaded: number; verified: number };
}
/* A change the Auditor made to a submitted form: the fields, as shown (Aadhaar masked). */
export interface FormEdit {
  at: string;
  by: string | null;
  changes: { key: string; label: string; from: string | null; to: string | null }[];
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
  /* The form as every login shows it (labels and texts from the masters). */
  view_fields?: ViewField[];
  /* The active documents in order, plus any other with a file. */
  documents: {
    code: string;
    name: string;
    name_mr?: string | null;
    required: boolean;
    kind?: DocumentKind;
    file: StoredFile | null;
    verified: DocumentCheck | null;
  }[];
  /* What the Auditor changed on the submitted form, newest first. */
  edits: FormEdit[];
  /* The Auditor may change the form (submitted, not finally approved), except these fields. */
  can_edit: boolean;
  locked_fields: string[];
  /* As in the list; null before submission. */
  approval: Approval | null;
  /* Every approval and rejection, newest first. */
  history: ApprovalEvent[];
}
export interface Summary {
  total: number;
  counts: Record<Stage, number>;
  stages: { code: Stage; label: string; count: number }[];
  /* Students per current follow-up status; NONE = not followed up yet. */
  follow_ups: Record<FollowUpStatus | 'NONE', number>;
  /* Students per approval status (see ApprovalFilter). Absent from an older API. */
  approvals?: Partial<Record<ApprovalFilter, number>>;
}

/* ---------- Masters (the tracking panel's /manage/masters) ---------- */

/* GET /manage/masters: the dropdown lists. stored_as: what the form stores (its code, or the linked master's id). */
export interface MasterKind {
  kind: string;
  name: string;
  count: number;
  active: number;
  can_add: boolean;
  can_delete: boolean;
  stored_as: 'code' | 'master';
}
/* GET /manage/masters/:kind: one choice. */
export interface MasterOption {
  id: string;
  value: string;
  code: string;
  name_en: string;
  name_mr: string | null;
  order: number;
  is_active: boolean;
  /* Cannot be deleted. */
  is_system: boolean;
  in_use: boolean | number;
}
/* GET /manage/technologies/districts; all = every active technology (nothing selected). */
export interface DistrictTechnologies {
  district_id: string;
  district: string;
  all: boolean;
  codes: string[];
}
/* GET /manage/documents. */
export interface MasterDocument {
  id: string;
  code: string;
  name_en: string;
  name_mr: string | null;
  required: boolean;
  is_active: boolean;
  is_system: boolean;
  kind: DocumentKind;
  order: number;
  in_use: boolean | number;
}
/* GET /manage/fields (all of them, active or not). */
export interface MasterField extends FieldConfig {
  id: string;
  is_active: boolean;
  /* The types it can be given (absent from an older API: any for an own field, else only its own). */
  types?: FieldType[];
}

/* GET /manage/states: every state, active or not; districts = how many it has. */
export interface MasterState {
  id: string;
  name: string;
  code: string;
  districts: number;
  is_active: boolean;
  in_use: boolean;
}
/* GET /manage/districts: every district, active or not; talukas = how many it has (absent from an older API). */
export interface MasterDistrict {
  id: string;
  name: string;
  code: string;
  state_id?: string;
  state: string;
  talukas?: number;
  is_active: boolean;
  in_use: boolean;
}
/* GET /manage/talukas (paged). */
export interface MasterTaluka {
  id: string;
  name: string;
  code: string | null;
  district_id: string;
  district: string;
  is_active: boolean;
  in_use: boolean;
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
  /* No longer used: the technologies a student may choose depend on the student's district (Masters → Technologies). */
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
