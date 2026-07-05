"use client";

import React from "react";
import {Button} from "@/components/ui/button";

type State = {hasError: boolean};

export class PanelErrorBoundary extends React.Component<React.PropsWithChildren<{message: string; retry: string}>, State> {
  state: State = {hasError: false};

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid h-full place-items-center p-4 text-center">
          <div>
            <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">{this.props.message}</p>
            <Button onClick={() => this.setState({hasError: false})}>{this.props.retry}</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
