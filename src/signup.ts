/*
 * The password a student just chose (sign-up) or typed (login of an account not verified yet), for the OTP page:
 * verifying the OTP needs it (the OTP proves the inbox, the password who signed up). Kept in memory only, never stored;
 * after a reload the OTP page asks for it.
 */
let pending: { email: string; password: string } | null = null;
const key = (email: string) => email.trim().toLowerCase();

export const rememberSignupPassword = (email: string, password: string) => {
  pending = { email: key(email), password };
};
export const signupPasswordFor = (email: string): string | null => (pending && pending.email === key(email) ? pending.password : null);
export const forgetSignupPassword = () => {
  pending = null;
};
