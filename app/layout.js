import "../styles/globals.css";

export const metadata = {
  title: "Cannabis Pilot",
  description: "MVP Pilot"
};

export default function RootLayout({ children }) {
  return (
    <html lang="he">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
