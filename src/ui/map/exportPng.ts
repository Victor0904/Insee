const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity'] as const

/** Copie de la carte SVG avec les styles calculés en ligne (les variables CSS ne suivent pas une image). */
function inlineSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = [svg, ...svg.querySelectorAll('*')]
  const dst = [clone, ...clone.querySelectorAll('*')]
  src.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const target = dst[i] as SVGElement
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p)
      if (v) target.style.setProperty(p, v)
    }
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.removeAttribute('class')
  return new XMLSerializer().serializeToString(clone)
}

function loadImage(svgText: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image de la carte impossible à produire'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
  })
}

export interface PngOptions {
  svg: SVGSVGElement
  title: string
  subtitle: string
  legendTitle: string
  colors: string[]
  labels: string[]
  hatchedClasses: number
  source: string
}

/** Image PNG de la vue : titre, carte, légende et source, aux couleurs du thème courant. */
export async function exportMapPng(o: PngOptions): Promise<Blob> {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  const scale = 2
  const mapW = o.svg.width.baseVal.value
  const mapH = o.svg.height.baseVal.value
  const legendW = 260
  const W = mapW + legendW + 48
  const H = Math.max(mapH, o.colors.length * 26 + 80) + 140
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = v('--paper') || '#f4f2ec'
  ctx.fillRect(0, 0, W, H)

  const display = v('--font-display') || 'Georgia, serif'
  const body = v('--font-body') || 'system-ui, sans-serif'
  ctx.fillStyle = v('--ink') || '#18202b'
  ctx.font = `italic 500 30px ${display}`
  ctx.fillText(o.title, 24, 46)
  ctx.font = `400 15px ${body}`
  ctx.fillStyle = v('--ink-muted') || '#4b5563'
  ctx.fillText(o.subtitle, 24, 72)
  ctx.strokeStyle = v('--ink') || '#18202b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(24, 86)
  ctx.lineTo(W - 24, 86)
  ctx.stroke()

  const img = await loadImage(inlineSvg(o.svg))
  ctx.drawImage(img, 24, 100, mapW, mapH)

  // légende
  const lx = mapW + 48
  let ly = 120
  ctx.fillStyle = v('--ink') || '#18202b'
  ctx.font = `600 16px ${display}`
  ctx.fillText(o.legendTitle, lx, ly)
  ly += 18
  ctx.font = `400 13px ${body}`
  o.colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(lx, ly, 22, 14)
    if (i < o.hatchedClasses) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(lx, ly, 22, 14)
      ctx.clip()
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1
      for (let k = -14; k < 22; k += 4) {
        ctx.beginPath()
        ctx.moveTo(lx + k, ly + 14)
        ctx.lineTo(lx + k + 14, ly)
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.strokeStyle = v('--rule') || '#cbc6b8'
    ctx.strokeRect(lx, ly, 22, 14)
    ctx.fillStyle = v('--ink') || '#18202b'
    ctx.fillText(o.labels[i], lx + 30, ly + 12)
    ly += 24
  })
  if (o.hatchedClasses) {
    ctx.fillStyle = v('--ink-muted') || '#4b5563'
    ctx.fillText('Hachures : baisse.', lx, ly + 10)
  }

  ctx.fillStyle = v('--ink-muted') || '#4b5563'
  ctx.font = `400 12px ${body}`
  ctx.fillText(o.source, 24, H - 18)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export PNG impossible'))), 'image/png'))
}
