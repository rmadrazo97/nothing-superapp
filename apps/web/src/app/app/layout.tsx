import type { ReactNode } from 'react';
import { Shell } from '@/components/shell/Shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  // Auth + subscription gates land in tasks 05 + 08.
  return <Shell>{children}</Shell>;
}
