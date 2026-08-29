import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StructFlow — Documents to structured Excel",
  description: "Turn messy documents into the spreadsheet you already use.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className="antialiased">{children}</body></html>;
}
