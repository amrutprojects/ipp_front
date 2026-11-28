import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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

/*
 * Dashboard (the Auditor's figures), Applicants (the student tracking list), Batches, Masters, for an admin Users, Settings and CMS (the public landing page);
 * Settings and CMS are read-only for a viewer.
 */
export function ManageNav() {
  const canEdit = useCanEdit();
  /* Center Master keeps its own address, under Masters. */
  const inCentres = useLocation().pathname.startsWith('/manage/centres');
  return (
    <nav className="manage-nav" aria-label="Tracking panel sections">
      <NavLink to="/manage/dashboard">Dashboard</NavLink>
      <NavLink to="/manage" end>
        Applicants
      </NavLink>
      <NavLink to="/manage/batches">Batches</NavLink>
      <NavLink to="/manage/masters" className={({ isActive }) => (isActive || inCentres ? 'active' : '')}>
        Masters
      </NavLink>
      {canEdit ? <NavLink to="/manage/users">Users</NavLink> : null}
      <NavLink to="/manage/settings">Settings</NavLink>
      <NavLink to="/manage/cms">CMS</NavLink>
    </nav>
  );
}

/* The masters: what the form asks and offers (an admin changes them, a viewer sees them). */
export function MastersNav() {
  return (
    <nav className="masters-nav" aria-label="Masters">
      <NavLink to="/manage/masters/lists">Dropdown lists</NavLink>
      <NavLink to="/manage/masters/technologies">Technologies</NavLink>
      <NavLink to="/manage/masters/documents">Documents</NavLink>
      <NavLink to="/manage/masters/fields">Form fields</NavLink>
      <NavLink to="/manage/masters/states">States</NavLink>
      <NavLink to="/manage/masters/districts">Districts</NavLink>
      <NavLink to="/manage/masters/talukas">Talukas</NavLink>
      <NavLink to="/manage/centres">Center Master</NavLink>
    </nav>
  );
}

/* A page of the masters: a tracking panel page with their own links. */
export function MastersShell({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  return (
    <ManageShell wide={wide}>
      <MastersNav />
      {children}
    </ManageShell>
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
