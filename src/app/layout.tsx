import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Folder Manager',
  description: 'Next.js folder manager workspace'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
