/** Bevel-influenced design tokens: soft surfaces, clean at-a-glance metric cards. */
export const theme = {
  color: {
    bg: "#F4F1EA", // warm off-white canvas
    card: "#FFFFFF",
    ink: "#1C1B19",
    muted: "#6B675F",
    line: "#E7E2D8",
    accent: "#4F8DFD", // performance / data
    warm: "#E2725B", // social / effort
    good: "#3FA37A", // recovery / positive
    zone: ["#9CC4FF", "#6FA8FF", "#4F8DFD", "#E7A23C", "#E2725B"],
  },
  radius: { card: 20, pill: 999 },
  space: (n: number) => n * 4,
  font: {
    display: 30,
    title: 20,
    body: 15,
    caption: 12,
    metric: 44,
  },
} as const;
