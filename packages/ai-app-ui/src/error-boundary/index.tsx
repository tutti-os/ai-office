import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw, X } from "lucide-react";

export type ArtifactErrorBoundaryRenderProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

export type ArtifactErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode | ((props: ArtifactErrorBoundaryRenderProps) => ReactNode);
  resetKeys?: readonly unknown[];
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type ArtifactErrorBoundaryState = {
  error: Error | null;
};

export class ArtifactErrorBoundary extends Component<ArtifactErrorBoundaryProps, ArtifactErrorBoundaryState> {
  state: ArtifactErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ArtifactErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const normalized = normalizeError(error);
    console.error("Artifact app render error", normalized, errorInfo);
    this.props.onError?.(normalized, errorInfo);
  }

  componentDidUpdate(previousProps: ArtifactErrorBoundaryProps) {
    if (!this.state.error) return;
    if (!resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) return;
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const resetErrorBoundary = () => this.setState({ error: null });
    if (typeof this.props.fallback === "function") {
      return this.props.fallback({ error: this.state.error, resetErrorBoundary });
    }
    return this.props.fallback ?? null;
  }
}

export function ArtifactAppRoot(props: {
  appName: string;
  children: ReactNode;
  onError?: (error: Error, source: ArtifactBrowserErrorSource) => void;
}) {
  const { error, clearError } = useBrowserErrorState({
    appName: props.appName,
    onError: props.onError,
  });

  return (
    <ArtifactErrorBoundary
      fallback={({ error: renderError, resetErrorBoundary }) => (
        <ArtifactAppErrorFallback
          appName={props.appName}
          error={renderError}
          resetErrorBoundary={resetErrorBoundary}
        />
      )}
    >
      {props.children}
      <ArtifactGlobalErrorToast appName={props.appName} error={error} onClose={clearError} />
    </ArtifactErrorBoundary>
  );
}

export function ArtifactAppErrorFallback(props: {
  appName: string;
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <ArtifactErrorFallbackLayout
      title={`${props.appName} stopped rendering`}
      message="The app hit an unexpected rendering error."
      error={props.error}
      primaryAction={{
        label: "Try again",
        icon: <RotateCcw size={15} />,
        onClick: props.resetErrorBoundary,
      }}
      secondaryAction={{
        label: "Reload app",
        icon: <RotateCcw size={15} />,
        onClick: () => window.location.reload(),
      }}
    />
  );
}

export function ArtifactSurfaceErrorFallback(props: {
  surfaceName: string;
  error: Error;
  resetErrorBoundary: () => void;
  onBackHome?: () => void;
}) {
  return (
    <ArtifactErrorFallbackLayout
      title={`${props.surfaceName} stopped rendering`}
      message="This workspace view hit an unexpected rendering error."
      error={props.error}
      primaryAction={{
        label: "Try again",
        icon: <RotateCcw size={15} />,
        onClick: props.resetErrorBoundary,
      }}
      secondaryAction={{
        label: props.onBackHome ? "Home" : "Reload app",
        icon: props.onBackHome ? <Home size={15} /> : <RotateCcw size={15} />,
        onClick: () => {
          props.resetErrorBoundary();
          if (props.onBackHome) {
            props.onBackHome();
          } else {
            window.location.reload();
          }
        },
      }}
    />
  );
}

export type ArtifactBrowserErrorSource = "error" | "unhandledrejection";

export function installBrowserErrorHandlers(input: {
  appName: string;
  onError: (error: Error, source: ArtifactBrowserErrorSource) => void;
}) {
  const onWindowError = (event: ErrorEvent) => {
    input.onError(normalizeError(event.error ?? event.message), "error");
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    input.onError(normalizeError(event.reason), "unhandledrejection");
  };
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function useBrowserErrorState(input: {
  appName: string;
  onError?: (error: Error, source: ArtifactBrowserErrorSource) => void;
}) {
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    return installBrowserErrorHandlers({
      appName: input.appName,
      onError: (error, source) => {
        console.error(`${input.appName} global browser error`, source, error);
        setError(error);
        input.onError?.(error, source);
      },
    });
  }, [input.appName, input.onError]);
  return {
    error,
    clearError: () => setError(null),
  };
}

function ArtifactGlobalErrorToast(props: {
  appName: string;
  error: Error | null;
  onClose: () => void;
}) {
  if (!props.error) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[1000] flex justify-center px-4">
      <section className="pointer-events-auto flex w-full max-w-[560px] items-start gap-3 rounded-lg border border-[#B8A07C]/30 bg-[#F4EFE6] px-4 py-3 text-[#2A2620] ">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-[#B8A07C]/30 bg-white text-[#7b2e24]">
          <AlertTriangle size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{props.appName} caught a background error</div>
          <div className="mt-1 truncate text-[13px] text-[#5f574e]" title={props.error.message || props.error.name}>
            {props.error.message || props.error.name}
          </div>
        </div>
        <button
          className="grid size-7 shrink-0 place-items-center rounded-md text-[#8B8275] hover:bg-[#EEE8DC]/55 hover:text-[#5C6B50]"
          type="button"
          aria-label="Dismiss error"
          title="Dismiss"
          onClick={props.onClose}
        >
          <X size={15} />
        </button>
      </section>
    </div>
  );
}

function ArtifactErrorFallbackLayout(props: {
  title: string;
  message: string;
  error: Error;
  primaryAction: ArtifactErrorAction;
  secondaryAction: ArtifactErrorAction;
}) {
  return (
    <main className="grid h-dvh min-h-0 place-items-center bg-[#EEE8DC] px-5 font-sans text-[#2A2620]">
      <section className="w-full max-w-[520px] rounded-lg border border-[#B8A07C]/30 bg-[#F4EFE6] p-6 ">
        <div className="mb-4 grid size-10 place-items-center rounded-full border border-[#B8A07C]/30 bg-white text-[#7b2e24]">
          <AlertTriangle size={19} />
        </div>
        <h1 className="text-[15px] font-semibold leading-6">{props.title}</h1>
        <p className="mt-2 text-[13px] leading-5 text-[#5f574e]">{props.message}</p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-md border border-[#B8A07C]/30 bg-white/70 p-3 text-[11px] leading-4 text-[#7b2e24]">
          {props.error.message || props.error.name}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <ArtifactErrorActionButton action={props.primaryAction} primary />
          <ArtifactErrorActionButton action={props.secondaryAction} />
        </div>
      </section>
    </main>
  );
}

type ArtifactErrorAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

function ArtifactErrorActionButton(props: { action: ArtifactErrorAction; primary?: boolean }) {
  return (
    <button
      className={
        props.primary
          ? "inline-flex h-9 items-center gap-2 rounded-md bg-[#2A2620] px-3 text-[13px] font-semibold text-[#F4EFE6] hover:bg-[#5C6B50]"
          : "inline-flex h-9 items-center gap-2 rounded-md border border-[#B8A07C]/30 bg-white/70 px-3 text-[13px] font-semibold text-[#2A2620] hover:bg-white"
      }
      type="button"
      onClick={props.action.onClick}
    >
      {props.action.icon}
      {props.action.label}
    </button>
  );
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown application error");
}

function resetKeysChanged(previousKeys: readonly unknown[] | undefined, nextKeys: readonly unknown[] | undefined) {
  if (!previousKeys || !nextKeys) return previousKeys !== nextKeys;
  if (previousKeys.length !== nextKeys.length) return true;
  return previousKeys.some((key, index) => !Object.is(key, nextKeys[index]));
}
