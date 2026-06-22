import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

type ErrorBoundaryRenderProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode | ((props: ErrorBoundaryRenderProps) => ReactNode);
  resetKeys?: readonly unknown[];
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const normalized = normalizeError(error);
    console.error("AI Doc render error", normalized, errorInfo);
    this.props.onError?.(normalized, errorInfo);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
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
    return this.props.fallback ?? <AppErrorFallback error={this.state.error} resetErrorBoundary={resetErrorBoundary} />;
  }
}

export function AppErrorFallback(props: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <ErrorFallbackLayout
      title="AI Doc stopped rendering"
      message="The document app hit an unexpected rendering error."
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

export function DocumentSurfaceErrorFallback(props: {
  error: Error;
  resetErrorBoundary: () => void;
  onBackHome: () => void;
}) {
  return (
    <ErrorFallbackLayout
      title="Document view stopped rendering"
      message="This project view hit an unexpected rendering error."
      error={props.error}
      primaryAction={{
        label: "Try again",
        icon: <RotateCcw size={15} />,
        onClick: props.resetErrorBoundary,
      }}
      secondaryAction={{
        label: "Home",
        icon: <Home size={15} />,
        onClick: () => {
          props.resetErrorBoundary();
          props.onBackHome();
        },
      }}
    />
  );
}

function ErrorFallbackLayout(props: {
  title: string;
  message: string;
  error: Error;
  primaryAction: ErrorAction;
  secondaryAction: ErrorAction;
}) {
  return (
    <main className="grid h-dvh min-h-0 place-items-center bg-[#E6DDCD] px-5 font-sans text-[#2A2620]">
      <section className="w-full max-w-[520px] rounded-lg border border-[#B8A07C]/55 bg-[#F4EFE6] p-6 shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]">
        <div className="mb-4 grid size-10 place-items-center rounded-full border border-[#B8A07C]/60 bg-white text-[#7b2e24]">
          <AlertTriangle size={19} />
        </div>
        <h1 className="text-[18px] font-semibold leading-6">{props.title}</h1>
        <p className="mt-2 text-[13px] leading-5 text-[#5f574e]">{props.message}</p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-md border border-[#B8A07C]/45 bg-white/70 p-3 text-[11px] leading-4 text-[#7b2e24]">
          {props.error.message || props.error.name}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <ErrorActionButton action={props.primaryAction} primary />
          <ErrorActionButton action={props.secondaryAction} />
        </div>
      </section>
    </main>
  );
}

type ErrorAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

function ErrorActionButton(props: { action: ErrorAction; primary?: boolean }) {
  return (
    <button
      className={
        props.primary
          ? "inline-flex h-9 items-center gap-2 rounded-md bg-[#2A2620] px-3 text-[12px] font-semibold text-[#F4EFE6] hover:bg-[#5C6B50]"
          : "inline-flex h-9 items-center gap-2 rounded-md border border-[#B8A07C]/60 bg-white/70 px-3 text-[12px] font-semibold text-[#2A2620] hover:bg-white"
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
  return new Error(typeof error === "string" ? error : "Unknown rendering error");
}

function resetKeysChanged(previousKeys: readonly unknown[] | undefined, nextKeys: readonly unknown[] | undefined) {
  if (!previousKeys || !nextKeys) return previousKeys !== nextKeys;
  if (previousKeys.length !== nextKeys.length) return true;
  return previousKeys.some((key, index) => !Object.is(key, nextKeys[index]));
}
