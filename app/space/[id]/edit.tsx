// app/space/[id]/edit.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

import AddressPicker from "../../../components/AddressPicker";
import { app, auth, db } from "../../../firebase";

const storage = getStorage(app);

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_SIZE = (SCREEN_WIDTH - 16 * 2 - 8 * 2) / 3;

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

const PRICE_OPTIONS = [500, 1000, 2000, 5000] as const;

export default function EditSpace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // 주소검색 입력란 표시 텍스트
  const [addressQuery, setAddressQuery] = useState("");
  const addressPickerKeyRef = useRef(0);

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

  const [loading, setLoading] = useState(false);

  // 기존 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, "spaces", String(id));
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          
          // 주소 정보
          if (data.address) {
            setAddressFormatted(data.address);
            setSelectedAddress({
              name: data.title || "",
              formatted: data.address,
            });
          }
          if (data.coords) {
            setCoords({ lat: data.coords.lat, lng: data.coords.lng });
          }
          
          // 설명
          setDesc(data.description || "");
          
          // 사진
          setImages(data.images || []);
          
          // 카테고리
          setCategories(data.tags || []);
          
          // 스케줄
          if (data.schedules && data.schedules.length > 0) {
            const loadedSchedules = data.schedules.map((s: any) => ({
              id: uuidv4(),
              days: new Set<DayKey>(s.days || []),
              time: s.time || { start: "09", end: "18" },
            }));
            setSchedules(loadedSchedules);
          }
          
          // 가격
          setHourlyPrice(data.pricePerHour || 1000);
        }
      } catch (e) {
        console.error("데이터 불러오기 실패:", e);
        Alert.alert("오류", "데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

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

  const toggleDay = (blockId: string, day: DayKey) => {
    setSchedules((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              days: b.days.has(day)
                ? new Set([...b.days].filter((d) => d !== day))
                : new Set([...b.days, day]),
            }
          : b
      )
    );
  };

  const addScheduleBlock = () => {
    setSchedules((prev) => [
      ...prev,
      { id: uuidv4(), days: new Set<DayKey>(), time: { start: "09", end: "18" } },
    ]);
  };

  const removeScheduleBlock = (blockId: string) => {
    setSchedules((prev) => prev.filter((b) => b.id !== blockId));
  };

  const toggleCategory = (cat: StorageCategory) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handlePickedAddress = (p: {
    name?: string;
    formatted_address?: string;
    lat?: number;
    lng?: number;
  }) => {
    const name = p.name || p.formatted_address || "";
    const formatted = p.formatted_address || "";
    
    setAddressQuery("");
    setSelectedAddress({
      name,
      formatted,
    });
    setAddressFormatted(formatted);
    setCoords(p.lat && p.lng ? { lat: p.lat, lng: p.lng } : null);
    addressPickerKeyRef.current += 1;
  };

  const handleChangeAddress = () => {
    setSelectedAddress(null);
    setAddressQuery("");
    setAddressFormatted("");
    setCoords(null);
    addressPickerKeyRef.current += 1;
  };

  const canSubmit = useMemo(() => {
    const hasAddress = selectedAddress || (addressQuery.trim() && coords);
    const hasDays = schedules.some((b) => b.days.size > 0);
    return hasAddress && hourlyPrice && hasDays;
  }, [selectedAddress, addressQuery, coords, hourlyPrice, schedules]);

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
        allowsEditing: false,
        quality: 0.8,
        aspect: [1, 1],
        selectionLimit: 9 - images.length,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages = result.assets.map((asset) => asset.uri);
        setImages((prev) => [...prev, ...newImages].slice(0, 9));
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

  // 수정 저장
  const handleUpdate = async () => {
    if (!canSubmit) {
      Alert.alert("입력 확인", "주소/가격/요일-시간을 확인해 주세요.");
      return;
    }
    if (!auth.currentUser) {
      Alert.alert("로그인 필요", "공간을 수정하려면 로그인이 필요합니다.");
      return;
    }
    if (!coords) {
      Alert.alert("오류", "주소 좌표가 없습니다.");
      return;
    }

    try {
      setLoading(true);
      const addressTitle = selectedAddress?.name || addressQuery.trim();

      // 새로 추가된 이미지를 Firebase Storage에 업로드
      const uploadedImageUrls: string[] = [...images.filter(img => img.startsWith('https://'))]; // 기존 URL은 그대로 유지
      const newImages = images.filter(img => !img.startsWith('https://')); // 새로 추가된 로컬 이미지만 업로드
      
      if (newImages.length > 0) {
        try {
          for (const localUri of newImages) {
            try {
              const response = await fetch(localUri);
              if (!response.ok) {
                console.error("이미지 fetch 실패:", response.status);
                continue;
              }
              const blob = await response.blob();
              
              const fileName = `${Date.now()}_${uuidv4()}.jpg`;
              const imagePath = `spaces/${auth.currentUser!.uid}/${fileName}`;
              const imageRef = ref(storage, imagePath);
              
              await uploadBytes(imageRef, blob);
              const downloadURL = await getDownloadURL(imageRef);
              uploadedImageUrls.push(downloadURL);
            } catch (error: any) {
              console.error("이미지 업로드 실패:", error);
            }
          }
        } catch (error: any) {
          console.error("이미지 업로드 전체 실패:", error);
        }
      }

      // Firebase Firestore에 업데이트
      const docRef = doc(db, "spaces", String(id));
      await updateDoc(docRef, {
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
        images: uploadedImageUrls,
        updatedAt: serverTimestamp(),
      });

      Alert.alert("수정 완료", "공간이 수정되었습니다.", [
        {
          text: "확인",
          onPress: () => {
            router.replace(`/space/${id}`);
          },
        },
      ]);
    } catch (e: any) {
      console.error("공간 수정 오류:", e);
      Alert.alert("오류", `수정 중 문제가 발생했습니다.\n${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !selectedAddress) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "게시글 수정",
            headerBackTitle: "",
            headerLeft: () => (
              <Pressable
                onPress={() => router.back()}
                style={{ marginLeft: 0, padding: 4 }}
              >
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            ),
          }}
        />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text>로딩 중...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "게시글 수정",
          headerBackTitle: "",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
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
            {/* 주소 검색 */}
            <Text style={styles.sectionTitle}>주소 검색</Text>

            {selectedAddress ? (
              <View style={styles.selectedAddressContainer}>
                <View style={styles.selectedAddressContent}>
                  <Text style={styles.selectedAddressName}>{selectedAddress.name}</Text>
                  {selectedAddress.formatted && (
                    <Text style={styles.selectedAddressFormatted}>
                      {selectedAddress.formatted}
                    </Text>
                  )}
                </View>
                <Pressable onPress={handleChangeAddress} style={styles.changeAddressButton}>
                  <Text style={styles.changeAddressText}>주소 변경</Text>
                </Pressable>
              </View>
            ) : (
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
              style={[
                styles.input,
                { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
              ]}
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
                    <Pressable
                      onPress={() => removeScheduleBlock(block.id)}
                      hitSlop={8}
                    >
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
                    <Text
                      style={[
                        styles.priceChipText,
                        active && styles.priceChipTextActive,
                      ]}
                    >
                      {p.toLocaleString()}원
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Pressable
              style={[styles.submitBtn, (!canSubmit || loading) && { opacity: 0.5 }]}
              onPress={handleUpdate}
              disabled={!canSubmit || loading}
            >
              <Text style={styles.submitText}>{loading ? "수정 중..." : "수정하기"}</Text>
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
                      <Pressable
                        style={styles.hourItem}
                        onPress={() => onPickHour(item)}
                      >
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
    color: "#111827",
    backgroundColor: "#fff",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 4,
  },

  helper: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: -4,
  },

  gplacesWrap: {
    marginTop: 4,
  },

  selectedAddressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    fontSize: 14,
    color: "#6B7280",
  },

  changeAddressButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
  },

  changeAddressText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },

  imagePreviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
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
    backgroundColor: "#E5E7EB",
  },

  imageRemoveButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
  },

  imagePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    marginTop: 8,
  },

  imagePickerText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },

  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },

  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  chipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
  },

  chipText: {
    fontSize: 14,
    color: "#6B7280",
  },

  chipTextActive: {
    color: "#2563EB",
    fontWeight: "600",
  },

  block: {
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 8,
  },

  blockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  blockTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },

  remove: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "600",
  },

  daysRow: {
    gap: 8,
    marginBottom: 12,
  },

  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  dayChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },

  dayChipText: {
    fontSize: 14,
    color: "#6B7280",
  },

  dayChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  timeLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginRight: 4,
  },

  timeSelect: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: 50,
    alignItems: "center",
  },

  timeSelectText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },

  tilde: {
    fontSize: 14,
    color: "#6B7280",
  },

  timeSuffix: {
    fontSize: 14,
    color: "#6B7280",
  },

  addBtn: {
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    marginTop: 8,
  },

  addBtnText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },

  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },

  priceChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  priceChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
  },

  priceChipText: {
    fontSize: 14,
    color: "#6B7280",
  },

  priceChipTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },

  submitBtn: {
    backgroundColor: "#2477ff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },

  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: "80%",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },

  hourItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },

  hourText: {
    fontSize: 16,
    color: "#111827",
  },

  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 20,
  },

  modalClose: {
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 8,
  },

  modalCloseText: {
    fontSize: 16,
    color: "#2563EB",
    fontWeight: "600",
  },
});
