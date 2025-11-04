import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from "react-native";

type ExpoSpeechModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (opts?: { lang?: string; interimResults?: boolean; continuous?: boolean }) => void;
  stop: () => void;
  addListener: (
    evt: "start" | "end" | "result" | "error",
    cb: (...args: any[]) => void
  ) => { remove: () => void };
};

type FuncAPI = {
  requestPermissionsAsync?: () => Promise<{ granted: boolean }>;
  start?: (opts?: { lang?: string; interimResults?: boolean; continuous?: boolean }) => Promise<void> | void;
  stop?: () => Promise<void> | void;
  addListener?: ExpoSpeechModule["addListener"];
};

type Props = {
  onResult?: (finalText: string) => void;
  lang?: string;
  size?: number;
  color?: string;
  timeoutMs?: number;
};

export default function VoiceSearchButton({
  onResult,
  lang = "ko-KR",
  size = 22,
  color = "#333",
  timeoutMs = 10000,
}: Props) {
  const [recognizing, setRecognizing] = useState(false);
  const [available, setAvailable] = useState<"unknown" | "yes" | "no">("unknown");
  const [lastError, setLastError] = useState<string | null>(null);

  const moduleRef = useRef<ExpoSpeechModule | null>(null);
  const funcApiRef = useRef<FuncAPI | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFinalRef = useRef(false);

  // 회전 애니메이션
  const rotateAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (recognizing) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.stopAnimation();
      rotateAnim.setValue(0);
    }
  }, [recognizing]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const m = (await import("expo-speech-recognition")) as any;
        const mod: ExpoSpeechModule | undefined =
          m?.ExpoSpeechRecognitionModule ?? m?.SpeechRecognitionModule ?? m?.default?.ExpoSpeechRecognitionModule;
        const helpers: FuncAPI = {
          requestPermissionsAsync: m?.requestPermissionsAsync,
          start: m?.start ?? m?.startAsync,
          stop: m?.stop ?? m?.stopAsync,
          addListener: m?.addListener,
        };

        if (!mounted) return;
        if (mod || helpers.start) {
          moduleRef.current = mod ?? null;
          funcApiRef.current = helpers;
          setAvailable("yes");

          const addL = (evt: any, cb: any) => {
            try {
              if (mod?.addListener) return mod.addListener(evt, cb);
              if (helpers.addListener) return helpers.addListener(evt, cb);
            } catch {}
            return { remove() {} };
          };

          const onStart = addL("start", () => {
            setRecognizing(true);
            gotFinalRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              stop();
              if (!gotFinalRef.current) {
                Alert.alert("음성 인식", "말씀을 인식하지 못했어요. 다시 시도해 주세요.");
              }
            }, timeoutMs);
          });

          const onEnd = addL("end", () => {
            setRecognizing(false);
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          });

          const onResultEvt = addL("result", (e: any) => {
            if (e?.isFinal) {
              gotFinalRef.current = true;
              const text = (e?.transcript ?? "").trim();
              if (text) onResult?.(text);
            }
          });

          const onErrorEvt = addL("error", (e: any) => {
            setRecognizing(false);
            setLastError(`${e?.error ?? "unknown"}: ${e?.message ?? ""}`);
            if (timerRef.current) clearTimeout(timerRef.current);
            Alert.alert("음성 인식 오류", e?.message ?? "권한/네트워크 문제일 수 있어요.");
          });

          return () => {
            onStart?.remove?.();
            onEnd?.remove?.();
            onResultEvt?.remove?.();
            onErrorEvt?.remove?.();
          };
        } else setAvailable("no");
      } catch {
        if (mounted) setAvailable("no");
      }
    })();
    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeoutMs]);

  const requestPermissionsAndStart = async () => {
    if (!moduleRef.current && !funcApiRef.current?.start) {
      Alert.alert(
        "음성 인식 사용 불가",
        Platform.select({
          ios: "Expo Go에서는 작동하지 않아요. 개발 빌드에서 시도해 주세요.\n명령어: npx expo run:ios --device",
          android: "Expo Go에서는 작동하지 않아요. 개발 빌드에서 시도해 주세요.\n명령어: npx expo run:android",
        })!
      );
      return;
    }

    try {
      const ask =
        moduleRef.current?.requestPermissionsAsync ?? funcApiRef.current?.requestPermissionsAsync;
      if (ask) {
        const p = await ask();
        if (!p?.granted) {
          Alert.alert("권한 필요", "마이크/음성 인식 권한을 허용해 주세요.");
          return;
        }
      }

      setTimeout(() => {
        try {
          moduleRef.current?.start?.({ lang, interimResults: true, continuous: true });
          funcApiRef.current?.start?.({ lang, interimResults: true, continuous: true });
        } catch {}
      }, Platform.OS === "ios" ? 120 : 0);
    } catch {
      Alert.alert("시작 실패", "음성 인식을 시작하지 못했어요.");
    }
  };

  const stop = () => {
    try {
      moduleRef.current?.stop?.();
      funcApiRef.current?.stop?.();
    } catch {}
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={recognizing ? stop : requestPermissionsAndStart}
        style={({ pressed }) => [
          styles.micBtn,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="음성검색"
      >
        {recognizing ? (
          <View style={styles.recordingWrap}>
            <Animated.View
              style={[
                styles.spinner,
                { transform: [{ rotate: spin }] },
              ]}
            />
            <Ionicons name="close" size={16} color={color} style={{ position: "absolute" }} />
          </View>
        ) : (
          <Ionicons name="mic" size={size} color={color} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  recordingWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#000",
    borderTopColor: "transparent",
  },
});
