import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from '@/trpc/client';
import { HexBackground } from '@/components/shell/HexBackground';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cauldron',
  description: 'AI-powered software development platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <HexBackground />
        <Providers>
          <div className="flex min-h-screen" style={{ position: 'relative', zIndex: 1 }}>
            {/* NavSidebar is rendered per-layout (projects list and project detail)
                so it can carry project context and escalation badge counts */}
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
