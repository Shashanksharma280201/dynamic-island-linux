import { Easing, FadeIn, FadeOut, ReduceMotion, SlideInRight, SlideOutRight, withTiming } from 'react-native-reanimated'

/**
 * All of the app's motion, in one place: short, eased, never bouncing, and
 * only where it tells you something (a screen opening over another, a card
 * you answered going away, which tab or choice is on). Lists, cards and
 * rows simply appear. Each follows the phone's Reduce motion setting.
 */
const OUT = Easing.bezier(0.2, 0, 0, 1)
const IN = Easing.bezier(0.4, 0, 1, 1)

/** A screen opening over the one you were on, and closing again. */
export const PUSH_IN = SlideInRight.duration(240).easing(OUT).reduceMotion(ReduceMotion.System)
export const PUSH_OUT = SlideOutRight.duration(200).easing(IN).reduceMotion(ReduceMotion.System)

/** Something that appears where you're looking (an answer, a sheet). */
export const APPEAR = FadeIn.duration(160).reduceMotion(ReduceMotion.System)
/** Something you finished with leaving (an answered card, a deleted row). */
export const LEAVE = FadeOut.duration(160).reduceMotion(ReduceMotion.System)

/** The chosen marker (tab, segment) moving to its new place. */
export const glide = (to: number) => withTiming(to, { duration: 200, easing: OUT, reduceMotion: ReduceMotion.System })

/** A pressed control dims a little; nothing jumps. */
export const PRESSED = { opacity: 0.6 } as const
