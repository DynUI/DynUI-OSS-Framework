import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { JsonValue } from "../contract-types";
import { theme } from "../theme";

/**
 * A registered component receives its resolved data props (keyed by data key),
 * its variant, and — for container components — its rendered slot children keyed
 * by slot id. Leaf components simply ignore `slots`.
 */
export type DynComponent = React.FC<{
  p: Record<string, JsonValue>;
  variant?: string;
  slots?: Record<string, React.ReactNode>;
}>;

// Small typed accessors over the loosely-typed resolved props.
const S = (v: JsonValue | undefined): string => (v == null ? "" : String(v));
const N = (v: JsonValue | undefined): number => (typeof v === "number" ? v : 0);
const A = <T,>(v: JsonValue | undefined): T[] => (Array.isArray(v) ? (v as T[]) : []);

const Card: React.FC<{ children: React.ReactNode; tint?: string }> = ({
  children,
  tint,
}) => (
  <View style={[s.card, tint ? { backgroundColor: tint } : null]}>{children}</View>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={s.label}>{String(children).toUpperCase()}</Text>
);

// 1. Activity headline -------------------------------------------------------
const ActivityHeadline: DynComponent = ({ p, variant }) => {
  const date = S(p["activity.startedAt"]).slice(0, 10);
  return (
    <Card>
      {variant === "with-photo" && S(p["activity.photoUrl"]) ? (
        <Image source={{ uri: S(p["activity.photoUrl"]) }} style={s.banner} />
      ) : null}
      <Text style={s.title}>{S(p["activity.title"])}</Text>
      <Text style={s.muted}>
        {S(p["activity.type"])} · {date}
      </Text>
      <Text style={s.headlineStat}>{S(p["activity.headlineStat"])}</Text>
    </Card>
  );
};

// 2. Recovery / readiness ----------------------------------------------------
const RecoveryScoreCard: DynComponent = ({ p, variant }) => {
  const score = N(p["readiness.score"]);
  return (
    <Card>
      <Label>Recovery</Label>
      <View style={s.row}>
        <View style={[s.ring, { borderColor: theme.color.good }]}>
          <Text style={[s.ringNum, { color: theme.color.good }]}>{score}</Text>
        </View>
        <View style={s.flex}>
          {variant === "expanded" && (
            <>
              <Text style={s.body}>{S(p["readiness.narrative"])}</Text>
              {p["readiness.hrv"] != null && (
                <View style={s.pill}>
                  <Text style={s.pillText}>HRV {N(p["readiness.hrv"])} ms</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Card>
  );
};

// 3. Training load chart -----------------------------------------------------
const TrainingLoadChart: DynComponent = ({ p, variant }) => {
  const series = A<number>(p["training.loadSeries"]);
  const max = Math.max(1, ...series);
  const h = variant === "sparkline" ? 36 : 84;
  return (
    <Card>
      <View style={s.spread}>
        <Label>Training load</Label>
        {p["training.acuteChronicRatio"] != null && (
          <View style={[s.pill, { backgroundColor: "#EAF1FF" }]}>
            <Text style={[s.pillText, { color: theme.color.accent }]}>
              A:C {N(p["training.acuteChronicRatio"]).toFixed(2)}
            </Text>
          </View>
        )}
      </View>
      <View style={[s.bars, { height: h }]}>
        {series.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              marginHorizontal: 1,
              height: `${(v / max) * 100}%`,
              backgroundColor: theme.color.accent,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
            }}
          />
        ))}
      </View>
    </Card>
  );
};

// 4. HR zone breakdown -------------------------------------------------------
const HrZoneBreakdown: DynComponent = ({ p }) => {
  const zones = A<number>(p["activity.hrZones"]);
  const max = Math.max(1, ...zones);
  return (
    <Card>
      <Label>Heart-rate zones</Label>
      {zones.map((v, i) => (
        <View key={i} style={s.zoneRow}>
          <Text style={s.zoneTag}>Z{i + 1}</Text>
          <View style={s.zoneTrack}>
            <View
              style={{
                width: `${(v / max) * 100}%`,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.color.zone[i] ?? theme.color.accent,
              }}
            />
          </View>
          <Text style={s.zoneVal}>{v}m</Text>
        </View>
      ))}
    </Card>
  );
};

// 5. Split / lap table -------------------------------------------------------
const SplitTable: DynComponent = ({ p, variant }) => {
  const splits = A<{ km: number; pace: string; hr: number }>(p["activity.splits"]);
  const showHr = variant !== "essential";
  return (
    <Card>
      <Label>Splits</Label>
      <View style={[s.trow, s.thead]}>
        <Text style={[s.th, s.flex]}>KM</Text>
        <Text style={[s.th, s.flex]}>PACE</Text>
        {showHr && <Text style={[s.th, s.flex]}>HR</Text>}
      </View>
      {splits.map((r) => (
        <View key={r.km} style={s.trow}>
          <Text style={[s.td, s.flex]}>{r.km}</Text>
          <Text style={[s.td, s.flex]}>{r.pace}</Text>
          {showHr && <Text style={[s.td, s.flex]}>{r.hr}</Text>}
        </View>
      ))}
    </Card>
  );
};

// 6. Route map hero ----------------------------------------------------------
const RouteMapHero: DynComponent = ({ p, variant }) => (
  <View style={s.hero}>
    {variant === "map-photo" && S(p["activity.photoUrl"]) ? (
      <Image source={{ uri: S(p["activity.photoUrl"]) }} style={s.heroPhoto} />
    ) : null}
    <View style={s.heroMap}>
      <Text style={s.heroPin}>📍</Text>
      <Text style={s.heroLabel}>Route</Text>
    </View>
  </View>
);

// 7. Insight / narrative card ------------------------------------------------
const InsightCard: DynComponent = ({ p }) => (
  <Card tint="#FBF6EE">
    <View style={s.row}>
      <Text style={s.insightIcon}>💡</Text>
      <View style={s.flex}>
        <Text style={s.insightHead}>{S(p["insight.headline"])}</Text>
        <Text style={s.body}>{S(p["insight.body"])}</Text>
      </View>
    </View>
  </Card>
);

// 8. Kudos & comments --------------------------------------------------------
const SocialKudosBar: DynComponent = ({ p }) => {
  const comments = A<{ author: string; text: string }>(p["social.comments"]);
  return (
    <Card>
      <View style={s.spread}>
        <Text style={s.kudos}>❤ {N(p["social.kudosCount"])} kudos</Text>
        <Text style={s.muted}>{comments.length} comments</Text>
      </View>
      {comments.slice(0, 2).map((c, i) => (
        <View key={i} style={s.commentRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{c.author.slice(0, 1)}</Text>
          </View>
          <Text style={s.body}>
            <Text style={s.bold}>{c.author}</Text>  {c.text}
          </Text>
        </View>
      ))}
    </Card>
  );
};

// 9. Segment leaderboard -----------------------------------------------------
const SegmentLeaderboard: DynComponent = ({ p }) => {
  const segs = A<{ name: string; rank: number; total: number }>(p["social.segments"]);
  const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");
  return (
    <Card>
      <Label>Segments</Label>
      {segs.map((seg, i) => (
        <View key={i} style={s.segRow}>
          <Text style={[s.body, s.flex]}>
            {medal(seg.rank)} {seg.name}
          </Text>
          <Text style={s.muted}>
            #{seg.rank} / {seg.total}
          </Text>
        </View>
      ))}
    </Card>
  );
};

// 10. Strength volume (canary) ----------------------------------------------
const StrengthVolumeCard: DynComponent = ({ p }) => {
  const groups = A<{ group: string; volume: number }>(p["strength.volumeByGroup"]);
  const max = Math.max(1, ...groups.map((g) => g.volume));
  return (
    <Card>
      <View style={s.spread}>
        <Label>Strength volume</Label>
        <View style={[s.pill, { backgroundColor: "#EAF1FF" }]}>
          <Text style={[s.pillText, { color: theme.color.accent }]}>NEW</Text>
        </View>
      </View>
      {groups.map((g, i) => (
        <View key={i} style={s.zoneRow}>
          <Text style={[s.zoneTag, { width: 56 }]}>{g.group}</Text>
          <View style={s.zoneTrack}>
            <View
              style={{
                width: `${(g.volume / max) * 100}%`,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.color.accent,
              }}
            />
          </View>
          <Text style={s.zoneVal}>{g.volume}</Text>
        </View>
      ))}
    </Card>
  );
};

// --- Composition demo (slots) ----------------------------------------------
// These prove TRUE nested rendering: dashboard-panel places its slot children
// inside its own layout rather than the renderer flattening them into siblings.
const PanelTitle: DynComponent = ({ p }) => (
  <Card>
    <Text style={s.title}>{S(p["title"])}</Text>
  </Card>
);

const MiniMetric: DynComponent = ({ p }) => (
  <View style={s.miniMetric}>
    <Text style={s.headlineStat}>{N(p["value"])}</Text>
  </View>
);

const MiniChart: DynComponent = ({ p }) => {
  const series = A<number>(p["series"]);
  const max = Math.max(1, ...series);
  return (
    <View style={[s.bars, { height: 36 }]}>
      {series.map((v, i) => (
        <View
          key={i}
          style={{ flex: 1, marginHorizontal: 1, height: `${(v / max) * 100}%`, backgroundColor: theme.color.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3 }}
        />
      ))}
    </View>
  );
};

const DashboardPanel: DynComponent = ({ slots }) => (
  <Card>
    <Label>Panel</Label>
    <View style={s.slotBody}>{slots?.body}</View>
    {slots?.footer ? <View style={s.slotFooter}>{slots.footer}</View> : null}
  </Card>
);

export const registry: Record<string, DynComponent> = {
  "activity-headline": ActivityHeadline,
  "strength-volume-card": StrengthVolumeCard,
  "recovery-score-card": RecoveryScoreCard,
  "training-load-chart": TrainingLoadChart,
  "hr-zone-breakdown": HrZoneBreakdown,
  "split-table": SplitTable,
  "route-map-hero": RouteMapHero,
  "insight-card": InsightCard,
  "social-kudos-bar": SocialKudosBar,
  "segment-leaderboard": SegmentLeaderboard,
  // composition demo
  "panel-title": PanelTitle,
  "dashboard-panel": DashboardPanel,
  "mini-metric": MiniMetric,
  "mini-chart": MiniChart,
};

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.card,
    padding: theme.space(4),
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space(3) },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: {
    fontSize: theme.font.caption,
    letterSpacing: 1,
    color: theme.color.muted,
    marginBottom: theme.space(2),
    fontWeight: "600",
  },
  title: { fontSize: theme.font.title, fontWeight: "700", color: theme.color.ink },
  muted: { fontSize: theme.font.body, color: theme.color.muted },
  body: { fontSize: theme.font.body, color: theme.color.ink },
  bold: { fontWeight: "700" },
  headlineStat: {
    fontSize: theme.font.display,
    fontWeight: "800",
    color: theme.color.ink,
    marginTop: theme.space(2),
  },
  banner: { height: 120, borderRadius: 12, marginBottom: theme.space(3) },
  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ringNum: { fontSize: 26, fontWeight: "800" },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6F2",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1),
    marginTop: theme.space(2),
  },
  pillText: { fontSize: theme.font.caption, color: theme.color.good, fontWeight: "600" },
  bars: { flexDirection: "row", alignItems: "flex-end", marginTop: theme.space(3) },
  zoneRow: { flexDirection: "row", alignItems: "center", marginTop: theme.space(2) },
  zoneTag: { width: 26, fontSize: theme.font.caption, color: theme.color.muted },
  zoneTrack: { flex: 1, marginHorizontal: theme.space(2) },
  zoneVal: { width: 34, textAlign: "right", fontSize: theme.font.caption, color: theme.color.muted },
  trow: { flexDirection: "row", paddingVertical: theme.space(2) },
  thead: { borderBottomWidth: 1, borderBottomColor: theme.color.line },
  th: { fontSize: theme.font.caption, color: theme.color.muted, fontWeight: "700" },
  td: { fontSize: theme.font.body, color: theme.color.ink },
  hero: { borderRadius: theme.radius.card, overflow: "hidden", height: 160 },
  heroPhoto: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  heroMap: {
    flex: 1,
    backgroundColor: "#DCE7DD",
    alignItems: "center",
    justifyContent: "center",
  },
  heroPin: { fontSize: 28 },
  heroLabel: { color: theme.color.muted, fontWeight: "600", marginTop: 4 },
  insightIcon: { fontSize: 22 },
  insightHead: { fontSize: theme.font.body, fontWeight: "700", color: theme.color.ink },
  kudos: { fontSize: theme.font.body, fontWeight: "700", color: theme.color.warm },
  commentRow: { flexDirection: "row", alignItems: "center", gap: theme.space(2), marginTop: theme.space(2) },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.color.warm,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: theme.font.caption },
  segRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.space(2),
  },
  slotBody: {
    backgroundColor: "#F4F8FF",
    borderRadius: theme.radius.card,
    padding: theme.space(3),
  },
  slotFooter: { marginTop: theme.space(3) },
  miniMetric: { alignItems: "center", paddingVertical: theme.space(2) },
});
