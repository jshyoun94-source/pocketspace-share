import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { auth, db } from "../firebase";

type SettingsState = {
  chatEnabled: boolean;
  statusEnabled: boolean;
};

const DEFAULT_SETTINGS: SettingsState = {
  chatEnabled: true,
  statusEnabled: true,
};

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof SettingsState | null>(null);

  useEffect(() => {
    let alive = true;
    const user = auth.currentUser;
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const raw = snap.data()?.notificationSettings ?? {};
        if (!alive) return;
        setSettings({
          chatEnabled: typeof raw.chatEnabled === "boolean" ? raw.chatEnabled : true,
          statusEnabled: typeof raw.statusEnabled === "boolean" ? raw.statusEnabled : true,
        });
      } catch {
        if (alive) setSettings(DEFAULT_SETTINGS);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const updateSetting = async (key: keyof SettingsState, value: boolean) => {
    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert("로그인 필요", "알림 설정을 변경하려면 로그인해 주세요.");
      return;
    }
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavingKey(key);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          notificationSettings: { [key]: value },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e: any) {
      setSettings((prev) => ({ ...prev, [key]: !value }));
      Alert.alert("오류", e?.message ?? "설정 저장에 실패했습니다.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!auth.currentUser) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>로그인이 필요합니다.</Text>
        <Pressable style={styles.button} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.buttonText}>로그인하기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>채팅 알림</Text>
          <Text style={styles.desc}>새 채팅 문의/메시지 알림을 받습니다.</Text>
        </View>
        <Switch
          value={settings.chatEnabled}
          onValueChange={(v) => updateSetting("chatEnabled", v)}
          disabled={savingKey === "chatEnabled"}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>상태 변경 알림</Text>
          <Text style={styles.desc}>요청 상태(수락/변경) 관련 알림을 받습니다.</Text>
        </View>
        <Switch
          value={settings.statusEnabled}
          onValueChange={(v) => updateSetting("statusEnabled", v)}
          disabled={savingKey === "statusEnabled"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  row: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textWrap: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  desc: { fontSize: 13, color: "#6B7280" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    gap: 12,
    paddingHorizontal: 20,
  },
  emptyText: { fontSize: 15, color: "#6B7280" },
  button: {
    backgroundColor: "#2477ff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
