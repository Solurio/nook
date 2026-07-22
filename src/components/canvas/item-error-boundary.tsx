"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Bumping this (e.g. the item's data) lets a fixed item recover on its own. */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

/**
 * Isolates a single item's rendering. If a card throws -- a malformed payload, a
 * flaky media source, a player that blew up -- only that card shows a fallback;
 * every other note, gif and sticker stays on the wall.
 */
export default class ItemErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    // A remote edit (new data) is a chance for a broken item to render again.
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown) {
    console.error("[nook] item failed to render", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid size-full place-items-center rounded-2xl bg-ink-800/85 p-3 text-center ring-1 ring-white/10">
          <div className="text-muted">
            <AlertTriangle className="mx-auto mb-1.5 size-4 text-warm" strokeWidth={2} />
            <p className="text-[11px] leading-snug">este item não pôde ser mostrado</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
