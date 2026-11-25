import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models"

function getPdfiumWasmUrl() {
  return new URL(`${import.meta.env.BASE_URL}assets/pdfium.wasm`, window.location.href).href
}

let sharedEnginePromise: Promise<PdfEngine> | null = null
const pdfDocumentCache = new Map<string, Promise<PdfDocumentObject>>()
const thumbnailUrlCache = new Map<string, Promise<string | null>>()

export function getPdfSourceUrl(src: string) {
  // Raw base64 must start with the encoded PDF header to distinguish it from a path.
  if (/^\s*JVBERi0/.test(src) && !/[^A-Za-z0-9+/=\s]/.test(src)) {
    return `data:application/pdf;base64,${src.replace(/\s/g, "")}`
  }

  return src
}

export function loadSharedPdfEngine() {
  sharedEnginePromise ??= new Promise<PdfEngine>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Bộ đọc PDF không khởi động được sau 45 giây. Hãy tải lại trang hoặc mở PDF gốc.")), 45_000)
    import("@embedpdf/engines/pdfium-worker-engine")
      .then(({ createPdfiumEngine }) => createPdfiumEngine(getPdfiumWasmUrl(), {}))
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timer))
  }).catch((error) => {
    sharedEnginePromise = null
    throw error
  })

  return sharedEnginePromise
}

export async function loadPdfDocument(url: string) {
  let documentPromise = pdfDocumentCache.get(url)

  if (!documentPromise) {
    documentPromise = loadSharedPdfEngine().then((engine) =>
      engine
        .openDocumentUrl(
          { id: url, url },
          { mode: url.startsWith("blob:") ? "full-fetch" : "auto" }
        )
        .toPromise()
    )
    pdfDocumentCache.set(url, documentPromise)
  }

  return documentPromise
}

export async function getPdfPageCount(url: string) {
  return (await loadPdfDocument(url)).pageCount
}

export function renderPdfThumbnailUrl({
  dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  pageIndex,
  url,
  width,
}: {
  dpr?: number
  pageIndex: number
  url: string
  width: number
}) {
  const cacheKey = `${url}#${pageIndex}@${width}x${dpr}`
  let thumbnailPromise = thumbnailUrlCache.get(cacheKey)

  if (!thumbnailPromise) {
    thumbnailPromise = (async () => {
      const [engine, document] = await Promise.all([
        loadSharedPdfEngine(),
        loadPdfDocument(url),
      ])
      const page = document.pages[pageIndex]

      if (!page) return null

      const blob = await engine
        .renderThumbnail(document, page, {
          dpr,
          imageType: "image/png",
          scaleFactor: width / page.size.width,
          withAnnotations: true,
        })
        .toPromise()

      return URL.createObjectURL(blob)
    })()
    thumbnailUrlCache.set(cacheKey, thumbnailPromise)
  }

  return thumbnailPromise
}
