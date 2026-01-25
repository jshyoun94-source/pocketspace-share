// app/space/new.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

// ✅ 구글 기반 AddressPicker
import AddressPicker from "../../components/AddressPicker";
import { app, auth, db } from "../../firebase";

const storage = getStorage(app);

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_SIZE = (SCREEN_WIDTH - 16 * 2 - 8 * 2) / 3; // 화면 너비에서 패딩과 간격 제외 후 3등분

const STORAGE_CATEGORIES = [
  "모든물품",
  "옷/잡화",
  "20kg이내",
  "수하물캐리어 크기이하",
  "기내용캐리어 크기이하",
  "지저분한물품가능",
] as const;
type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_LABELS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
  { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];

type TimeRange = { start: string; end: string };
type ScheduleBlock = { id: string; days: Set<DayKey>; time: TimeRange };
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);

// ✅ 가격 옵션(원/시간)
const PRICE_OPTIONS = [500, 1000, 2000, 5000] as const;

export default function NewSpace() {
  const router = useRouter();

  // 주소검색 입력란 표시 텍스트
  const [addressQuery, setAddressQuery] = useState("");
  const addressPickerKeyRef = useRef(0); // 선택 시 리마운트해 드롭다운 닫힘 보강

  // 선택된 주소 정보
  const [selectedAddress, setSelectedAddress] = useState<{
    name: string;
    formatted: string;
  } | null>(null);
  const [addressFormatted, setAddressFormatted] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // 설명
  const [desc, setDesc] = useState("");
  
  // 사진
  const [images, setImages] = useState<string[]>([]);

  // 카테고리
  const [categories, setCategories] = useState<StorageCategory[]>([]);

  // 스케줄
  const [schedules, setSchedules] = useState<ScheduleBlock[]>([
    { id: uuidv4(), days: new Set<DayKey>(), time: { start: "09", end: "18" } },
  ]);

  // 가격(원/시간)
  const [hourlyPrice, setHourlyPrice] = useState<number | null>(1000);

  // 시간 선택 모달 상태
  const [timePicker, setTimePicker] = useState<{
    visible: boolean;
    blockId: string | null;
    field: "start" | "end" | null;
  }>({ visible: false, blockId: null, field: null });

  const openTimePicker = (blockId: string, field: "start" | "end") =>
    setTimePicker({ visible: true, blockId, field });
  const closeTimePicker = () =>
    setTimePicker({ visible: false, blockId: null, field: null });

  const onPickHour = (hour: string) => {
    if (!timePicker.blockId || !timePicker.field) return;
    setSchedules((prev) =>
      prev.map((b) =>
        b.id === timePicker.blockId
          ? { ...b, time: { ...b.time, [timePicker.field!]: hour } }
          : b
      )
    );
    closeTimePicker();
  };

  const toggleCategory = (cat: StorageCategory) =>
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const toggleDay = (blockId: string, day: DayKey) =>
    setSchedules((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const next = new Set(b.days);
        next.has(day) ? next.delete(day) : next.add(day);
        return { ...b, days: next };
      })
    );

  const addScheduleBlock = () =>
    setSchedules((prev) => [
      ...prev,
      { id: uuidv4(), days: new Set<DayKey>(), time: { start: "09", end: "18" } },
    ]);
  const removeScheduleBlock = (id: string) =>
    setSchedules((prev) => prev.filter((b) => b.id !== id));

  const canSubmit = useMemo(() => {
    const hasDays = schedules.some((b) => b.days.size > 0);
    return (selectedAddress || addressQuery.trim().length > 0) && coords && hourlyPrice && hasDays;
  }, [selectedAddress, addressQuery, coords, hourlyPrice, schedules]);

  // ✅ 주소 선택 시: 입력란 비우기 + 선택된 주소 표시 + 좌표 저장
  const handlePickedAddress = (p: {
    name?: string;
    formatted_address?: string;
    lat?: number;
    lng?: number;
  }) => {
    const name = p.name || p.formatted_address || "";
    const formatted = p.formatted_address || "";
    
    // 입력란 비우기 (자동완성 재트리거 방지)
    setAddressQuery("");
    // 선택된 주소 정보 저장
    setSelectedAddress({
      name,
      formatted,
    });
    setAddressFormatted(formatted);
    setCoords(p.lat && p.lng ? { lat: p.lat, lng: p.lng } : null);

    // 리마운트로 드롭다운 강제 종료 보강
    addressPickerKeyRef.current += 1;
  };

  // 주소 변경 버튼 클릭 시
  const handleChangeAddress = () => {
    setSelectedAddress(null);
    setAddressQuery("");
    setAddressFormatted("");
    setCoords(null);
    addressPickerKeyRef.current += 1;
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert("입력 확인", "주소/가격/요일-시간을 확인해 주세요.");
      return;
    }
    if (!auth.currentUser) {
      Alert.alert("로그인 필요", "공간을 등록하려면 로그인이 필요합니다.");
      router.push("/(auth)/login");
      return;
    }
    if (!coords) {
      Alert.alert("오류", "주소 좌표가 없습니다.");
      return;
    }
    
    try {
      const addressTitle = selectedAddress?.name || addressQuery.trim();
      
      // 이미지를 Firebase Storage에 업로드하고 다운로드 URL 가져오기
      const uploadedImageUrls: string[] = [];
      if (images.length > 0) {
        try {
          console.log("이미지 업로드 시작, 총 개수:", images.length);
          console.log("Storage 버킷:", storage.app.options.storageBucket);
          console.log("현재 사용자 UID:", auth.currentUser?.uid);
          
          for (const localUri of images) {
            try {
              console.log("이미지 업로드 시도:", localUri);
              
              // 로컬 URI를 Blob으로 변환
              const response = await fetch(localUri);
              if (!response.ok) {
                console.error("이미지 fetch 실패:", response.status, response.statusText);
                continue;
              }
              const blob = await response.blob();
              console.log("Blob 생성 완료, 크기:", blob.size);
              
              // Firebase Storage에 업로드
              const fileName = `${Date.now()}_${uuidv4()}.jpg`;
              const imagePath = `spaces/${auth.currentUser!.uid}/${fileName}`;
              console.log("업로드 경로:", imagePath);
              
              const imageRef = ref(storage, imagePath);
              console.log("Storage ref 생성 완료");
              
              await uploadBytes(imageRef, blob);
              console.log("업로드 완료:", fileName);
              
              // 다운로드 URL 가져오기
              const downloadURL = await getDownloadURL(imageRef);
              console.log("다운로드 URL:", downloadURL);
              uploadedImageUrls.push(downloadURL);
            } catch (error: any) {
              console.error("이미지 업로드 실패 - 상세:", {
                message: error?.message,
                code: error?.code,
                serverResponse: error?.serverResponse,
                stack: error?.stack,
              });
              Alert.alert("이미지 업로드 실패", `오류: ${error?.message || "알 수 없는 오류"}`);
              // 업로드 실패한 이미지는 건너뛰기 (공간 등록은 계속 진행)
            }
          }
          console.log("업로드 완료된 이미지 개수:", uploadedImageUrls.length);
        } catch (error: any) {
          console.error("이미지 업로드 전체 실패:", error);
          Alert.alert("이미지 업로드 오류", `전체 업로드 실패: ${error?.message || "알 수 없는 오류"}`);
          // 이미지 업로드 실패해도 공간 등록은 계속 진행
        }
      }
      
      // Firebase Firestore에 저장
      const spaceData = {
        title: addressTitle,
        description: desc.trim(),
        address: addressFormatted.trim(),
        coords: {
          lat: coords.lat,
          lng: coords.lng,
        },
        pricePerHour: hourlyPrice,
        tags: categories,
        schedules: schedules.map((b) => ({
          days: Array.from(b.days),
          time: b.time,
        })),
        images: uploadedImageUrls, // Firebase Storage 다운로드 URL 배열
        ownerId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "spaces"), spaceData);
      console.log("✅ Firebase에 공간 저장 완료:", docRef.id);

      // 로컬 AsyncStorage에도 저장 (백업용)
      const payload = {
        id: docRef.id,
        title: addressTitle,
        description: desc.trim(),
        addressFormatted: addressFormatted.trim(),
        location: coords,
        categories,
        schedules: schedules.map((b) => ({
          days: Array.from(b.days),
          time: b.time,
        })),
        hourlyPrice,
        createdAt: Date.now(),
      };

      const raw = await AsyncStorage.getItem("spaces");
      const spaces = raw ? JSON.parse(raw) : [];
      spaces.push(payload);
      await AsyncStorage.setItem("spaces", JSON.stringify(spaces));

      Alert.alert("등록 완료", "공간이 등록되었습니다.", [
        { 
          text: "확인", 
          onPress: () => {
            // 등록된 공간의 위치로 이동하기 위해 좌표를 전달
            router.replace({
              pathname: "/(tabs)",
              params: {
                focusLat: coords.lat.toString(),
                focusLng: coords.lng.toString(),
              },
            });
          },
        },
      ]);
    } catch (e: any) {
      console.error("공간 등록 오류:", e);
      Alert.alert("오류", `저장 중 문제가 발생했습니다.\n${e?.message ?? e}`);
    }
  };

  // 사진 선택
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "사진을 선택하려면 갤러리 접근 권한이 필요합니다.");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false, // 여러 장 선택 시 편집 비활성화
        quality: 0.8,
        aspect: [1, 1], // 정사각형
        selectionLimit: 9 - images.length, // 남은 개수만큼만 선택 가능
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages = result.assets.map((asset) => asset.uri);
        setImages((prev) => [...prev, ...newImages].slice(0, 9)); // 최대 9개
      }
    } catch (error) {
      console.error("이미지 선택 오류:", error);
      Alert.alert("오류", "사진을 선택하는 중 오류가 발생했습니다.");
    }
  };

  // 사진 삭제
  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "공간등록",
          headerBackTitle: "",
          headerLeft: () => (
            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={{ marginLeft: 0, padding: 4 }}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          ),
        }}
      />

      <FlatList
        data={[{ key: "form" }]}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={() => (
          <View style={styles.container}>
            {/* ✅ 부제목 통일: 주소 검색 */}
            <Text style={styles.sectionTitle}>주소 검색</Text>
            
            {selectedAddress ? (
              // 선택된 주소 표시
              <View style={styles.selectedAddressContainer}>
                <View style={styles.selectedAddressContent}>
                  <Text style={styles.selectedAddressName}>{selectedAddress.name}</Text>
                  {selectedAddress.formatted && (
                    <Text style={styles.selectedAddressFormatted}>{selectedAddress.formatted}</Text>
                  )}
                </View>
                <Pressable onPress={handleChangeAddress} style={styles.changeAddressButton}>
                  <Text style={styles.changeAddressText}>주소 변경</Text>
                </Pressable>
              </View>
            ) : (
              // 주소 검색 입력란
              <View style={styles.gplacesWrap}>
                <AddressPicker
                  key={`ap-${addressPickerKeyRef.current}`}
                  placeholder="도로명주소 또는 상호명"
                  defaultQuery=""
                  onPicked={handlePickedAddress}
                />
              </View>
            )}

            {/* 공간설명 */}
            <Text style={styles.sectionTitle}>공간설명</Text>
            
            {/* 사진 미리보기 */}
            {images.length > 0 && (
              <View style={styles.imagePreviewContainer}>
                {images.map((uri, index) => (
                  <View key={index} style={styles.imagePreviewWrapper}>
                    <Image source={{ uri }} style={styles.imagePreview} />
                    <Pressable
                      style={styles.imageRemoveButton}
                      onPress={() => removeImage(index)}
                    >
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            
            {/* 사진 첨부 버튼 */}
            <Pressable style={styles.imagePickerButton} onPress={pickImage}>
              <Ionicons name="camera-outline" size={20} color="#6B7280" />
              <Text style={styles.imagePickerText}>사진 첨부</Text>
            </Pressable>
            
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
              placeholder="보관 가능 물품이나 주의사항 등을 적어주세요."
              multiline
              value={desc}
              onChangeText={setDesc}
            />

            {/* 보관가능한 물품 */}
            <Text style={styles.sectionTitle}>보관가능한 물품</Text>
            <View style={styles.chipRowWrap}>
              {STORAGE_CATEGORIES.map((cat) => {
                const active = categories.includes(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => toggleCategory(cat)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 보관가능시간 */}
            <Text style={styles.sectionTitle}>보관가능시간</Text>
            <Text style={styles.helper}>
              요일은 여러 개 선택 가능해요. 각 블록마다 시간대를 설정할 수 있어요.
            </Text>

            {schedules.map((block, idx) => (
              <View key={block.id} style={styles.block}>
                <View style={styles.blockHeader}>
                  <Text style={styles.blockTitle}>시간 블록 #{idx + 1}</Text>
                  {schedules.length > 1 ? (
                    <Pressable onPress={() => removeScheduleBlock(block.id)} hitSlop={8}>
                      <Text style={styles.remove}>삭제</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* 요일 */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.daysRow}
                >
                  {DAY_LABELS.map(({ key, label }) => {
                    const selected = block.days.has(key);
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => toggleDay(block.id, key)}
                        style={[styles.dayChip, selected && styles.dayChipActive]}
                      >
                        <Text
                          style={[
                            styles.dayChipText,
                            selected && styles.dayChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* 시간 선택 */}
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>가능 시간</Text>
                  <Pressable
                    style={styles.timeSelect}
                    onPress={() => openTimePicker(block.id, "start")}
                  >
                    <Text style={styles.timeSelectText}>{block.time.start}</Text>
                  </Pressable>
                  <Text style={styles.tilde}>~</Text>
                  <Pressable
                    style={styles.timeSelect}
                    onPress={() => openTimePicker(block.id, "end")}
                  >
                    <Text style={styles.timeSelectText}>{block.time.end}</Text>
                  </Pressable>
                  <Text style={styles.timeSuffix}>시</Text>
                </View>
              </View>
            ))}

            <Pressable style={styles.addBtn} onPress={addScheduleBlock}>
              <Text style={styles.addBtnText}>+ 시간 블록 추가</Text>
            </Pressable>

            {/* 보관가격(원/시간) */}
            <Text style={styles.sectionTitle}>보관가격(원/시간)</Text>
            <View style={styles.priceRow}>
              {PRICE_OPTIONS.map((p) => {
                const active = hourlyPrice === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setHourlyPrice(p)}
                    style={[styles.priceChip, active && styles.priceChipActive]}
                  >
                    <Text style={[styles.priceChipText, active && styles.priceChipTextActive]}>
                      {p.toLocaleString()}원
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Pressable
              style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              <Text style={styles.submitText}>등록하기</Text>
            </Pressable>

            {/* 시간 선택 모달 */}
            <Modal
              visible={timePicker.visible}
              animationType="slide"
              transparent
              onRequestClose={closeTimePicker}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>시간 선택 (00~23)</Text>
                  <FlatList
                    data={HOUR_OPTIONS}
                    keyExtractor={(h) => h}
                    renderItem={({ item }) => (
                      <Pressable style={styles.hourItem} onPress={() => onPickHour(item)}>
                        <Text style={styles.hourText}>{item}</Text>
                      </Pressable>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.divider} />}
                    contentContainerStyle={{ paddingBottom: 8 }}
                    style={{ maxHeight: 320 }}
                  />
                  <Pressable style={styles.modalClose} onPress={closeTimePicker}>
                    <Text style={styles.modalCloseText}>닫기</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: "#fff" },

  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 16,
    backgroundColor: "#fff",
  },

  // dropdown이 absolute로 열리므로 relative 박스 유지
  gplacesWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    position: "relative",
    backgroundColor: "#fff",
    marginBottom: 4, // ✅ 입력창과 도로명주소 간격 축소
  },

  // ✅ 부제목 공통 스타일 (주소 검색 포함)
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 12 },

  helper: { fontSize: 12, color: "#888" },

  // ✅ 도로명주소(좀 더 촘촘)
  addrSmall: { fontSize: 12, color: "#6B7280", marginTop: 2, marginLeft: 2 },

  // 선택된 주소 표시
  selectedAddressContainer: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedAddressContent: {
    flex: 1,
    marginRight: 12,
  },
  selectedAddressName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  selectedAddressFormatted: {
    fontSize: 13,
    color: "#6B7280",
  },
  changeAddressButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  changeAddressText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },

  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  block: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginTop: 8,
    gap: 10,
    backgroundColor: "#fff",
  },
  blockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockTitle: { fontSize: 14, fontWeight: "700" },
  remove: { color: "#EF4444", fontSize: 12 },

  daysRow: { gap: 8, paddingVertical: 2 },
  dayChip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
    backgroundColor: "#fff",
  },
  dayChipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  dayChipText: { fontSize: 13, color: "#374151" },
  dayChipTextActive: { color: "#fff", fontWeight: "600" },

  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  timeLabel: { fontSize: 13, color: "#374151", marginRight: 8 },
  timeSelect: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  timeSelectText: { fontSize: 16, fontVariant: ["tabular-nums"] },
  tilde: { fontSize: 16, paddingHorizontal: 2, color: "#6B7280" },
  timeSuffix: { fontSize: 13, color: "#6B7280", marginLeft: 2 },

  addBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  addBtnText: { fontSize: 15, fontWeight: "600", color: "#111827" },

  // 가격 선택
  priceRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 },
  priceChip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  priceChipActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  priceChipText: { fontSize: 13, color: "#374151" },
  priceChipTextActive: { color: "#fff", fontWeight: "700" },

  submitBtn: {
    marginTop: 16,
    backgroundColor: "#111827",
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  hourItem: { paddingVertical: 12, alignItems: "center" },
  hourText: { fontSize: 18, fontVariant: ["tabular-nums"] },
  divider: { height: 1, backgroundColor: "#EEE" },
  modalClose: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: { fontSize: 15 },

  // 사진 관련 스타일
  imagePreviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  imagePreviewWrapper: {
    position: "relative",
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  imagePreview: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  imageRemoveButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: "#F9FAFB",
  },
  imagePickerText: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
});
