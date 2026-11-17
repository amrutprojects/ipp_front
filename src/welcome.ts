/*
 * The congratulations dialog is owed to the student whose account has just been created (the OTP page) and is shown by
 * the form page. Kept here rather than in the router's location state, which does not survive the hand-over: the OTP
 * page signs the student in and navigates in one go, and whichever of the two navigations wins carries no state. It
 * also outlives a remount, so the dialog waits for the student instead of vanishing when the page behind it settles.
 *
 * In memory only, like the sign-up password (signup.ts): after a reload the account is no longer newly created, so
 * nothing is owed.
 */
let owed = false;

/* The account was created just now: the form page should congratulate the student. */
export const oweWelcome = () => {
  owed = true;
};
export const welcomeOwed = () => owed;
/* Shown and closed (or not wanted): nothing is owed any more. */
export const settleWelcome = () => {
  owed = false;
};
