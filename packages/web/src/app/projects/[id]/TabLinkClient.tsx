'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TabLinkClientProps {
  href: string;
  label: string;
}

export function TabLinkClient({ href, label }: TabLinkClientProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className="px-4 py-3 text-sm font-semibold transition-colors relative"
      style={{
        color: isActive ? '#00d4aa' : '#6b8399',
        borderBottom: isActive ? '2px solid #00d4aa' : '2px solid transparent',
      }}
    >
      {label}
    </Link>
  );
}
