import { useRef } from "react";
import HTMLFlipBook from "react-pageflip";

interface PageData {
  src: string;
  alt?: string;
}

interface Props {
  pages: PageData[];
  width?: number;
  height?: number;
  className?: string;
}

export default function PageFlipViewer({
  pages,
  width = 380,
  height = 507,
  className = "",
}: Props) {
  const book = useRef<any>(null);

  if (!pages || pages.length === 0) {
    return (
      <div className="aspect-[3/4] max-w-sm mx-auto md:mx-0 rounded-xl border-2 border-triba-black bg-triba-cream flex items-center justify-center">
        <p className="font-heading text-base text-triba-brown/40 text-center px-4">
          Visor interactivo<br />(próximamente)
        </p>
      </div>
    );
  }

  return (
    <div className={"flex flex-col items-center " + className}>
      <div className="w-full max-w-sm mx-auto md:mx-0">
        <HTMLFlipBook
          width={width}
          height={height}
          size="stretch"
          minWidth={260}
          maxWidth={width}
          minHeight={Math.round((260 * height) / width)}
          maxHeight={height}
          showCover={true}
          mobileScrollSupport={true}
          swipeDistance={30}
          flippingTime={600}
          drawShadow={true}
          showPageCorners={true}
          clickEventForward={true}
          className="shadow-xl border-2 border-triba-black rounded-sm overflow-hidden"
        >
          {pages.map((page, i) => (
            <div key={i} className="bg-triba-white">
              <img
                src={page.src}
                alt={page.alt || `Página ${i + 1}`}
                className="w-full h-full object-cover select-none pointer-events-none"
                draggable={false}
              />
            </div>
          ))}
        </HTMLFlipBook>
      </div>

      <div className="flex items-center justify-center gap-4 mt-5">
        <button
          onClick={() => book.current?.pageFlip()?.flipPrev()}
          className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform focus-visible:outline-2 focus-visible:outline-triba-red"
          aria-label="Página anterior"
        >
          <span className="text-xl font-heading text-triba-brown -mt-0.5">‹</span>
        </button>

        <span className="font-sans text-xs text-triba-brown/60 select-none" id="page-indicator">
          1 / {pages.length}
        </span>

        <button
          onClick={() => book.current?.pageFlip()?.flipNext()}
          className="w-10 h-10 rounded-full bg-triba-white border-2 border-triba-black flex items-center justify-center shadow-md hover:scale-110 transition-transform focus-visible:outline-2 focus-visible:outline-triba-red"
          aria-label="Página siguiente"
        >
          <span className="text-xl font-heading text-triba-brown -mt-0.5">›</span>
        </button>
      </div>
    </div>
  );
}
