import type { Metadata } from "next"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Robust Gifting — Corporate Gifting CRM",
  description: "Sign in to Robust Gifting, the corporate gifting CRM.",
  applicationName: "Robust Gifting",
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
