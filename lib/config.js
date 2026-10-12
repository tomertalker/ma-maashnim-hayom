// Where the app talks to. The pilot runs in the survey's Supabase project; the
// key below is the publishable ("anon") key, which is public by design. It can
// do nothing but call the mmh_* functions (see supabase/pilot_schema.sql).
// The old NEXT_PUBLIC_SUPABASE_* variables (still set on the Vercel project from
// February) are deliberately ignored; only these names override the defaults.
export const API_URL = (process.env.NEXT_PUBLIC_MMH_API_URL || "https://yernxedmokifcmpakzgd.supabase.co").replace(/\/$/, "");
export const API_KEY = process.env.NEXT_PUBLIC_MMH_API_KEY || "sb_publishable_DC8y2WILA3My_l-zAraI7Q_BlXhGHWM";
export const APP_VERSION = "pilot-1";
export const PHARMACY = "אולטרה פארם";
