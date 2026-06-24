import React, { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { JsonValue, ScreensFile, UITree } from "./src/contract-types";
import { UITreeRenderer } from "./src/renderer/UITreeRenderer";
import { theme } from "./src/theme";
import {
  bumpSession,
  inferLabel,
  inferScreenKey,
  loadProfile,
  recordSignalTaps,
  resetProfile,
} from "./src/profile-client";
import screensJson from "./assets/screens.json";

const file = screensJson as unknown as ScreensFile;

// A nested composition demo: dashboard-panel renders its slot children INSIDE its
// own layout (true nesting), proving the renderer follows the real UITree model.
const COMPOSE_DATA: Record<string, JsonValue> = { title: "Today", value: 72, series: [3, 5, 4, 6, 7, 6, 8] };
const COMPOSE_TREE: UITree = {
  schemaVersion: "ui-tree/1.0",
  surface: "dashboard",
  generatedFor: { anonId: "demo" },
  meta: { generatedAt: "", model: "composition-demo", cacheKey: "demo", fallback: false },
  root: {
    type: "screen",
    children: [
      { type: "component", componentId: "panel-title", variant: "standard", dataBindings: { title: "title" } },
      {
        type: "component",
        componentId: "dashboard-panel",
        variant: "standard",
        slots: {
          body: [{ type: "component", componentId: "mini-metric", variant: "compact", dataBindings: { value: "value" } }],
          footer: [{ type: "component", componentId: "mini-chart", variant: "sparkline", dataBindings: { series: "series" } }],
        },
      },
    ],
  },
};

const TABS = [
  { key: "default", label: "New" },
  { key: "performanceAthlete", label: "Performance" },
  { key: "casualWellness", label: "Wellness" },
  { key: "socialCompetitive", label: "Social" },
  { key: "performanceCanary", label: "Canary" },
  { key: "compose", label: "Compose" },
] as const;

const SIGNAL_LABEL: Record<string, string> = {
  "fitness.engagement.charts.openRate": "Performance",
  "fitness.engagement.insights.readRate": "Wellness",
  "fitness.engagement.social.kudosRate": "Social",
};

export default function App() {
  // Resolve the persisted profile at launch and open on the screen it calls for.
  const [profile, setProfile] = useState(() => loadProfile());
  const [selected, setSelected] = useState<string>(
    () => inferScreenKey(loadProfile()) ?? "default",
  );
  const [sessions, setSessions] = useState(profile.sessions);
  const [sessionTaps, setSessionTaps] = useState<Record<string, number>>({});
  const [showReasons, setShowReasons] = useState(false);

  useEffect(() => {
    setSessions(bumpSession());
  }, []);

  const isCompose = selected === "compose";
  const tree = isCompose ? COMPOSE_TREE : file.screens[selected];
  const renderData = isCompose ? COMPOSE_DATA : file.data;
  const persistedLabel = inferLabel(profile);
  const persistedScreen = inferScreenKey(profile);

  // This session's live leaning (component-state taps).
  const liveByLabel: Record<string, number> = {};
  let liveTotal = 0;
  for (const [componentId, count] of Object.entries(sessionTaps)) {
    const label = SIGNAL_LABEL[file.signalMap[componentId] ?? ""];
    if (!label) continue;
    liveByLabel[label] = (liveByLabel[label] ?? 0) + count;
    liveTotal += count;
  }

  const onTap = (componentId: string) => {
    const signal = file.signalMap[componentId];
    if (signal) recordSignalTaps({ [signal]: 1 }); // persist
    setSessionTaps((t) => ({ ...t, [componentId]: (t[componentId] ?? 0) + 1 }));
    setProfile(loadProfile());
  };

  const onReset = () => {
    resetProfile();
    setProfile(loadProfile());
    setSessionTaps({});
    setSelected("default");
  };

  const willAdaptOnReload =
    persistedScreen != null && persistedScreen !== selected;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.kicker}>YOUR PROFILE · SESSION {sessions}</Text>
        <Text style={s.h1}>
          {persistedLabel ? `${persistedLabel} athlete` : "New user — exploring"}
        </Text>
      </View>

      <View style={s.banner}>
        <Text style={s.bannerBody}>
          {persistedScreen
            ? `Opened on your ${persistedLabel} screen, learned from past taps.`
            : "No history yet — showing the neutral new-user screen. Tap data cards to teach it."}
        </Text>
        {willAdaptOnReload ? (
          <Text style={s.bannerHint}>↻ reload to open on your {persistedLabel} screen</Text>
        ) : null}
        <View style={s.bannerRow}>
          <Text style={s.bannerMeta}>
            this session — Perf {liveByLabel["Performance"] ?? 0} · Well{" "}
            {liveByLabel["Wellness"] ?? 0} · Social {liveByLabel["Social"] ?? 0} ({liveTotal})
          </Text>
          <Pressable onPress={onReset}>
            <Text style={s.reset}>reset profile</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.switcher}>
        {TABS.map((t) => {
          const active = t.key === selected;
          return (
            <Pressable
              key={t.key}
              onPress={() => setSelected(t.key)}
              style={[s.seg, active && s.segActive]}
            >
              <Text style={[s.segText, active && s.segTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.reasonsToggle}>
        <Text style={s.reasonsLabel}>Tap cards to log behavior · show reasons</Text>
        <Switch value={showReasons} onValueChange={setShowReasons} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {tree ? (
          <UITreeRenderer
            tree={tree}
            data={renderData}
            manifestVersion="0.1.0"
            showReasons={showReasons}
            onTap={onTap}
          />
        ) : (
          <Text style={s.muted}>No screen for “{selected}”.</Text>
        )}
        <Text style={s.footer}>
          model: {tree?.meta.model}
          {tree?.meta.fallback ? " (fallback)" : ""}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  header: {
    paddingHorizontal: theme.space(4),
    paddingTop: theme.space(4),
    paddingBottom: theme.space(1),
  },
  kicker: {
    fontSize: theme.font.caption,
    letterSpacing: 1.5,
    color: theme.color.muted,
    fontWeight: "700",
  },
  h1: { fontSize: theme.font.display, fontWeight: "800", color: theme.color.ink },
  banner: {
    marginHorizontal: theme.space(4),
    marginBottom: theme.space(2),
    padding: theme.space(3),
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  bannerBody: { fontSize: theme.font.caption, color: theme.color.ink },
  bannerHint: {
    fontSize: theme.font.caption,
    color: theme.color.accent,
    fontWeight: "700",
    marginTop: 4,
  },
  bannerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  bannerMeta: { fontSize: theme.font.caption, color: theme.color.muted, flex: 1 },
  reset: { fontSize: theme.font.caption, color: theme.color.warm, fontWeight: "700" },
  switcher: {
    flexDirection: "row",
    marginHorizontal: theme.space(4),
    backgroundColor: "#EAE5DA",
    borderRadius: theme.radius.pill,
    padding: 4,
  },
  seg: {
    flex: 1,
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  segActive: { backgroundColor: theme.color.card },
  segText: { fontSize: theme.font.caption, color: theme.color.muted, fontWeight: "600" },
  segTextActive: { color: theme.color.ink },
  reasonsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space(5),
    paddingVertical: theme.space(2),
  },
  reasonsLabel: { fontSize: theme.font.caption, color: theme.color.muted },
  scroll: { padding: theme.space(4), paddingBottom: theme.space(10) },
  muted: { color: theme.color.muted },
  footer: {
    fontSize: theme.font.caption,
    color: theme.color.muted,
    textAlign: "center",
    marginTop: theme.space(4),
  },
});
