interface PwaBannerProps {
  updateReady: boolean;
  canInstall: boolean;
  onApply: () => void;
  onInstall: () => void;
}

const button = "min-h-11 min-w-11 rounded-lg bg-accent px-3 text-on-accent";

/** Small notices about the installed app: a new version is waiting, or the app can be installed. */
export function PwaBanner({ updateReady, canInstall, onApply, onInstall }: PwaBannerProps) {
  if (!updateReady && !canInstall) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-line bg-surface p-3 text-ink"
    >
      {updateReady ? (
        <>
          <span>A new version is ready.</span>
          <button type="button" className={button} onClick={onApply}>
            Reload
          </button>
        </>
      ) : (
        <>
          <span>Install the app to use it offline.</span>
          <button type="button" className={button} onClick={onInstall}>
            Install app
          </button>
        </>
      )}
    </div>
  );
}
