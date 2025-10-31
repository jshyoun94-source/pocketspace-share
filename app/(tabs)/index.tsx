// app/(tabs)/index.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { db } from "../../firebase";

// ✅ 자동완성(구글)
import AddressPicker from "../../components/AddressPicker";

// ✅ 아이콘
import { FontAwesome5, Ionicons } from "@expo/vector-icons";

type Space = {
  id: string;
  title: string;
  pricePerHour: number;
  coords: { lat: number; lng: number };
  address: string;
  tags: string[];
  nightClosed?: boolean;
  verified?: boolean;
};

export default function HomeMap() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [region, setRegion] = useState<Region>({
    latitude: 37.5665,
    longitude: 126.978,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  });

  // 자동완성에서 고른 지점(임시 마커)
  const [picked, setPicked] = useState<{
    lat: number;
    lng: number;
    name?: string;
    formatted?: string;
  } | null>(null);

  // 필터
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [when, setWhen] = useState<"지금" | "오늘" | "내일">("지금");

  // 배너
  const banner = useMemo(
    () => ({
      image:
        "https://dummyimage.com/1400x180/EEF3FF/2477FF&text=%EA%B4%91%EA%B3%A0+%EB%B0%B0%EB%84%88",
      link: "https://example.com",
    }),
    []
  );

  // 현위치
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          const { latitude, longitude } = loc.coords;
          setRegion((r) => ({ ...r, latitude, longitude }));
          mapRef.current?.animateToRegion(
            { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
            600
          );
        }
      } catch {}
    })();
  }, []);

  // Firestore + Local
  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "spaces"));
      const fsRows: Space[] = [];
      snap.forEach((d) => {
        const x: any = d.data();
        if (!x?.coords?.lat || !x?.coords?.lng) return;
        fsRows.push({
          id: d.id,
          title: x.title ?? "공간",
          pricePerHour: Number(x.pricePerHour ?? 0),
          coords: { lat: x.coords.lat, lng: x.coords.lng },
          address: x.address ?? "",
          tags: x.tags ?? [],
          nightClosed: x.nightClosed ?? false,
          verified: x.verified ?? false,
        });
      });

      const raw = await AsyncStorage.getItem("spaces");
      const localArr: any[] = raw ? JSON.parse(raw) : [];
      const localRows: Space[] = localArr
        .filter((s) => s?.location?.lat && s?.location?.lng)
        .map((s) => ({
          id: s.id,
          title: s.title ?? s.addressFormatted ?? "공간",
          pricePerHour: Number(s.hourlyPrice ?? 0),
          coords: { lat: s.location.lat, lng: s.location.lng },
          address: s.addressFormatted ?? "",
          tags: s.categories ?? [],
          nightClosed: false,
          verified: false,
        }));

      const fsIds = new Set(fsRows.map((r) => r.id));
      const merged = [...fsRows, ...localRows.filter((r) => !fsIds.has(r.id))];
      setSpaces(merged);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);
  useFocusEffect(
    React.useCallback(() => {
      loadSpaces();
    }, [loadSpaces])
  );

  // 필터 적용 후 목록
  const filtered = useMemo(() => {
    return spaces.filter((s) => {
      if (selectedTags.length > 0) {
        const ok = selectedTags.every((t) => s.tags.includes(t));
        if (!ok) return false;
      }
      return true;
    });
  }, [spaces, selectedTags]);

  const goRegister = () => router.push("/space/new");
  const goDetail = (id: string) => router.push(`/space/${id}`);

  const moveTo = (lat: number, lng: number, delta = 0.012) =>
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta },
      350
    );

  // 확대/축소/현위치
  const zoom = (factor: number) => {
    setRegion((r) => {
      const next: Region = {
        ...r,
        latitudeDelta: Math.max(0.002, r.latitudeDelta * factor),
        longitudeDelta: Math.max(0.002, r.longitudeDelta * factor),
      };
      mapRef.current?.animateToRegion(next, 200);
      return next;
    });
  };
  const goMyLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      moveTo(loc.coords.latitude, loc.coords.longitude, 0.01);
    } catch {}
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ✅ 이 화면만 헤더 숨김 → 상단 'index' 제거 + 지도 꽉 채움 */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* 🗺 지도 */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        loadingEnabled
      >
        {filtered.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.coords.lat, longitude: s.coords.lng }}
            onPress={() => goDetail(s.id)}
          >
            <View
              style={{
                backgroundColor: "#2477ff",
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 8,
                minWidth: 54,
                alignItems: "center",
                borderWidth: 2,
                borderColor: "#fff",
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold" }}>
                {s.pricePerHour.toLocaleString()}원
              </Text>
            </View>
          </Marker>
        ))}

        {picked && (
          <Marker
            coordinate={{ latitude: picked.lat, longitude: picked.lng }}
            title={picked.name || "선택 지점"}
            description={picked.formatted}
          />
        )}
      </MapView>

      {/* 🔍 검색 + 필터 → 하나의 흰 박스 */}
      <View
        style={{
          position: "absolute",
          top: Platform.select({ ios: 48, android: 18 }),
          left: 12,
          right: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#fff",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 4,
            paddingHorizontal: 10,
            height: 56,
          }}
        >
          {/* 메뉴 */}
          <Pressable onPress={() => {}} hitSlop={10} style={{ padding: 6 }}>
            <Ionicons name="menu" size={20} color="#333" />
          </Pressable>

          {/* AddressPicker 영역 */}
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <AddressPicker
              placeholder="목적지 또는 주소 검색"
              coordsBias={{ lat: region.latitude, lng: region.longitude, radius: 30000 }}
              onPicked={(p) => {
                if (p.lat && p.lng) {
                  setPicked({
                    lat: p.lat,
                    lng: p.lng,
                    name: p.name,
                    formatted: p.formatted_address,
                  });
                  moveTo(p.lat, p.lng);
                }
              }}
            />
          </View>

          {/* 마이크 */}
          <Pressable onPress={() => {}} hitSlop={10} style={{ padding: 6 }}>
            <Ionicons name="mic-outline" size={18} color="#333" />
          </Pressable>

          {/* 구분선 */}
          <View style={{ width: 1, height: 24, backgroundColor: "#E5E7EB", marginHorizontal: 8 }} />

          {/* 필터 버튼(같은 박스 내부) */}
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: "#F8FAFF",
            }}
          >
            <Ionicons name="filter-outline" size={18} color="#2477ff" />
            <Text style={{ color: "#2477ff", fontWeight: "700" }}>필터</Text>
          </Pressable>
        </View>
      </View>

      {/* ⚙️ 오른쪽 버튼 묶음 */}
      <View
        style={{
          position: "absolute",
          right: 12,
          top: Platform.select({ ios: 120, android: 90 }),
          alignItems: "center",
          gap: 8,
        }}
      >
        {(["지금", "오늘", "내일"] as const).map((label) => {
          const active = when === label;
          return (
            <Pressable
              key={label}
              onPress={() => setWhen(label)}
              style={{
                backgroundColor: active ? "#2477ff" : "#fff",
                borderWidth: 1,
                borderColor: active ? "#2477ff" : "#E5E7EB",
                borderRadius: 18,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: active ? "#fff" : "#333", fontWeight: "600", fontSize: 12 }}>
                {label}
              </Text>
            </Pressable>
          );
        })}

        {/* 확대/축소/현위치 */}
        <Pressable
          onPress={() => zoom(0.7)}
          style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12 }}
        >
          <Ionicons name="add" size={18} color="#333" />
        </Pressable>
        <Pressable
          onPress={() => zoom(1.3)}
          style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12 }}
        >
          <Ionicons name="remove" size={18} color="#333" />
        </Pressable>
        <Pressable
          onPress={goMyLocation}
          style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12 }}
        >
          <Ionicons name="locate" size={18} color="#2477ff" />
        </Pressable>
      </View>

      {/* ➕ 내 공간 등록 */}
      <Pressable
        onPress={goRegister}
        style={{
          position: "absolute",
          alignSelf: "center",
          bottom: 170,
          backgroundColor: "#2477ff",
          borderRadius: 24,
          paddingHorizontal: 18,
          paddingVertical: 12,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 6,
          elevation: 4,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>+ 내 공간 등록</Text>
      </Pressable>

      {/* 하단 3버튼 + 배너 */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fff",
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 12 }}>
          <Pressable style={{ alignItems: "center", gap: 6 }}>
            <FontAwesome5 name="box" size={18} color="#2477ff" />
            <Text style={{ fontSize: 12, color: "#111" }}>내 공간</Text>
          </Pressable>
          <Pressable style={{ alignItems: "center", gap: 6 }}>
            <Ionicons name="star-outline" size={20} color="#555" />
            <Text style={{ fontSize: 12, color: "#111" }}>즐겨찾기</Text>
          </Pressable>
          <Pressable style={{ alignItems: "center", gap: 6 }}>
            <FontAwesome5 name="suitcase" size={18} color="#2477ff" />
            <Text style={{ fontSize: 12, color: "#111" }}>이용공간</Text>
          </Pressable>
        </View>

        <View
          style={{
            marginHorizontal: 12,
            marginBottom: 16,
            backgroundColor: "#fff",
            borderRadius: 12,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Image source={{ uri: banner.image }} style={{ width: "100%", height: 66 }} />
        </View>
      </View>

      {loading && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.2)",
          }}
        >
          <ActivityIndicator />
        </View>
      )}

      {/* 필터 시트(기존) */}
      {filterOpen && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "white",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700" }}>필터</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["캐리어", "가방", "골프백", "악기", "서류", "부피대형", "귀중품불가"].map((t) => {
              const active = selectedTags.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() =>
                    setSelectedTags((prev) =>
                      active ? prev.filter((x) => x !== t) : [...prev, t]
                    )
                  }
                  style={{
                    borderWidth: 1,
                    borderColor: active ? "#2477ff" : "#ddd",
                    backgroundColor: active ? "#eef3ff" : "white",
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: active ? "#2477ff" : "#333" }}>#{t}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable onPress={() => setSelectedTags([])} style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
              <Text style={{ color: "gray" }}>초기화</Text>
            </Pressable>
            <Pressable
              onPress={() => setFilterOpen(false)}
              style={{ backgroundColor: "#2477ff", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>적용</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
