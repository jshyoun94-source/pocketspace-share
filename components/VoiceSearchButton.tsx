// components/VoiceSearchButton.tsx
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
    type SpeechRecognitionErrorEvent,
    type SpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onResult?: (finalText: string) => void; // 최종 텍스트 콜백
  lang?: string; // "ko-KR" | "en-US" 등
};

export default function VoiceSearchButton({ onResult, lang = "ko-KR" }: Props) {
  const [recognizing, setRecognizing] = useState(false);
  const [interim, setInterim] = useState<string>("");
  const finalRef = useRef<string>("");

  useSpeechRecognitionEvent("result", (e: SpeechRecognitionResultEvent) => {
    if (e.isFinal) {
      finalRef.current = e.transcript?.trim() ?? "";
      setInterim("");
      if (onResult && finalRef.current) onResult(finalRef.current);
      setRecognizing(false);
    } else {
      setInterim(e.transcript ?? "");
    }
  });

  useSpeechRecognitionEvent("start", () => {
    setRecognizing(true);
    setInterim("");
    finalRef.current = "";
  });

  useSpeechRecognitionEvent("end", () => {
    setRecognizing(false);
  });

  useSpeechRecognitionEvent("error", (e: SpeechRecognitionErrorEvent) => {
    console.warn("STT error:", e.error, e.message);
    setRecognizing(false);
  });

  const requestPermissionsAndStart = async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      console.warn("마이크/음성 인식 권한이 거부되었습니다:", perm);
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: false, // 한 문장 받고 자동 종료
    });
  };

  const stop = () => ExpoSpeechRecognitionModule.stop();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={recognizing ? stop : requestPermissionsAndStart}
        style={[styles.mic, recognizing && styles.micActive]}
        accessibilityRole="button"
        accessibilityLabel="음성검색"
      >
        <Text style={styles.micText}>{recognizing ? "듣는 중…" : "🎤"}</Text>
      </Pressable>
      {recognizing && (
        <View style={styles.below}>
          <ActivityIndicator />
          <Text style={styles.interim} numberOfLines={1}>
            {interim || "말씀해 주세요…"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  micActive: {
    borderColor: "#000",
  },
  micText: { fontSize: 20 },
  below: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 },
  interim: { maxWidth: 220, fontSize: 12, color: "#666" },
});
