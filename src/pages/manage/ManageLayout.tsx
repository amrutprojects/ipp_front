import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Footer, Header } from '../../components/ui';
import { useCanEdit, useManage } from '../../session';

/* The tracking panel's top bar: who is signed in (and "View only" for a viewer), and Logout. */
export function ManageHeader() {
  const { user, signOut } = useManage();
  const canEdit = useCanEdit();
  return (
    <Header
      right={
        <>
          <span className="who">
            Tracking panel
            <br />
            <small>{user?.email}</small>
            {user && !canEdit ? (
              <>
                {' '}
                <span className="badge view-only">View only</span>
              </>
            ) : null}
          </span>
          <button className="btn light sm" onClick={signOut}>
            Logout
          </button>
        </>
      }
    />
  );
}

/* Applicants (the student tracking list), Batches, Center Master, for an admin Users, and Settings (read-only for a viewer). */
export function ManageNav() {
  const canEdit = useCanEdit();
  return (
    <nav className="manage-nav" aria-label="Tracking panel sections">
      <NavLink to="/manage" end>
        Applicants
      </NavLink>
      <NavLink to="/manage/batches">Batches</NavLink>
      <NavLink to="/manage/centres">Center Master</NavLink>
      {canEdit ? <NavLink to="/manage/users">Users</NavLink> : null}
      <NavLink to="/manage/settings">Settings</NavLink>
    </nav>
  );
}

/* A tracking panel page: header, section links, the page, footer. */
export function ManageShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <ManageHeader />
      <main className="page" style={{ maxWidth: wide ? 1640 : 1100 }}>
        <ManageNav />
        {children}
      </main>
      <Footer />
    </>
  );
}
