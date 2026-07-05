import type {Metadata} from "next";
import {NextIntlClientProvider} from "next-intl";
import {getMessages} from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notebook AI",
  description: "NotebookLM-like local-first MVP"
};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const messages = await getMessages();
  return (
    <html lang="vi">
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
