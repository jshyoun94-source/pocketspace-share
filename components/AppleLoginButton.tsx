// components/AppleLoginButton.tsx - Sign in with Apple (iOS 전용)
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { signInWithAppleCredential } from "../utils/authApple";

type Props = {
  onAppleStart?: () => void;
  onSuccess?: () => void | Promise<void>;
};

export default function AppleLoginButton({ onAppleStart, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (Platform.OS !== "ios") {
      Toast.show({
        type: "info",
        text1: "Apple 로그인은 iOS 앱에서만 사용할 수 있습니다.",
      });
      return;
    }
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      Toast.show({
        type: "info",
        text1: "이 기기에서는 Apple 로그인을 사용할 수 없습니다.",
      });
      return;
    }

    try {
      setLoading(true);
      onAppleStart?.();

      // 1) Apple에서 identityToken 발급 (replay 방지용 nonce 사용)
      const rawNonce = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: rawNonce,
      });

      if (!credential.identityToken) {
        throw new Error("Apple 로그인 토큰을 받지 못했습니다.");
      }

      // 2) 백엔드에서 Apple JWT 검증 후 Custom Token 발급 → Firebase 로그인 (nonce 이슈 우회)
      const fullName = credential.fullName
        ? {
            givenName: credential.fullName.givenName ?? undefined,
            familyName: credential.fullName.familyName ?? undefined,
          }
        : null;
      await signInWithAppleCredential(
        credential.identityToken,
        fullName,
        credential.email ?? null
      );

      const displayName =
        credential.fullName?.givenName || credential.fullName?.familyName
          ? [credential.fullName.givenName, credential.fullName.familyName]
              .filter(Boolean)
              .join(" ")
          : "Apple 사용자";

      Toast.show({ type: "success", text1: `${displayName}님 환영합니다!` });

      if (onSuccess) {
        await new Promise((r) => setTimeout(r, 120));
        await onSuccess();
      }
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") {
        // 사용자가 취소한 경우
        return;
      }
      console.error("[Apple 로그인] 전체 에러:", e?.code, e?.message, e);
      const code = e?.code ?? "";
      const msg = e?.message ?? String(e);
      Toast.show({
        type: "error",
        text1: "Apple 로그인 실패",
        text2: code ? `[${code}] ${msg}` : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  // 모든 플랫폼에서 버튼 표시 (iOS에서만 실제 로그인 가능)
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
        padding: 12,
        borderRadius: 8,
        width: 220,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="logo-apple" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "bold" }}>
            Apple 로그인
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
