import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import ServiceWorkerGuard from '@/components/ServiceWorkerGuard';
import './globals.css';

export const metadata: Metadata = {
  title: 'nook — a quiet place for everything',
  description:
    'nook is a holographic, dark-first personal productivity app. habits, goals, journal, tasks, calendar, finance — one refractive surface.',
  openGraph: {
    title: 'nook',
    description: 'a holographic, dark-first productivity app.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#050505',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <ServiceWorkerGuard />
        {children}
      </body>
    </html>
  );
}
