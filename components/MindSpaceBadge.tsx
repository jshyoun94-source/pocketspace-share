import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MIND_SPACE } from "../constants/mindSpace";

const COLOR_0 = { r: 0x2f, g: 0x3a, b: 0x5f }; // #2F3A5F 딥 블루
const COLOR_100 = { r: 0x6f, g: 0xcf, b: 0x97 }; // #6FCF97 웜 그린

function getGradientColor(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100;
  const r = Math.round(COLOR_0.r + (COLOR_100.r - COLOR_0.r) * t);
  const g = Math.round(COLOR_0.g + (COLOR_100.g - COLOR_0.g) * t);
  const b = Math.round(COLOR_0.b + (COLOR_100.b - COLOR_0.b) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type Props = {
  mindSpace: number | undefined | null;
  size?: "small" | "medium";
};

export default function MindSpaceBadge({
  mindSpace = MIND_SPACE.DEFAULT,
  size = "medium",
}: Props) {
  const value = mindSpace ?? MIND_SPACE.DEFAULT;
  const clamped = Math.max(MIND_SPACE.MIN, Math.min(MIND_SPACE.MAX, value));
  const displayText = clamped.toFixed(1);
  const color = getGradientColor(clamped);

  const isSmall = size === "small";

  return (
    <View style={[styles.badge, isSmall && styles.badgeSmall]}>
      <Text style={[styles.value, { color }, isSmall && styles.valueSmall]}>
        {displayText}평
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
  },
  valueSmall: {
    fontSize: 14,
  },
});
