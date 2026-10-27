
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { cn } from "@/lib/utils";
import { BrailleSpinner } from "@/components/braille-spinner";
import type { ComponentProps, ReactNode } from "react";
import {
  Children,
  createContext,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";

import { transformMathDelimiters } from "@/src/core";
import { streamdownPlugins } from "./message";
import { mdComponents } from "@/components/md-blocks";
import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = {
  className?: string;
  children?: ReactNode;
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const AUTO_CLOSE_DELAY = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    children,
  }: ReasoningProps) => {
    // COLLAPSED BY DEFAULT, ALWAYS (owner, streaming round 2026-10-01):
    // the old default opened on streaming and an auto-open effect
    // re-fought a manual collapse — the block "wasn't collapsible until
    // it finished". Collapsed is the default; opening is always the
    // learner's click; the auto-close after the stream still tidies a
    // row the learner had opened.
    const resolvedDefaultOpen = defaultOpen ?? false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen]
    );

    const contextValue = useMemo(
      () => ({ isOpen, isStreaming, setIsOpen }),
      [isOpen, isStreaming, setIsOpen]
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        {/* Astryx Collapsible: the ReasoningTrigger child becomes its
            trigger row, everything else is the collapsing body. */}
        <Collapsible
          className={cn("not-prose mb-4", className)}
          onOpenChange={handleOpenChange}
          isOpen={isOpen}
          trigger={Children.toArray(children).find(isTrigger)}
        >
          {Children.toArray(children).filter((c) => !isTrigger(c))}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  }
);

export type ReasoningTriggerProps = {
  className?: string;
  children?: ReactNode;
  getThinkingMessage?: (isStreaming: boolean) => ReactNode;
};

/* The settled label (owner round, 2026-10-05): static "Agent's thinking" —
   the duration was live-turn state that died on remount anyway ("thought
   for a few seconds"), bookkeeping for information we knowingly lose. The
   label pairs with the user's collapsed "Your thinking" rows — one
   language; motion (spinner + shimmer) stays the working signal. */
const defaultGetThinkingMessage = (isStreaming: boolean) => {
  if (isStreaming) {
    return <Shimmer duration={1}>Thinking...</Shimmer>;
  }
  return <p>Agent’s thinking</p>;
};

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
  }: ReasoningTriggerProps) => {
    const { isStreaming } = useReasoning();
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-secondary text-xs font-medium", className)}>
        {children ?? (
          <>
            {/* The spinner shows only while streaming: motion is the signal. */}
            {isStreaming && <BrailleSpinner label="Thinking" />}
            {getThinkingMessage(isStreaming)}
          </>
        )}
      </span>
    );
  }
);

/** The Collapsible's trigger is whichever child is a ReasoningTrigger. */
function isTrigger(node: unknown): boolean {
  return isValidElement(node) && node.type === ReasoningTrigger;
}

export type ReasoningContentProps = {
  className?: string;
  children: string;
};

// Shares message.tsx's Streamdown config (math delimiters, dark mermaid,
// remark-breaks) — reasoning renders the same contract as message text.

export const ReasoningContent = memo(
  ({ className, children }: ReasoningContentProps) => (
    <div className={cn("mt-2 text-sm text-secondary", className)}>
      <Streamdown components={mdComponents} plugins={streamdownPlugins}>
        {transformMathDelimiters(children)}
      </Streamdown>
    </div>
  )
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
