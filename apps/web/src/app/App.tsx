import { MotionConfig } from 'motion/react'
import { RouterProvider } from 'react-router'
import { SessionProvider } from '@/auth/session'
import { router } from './router'

export default function App() {
  return (
    // With reduced motion asked for, springs and entrances jump straight to their end.
    <MotionConfig reducedMotion="user">
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </MotionConfig>
  )
}
