// components/KakaoLoginButton.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
};

export default function KakaoLoginButton({ onPress, loading, disabled }: Props) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isDisabled}
      style={[styles.button, isDisabled && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityLabel="카카오로 로그인"
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.kakaoIcon}>🟨</Text>
        )}
        <Text style={styles.label}>카카오로 로그인</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 280,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#FEE500", // 카카오 옐로우
    justifyContent: "center",
    alignItems: "center",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  kakaoIcon: {
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
  },
});
