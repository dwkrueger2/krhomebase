import type { ReactNode } from 'react'
import DevViewLoader from '@/components/dev-view/DevViewLoader.client'
import './globals.css'

export const metadata = {
  title: 'KR Homebase',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Dev View: development-only marker inspector; renders nothing in a production build */}
        <DevViewLoader />
      </body>
    </html>
  )
}
