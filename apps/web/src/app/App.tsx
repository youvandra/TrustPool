import { RouterProvider } from 'react-router'
import { SessionProvider } from '@/auth/session'
import { router } from './router'

export default function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
