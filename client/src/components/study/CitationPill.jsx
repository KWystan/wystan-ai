export default function CitationPill({ fileName, pageNumber, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium
        bg-blue-50 text-blue-700 border border-blue-200
        hover-gate:bg-blue-100 hover-gate:border-blue-300
        active:scale-[0.97] transition-all duration-100 cursor-pointer"
      aria-label={`View source: ${fileName} page ${pageNumber}`}
    >
      <span className="material-symbols-outlined text-[12px]">description</span>
      {fileName}, p. {pageNumber}
    </button>
  );
}
