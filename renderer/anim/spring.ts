// Apple-ish morph feel (≈ iOS .snappy: perceptual ~0.5s, small overshoot).
export const spring = { type: 'spring', stiffness: 360, damping: 30, mass: 1 } as const
// Collapse is slightly snappier / more damped than expand.
export const collapseSpring = { type: 'spring', stiffness: 420, damping: 32, mass: 1 } as const
// Content cross-fade (staggered against the layout morph).
export const contentFade = { duration: 0.18 } as const
