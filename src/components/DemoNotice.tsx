import { Info } from 'lucide-react'

export default function DemoNotice({ children = 'Demo only - no live transactions or account changes are made.' }: { children?: string }) {
  return (
    <div className="demo-notice">
      <Info size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
