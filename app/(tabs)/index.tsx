import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { db } from "../../firebase";

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
  const [region, setRegion] = useState({
    latitude: 37.5665,
    longitude: 126.9780,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  });

  // 상단 검색/필터
  const [searchText, setSearchText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 하단 광고 배너(샘플)
  const banner = useMemo(
    () => ({
      image: "https://dummyimage.com/600x120/eee/333&text=%EA%B4%91%EA%B3%A0+%EB%B0%B0%EB%84%88",
      link: "https://example.com",
    }),
    []
  );

  // 위치 권한 + 현위치 이동
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          const { latitude, longitude } = loc.coords;
          setRegion(r => ({ ...r, latitude, longitude }));
          mapRef.current?.animateToRegion(
            { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
            600
          );
        }
      } catch {}
    })();
  }, []);

  // Firestore에서 spaces 로드
  useEffect(() => {
    (async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "spaces"));
      const rows: Space[] = [];
      snap.forEach(d => {
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

  // 검색/태그 필터
  const filtered = useMemo(() => {
    return spaces.filter(s => {
      if (selectedTags.length > 0) {
        const ok = selectedTags.every(t => s.tags.includes(t));
        if (!ok) return false;
      }
      if (searchText.trim()) {
        const q = searchText.trim();
        if (!s.title.includes(q) && !s.address.includes(q)) return false;
      }
      return true;
    });
  }, [spaces, selectedTags, searchText]);

  const goRegister = () => router.push("/space/new");
  const goDetail = (id: string) => router.push(`/space/${id}`);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined} // iOS=Apple Map, Android=Google Map
        initialRegion={region}
        onRegionChangeComplete={setRegion}
      >
        {filtered.map(s => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.coords.lat, longitude: s.coords.lng }}
            onPress={() => goDetail(s.id)}
          >
            {/* 가격 말풍선 */}
            <View style={{
              backgroundColor: "#2477ff",
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 8,
              minWidth: 54,
              alignItems: "center",
            }}>
              <Text style={{ color: "white", fontWeight: "bold" }}>
                {s.pricePerHour.toLocaleString()}원
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* 상단 검색/필터 바 */}
      <View style={{ position: "absolute", top: Platform.select({ ios: 60, android: 20 }), left: 12, right: 12, gap: 8 }}>
        <View style={{
          flexDirection: "row",
          backgroundColor: "white",
          borderRadius: 12,
          paddingHorizontal: 12, paddingVertical: 10,
          alignItems: "center",
          shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4
        }}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="목적지 또는 주소 검색"
            style={{ flex: 1, fontSize: 16 }}
            returnKeyType="search"
          />
          <Pressable onPress={() => setFilterOpen(true)} style={{ marginLeft: 8 }}>
            <Text style={{ fontWeight: "600", color: "#2477ff" }}>필터</Text>
          </Pressable>
        </View>

        {selectedTags.length > 0 && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {selectedTags.map(t => (
              <View key={t} style={{ backgroundColor: "#eef3ff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: "#2477ff" }}>#{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 하단 광고 배너 */}
      <View style={{
        position: "absolute", left: 12, right: 12, bottom: 24,
        backgroundColor: "white", borderRadius: 12, overflow: "hidden",
        shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4
      }}>
        <Image source={{ uri: banner.image }} style={{ width: "100%", height: 66 }} />
      </View>

      {/* 내 공간 등록 버튼(FAB) */}
      <Pressable
        onPress={goRegister}
        style={{ position: "absolute", right: 20, bottom: 110, backgroundColor: "#2477ff",
                 borderRadius: 28, paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>+ 내 공간 등록</Text>
      </Pressable>

      {loading && (
        <View style={{
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.2)"
        }}>
          <ActivityIndicator />
        </View>
      )}

      {/* 간단 필터 시트 */}
      {filterOpen && (
        <View style={{
          position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "white",
          borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12
        }}>
          <Text style={{ fontSize: 16, fontWeight: "700" }}>필터</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["캐리어","가방","골프백","악기","서류","부피대형","귀중품불가"].map(t => {
              const active = selectedTags.includes(t);
              return (
                <Pressable key={t}
                  onPress={() =>
                    setSelectedTags(prev => active ? prev.filter(x => x !== t) : [...prev, t])
                  }
                  style={{
                    borderWidth: 1, borderColor: active ? "#2477ff" : "#ddd",
                    backgroundColor: active ? "#eef3ff" : "white",
                    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8
                  }}>
                  <Text style={{ color: active ? "#2477ff" : "#333" }}>#{t}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable onPress={() => setSelectedTags([])} style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
              <Text style={{ color: "#888" }}>초기화</Text>
            </Pressable>
            <Pressable onPress={() => setFilterOpen(false)}
              style={{ backgroundColor: "#2477ff", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}>
              <Text style={{ color: "white", fontWeight: "700" }}>적용</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
