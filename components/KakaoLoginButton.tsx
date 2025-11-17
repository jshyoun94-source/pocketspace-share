// components/KakaoLoginButton.tsx
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  onPress?: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
};

export default function KakaoLoginButton({
  onPress,
  loading,
  disabled,
}: Props) {
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
          <Text style={styles.kakaoIcon}></Text>
        )}
        <Text style={styles.label}>카카오로 로그인</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // 👉 네이버/구글 버튼과 동일한 느낌으로 정리 (크기/라운드/정렬)
  button: {
    width: 220,              // 다른 버튼들과 동일 가로 길이 가정
    height: 40,              // 살짝 높이를 키워 통일감 있게
    borderRadius: 8,        // 둥근 모서리
    backgroundColor: "#FEE500", // 카카오 옐로우만 유지
    justifyContent: "center",
    alignItems: "center",

    // 살짝 그림자 (있으면 다른 버튼과 통일감, 없으면 큰 문제 X)
    shadowOpacity: 0.08,
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
    fontSize: 18,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    // 필요하면 여기서 color도 네이버/구글에 맞춰 조절 가능
    // color: "#000",
  },
});
