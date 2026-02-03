import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CUSTOMER_EVAL_ITEMS,
  OWNER_EVAL_ITEMS,
  calcMindSpaceDelta,
} from "../constants/mindSpace";

type EvalTarget = "owner" | "customer";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (scores: Record<string, number>) => Promise<void>;
  target: EvalTarget;
  targetName: string;
};

export default function EvaluationModal({
  visible,
  onClose,
  onSubmit,
  target,
  targetName,
}: Props) {
  const items = target === "owner" ? OWNER_EVAL_ITEMS : CUSTOMER_EVAL_ITEMS;
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleStarPress = (key: string, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const allSelected = items.every((item) => scores[item.key] != null);
  const avgScore = allSelected
    ? items.reduce((sum, item) => sum + (scores[item.key] ?? 0), 0) / items.length
    : 0;
  const delta = calcMindSpaceDelta(Object.values(scores));

  const handleSubmit = async () => {
    if (!allSelected) return;
    setSubmitting(true);
    try {
      await onSubmit(scores);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{targetName}님 평가하기</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <View key={item.key} style={styles.item}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemDesc}>{item.desc}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => handleStarPress(item.key, v)}
                      style={styles.starBtn}
                    >
                      <Ionicons
                        name={scores[item.key] != null && v <= (scores[item.key] ?? 0) ? "star" : "star-outline"}
                        size={32}
                        color={scores[item.key] != null && v <= (scores[item.key] ?? 0) ? "#FBBF24" : "#D1D5DB"}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.submitBtn, !allSelected && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!allSelected || submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? "제출 중..." : "평가 완료"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 34,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  body: {
    padding: 20,
    maxHeight: 400,
  },
  item: {
    marginBottom: 24,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 12,
  },
  stars: {
    flexDirection: "row",
    gap: 8,
  },
  starBtn: {
    padding: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  deltaHint: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: "#2477ff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
