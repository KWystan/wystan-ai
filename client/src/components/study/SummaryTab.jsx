export default function SummaryTab({ summary, isGenerating, onGenerate }) {
  if (!summary && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <span className="material-symbols-outlined text-2xl text-black mb-2">summarize</span>
        <p className="text-xs text-black mb-3">Generate a summary of key concepts from your materials.</p>
        <button onClick={onGenerate}
          className="text-[11px] font-medium bg-black text-white rounded-lg px-3 py-1.5 active:scale-[0.97] transition-all duration-150">
          Generate Summary
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {isGenerating ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-black/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {summary?.title && (
            <h3 className="text-xs font-semibold text-black">{summary.title}</h3>
          )}
          {Array.isArray(summary?.items) && summary.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0 mt-1.5" />
              <div>
                <p className="text-[11px] text-black leading-relaxed">{item.text}</p>
                {item.pageReferences?.length > 0 && (
                  <p className="text-[10px] text-black mt-0.5">
                    pp. {item.pageReferences.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
