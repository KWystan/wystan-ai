import { useEffect } from 'react';
import UploadDropzone from './UploadDropzone';
import SourceItem from './SourceItem';
import { useApp } from '../../lib/AppContext';

export default function SourceSidebar({
  sources, activeSourceIds, isUploading,
  onUpload, onToggle, onDelete, onFetchSources,
}) {
  const { user, handleOpenAuth } = useApp();

  useEffect(() => {
    if (user) onFetchSources();
  }, [user, onFetchSources]);

  if (!user) {
    return (
      <div className="w-[260px] border-r border-black/8 bg-white flex flex-col items-center justify-center p-6 shrink-0">
        <span className="material-symbols-outlined text-3xl text-black mb-3">folder_open</span>
        <p className="text-xs text-black text-center leading-relaxed mb-3">
          Sign in to upload and manage study materials.
        </p>
        <button
          onClick={() => handleOpenAuth('login')}
          className="text-[11px] font-medium text-white bg-black rounded-lg px-3 py-1.5 active:scale-[0.97] transition-all duration-150"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="w-[260px] border-r border-black/8 bg-white flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/8">
        <h2 className="text-xs font-semibold text-black">Sources</h2>
        <span className="text-[10px] text-black bg-black/5 rounded-full px-2 py-0.5">
          {activeSourceIds.length} active
        </span>
      </div>

      {/* Upload Dropzone */}
      <div className="px-3 py-2">
        <UploadDropzone onUpload={onUpload} isUploading={isUploading} />
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {sources.length === 0 ? (
          <div className="text-center py-6">
            <span className="material-symbols-outlined text-2xl text-black mb-2">description</span>
            <p className="text-[11px] text-black leading-relaxed">
              No sources yet. Drop a file above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sources.map(s => (
              <SourceItem key={s.id} source={s} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
