import { SECTIONS, type Doc } from './cmsTypes';
import type { Def } from './fields';

/*
 * The tabs of Manage → CMS, in the order of the landing page. Each tab edits some top-level parts of the page document
 * (its `defs` are drawn from the document's root); "Courses", "FAQs" and "Site & links" add a list or the logo of their own.
 */
export interface CmsTab {
  key: string;
  label: string;
  intro: string;
  defs: Def[];
  extra?: 'logo' | 'courses' | 'faqs';
}

const BOLD = 'Put **two stars** around words to show them in bold.';
const shown: Def = { kind: 'toggle', key: 'enabled', label: 'Show on the page' };
const head = (what: string): Def[] => [
  { kind: 'toggle', key: 'enabled', label: `Show the ${what} section on the page` },
  { kind: 'text', key: 'eyebrow', label: 'Small heading above the title', max: 80 },
  { kind: 'text', key: 'title', label: 'Title', max: 160 },
  { kind: 'textarea', key: 'subtitle', label: 'Text under the title', max: 400, rows: 2 },
];
const note = (key: string, label: string): Def => ({
  kind: 'group',
  key,
  label,
  fields: [
    { kind: 'toggle', key: 'enabled', label: 'Show this note' },
    { kind: 'text', key: 'title', label: 'Bold start', max: 120 },
    { kind: 'textarea', key: 'text', label: 'Text', max: 600, rows: 2 },
  ],
});
const buttons: Def[] = [
  { kind: 'cta', key: 'primary', label: 'First button' },
  { kind: 'cta', key: 'secondary', label: 'Second button' },
];
const ctaBlock = (key: string, label: string): Def => ({
  kind: 'group',
  key,
  label,
  fields: [
    { kind: 'toggle', key: 'enabled', label: 'Show this box' },
    { kind: 'text', key: 'title', label: 'Title', max: 160 },
    { kind: 'textarea', key: 'text', label: 'Text', max: 300, rows: 2 },
    ...buttons,
  ],
});
const iconItem = (titleLabel: string, titleMax: number, textMax?: number): Def[] => [
  { kind: 'icon', key: 'icon', label: 'Icon' },
  { kind: 'text', key: 'title', label: titleLabel, max: titleMax },
  ...(textMax ? [{ kind: 'textarea', key: 'text', label: 'Text', max: textMax, rows: 2 } as Def] : []),
  shown,
];
const blank = (over: Doc): Doc => ({ icon: 'check', enabled: true, ...over });

export const CMS_TABS: CmsTab[] = [
  {
    key: 'site',
    label: 'Site & links',
    intro: 'Search engine texts, the addresses of the portal, and the logo or title text of the page.',
    extra: 'logo',
    defs: [
      {
        kind: 'group',
        key: 'links',
        label: 'Portal addresses',
        hint: 'Every button set to "Registration page" or "Login page" opens these addresses.',
        fields: [
          { kind: 'text', key: 'register_url', label: 'Registration page', max: 500, hint: 'e.g. https://ipp.sumago.ai/register' },
          { kind: 'text', key: 'login_url', label: 'Login page', max: 500, hint: 'e.g. https://ipp.sumago.ai/login' },
          {
            kind: 'text',
            key: 'landing_url',
            label: 'Address of the landing page',
            max: 500,
            hint: 'Where the landing page is published: the Preview button opens it.',
          },
        ],
      },
      {
        kind: 'group',
        key: 'branding',
        label: 'Title text',
        hint: 'Shown beside the logo, or instead of it when there is no logo.',
        fields: [
          { kind: 'text', key: 'title_line1', label: 'First line', max: 60 },
          { kind: 'text', key: 'title_line2', label: 'Second line', max: 60 },
          { kind: 'text', key: 'logo_alt', label: 'Logo description (for screen readers)', max: 120 },
          { kind: 'toggle', key: 'show_title_with_logo', label: 'Show the title text beside the logo' },
        ],
      },
      {
        kind: 'group',
        key: 'seo',
        label: 'Search engines',
        fields: [
          { kind: 'text', key: 'title', label: 'Page title (browser tab and search results)', max: 160 },
          { kind: 'textarea', key: 'description', label: 'Description', max: 320, rows: 3 },
          { kind: 'textarea', key: 'keywords', label: 'Keywords (comma-separated)', max: 600, rows: 2 },
        ],
      },
    ],
  },
  {
    key: 'header',
    label: 'Header & menu',
    intro: 'The buttons in the header and the menu items. A menu item is hidden while its section is hidden.',
    defs: [
      {
        kind: 'part',
        key: 'header',
        fields: [
          { kind: 'cta', key: 'register', label: 'Register button' },
          { kind: 'cta', key: 'login', label: 'Login button' },
          { kind: 'toggle', key: 'mobile_bar', label: 'On phones, keep both buttons in a bar at the bottom of the screen' },
        ],
      },
      {
        kind: 'list',
        key: 'nav',
        label: 'Menu',
        item: 'Menu item',
        max: 12,
        title: 'label',
        blank: { label: '', section: 'about', enabled: true },
        fields: [
          { kind: 'text', key: 'label', label: 'Text', max: 40 },
          { kind: 'select', key: 'section', label: 'Goes to', options: SECTIONS },
          shown,
        ],
      },
    ],
  },
  {
    key: 'hero',
    label: 'Hero',
    intro: 'The top of the page: the title, the first buttons, the snapshot card and the key facts.',
    defs: [
      {
        kind: 'part',
        key: 'hero',
        fields: [
          { kind: 'text', key: 'badge_tag', label: 'Badge (coloured part)', max: 30 },
          { kind: 'text', key: 'badge_text', label: 'Badge text', max: 100 },
          { kind: 'text', key: 'title_line1', label: 'Title, first line', max: 80 },
          { kind: 'text', key: 'title_line2', label: 'Title, second line (coloured)', max: 80 },
          { kind: 'textarea', key: 'tagline', label: 'Tagline', max: 200, rows: 2 },
          { kind: 'strings', key: 'paragraphs', label: 'Paragraphs', item: 'Paragraph', max: 4, itemMax: 800, multiline: true, hint: BOLD },
          ...buttons,
          { kind: 'textarea', key: 'note', label: 'Small note under the buttons', max: 300, rows: 2 },
          {
            kind: 'group',
            key: 'snapshot',
            label: 'Snapshot card',
            hint: 'The card lists the active courses (Courses tab) by their short names.',
            fields: [
              { kind: 'toggle', key: 'enabled', label: 'Show the snapshot card' },
              { kind: 'toggle', key: 'show_mix', label: 'Show the theory / practical bar' },
              { kind: 'text', key: 'kicker', label: 'Small heading', max: 60 },
              { kind: 'text', key: 'title', label: 'Title', max: 120 },
              { kind: 'strings', key: 'chips', label: 'Chips at the bottom', item: 'Chip', max: 6, itemMax: 40 },
            ],
          },
          {
            kind: 'list',
            key: 'stats',
            label: 'Key facts (cards under the hero)',
            item: 'Fact',
            max: 6,
            title: 'value',
            blank: blank({ value: '', label: '' }),
            fields: [
              { kind: 'icon', key: 'icon', label: 'Icon' },
              { kind: 'text', key: 'value', label: 'Big text', max: 20 },
              { kind: 'text', key: 'label', label: 'Small text', max: 60 },
              shown,
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'about',
    label: 'About',
    intro: 'About the programme, with its pillars.',
    defs: [
      {
        kind: 'part',
        key: 'about',
        fields: [
          ...head('About'),
          { kind: 'textarea', key: 'lead', label: 'Opening paragraph (larger text)', max: 600, rows: 3 },
          { kind: 'strings', key: 'paragraphs', label: 'Paragraphs', item: 'Paragraph', max: 4, itemMax: 800, multiline: true, hint: BOLD },
          { kind: 'strings', key: 'chips', label: 'Focus areas (chips)', item: 'Chip', max: 10, itemMax: 40 },
          {
            kind: 'list',
            key: 'pillars',
            label: 'Pillars',
            item: 'Pillar',
            max: 6,
            title: 'title',
            blank: blank({ title: '', text: '' }),
            fields: iconItem('Title', 120, 400),
          },
        ],
      },
    ],
  },
  {
    key: 'courses',
    label: 'Courses',
    intro: 'The heading of the courses section and its course cards. Only active courses are shown on the page.',
    extra: 'courses',
    defs: [
      {
        kind: 'part',
        key: 'courses',
        fields: [
          ...head('courses'),
          { kind: 'text', key: 'button_label', label: "Text of a course's button", max: 40 },
          { kind: 'text', key: 'closed_label', label: 'Text when its registration is closed', max: 40 },
          { kind: 'textarea', key: 'note', label: 'Note under the courses', max: 600, rows: 2 },
        ],
      },
    ],
  },
  {
    key: 'structure',
    label: 'Structure',
    intro: 'Duration, hours, the theory / practical split, the learning stages and the month-by-month journey.',
    defs: [
      {
        kind: 'part',
        key: 'structure',
        fields: [
          ...head('programme structure'),
          {
            kind: 'list',
            key: 'facts',
            label: 'Fact tiles',
            item: 'Tile',
            max: 6,
            title: 'label',
            blank: blank({ label: '', value: '' }),
            fields: [
              { kind: 'icon', key: 'icon', label: 'Icon' },
              { kind: 'text', key: 'label', label: 'Label', max: 40 },
              { kind: 'text', key: 'value', label: 'Value', max: 30 },
              shown,
            ],
          },
          { kind: 'toggle', key: 'show_mix', label: 'Show the theory / practical bar' },
          { kind: 'number', key: 'theory_percent', label: 'Theory, %', min: 0, max: 100, hint: 'Practical is the rest.' },
          { kind: 'text', key: 'theory_label', label: 'Name of the first part', max: 30 },
          { kind: 'text', key: 'practical_label', label: 'Name of the second part', max: 30 },
          note('project_note', 'Highlighted note'),
          { kind: 'text', key: 'stages_title', label: 'Title of the learning stages', max: 120 },
          {
            kind: 'list',
            key: 'stages',
            label: 'Learning stages',
            item: 'Stage',
            max: 10,
            title: 'title',
            blank: { title: '', text: '', enabled: true },
            fields: [
              { kind: 'text', key: 'title', label: 'Title', max: 120 },
              { kind: 'textarea', key: 'text', label: 'Text', max: 300, rows: 2 },
              shown,
            ],
          },
          {
            kind: 'group',
            key: 'months',
            label: 'Month-by-month journey',
            fields: [
              { kind: 'toggle', key: 'enabled', label: 'Show the month-by-month journey' },
              { kind: 'text', key: 'title', label: 'Title', max: 120 },
              { kind: 'textarea', key: 'note', label: 'Note under it', max: 300, rows: 2 },
              {
                kind: 'list',
                key: 'items',
                label: 'Months',
                item: 'Month',
                max: 6,
                title: 'title',
                blank: { label: '', title: '', points: [] },
                fields: [
                  { kind: 'text', key: 'label', label: 'Label (e.g. Month 1)', max: 30 },
                  { kind: 'text', key: 'title', label: 'Title', max: 120 },
                  { kind: 'strings', key: 'points', label: 'Points', item: 'Point', max: 6, itemMax: 80 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'benefits',
    label: 'Benefits',
    intro: 'Why join the programme, and the attendance note.',
    defs: [
      {
        kind: 'part',
        key: 'benefits',
        fields: [
          ...head('benefits'),
          {
            kind: 'list',
            key: 'items',
            label: 'Benefits',
            item: 'Benefit',
            max: 16,
            title: 'title',
            blank: blank({ title: '' }),
            fields: iconItem('Title', 120),
          },
          note('attendance_note', 'Attendance note'),
        ],
      },
    ],
  },
  {
    key: 'eligibility',
    label: 'Eligibility',
    intro: 'Who can apply: the conditions, and the summary card beside them.',
    defs: [
      {
        kind: 'part',
        key: 'eligibility',
        fields: [
          ...head('eligibility'),
          {
            kind: 'list',
            key: 'items',
            label: 'Conditions',
            item: 'Condition',
            max: 12,
            title: 'title',
            blank: blank({ title: '', text: '', chips: [] }),
            fields: [
              { kind: 'icon', key: 'icon', label: 'Icon' },
              { kind: 'text', key: 'title', label: 'Title', max: 120 },
              { kind: 'textarea', key: 'text', label: 'Text', max: 400, rows: 2 },
              { kind: 'strings', key: 'chips', label: 'Chips (e.g. the communities)', item: 'Chip', max: 8, itemMax: 40 },
              shown,
            ],
          },
          { kind: 'textarea', key: 'fine_print', label: 'Small print under the conditions', max: 400, rows: 2 },
          {
            kind: 'group',
            key: 'summary',
            label: 'Summary card',
            fields: [
              { kind: 'toggle', key: 'enabled', label: 'Show the summary card' },
              { kind: 'text', key: 'kicker', label: 'Small heading', max: 60 },
              { kind: 'text', key: 'title', label: 'Title', max: 120 },
              {
                kind: 'list',
                key: 'rows',
                label: 'Rows',
                item: 'Row',
                max: 8,
                title: 'label',
                blank: { label: '', value: '' },
                fields: [
                  { kind: 'text', key: 'label', label: 'Label', max: 60 },
                  { kind: 'text', key: 'value', label: 'Value', max: 160 },
                ],
              },
              { kind: 'textarea', key: 'note', label: 'Note', max: 400, rows: 2 },
              ...buttons,
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    intro: 'The documents to keep ready, the note and the call to register.',
    defs: [
      {
        kind: 'part',
        key: 'documents',
        fields: [
          ...head('documents'),
          {
            kind: 'list',
            key: 'items',
            label: 'Documents',
            item: 'Document',
            max: 16,
            title: 'text',
            blank: blank({ icon: 'file', text: '' }),
            fields: [{ kind: 'icon', key: 'icon', label: 'Icon' }, { kind: 'textarea', key: 'text', label: 'Text', max: 300, rows: 2 }, shown],
          },
          note('note', 'Note'),
          ctaBlock('cta', 'Call to register'),
        ],
      },
    ],
  },
  {
    key: 'journey',
    label: 'Journey',
    intro: 'The steps of the candidate journey, the note and the call to register.',
    defs: [
      {
        kind: 'part',
        key: 'journey',
        fields: [
          ...head('candidate journey'),
          {
            kind: 'list',
            key: 'steps',
            label: 'Steps',
            item: 'Step',
            max: 12,
            title: 'title',
            blank: blank({ title: '', text: '' }),
            fields: iconItem('Title', 120, 300),
          },
          note('note', 'Note'),
          ctaBlock('cta', 'Call to register'),
        ],
      },
    ],
  },
  {
    key: 'placement',
    label: 'Placement',
    intro: 'Placement and career support.',
    defs: [
      {
        kind: 'part',
        key: 'placement',
        fields: [
          ...head('placement support'),
          { kind: 'textarea', key: 'lead', label: 'Opening paragraph', max: 600, rows: 3 },
          note('note', 'Note'),
          {
            kind: 'list',
            key: 'items',
            label: 'Support items',
            item: 'Item',
            max: 12,
            title: 'label',
            blank: blank({ label: '' }),
            fields: [{ kind: 'icon', key: 'icon', label: 'Icon' }, { kind: 'text', key: 'label', label: 'Text', max: 120 }, shown],
          },
          ...buttons,
        ],
      },
    ],
  },
  {
    key: 'faqs',
    label: 'FAQs',
    intro: 'The heading of the FAQ section and its questions. Only active questions are shown on the page.',
    extra: 'faqs',
    defs: [{ kind: 'part', key: 'faqs', fields: head('FAQ') }],
  },
  {
    key: 'footer',
    label: 'Final call & footer',
    intro: 'The last call to action and the footer.',
    defs: [
      {
        kind: 'group',
        key: 'final_cta',
        label: 'Final call to action',
        fields: [
          { kind: 'toggle', key: 'enabled', label: 'Show the final call to action' },
          { kind: 'text', key: 'title', label: 'Title', max: 160 },
          { kind: 'textarea', key: 'text', label: 'Text', max: 400, rows: 2 },
          { kind: 'strings', key: 'points', label: 'Points with a tick', item: 'Point', max: 6, itemMax: 60 },
          ...buttons,
        ],
      },
      {
        kind: 'group',
        key: 'footer',
        label: 'Footer',
        fields: [
          { kind: 'textarea', key: 'description', label: 'Text under the title', max: 600, rows: 3 },
          { kind: 'toggle', key: 'show_quick_links', label: 'Show the quick links (the menu items)' },
          { kind: 'text', key: 'quick_links_title', label: 'Quick links heading', max: 60 },
          { kind: 'toggle', key: 'show_programmes', label: 'Show the list of active courses' },
          { kind: 'text', key: 'programmes_title', label: 'Courses heading', max: 60 },
          { kind: 'toggle', key: 'portal_enabled', label: 'Show the candidate portal column' },
          { kind: 'text', key: 'portal_title', label: 'Portal heading', max: 60 },
          { kind: 'textarea', key: 'portal_text', label: 'Portal text', max: 300, rows: 2 },
          ...buttons,
          { kind: 'text', key: 'copyright', label: 'Copyright line', max: 200, hint: '© and the current year are added in front.' },
          { kind: 'textarea', key: 'bottom_note', label: 'Note at the very bottom', max: 300, rows: 2 },
        ],
      },
    ],
  },
];

/* The parts of the document a tab edits. */
export const partsOf = (tab: CmsTab) => tab.defs.map((d) => d.key);
