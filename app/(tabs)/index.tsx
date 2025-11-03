import { Ionicons } from "@expo/vector-icons";
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
import AddressPicker from "../../components/AddressPicker";
import SideMenu from "../../components/SideMenu";
import { db } from "../../firebase";
// ✅ 음성검색 버튼 컴포넌트 추가
import VoiceSearchButton from "../../components/VoiceSearchButton";

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

  const [picked, setPicked] = useState<{ lat: number; lng: number; name?: string; formatted?: string } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const banner = useMemo(
    () => ({
      image: "https://dummyimage.com/1400x180/EEF3FF/2477FF&text=%EA%B3%B5%ED%95%AD+%EC%A3%BC%EC%B0%A8%EB%8C%80%ED%96%89+%EB%B0%B0%EB%84%88",
      link: "https://example.com",
    }),
    []
  );

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
    useCallback(() => {
      loadSpaces();
    }, [loadSpaces])
  );

  const filtered = useMemo(
    () =>
      spaces.filter((s) => {
        if (selectedTags.length > 0) {
          const ok = selectedTags.every((t) => s.tags.includes(t));
          if (!ok) return false;
        }
        return true;
      }),
    [spaces, selectedTags]
  );

  const goDetail = (id: string) => router.push(`/space/${id}`);
  const moveTo = (lat: number, lng: number) =>
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      350
    );

  // ✅ 음성 인식 결과 처리: 주소/장소명을 좌표로 변환하여 지도 이동 + 마커 표시
  const handleVoiceResult = useCallback(async (spoken: string) => {
    const text = (spoken || "").trim();
    if (!text) return;

    try {
      // 기기/플랫폼 지오코더 이용 (간단 & 빠름)
      const results = await Location.geocodeAsync(text);
      if (results?.length) {
        const { latitude, longitude } = results[0];
        setPicked({ lat: latitude, lng: longitude, name: text, formatted: text });
        moveTo(latitude, longitude);
      } else {
        console.warn("지오코딩 결과 없음:", text);
      }
    } catch (err) {
      console.warn("지오코딩 실패:", err);
    }
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />

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
                borderWidth: 2,
                borderColor: "#fff",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
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

      {/* 상단 검색 */}
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
          <Pressable onPress={() => setMenuOpen(true)} style={{ padding: 6 }}>
            <Ionicons name="menu" size={20} color="#333" />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <AddressPicker
              placeholder="목적지 또는 주소 검색"
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
                    // AddressPicker는 formatted_address를 내려주는 구조임
                    // (네 버전에서 속성명이 다르면 p.formatted 등으로 맞춰줘)
                    formatted: (p as any).formatted_address ?? (p as any).formatted,
                  });
                  moveTo(p.lat, p.lng);
                }
              }}
            />
          </View>

          {/* 🔄 기존 Ionicons 마이크 → 음성검색 컴포넌트로 교체 */}
          <VoiceSearchButton onResult={handleVoiceResult} lang="ko-KR" />

          <Pressable
            onPress={() => setFilterOpen(true)}
            style={{
              marginLeft: 8,
              backgroundColor: "#2477ff",
              paddingHorizontal: 12,
              height: 36,
              borderRadius: 10,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>필터</Text>
          </Pressable>
        </View>
      </View>

      {/* 오른쪽 버튼 */}
      <View style={{ position: "absolute", right: 14, top: 140, gap: 10 }}>
        {["지금", "오늘", "내일"].map((t, i) => (
          <Pressable
            key={t}
            style={{
              backgroundColor: i === 0 ? "#2477ff" : "white",
              borderRadius: 999,
              paddingHorizontal: 16,
              height: 44,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <Text style={{ color: i === 0 ? "white" : "#111827", fontWeight: "700" }}>
              {t}
            </Text>
          </Pressable>
        ))}
        <View style={{ gap: 10, alignItems: "center" }}>
          <Pressable
            onPress={() =>
              mapRef.current?.animateToRegion({
                ...region,
                latitudeDelta: region.latitudeDelta * 0.7,
                longitudeDelta: region.longitudeDelta * 0.7,
              })
            }
            style={btnSquare}
          >
            <Text style={btnText}>＋</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              mapRef.current?.animateToRegion({
                ...region,
                latitudeDelta: region.latitudeDelta / 0.7,
                longitudeDelta: region.longitudeDelta / 0.7,
              })
            }
            style={btnSquare}
          >
            <Text style={btnText}>－</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              try {
                const loc = await Location.getCurrentPositionAsync({});
                moveTo(loc.coords.latitude, loc.coords.longitude);
              } catch {}
            }}
            style={[btnSquare, { borderRadius: 16 }]}
          >
            <Ionicons name="locate-outline" size={20} color="#111827" />
          </Pressable>
        </View>
      </View>

      {/* 내공간등록 버튼 (살짝 작게 & 위치 조정) */}
      <Pressable
        onPress={() => router.push("/space/new")}
        style={{
          position: "absolute",
          bottom: 170, // 카드 위보다 약간 띄움
          alignSelf: "center",
          backgroundColor: "#2477ff",
          borderRadius: 26,
          paddingHorizontal: 22,
          paddingVertical: 12,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 4,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
          + 내 공간 등록
        </Text>
      </Pressable>

      {/* 하단 흰색 카드 - 높이 축소 */}
      <View style={{ position: "absolute", left: 12, right: 12, bottom: 16 }}>
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 16,
            paddingVertical: 8,
            paddingHorizontal: 12,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          {/* 버튼 3개 */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-around",
              alignItems: "center",
            }}
          >
            <BottomButton
              icon={<Ionicons name="cube-outline" size={22} color="#2563EB" />}
              label="내 공간"
            />
            <BottomButton
              icon={<Ionicons name="star-outline" size={22} color="#2563EB" />}
              label="즐겨찾기"
            />
            <BottomButton
              icon={<Ionicons name="briefcase-outline" size={22} color="#2563EB" />}
              label="이용공간"
            />
          </View>

          {/* 구분선 */}
          <View style={{ height: 1, backgroundColor: "#E5E7EB", marginVertical: 8 }} />

          {/* 배너 높이 축소 */}
          <View style={{ borderRadius: 12, overflow: "hidden" }}>
            <Image
              source={{ uri: banner.image }}
              style={{ width: "100%", height: 70 }}
              resizeMode="cover"
            />
          </View>
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

      <SideMenu visible={menuOpen} onClose={() => setMenuOpen(false)} bannerUri={banner.image} />
    </View>
  );
}

function BottomButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      {icon}
      <Text style={{ color: "#111827", fontSize: 13, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

const btnSquare = {
  width: 44,
  height: 44,
  backgroundColor: "white",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#E5E7EB",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const btnText = { fontSize: 24, lineHeight: 24, color: "#111827" };
