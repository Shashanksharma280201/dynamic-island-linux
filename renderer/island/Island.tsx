import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import type { Activity } from '@shared/types'
import { spring } from '../anim/spring'
import { IdlePill } from './states/IdlePill'
import { MediaCard } from './states/MediaCard'
import { ApprovalCard } from './states/ApprovalCard'

export function Island({ activity }: { activity: Activity | null }) {
  const [hover, setHover] = useState(false)
  const setH = (b: boolean) => {
    setHover(b)
    ;(window as any).island.setHover(b)
  }
  const isApproval = activity?.kind === 'approval'
  const expanded = hover || isApproval
  const radius = expanded ? 24 : 20

  return (
    <motion.div
      className="island"
      layout
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      transition={spring}
      style={{ borderRadius: radius }}
      animate={{ borderRadius: radius }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={activity ? activity.kind + activity.id : 'idle'}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {!activity && <IdlePill />}
          {activity?.kind === 'media' && (
            <MediaCard media={activity.media} expanded={expanded} />
          )}
          {activity?.kind === 'approval' && <ApprovalCard request={activity.request} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
