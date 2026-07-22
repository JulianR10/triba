import { useState, useRef, useCallback, useEffect } from "react";
import type { DocumentProps, PageProps } from "react-pdf";

interface Props {
  pdfUrl: string;
  className?: string;
}

export default function PDFViewer({ pdfUrl, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const aspectRatioRef = useRef(0.707);
  const [aspectRatio, setAspectRatio] = useState(0.707);
  const [Components, setComponents] = useState<{
    Document: React.ComponentType<DocumentProps>;
    Page: React.ComponentType<PageProps>;
  } | null>(null);
  const [pageHeight, setPageHeight] = useState<number>(0);

  useEffect(() => {
    setViewportWidth(window.innerWidth);
    setViewportHeight(window.innerHeight);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const mod = await import("react-pdf");
        if (cancelled) return;
        mod.pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        setComponents({ Document: mod.Document, Page: mod.Page });
      } catch {
        // pdfjs failed to load
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = () => {
      const inFullscreen = document.fullscreenElement === containerRef.current;
      setIsFullscreen(inFullscreen);
      if (!inFullscreen) {
        setScale(1);
        setViewportWidth(0);
        setViewportHeight(0);
        const ar = aspectRatioRef.current;
        setPageHeight(ar > 0 ? Math.round(340 / ar) : 0);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    function updateDimensions() {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    }
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (isFullscreen) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch {}
  }, [isFullscreen]);

  const handleDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPageNumber(1);
    setScale(1);
    setPageHeight(0);
  }, []);

  const handlePageLoadSuccess = useCallback((page: any) => {
    const vp = page.getViewport({ scale: 1 });
    const ar = vp.width / vp.height;
    aspectRatioRef.current = ar;
    setAspectRatio(ar);
    const pageW = isFullscreen ? Math.min(viewportWidth * 0.85, 1000) : 340;
    const s = pageW / vp.width;
    const h = Math.round(vp.height * s);
    if (h > 0) setPageHeight((prev) => Math.max(prev, h));
  }, [isFullscreen, viewportWidth]);

  function changePage(offset: number) {
    setPageNumber((prev) => {
      const next = prev + offset;
      return Math.max(1, Math.min(next, numPages));
    });
  }

  function zoomIn() {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }

  function zoomOut() {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }

  if (!pdfUrl) {
    return (
      <div className="aspect-[3/4] max-w-sm mx-auto md:mx-0 rounded-xl border-2 border-triba-black bg-triba-cream flex items-center justify-center">
        <p className="font-heading text-base text-triba-brown/40 text-center px-4">
          PDF no disponible
        </p>
      </div>
    );
  }

  const pageWidth = isFullscreen
    ? (() => {
        const maxW = viewportWidth - 32;
        const maxH = viewportHeight > 110 ? viewportHeight - 110 : viewportHeight * 0.9;
        let w = Math.min(maxW * 0.9, viewportWidth * 0.85, 1000);
        if (maxH > 0 && aspectRatio > 0) {
          const h = w / aspectRatio;
          if (h > maxH) w = maxH * aspectRatio;
        }
        return Math.floor(Math.min(w, maxW));
      })()
    : 340;

  const fullscreenClasses = isFullscreen
    ? "fixed inset-0 z-50 bg-triba-bone flex flex-col"
    : "flex flex-col items-center";

  return (
    <div
      ref={containerRef}
      className={(fullscreenClasses + " " + className).trim()}
    >
      <div
        className={
          isFullscreen
            ? "flex-1 flex items-center justify-center overflow-auto px-4 py-4"
            : ""
        }
      >
        <div
          className={isFullscreen ? "" : "w-full max-w-sm mx-auto md:mx-0"}
          style={!isFullscreen && pageHeight > 0 ? { minHeight: pageHeight + "px" } : undefined}
        >
          {!Components ? (
            <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-cream flex items-center justify-center">
              <p className="font-heading text-base text-triba-brown/40">
                Cargando PDF...
              </p>
            </div>
          ) : (
            <Components.Document
              file={pdfUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              loading={
                <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-cream flex items-center justify-center">
                  <p className="font-heading text-base text-triba-brown/40">
                    Cargando PDF...
                  </p>
                </div>
              }
              error={
                <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-red/10 flex items-center justify-center">
                  <p className="font-heading text-base text-triba-red/60">
                    Error al cargar el PDF
                  </p>
                </div>
              }
              className={
                "shadow-xl border-2 border-triba-black rounded-sm overflow-hidden" +
                (isFullscreen ? " inline-block" : " w-full")
              }
            >
              <Components.Page
                pageNumber={pageNumber}
                width={pageWidth}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                canvasBackground="#FFFFFF"
                className="bg-triba-white"
                onLoadSuccess={handlePageLoadSuccess}
              />
            </Components.Document>
          )}
        </div>
      </div>

      {Components && numPages > 0 && (
        <div
          className={
            "flex items-center justify-center gap-2 md:gap-4 py-4 px-4" +
            (isFullscreen
              ? " bg-triba-bone border-t-2 border-triba-black/10 shrink-0"
              : " mt-5")
          }
        >
          <button
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1}
            className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-triba-red shrink-0"
            aria-label="Página anterior"
          >
            <span className="text-xl font-heading text-triba-brown -mt-0.5">
              ‹
            </span>
          </button>

          <span className="font-sans text-xs text-triba-brown/60 select-none whitespace-nowrap">
            {pageNumber} / {numPages || "—"}
          </span>

          <button
            onClick={() => changePage(1)}
            disabled={pageNumber >= numPages}
            className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-triba-red shrink-0"
            aria-label="Página siguiente"
          >
            <span className="text-xl font-heading text-triba-brown -mt-0.5">
              ›
            </span>
          </button>

          {isFullscreen && (
            <>
          <div className="w-px h-6 bg-triba-black/20 mx-1 shrink-0"></div>

          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            aria-label="Alejar"
          >
            <span className="text-xl font-heading text-triba-brown -mt-0.5">
              −
            </span>
          </button>

          <span className="font-sans text-xs text-triba-brown/60 select-none w-10 text-center shrink-0">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={zoomIn}
            disabled={scale >= 3}
            className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            aria-label="Acercar"
          >
            <span className="text-xl font-heading text-triba-brown -mt-0.5">
              +
            </span>
          </button>

          <div className="w-px h-6 bg-triba-black/20 mx-1 shrink-0"></div>
            </>
          )}

          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform focus-visible:outline-2 focus-visible:outline-triba-red shrink-0"
            aria-label={
              isFullscreen
                ? "Salir de pantalla completa"
                : "Pantalla completa"
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="w-4 h-4 text-triba-brown"
            >
              {isFullscreen ? (
                <>
                  <polyline points="6 15 10 15 10 19" />
                  <polyline points="18 9 14 9 14 5" />
                  <line x1="14" y1="10" x2="19" y2="5" />
                  <line x1="5" y1="19" x2="10" y2="14" />
                </>
              ) : (
                <>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              )}
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
