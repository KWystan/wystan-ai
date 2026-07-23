export default function SourceItem({ source, onToggle, onDelete }) {
  return (
    <div className="group flex items-center gap-2 px-1 py-1.5 rounded-md hover-gate:bg-black/[0.02] transition-colors duration-100">
      <input
        type="checkbox"
        checked={source.active}
        onChange={() => onToggle(source.id)}
        className="w-3.5 h-3.5 rounded border-black/20 accent-black cursor-pointer shrink-0"
        aria-label={`Toggle ${source.file_name}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-black truncate" title={source.file_name}>{source.file_name}</p>
        <p className="text-[10px] text-black">{source.chunk_count} chunks</p>
      </div>
      <button
        onClick={() => onDelete(source.id)}
        className="opacity-0 group-hover-gate:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-black hover:text-red-500 transition-all duration-100 shrink-0"
        aria-label={`Delete ${source.file_name}`}
      >
        <span className="material-symbols-outlined text-[14px]">delete</span>
      </button>
    </div>
  );
}
