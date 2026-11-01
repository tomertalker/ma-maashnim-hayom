// the typeface ships with the app: no request to a font service
import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/ibm-plex-sans-hebrew/700.css";
import "../styles/globals.css";
import { AppProvider } from "../components/AppContext";
import Shell from "../components/Shell";

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "מה מעשנים היום",
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icon-192.png`, apple: `${base}/icon-192.png` },
  description: "מטופלי קנאביס רפואי משתפים מה עבד להם, עם המלצות מותאמות אישית.",
  robots: { index: false, follow: false },
};
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f1f4f0" }, { media: "(prefers-color-scheme: dark)", color: "#0e1411" }],
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <AppProvider><Shell>{children}</Shell></AppProvider>
      </body>
    </html>
  );
}
