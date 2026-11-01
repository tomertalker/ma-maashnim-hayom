// Small line icons, drawn here so the app loads no icon font.
const I = ({ children, fill }) => (
  <svg viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IconFeed = () => <I><rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /></I>;
export const IconSpark = () => <I><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></I>;
export const IconPlus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const IconBook = () => <I><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" /><path d="M9 9h6M9 13h4" /></I>;
export const IconUser = () => <I><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></I>;
export const IconBack = () => <I><path d="M9 6l6 6-6 6" /></I>;
export const IconUp = () => <I><path d="M7 11v9H4v-9zM7 11l4-8a2.5 2.5 0 012.5 2.5V9h4.7a2 2 0 012 2.4l-1.3 6.9a2 2 0 01-2 1.7H7" /></I>;
export const IconDown = () => <I><path d="M7 13V4H4v9zM7 13l4 8a2.5 2.5 0 002.5-2.5V15h4.7a2 2 0 002-2.4l-1.3-6.9a2 2 0 00-2-1.7H7" /></I>;
export const IconMeh = () => <I><circle cx="12" cy="12" r="9" /><path d="M8.5 15h7M9 9.5h.01M15 9.5h.01" /></I>;
export const IconStar = () => <I fill="currentColor"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" /></I>;
export const IconCamera = () => <I><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></I>;
export const IconSearch = () => <I><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></I>;
