import { Fragment, type ReactNode } from 'react';

/* The support contact line, as edited on /manage/settings (GET /edp/options → support). */
export interface SupportContactInfo {
  message: string;
  email: string | null;
  mobile: string | null;
}

export const DEFAULT_SUPPORT_MESSAGE =
  'If you have any query related to your registration, you can contact us on email ID {email} or mobile number {mobile}.';

const PLACEHOLDER_RE = /(\{email\}|\{mobile\})/;

/* tel: links carry the digits (and a leading +) only: no spaces, brackets or hyphens. */
export const telHref = (mobile: string) => `tel:${mobile.replace(/[^\d+]/g, '')}`;

function EmailLink({ email }: { email: string }) {
  return <a href={`mailto:${email}`}>{email}</a>;
}
function MobileLink({ mobile }: { mobile: string }) {
  return (
    <a href={telHref(mobile)} className="nowrap">
      {mobile}
    </a>
  );
}

/*
 * The message as students see it, built as React nodes (never HTML): {email} → a mailto: link, {mobile} → a tel: link.
 * A message without placeholders is followed by whichever contacts are set. Empty message → null (nothing shown).
 */
export function supportMessageNodes(support: Partial<SupportContactInfo> | null | undefined): ReactNode | null {
  const message = support?.message?.trim() ?? '';
  if (!message) return null;
  const email = support?.email?.trim() || null;
  const mobile = support?.mobile?.trim() || null;
  const parts = message.split(PLACEHOLDER_RE);
  if (parts.length > 1) {
    return parts.map((part, i) => {
      if (part === '{email}') return email ? <EmailLink key={i} email={email} /> : null;
      if (part === '{mobile}') return mobile ? <MobileLink key={i} mobile={mobile} /> : null;
      return <Fragment key={i}>{part}</Fragment>;
    });
  }
  return (
    <>
      {message}
      {email ? (
        <>
          {' '}
          Email: <EmailLink email={email} />
        </>
      ) : null}
      {email && mobile ? ',' : null}
      {mobile ? (
        <>
          {' '}
          Mobile: <MobileLink mobile={mobile} />
        </>
      ) : null}
    </>
  );
}

/* The message in a span (for a Notice or the settings preview); renders nothing when the message is empty. */
export function SupportMessage({ support }: { support: Partial<SupportContactInfo> | null | undefined }) {
  const nodes = supportMessageNodes(support);
  return nodes === null ? null : <span className="support-message">{nodes}</span>;
}
