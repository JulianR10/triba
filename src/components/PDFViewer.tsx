import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function useIsVisible(ref: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

interface Props {
  pdfUrl: string;
  className?: string;
  lang?: "es" | "en";
}

export default function PDFViewer({ pdfUrl, className = "", lang = "es" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [nativeFs, setNativeFs] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 0);
  const [viewportHeight, setViewportHeight] = useState(() => typeof window !== "undefined" ? window.innerHeight : 0);
  const aspectRatioRef = useRef(0.707);
  const [aspectRatio, setAspectRatio] = useState(0.707);
  const [pageHeight, setPageHeight] = useState<number>(0);
  const [err, setErr] = useState<string>("");
  const [errType, setErrType] = useState<"generic" | "expired" | "timeout">("generic");
  const [retryKey, setRetryKey] = useState(0);
  const visible = useIsVisible(containerRef);
  const mountTimeRef = useRef<number>(Date.now());

  const msg = {
    expiredTitle: lang === "en" ? "Link expired" : "El enlace expiró",
    expiredBody: lang === "en" ? "Your viewing session lasts 30 minutes. Reload the page to generate a new link." : "Tu sesión de visualización dura 30 minutos. Recargá la página para generar un nuevo enlace.",
    expiredAction: lang === "en" ? "Reload page" : "Recargar página",
    loadErrorTitle: lang === "en" ? "Could not load the magazine" : "No se pudo cargar la revista",
    retry: lang === "en" ? "Try again" : "Reintentar",
    loading: lang === "en" ? "Loading magazine..." : "Cargando revista...",
    unavailable: lang === "en" ? "PDF not available" : "PDF no disponible",
    errorGeneric: lang === "en" ? "Error loading PDF" : "Error al cargar el PDF",
    timeout: lang === "en" ? "The magazine took too long to load. Check your connection and try again." : "La revista tardó demasiado en cargar. Revisá tu conexión e intentá de nuevo.",
  };

  function isExpiredError(errorMsg: string, ageMs: number): boolean {
    // Signed URLs 30m; after ~25m any 403/Failed fetch is likely expiry
    const expiredPattern = /403|401|400|expired|token|unauthorized|signature|access.?denied/i;
    if (ageMs > 25 * 60 * 1000 && expiredPattern.test(errorMsg)) return true;
    // Also treat explicit token/signature errors as expired even early
    if (/expired|token.*invalid|signature.*invalid|access.?denied/i.test(errorMsg)) return true;
    return false;
  }

  useEffect(() => {
    if (err || numPages > 0) return;
    const timer = setTimeout(() => {
      setErr(msg.timeout);
      setErrType("timeout");
    }, 25000);
    return () => clearTimeout(timer);
  }, [err, numPages, msg.timeout]);

  useEffect(() => {
    setViewportWidth(window.innerWidth);
    setViewportHeight(window.innerHeight);
  }, []);

  function isNativeFsSupported() {
    const doc = document as Document & { webkitFullscreenEnabled?: boolean };
    return !!(
      typeof document !== "undefined" &&
      (document.fullscreenEnabled || doc.webkitFullscreenEnabled)
    );
  }

  function currentNativeFsElement() {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return document.fullscreenElement || doc.webkitFullscreenElement || null;
  }

  function requestNativeFs(el: HTMLElement) {
    const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (el.requestFullscreen) return el.requestFullscreen();
    if (anyEl.webkitRequestFullscreen) return anyEl.webkitRequestFullscreen();
    return Promise.reject(new Error("fullscreen unsupported"));
  }

  function exitNativeFs() {
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    if (document.exitFullscreen) return document.exitFullscreen();
    if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
    return Promise.resolve();
  }

  useEffect(() => {
    const syncNativeFs = () => {
      const inFs = currentNativeFsElement() === containerRef.current;
      setNativeFs(inFs);
      setExpanded(inFs);
      if (!inFs) resetInline();
    };
    document.addEventListener("fullscreenchange", syncNativeFs);
    document.addEventListener("webkitfullscreenchange", syncNativeFs);
    return () => {
      document.removeEventListener("fullscreenchange", syncNativeFs);
      document.removeEventListener("webkitfullscreenchange", syncNativeFs);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    function updateDimensions() {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setViewportWidth(vw);
      setViewportHeight(vh);
    }
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    window.visualViewport?.addEventListener("resize", updateDimensions);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", updateDimensions);
      window.visualViewport?.removeEventListener("resize", updateDimensions);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  const resetInline = () => {
    setScale(1);
    setViewportWidth(0);
    setViewportHeight(0);
    const ar = aspectRatioRef.current;
    setPageHeight(ar > 0 ? Math.round(340 / ar) : 0);
  };

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (expanded) {
        if (nativeFs) {
          await exitNativeFs();
        } else {
          setExpanded(false);
          resetInline();
        }
      } else if (isNativeFsSupported()) {
        try {
          await requestNativeFs(containerRef.current);
        } catch {
          setExpanded(true);
        }
      } else {
        setExpanded(true);
      }
    } catch {}
  }, [expanded, nativeFs]);

  const handleDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPageNumber(1);
    setScale(1);
    setPageHeight(0);
    setErr("");
    setErrType("generic");
  }, []);

  const handlePageLoadSuccess = useCallback((page: any) => {
    const vp = page.getViewport({ scale: 1 });
    const ar = vp.width / vp.height;
    aspectRatioRef.current = ar;
    setAspectRatio(ar);
    const pageW = expanded ? Math.min(viewportWidth * 0.85, 1000) : 340;
    const s = pageW / vp.width;
    const h = Math.round(vp.height * s);
    if (h > 0) setPageHeight((prev) => Math.max(prev, h));
  }, [expanded, viewportWidth]);

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
          {msg.unavailable}
        </p>
      </div>
    );
  }

  const pageWidth = expanded
    ? (() => {
        const vw = viewportWidth || window.innerWidth;
        const vh = viewportHeight || window.innerHeight;
        const maxW = Math.max(280, vw - 32);
        const maxH = vh > 110 ? vh - 110 : vh * 0.9;
        let w = Math.min(maxW * 0.9, vw * 0.85, 1000);
        if (maxH > 0 && aspectRatio > 0) {
          const h = w / aspectRatio;
          if (h > maxH) w = maxH * aspectRatio;
        }
        return Math.floor(Math.max(280, Math.min(w, maxW)));
      })()
    : 340;

  const fullscreenClasses = expanded
    ? "fixed inset-0 z-[80] bg-triba-bone flex flex-col h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    : "flex flex-col items-center";

  const content = (
    <div
      ref={containerRef}
      className={(fullscreenClasses + " " + className).trim()}
    >
      <div
        className={
          expanded
            ? "flex-1 flex items-center justify-center overflow-auto px-4 py-4"
            : ""
        }
      >
        <div
          className={expanded ? "" : "w-full max-w-sm mx-auto md:mx-0"}
          style={!expanded && pageHeight > 0 ? { minHeight: pageHeight + "px" } : undefined}
        >
          {err ? (
            <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-red/10 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="font-heading text-base text-triba-red/70">
                {errType === "expired" ? msg.expiredTitle : msg.loadErrorTitle}
              </p>
              {err && (
                <p className="font-sans text-xs text-triba-brown/60 max-w-[260px]">
                  {errType === "expired" ? msg.expiredBody : err}
                </p>
              )}
              {errType === "expired" ? (
                <button
                  onClick={() => window.location.reload()}
                  className="font-sans text-sm font-semibold text-triba-white bg-triba-brown hover:bg-triba-brown/90 rounded-full px-5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-triba-brown"
                >
                  {msg.expiredAction}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setErr("");
                    setErrType("generic");
                    setPageHeight(0);
                    setRetryKey((k) => k + 1);
                  }}
                  className="font-sans text-sm font-semibold text-triba-white bg-triba-red hover:bg-triba-red/90 rounded-full px-5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-triba-red"
                >
                  {msg.retry}
                </button>
              )}
            </div>
          ) : !visible ? (
            <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-cream flex items-center justify-center">
              <p className="font-heading text-base text-triba-brown/40">
                {msg.loading}
              </p>
            </div>
          ) : (
            <Document
              key={retryKey}
              file={pdfUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={(e: unknown) => {
                const raw = e instanceof Error ? e.message : "No se pudo abrir la revista";
                const age = Date.now() - mountTimeRef.current;
                if (isExpiredError(raw, age)) {
                  setErr(msg.expiredBody);
                  setErrType("expired");
                } else {
                  setErr(raw);
                  setErrType("generic");
                }
              }}
              loading={
                <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-cream flex items-center justify-center">
                  <p className="font-heading text-base text-triba-brown/40">
                    {msg.loading}
                  </p>
                </div>
              }
              error={
                <div className="aspect-[3/4] rounded-xl border-2 border-triba-black bg-triba-red/10 flex items-center justify-center">
                  <p className="font-heading text-base text-triba-red/60">
                    {msg.errorGeneric}
                  </p>
                </div>
              }
              className={
                "shadow-xl border-2 border-triba-black rounded-sm overflow-hidden" +
                (expanded ? " inline-block" : " w-full")
              }
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                canvasBackground="#FFFFFF"
                className="bg-triba-white"
                onLoadSuccess={handlePageLoadSuccess}
              />
            </Document>
          )}
        </div>
      </div>

      {numPages > 0 && (
        <div
          className={
            "flex items-center justify-center gap-2 md:gap-4 py-4 px-4" +
            (expanded
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

          {expanded && (
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
              expanded
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
              {expanded ? (
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

  if (expanded && typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
