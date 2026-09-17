import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

// Reconstruye el texto de un PDF respetando el ORDEN VISUAL (fila por fila,
// de izquierda a derecha), agrupando los fragmentos de texto por posición Y.
//
// Esto es necesario porque el orden en que un PDF "dicta" su texto
// internamente no siempre coincide con el orden visual — por ejemplo, en los
// pedidos de Embalados la cantidad y el precio a veces aparecen en el stream
// ANTES que el nombre del producto, aunque visualmente estén en la misma fila
// más a la derecha. Agrupar por coordenada Y (como hace `pdftotext -layout`)
// evita ese problema.
export async function extractLayoutText(file) {
  const buffer = await file.arrayBuffer()
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise

  let fullText = ''
  const Y_TOLERANCE   = 2.5  // pt — fragmentos en la "misma fila"
  const GAP_THRESHOLD = 1.2  // pt — separación mínima para insertar un espacio

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const lines = []
    for (const item of content.items) {
      if (!item.str) continue
      const y = item.transform[5]
      let line = lines.find((l) => Math.abs(l.y - y) < Y_TOLERANCE)
      if (!line) { line = { y, parts: [] }; lines.push(line) }
      line.parts.push({ x: item.transform[4], str: item.str, width: item.width || 0 })
    }

    // De arriba hacia abajo, y dentro de cada fila de izquierda a derecha
    lines.sort((a, b) => b.y - a.y)

    // Calcular el espaciado "normal" entre líneas de esta página, para poder
    // distinguir un simple salto de línea de un salto de PÁRRAFO/bloque más
    // grande (que es lo que separa un producto del siguiente en estos PDFs).
    // Sin esto, el texto queda todo pegado y los parsers no pueden encontrar
    // los límites entre productos.
    const gaps = []
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y
      if (gap > 0) gaps.push(gap)
    }
    const sortedGaps  = [...gaps].sort((a, b) => a - b)
    const typicalGap  = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 14
    const blockGapMin = typicalGap * 1.6

    let prevY = null
    for (const line of lines) {
      if (prevY !== null) {
        const gap = prevY - line.y
        if (gap > blockGapMin) fullText += '\n' // línea en blanco = separador de bloque
      }
      line.parts.sort((a, b) => a.x - b.x)
      let text = ''
      let prevEnd = null
      for (const p of line.parts) {
        if (prevEnd !== null && p.x - prevEnd > GAP_THRESHOLD) text += ' '
        text += p.str
        prevEnd = p.x + p.width
      }
      fullText += text.trimEnd() + '\n'
      prevY = line.y
    }
    fullText += '\f'
  }

  return fullText
}
