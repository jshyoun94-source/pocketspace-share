// app/space/new.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
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

  // 선택된 도로명주소(작은 글씨로 표시)
  const [addressFormatted, setAddressFormatted] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // 설명
  const [desc, setDesc] = useState("");

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
    return addressQuery.trim().length > 0 && coords && hourlyPrice && hasDays;
  }, [addressQuery, coords, hourlyPrice, schedules]);

  // ✅ 주소 선택 시: 입력란 텍스트 교체 + 도로명주소 표시 + 좌표 저장 + 드롭다운 닫힘 보장(리마운트)
  const handlePickedAddress = (p: {
    name?: string;
    formatted_address?: string;
    lat?: number;
    lng?: number;
  }) => {
    const name = p.name || p.formatted_address || "";
    setAddressQuery(name);
    setAddressFormatted(p.formatted_address || "");
    setCoords(p.lat && p.lng ? { lat: p.lat, lng: p.lng } : null);

    // 리마운트로 드롭다운 강제 종료 보강
    addressPickerKeyRef.current += 1;
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert("입력 확인", "주소/가격/요일-시간을 확인해 주세요.");
      return;
    }
    try {
      const payload = {
        id: uuidv4(),
        title: addressQuery.trim(),
        description: desc.trim(),
        addressFormatted: addressFormatted.trim(),
        location: coords, // { lat, lng }
        categories,
        schedules: schedules.map((b) => ({
          days: Array.from(b.days),
          time: b.time,
        })),
        hourlyPrice, // 원/시간
        createdAt: Date.now(),
      };

      const raw = await AsyncStorage.getItem("spaces");
      const spaces = raw ? JSON.parse(raw) : [];
      spaces.push(payload);
      await AsyncStorage.setItem("spaces", JSON.stringify(spaces));

      Alert.alert("등록 완료", "공간이 등록되었습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    } catch (e) {
      console.warn(e);
      Alert.alert("오류", "저장 중 문제가 발생했습니다.");
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "공간등록",
          headerBackTitle: "", // 아이콘만 표시
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
            <View style={styles.gplacesWrap}>
              <AddressPicker
                key={`ap-${addressPickerKeyRef.current}`}
                placeholder="도로명주소 또는 상호명"
                defaultQuery={addressQuery}
                onPicked={handlePickedAddress}
              />
            </View>

            {/* ✅ 도로명주소 간격 촘촘히 */}
            {!!addressFormatted && (
              <Text style={styles.addrSmall}>{addressFormatted}</Text>
            )}

            {/* 공간설명 */}
            <Text style={styles.sectionTitle}>공간설명</Text>
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
});
