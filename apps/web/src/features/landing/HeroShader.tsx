import { useReducedMotion } from 'motion/react'
import { ChromaFlow, CursorRipples, FilmGrain, FlowingGradient, Shader } from 'shaders/react'

/**
 * The pool: a slow pale-blue flow, a deeper brand-blue current that follows
 * the cursor, read through a ripple layer so the surface moves like water.
 * Kinsign's hero uses the same idea in orange behind fluted glass.
 */
export default function HeroShader() {
  // With reduced motion asked for, a still gradient in the same blues stands in for the water.
  const still = useReducedMotion()
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {still ? (
        <div className="h-full w-full bg-[radial-gradient(ellipse_at_75%_40%,#9cc8e8_0%,#d3e6f3_35%,#f4f9fc_70%)]" />
      ) : (
        // Every colour shares one blue hue: the gradient blends in oklch, where pure white has no hue and the blend would sweep a rainbow.
        <Shader className="h-full w-full">
          <FlowingGradient colorA="#f4f9fc" colorB="#d3e6f3" colorC="#6fb0de" colorD="#e8f2f9" speed={0.45} />
          <ChromaFlow baseColor="#f4f9fc" upColor="#1F6E9C" downColor="#1F6E9C" leftColor="#1F6E9C" rightColor="#1F6E9C" intensity={1.1} momentum={14} radius={3.4} />
          <CursorRipples intensity={9} decay={7} radius={0.45} chromaticSplit={0} />
          <FilmGrain strength={0.04} />
        </Shader>
      )}
      {/* Keeps the copy side calm and readable whatever the flow is doing. */}
      <div className="absolute inset-y-0 left-0 w-[62%] bg-gradient-to-r from-bg via-bg/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-bg to-transparent" />
    </div>
  )
}
