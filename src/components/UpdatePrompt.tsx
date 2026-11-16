import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker: updateSW } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <button
      className="update-prompt"
      type="button"
      role="status"
      onClick={() => void updateSW(true)}
    >
      新版本可用，点击刷新
    </button>
  );
}
