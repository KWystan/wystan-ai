import { useMemo } from 'react';
import CitationPill from './CitationPill';

export default function MessageBubble({ message, onCitationClick }) {
  const { role, content, citations } = message;

  // Parse [Source: fileName, p. X] tags and replace with CitationPill components
  const renderedContent = useMemo(() => {
    if (!content) return null;

    const parts = [];
    const regex = /\[Source:\s*([^,]+),\s*p\.\s*(\d+)\]/g;
    let lastIndex = 0;
    let match;
    let matchIndex = 0;

    while ((match = regex.exec(content)) !== null) {
      // Text before this citation
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${matchIndex}`}>{content.slice(lastIndex, match.index)}</span>
        );
      }

      const fileName = match[1].trim();
      const pageNumber = parseInt(match[2], 10);

      // Find the matching citation metadata
      const citationMeta = citations?.find(c =>
        c.fileName === fileName && c.pageNumber === pageNumber
      );

      parts.push(
        <CitationPill
          key={`cite-${matchIndex}`}
          fileName={fileName}
          pageNumber={pageNumber}
          onClick={() => onCitationClick?.(citationMeta?.chunkId, fileName, pageNumber)}
        />
      );

      lastIndex = regex.lastIndex;
      matchIndex++;
    }

    // Remaining text
    if (lastIndex < content.length) {
      parts.push(<span key={`text-${matchIndex}`}>{content.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : content;
  }, [content, citations, onCitationClick]);

  if (role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%] bg-black text-white rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[75%] bg-white border border-black/8 rounded-2xl rounded-bl-md px-4 py-2.5">
        <div className="text-sm leading-relaxed text-black [&_p]:mb-2 [&_p:last-child]:mb-0">
          {renderedContent}
        </div>
      </div>
    </div>
  );
}
