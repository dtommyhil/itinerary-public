import type { Metadata, Viewport } from 'next';
import { UiFeedback } from './components/ui-feedback';
import './globals.css';
import './ui-reference.css';
import './ui-polish.css';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};
export const metadata: Metadata = {
  title: 'itinerary — Travel together',
  description: 'A shared home for your next group adventure.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <UiFeedback />
      </body>
    </html>
  );
}
