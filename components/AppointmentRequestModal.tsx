import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type AppointmentRequestData = {
  itemImageUri?: string;
  itemImageBase64?: string;
  storageSchedule: string; // 예: "01/31 14:00 ~ 01/31 17:00"
  storageItem: string; // 보관물품 (필수)
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AppointmentRequestData) => void;
  /** 보관신청중인 요청이 있으면 true → 버튼을 "재요청하기"로 표시 */
  isReRequest?: boolean;
};

export default function AppointmentRequestModal({
  visible,
  onClose,
  onSubmit,
  isReRequest = false,
}: Props) {
  const [itemImageUri, setItemImageUri] = useState<string | null>(null);
  const [itemImageBase64, setItemImageBase64] = useState<string | null>(null);
  const [storageSchedule, setStorageSchedule] = useState("");
  const [storageItem, setStorageItem] = useState("");

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "사진을 선택하려면 갤러리 접근 권한이 필요합니다.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true, // RN에서 ArrayBuffer/Blob 미지원 → 네이티브 base64 직접 사용
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setItemImageUri(asset.uri);
      setItemImageBase64(asset.base64 ?? null);
    }
  };

  const handleSubmit = () => {
    if (!storageSchedule.trim()) {
      Alert.alert("입력 필요", "보관일정을 입력해 주세요.");
      return;
    }
    if (!storageItem.trim()) {
      Alert.alert("입력 필요", "보관물품을 입력해 주세요.");
      return;
    }
    onSubmit({
      itemImageUri: itemImageUri || undefined,
      itemImageBase64: itemImageBase64 || undefined,
      storageSchedule: storageSchedule.trim(),
      storageItem: storageItem.trim(),
    });
    setItemImageUri(null);
    setItemImageBase64(null);
    setStorageSchedule("");
    setStorageItem("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>보관요청하기</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>물건 사진 (선택)</Text>
            <Pressable style={styles.imageBox} onPress={pickImage}>
              {itemImageUri ? (
                <Image
                  source={{ uri: itemImageUri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="add" size={32} color="#9CA3AF" />
                  <Text style={styles.imagePlaceholderText}>사진 추가</Text>
                </View>
              )}
            </Pressable>

            <Text style={[styles.label, { marginTop: 16 }]}>보관일정 (필수)</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 01/31 14:00 ~ 01/31 17:00"
              placeholderTextColor="#9CA3AF"
              value={storageSchedule}
              onChangeText={setStorageSchedule}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>보관물품 (필수)</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 캐리어, 박스 2개"
              placeholderTextColor="#9CA3AF"
              value={storageItem}
              onChangeText={setStorageItem}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>
                {isReRequest ? "재요청하기" : "보관 요청 보내기"}
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
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  imageBox: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    fontSize: 16,
    color: "#111827",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  submitBtn: {
    backgroundColor: "#2477ff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
