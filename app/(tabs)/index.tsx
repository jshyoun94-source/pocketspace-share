import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

// ✅ 네이버 자동완성 컴포넌트 (새로 만든 파일)
import AddressPicker from "../../components/AddressPicker";

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

  // 상단 필터(기존 유지)
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 하단 배너(기존 유지)
  const banner = useMemo(
    () => ({
      image:
        "https://dummyimage.com/600x120/eee/333&text=%EA%B4%91%EA%B3%A0+%EB%B0%B0%EB%84%88",
      link: "https://example.com",
    }),
    []
  );

  // 현위치 권한 + 지도 이동 (기존 유지)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          const { latitude, longitude } = loc.coords;
          setRegion((r) => ({ ...r, latitude, longitude }));
          mapRef.current?.animateToRegion(
            {
              latitude,
              longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            },
            600
          );
        }
      } catch {}
    })();
  }, []);

  // Firestore에서 마커 로드 (기존 유지)
  useEffect(() => {
    (async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "spaces"));
      const rows: Space[] = [];
      snap.forEach((d) => {
        const x: any = d.data();
        if (!x?.coords?.lat || !x?.coords?.lng) return;
        rows.push({
          id: d.id,
          title: x.title ?? "공간",
          pricePerHour: x.pricePerHour ?? 0,
          coords: { lat: x.coords.lat, lng: x.coords.lng },
          address: x.address ?? "",
          tags: x.tags ?? [],
          nightClosed: x.nightClosed ?? false,
          verified: x.verified ?? false,
        });
      });
      setSpaces(rows);
      setLoading(false);
    })();
  }, []);

  // 태그 필터(기존 유지)
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
  const moveTo = (lat: number, lng: number) =>
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      350
    );

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        loadingEnabled
      >
        {/* Firestore 등록 마커 */}
        {filtered.map((s) => (
          <Marker
            key={s.id}
            coordinate={{
              latitude: s.coords.lat,
              longitude: s.coords.lng,
            }}
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
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold" }}>
                {s.pricePerHour.toLocaleString()}원
              </Text>
            </View>
          </Marker>
        ))}

        {/* 자동완성으로 고른 위치 임시 마커 */}
        {picked && (
          <Marker
            coordinate={{ latitude: picked.lat, longitude: picked.lng }}
            title={picked.name || "선택 지점"}
            description={picked.formatted}
          />
        )}
      </MapView>

      {/* 상단 검색/필터 바 */}
      <View
        style={{
          position: "absolute",
          top: Platform.select({ ios: 60, android: 20 }),
          left: 12,
          right: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* ✅ 구글 TextInput 대신 네이버 AddressPicker로 교체 */}
          <View
            style={{
              flex: 1,
              backgroundColor: "white",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 8,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 4,
              position: "relative",
            }}
          >
            <AddressPicker
              placeholder="상호 또는 도로명주소로 검색"
              // 로컬 바이어스: 지도 중심 기준 반경 가중
              coordsBias={{
                lat: region.latitude,
                lng: region.longitude,
                radius: 30000,
              }}
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

          {/* 필터 버튼(기존 유지) */}
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={{
              backgroundColor: "#2477ff",
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 12,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>필터</Text>
          </Pressable>
        </View>

        {selectedTags.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {selectedTags.map((t) => (
              <View
                key={t}
                style={{
                  backgroundColor: "#eef3ff",
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: "#dbe7ff",
                }}
              >
                <Text style={{ color: "#2477ff" }}>#{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 하단 광고 배너(기존 유지) */}
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 24,
          backgroundColor: "white",
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

      {/* 내 공간 등록 FAB(기존 유지) */}
      <Pressable
        onPress={() => router.push("/space/new")}
        style={{
          position: "absolute",
          right: 20,
          bottom: 110,
          backgroundColor: "#2477ff",
          borderRadius: 28,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>+ 내 공간 등록</Text>
      </Pressable>

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

      {/* 간단 필터 시트(기존 유지) */}
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
            {["캐리어", "가방", "골프백", "악기", "서류", "부피대형", "귀중품불가"].map(
              (t) => {
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
              }
            )}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable
              onPress={() => setSelectedTags([])}
              style={{ paddingVertical: 12, paddingHorizontal: 8 }}
            >
              <Text style={{ color: "gray" }}>초기화</Text>
            </Pressable>
            <Pressable
              onPress={() => setFilterOpen(false)}
              style={{
                backgroundColor: "#2477ff",
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>적용</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
