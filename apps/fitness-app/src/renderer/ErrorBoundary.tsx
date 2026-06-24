import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

/**
 * Per-component error boundary: one component throwing must NOT crash the whole
 * screen. The fallback is safe and observable — it names the component id and the
 * manifest version so the failure is diagnosable.
 */
export class ComponentErrorBoundary extends React.Component<
  { componentId: string; manifestVersion?: string; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Observable: surfaced with the component id + manifest version.
    console.warn(
      `[dynui] render error in '${this.props.componentId}' (manifest ${this.props.manifestVersion ?? "?"}): ${error.message}`,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <View style={s.box} accessibilityLabel={`Failed to render ${this.props.componentId}`}>
          <Text style={s.title}>Couldn’t render “{this.props.componentId}”</Text>
          <Text style={s.meta}>manifest {this.props.manifestVersion ?? "?"}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  box: {
    padding: theme.space(4),
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.color.warm,
    backgroundColor: "#FFF6F4",
  },
  title: { color: theme.color.warm, fontSize: theme.font.body, fontWeight: "700" },
  meta: { color: theme.color.muted, fontSize: theme.font.caption, marginTop: 2 },
});
