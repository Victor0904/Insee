import { useEffect, useMemo, useRef } from 'react'

interface Props {
  width: number
  height: number
  centroids: [number, number][]
  /** Flux bruts de l'année : o * n + d. */
  flows: Float32Array
  n: number
  color: string
  /** Particules animées ; sinon flèches fixes (mouvement réduit). */
  animate: boolean
  /** Nombre de flux nets affichés. */
  top?: number
}

interface Arc {
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  w: number // épaisseur
  particles: number
  phase: number
}

/** Point sur une courbe de Bézier quadratique. */
const bez = (a: Arc, t: number): [number, number] => {
  const u = 1 - t
  return [u * u * a.x0 + 2 * u * t * a.cx + t * t * a.x1, u * u * a.y0 + 2 * u * t * a.cy + t * t * a.y1]
}

/** Flux migratoires nets les plus importants, dessinés en arcs avec des particules qui avancent. */
export function FlowCanvas({ width, height, centroids, flows, n, color, animate, top = 40 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  const arcs = useMemo<Arc[]>(() => {
    // On montre les déplacements nets qui « traversent » la carte : volume × distance, en écartant
    // les échanges entre voisins immédiats (sinon l'Île-de-France sature tout).
    const minDist = Math.min(width, height) * 0.08
    const nets: { o: number; d: number; v: number; score: number }[] = []
    for (let o = 0; o < n; o++)
      for (let d = o + 1; d < n; d++) {
        const net = flows[o * n + d] - flows[d * n + o]
        if (net === 0) continue
        const dist = Math.hypot(centroids[d][0] - centroids[o][0], centroids[d][1] - centroids[o][1])
        if (dist < minDist) continue
        const v = Math.abs(net)
        const score = v * Math.sqrt(dist)
        if (net > 0) nets.push({ o, d, v, score })
        else nets.push({ o: d, d: o, v, score })
      }
    nets.sort((a, b) => b.score - a.score)
    const kept = nets.slice(0, top)
    const max = Math.max(1, ...kept.map((k) => k.v))
    return kept.map(({ o, d, v }, i) => {
      const [x0, y0] = centroids[o]
      const [x1, y1] = centroids[d]
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2
      const len = Math.hypot(x1 - x0, y1 - y0)
      // courbure perpendiculaire, toujours du même côté (sens horaire)
      const k = 0.22 * len
      return {
        x0,
        y0,
        x1,
        y1,
        cx: mx + (-(y1 - y0) / (len || 1)) * k,
        cy: my + ((x1 - x0) / (len || 1)) * k,
        w: 0.8 + 3.2 * Math.sqrt(v / max),
        particles: Math.max(1, Math.round(6 * Math.sqrt(v / max))),
        phase: (i * 0.137) % 1,
      }
    })
  }, [flows, n, centroids, top, width, height])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    let raf = 0
    const t0 = performance.now()

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height)
      const t = ((now - t0) / 2600) % 1
      for (const a of arcs) {
        ctx.globalAlpha = 0.28
        ctx.strokeStyle = color
        ctx.lineWidth = a.w
        ctx.beginPath()
        ctx.moveTo(a.x0, a.y0)
        ctx.quadraticCurveTo(a.cx, a.cy, a.x1, a.y1)
        ctx.stroke()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = color
        if (animate) {
          for (let p = 0; p < a.particles; p++) {
            const tt = (t + a.phase + p / a.particles) % 1
            const [x, y] = bez(a, tt)
            ctx.beginPath()
            ctx.arc(x, y, 0.8 + a.w * 0.45, 0, Math.PI * 2)
            ctx.fill()
          }
        } else {
          // pointe de flèche à l'arrivée
          const [px, py] = bez(a, 0.92)
          const ang = Math.atan2(a.y1 - py, a.x1 - px)
          const s = 3 + a.w
          ctx.beginPath()
          ctx.moveTo(a.x1, a.y1)
          ctx.lineTo(a.x1 - s * Math.cos(ang - 0.45), a.y1 - s * Math.sin(ang - 0.45))
          ctx.lineTo(a.x1 - s * Math.cos(ang + 0.45), a.y1 - s * Math.sin(ang + 0.45))
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      if (animate && !document.hidden) raf = requestAnimationFrame(draw)
    }
    draw(performance.now())
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (animate && !document.hidden) raf = requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [arcs, width, height, color, animate])

  return <canvas ref={canvas} className="map__flows" style={{ width, height }} aria-hidden="true" />
}
