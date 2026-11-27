/*
 * Manage → CMS: the public landing page's content, as the API keeps it (ipp_backend src/modules/cms). The page document
 * is edited as a whole (nested objects, lists, buttons) and saved with one PUT; courses and FAQs are lists of their own.
 */

/* A value of the page document: text, number, on/off, a list or a nested part. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Doc = { [key: string]: Json };

export interface LandingDoc {
  content: Doc;
  defaults: Doc;
  logo: { mime_type: string; size_bytes: number; version: string; path: string; updated_at: string } | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface CmsCourse {
  id: string;
  title: string;
  short_title: string | null;
  description: string;
  icon: string;
  tags: string[];
  registration_open: boolean;
  display_order: number;
  is_active: boolean;
  updated_at: string;
}

export type AnswerKind = 'TEXT' | 'COURSES';
export interface CmsFaq {
  id: string;
  question: string;
  answer: string;
  answer_kind: AnswerKind;
  display_order: number;
  is_active: boolean;
  updated_at: string;
}

/* The sections of the page, by their anchor: where a menu item or a button can point. */
export const SECTIONS: readonly (readonly [value: string, label: string])[] = [
  ['home', 'Top of the page (hero)'],
  ['about', 'About the programme'],
  ['courses', 'Courses'],
  ['structure', 'Programme structure'],
  ['benefits', 'Programme benefits'],
  ['eligibility', 'Eligibility'],
  ['documents', 'Documents required'],
  ['journey', 'Candidate journey'],
  ['placement', 'Placement support'],
  ['faqs', 'FAQs'],
  ['get-started', 'Final call to action'],
];

/* Where a button goes. */
export const CTA_ACTIONS: readonly (readonly [value: string, label: string])[] = [
  ['register', 'Registration page'],
  ['login', 'Login page'],
  ['url', 'Another web address'],
  ['section', 'A section of this page'],
];

/* A course's name in lists (blank short name = its title). */
export const courseName = (c: Pick<CmsCourse, 'title' | 'short_title'>) => c.short_title || c.title;
