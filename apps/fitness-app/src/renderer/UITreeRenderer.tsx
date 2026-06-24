import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { JsonValue, UITree } from "../contract-types";
import { theme } from "../theme";
import { registry } from "./registry";
import { resolveScreen, type RenderItem } from "./resolve";
import { ComponentErrorBoundary } from "./ErrorBoundary";

/**
 * The renderer: maps a generated UITree's nodes to native components.
 *
 * It renders the ACTUAL tree model — slot children are rendered INSIDE their
 * parent component (true composition), not flattened into siblings. It knows
 * nothing about archetypes; it renders whatever validated tree it is handed.
 */
export const UITreeRenderer: React.FC<{
  tree: UITree;
  data: Record<string, JsonValue>;
  manifestVersion?: string;
  showReasons?: boolean;
  onTap?: (componentId: string) => void;
}> = ({ tree, data, manifestVersion, showReasons, onTap }) => {
  const sections = resolveScreen(tree, data);

  const renderItem = (item: RenderItem, top: boolean): React.ReactNode => {
    // Resolve slot children into rendered nodes, keyed by slot id.
    const slotNodes = item.slots
      ? Object.fromEntries(
          Object.entries(item.slots).map(([slotId, children]) => [
            slotId,
            children.map((child) => renderItem(child, false)),
          ]),
        )
      : undefined;

    const Comp = registry[item.componentId];
    let body: React.ReactNode;
    if (item.invalidSlots?.length) {
      // Reject invalid slot structures before render — safe, observable fallback.
      body = (
        <View style={s.unknown}>
          <Text style={s.unknownText}>
            Invalid composition in “{item.componentId}” (slots: {item.invalidSlots.join(", ")})
          </Text>
        </View>
      );
    } else if (Comp) {
      body = (
        <ComponentErrorBoundary componentId={item.componentId} manifestVersion={manifestVersion}>
          <Comp p={item.props} variant={item.variant} slots={slotNodes} />
        </ComponentErrorBoundary>
      );
    } else {
      body = (
        <View style={s.unknown}>
          <Text style={s.unknownText}>Unregistered component: {item.componentId}</Text>
        </View>
      );
    }

    const reason =
      showReasons && item.reason ? <Text style={s.reason}>↳ {item.reason}</Text> : null;

    if (top) {
      return (
        <Pressable key={item.key} style={s.slot} onPress={() => onTap?.(item.componentId)}>
          {body}
          {reason}
        </Pressable>
      );
    }
    return (
      <View key={item.key} style={s.nested}>
        {body}
        {reason}
      </View>
    );
  };

  return (
    <View>
      {sections.map((section, i) => (
        <View key={i} style={s.section}>
          {section.label && section.label !== "above-the-fold" ? (
            <Text style={s.sectionLabel}>{section.label.toUpperCase()}</Text>
          ) : null}
          {section.items.map((item) => renderItem(item, true))}
        </View>
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  section: { marginBottom: theme.space(2) },
  sectionLabel: {
    fontSize: theme.font.caption,
    letterSpacing: 1.5,
    color: theme.color.muted,
    marginTop: theme.space(4),
    marginBottom: theme.space(2),
    marginLeft: theme.space(1),
    fontWeight: "700",
  },
  slot: { marginBottom: theme.space(3) },
  nested: { marginBottom: theme.space(2) },
  reason: {
    fontSize: theme.font.caption,
    color: theme.color.muted,
    marginTop: theme.space(1),
    marginLeft: theme.space(2),
    fontStyle: "italic",
  },
  unknown: {
    padding: theme.space(4),
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.color.warm,
  },
  unknownText: { color: theme.color.warm, fontSize: theme.font.caption },
});
