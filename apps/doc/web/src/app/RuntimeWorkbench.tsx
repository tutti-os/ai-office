import { RuntimeWorkbenchView } from "./RuntimeWorkbenchView";
import { useRuntimeWorkbenchModel } from "./useRuntimeWorkbenchModel";

export function RuntimeWorkbench() {
  return <RuntimeWorkbenchView model={useRuntimeWorkbenchModel()} />;
}
