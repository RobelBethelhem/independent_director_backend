/**
 * Phone number must start with a country code ('+') and contain digits only —
 * no letters, no separators. Ethiopian (+251) numbers are held to the national
 * mobile format (+251 then 7 or 9 then 8 digits); every other country code
 * accepts E.164 (7–15 digits). Mirrors the frontend `phoneError()` helper so
 * client and server agree.
 *
 * Examples: +251912345678 (ET), +14155551234 (US). Rejected: "0912345678"
 * (no country code), "+251612345678" (ET must be 7/9), "abc", "+25191abc".
 */
export const PHONE_PATTERN = /^\+(251[79]\d{8}|(?!251)\d{7,15})$/;
export const PHONE_MESSAGE =
  'Enter a valid phone number with a country code, digits only (e.g. +251912345678)';
