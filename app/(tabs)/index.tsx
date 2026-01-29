// app/(tabs)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import AddressPicker, { AddressPickerHandle } from "../../components/AddressPicker";
import SideMenu from "../../components/SideMenu";
import VoiceSearchButton from "../../components/VoiceSearchButton";
import { auth, db } from "../../firebase";

type Space = {
  id: string;
  title: string;
  pricePerHour: number;
  coords: { lat: number; lng: number };
  address: string;
  tags: string[];
  nightClosed?: boolean;
  verified?: boolean;
  schedules?: Array<{
    days: string[];
    time: { start: string; end: string };
  }>;
};

export default function HomeMap() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mapRef = useRef<MapView>(null);
  const addrRef = useRef<AddressPickerHandle>(null); // 음성결과 주입용 ref

  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [region, setRegion] = useState<Region>({
    latitude: 37.5665,
    longitude: 126.978,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  });

  const [picked, setPicked] = useState<{
    lat: number;
    lng: number;
    name?: string;
    formatted?: string;
  } | null>(null);

  const [filterOpen, setFilterOpen] = useState(false); // 필터 모달 상태
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  
  // 필터 상태
  const [selectedDistance, setSelectedDistance] = useState<number | null>(null); // 미터 단위 (50, 100, 500, 1000)
  const [selectedMaxPrice, setSelectedMaxPrice] = useState<number | null>(null); // 1000, 2000
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); // 보관가능물품
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<"지금" | "오늘" | "내일" | null>(null);

  const banner = useMemo(
    () => ({
      image:
        "https://dummyimage.com/1400x180/EEF3FF/2477FF&text=%EA%B3%B5%ED%95%AD+%EC%A3%BC%EC%B0%A8%EB%8C%80%ED%96%89+%EB%B0%B0%EB%84%88",
      link: "https://example.com",
    }),
    []
  );

  // 현재 위치로 초기 이동 및 실시간 위치 추적
  useEffect(() => {
    let watchSubscription: Location.LocationSubscription | null = null;
    
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          try {
            // 초기 위치 가져오기
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const { latitude, longitude } = loc.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
            setRegion((r: Region) => ({ ...r, latitude, longitude }));
            mapRef.current?.animateToRegion(
              {
                latitude,
                longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              },
              600
            );

            // 실시간 위치 추적 시작 (위치가 변경될 때마다 맵 업데이트)
            watchSubscription = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 5000, // 5초마다 업데이트
                distanceInterval: 10, // 10미터 이상 이동 시 업데이트
              },
              (location) => {
                const { latitude, longitude } = location.coords;
                setCurrentLocation({ lat: latitude, lng: longitude });
                // 맵이 사용자가 직접 이동시킨 게 아니면 자동으로 위치 따라가기
                setRegion((prev) => {
                  // 이전 위치와 거리가 많이 떨어졌을 때만 업데이트
                  const latDiff = Math.abs(prev.latitude - latitude);
                  const lngDiff = Math.abs(prev.longitude - longitude);
                  if (latDiff > 0.001 || lngDiff > 0.001) {
                    mapRef.current?.animateToRegion(
                      {
                        latitude,
                        longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                      },
                      1000
                    );
                    return { ...prev, latitude, longitude };
                  }
                  return prev;
                });
              }
            );
          } catch (locError) {
            // 위치 가져오기 실패 시 시뮬레이터에서 위치 설정 안내
            console.log("위치 가져오기 실패, 기본 위치(서울) 사용:", locError);
            // 시뮬레이터: Xcode > Features > Location > Custom Location에서 위치 설정 가능
            // 또는 기본값(서울) 유지
          }
        }
      } catch (permError) {
        console.log("위치 권한 오류:", permError);
      }
    })();

    // cleanup: 컴포넌트 언마운트 시 위치 추적 중지
    return () => {
      if (watchSubscription) {
        watchSubscription.remove();
      }
    };
  }, []);

  // 등록된 공간 위치로 이동
  useEffect(() => {
    if (params.focusLat && params.focusLng) {
      const lat = parseFloat(params.focusLat as string);
      const lng = parseFloat(params.focusLng as string);
      if (!isNaN(lat) && !isNaN(lng)) {
        setTimeout(() => {
          mapRef.current?.animateToRegion(
            {
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.005, // 두 배 확대 (0.01 -> 0.005)
              longitudeDelta: 0.005,
            },
            1000
          );
          setRegion({
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          });
        }, 500);
      }
    }
  }, [params.focusLat, params.focusLng]);

  // Firestore + 로컬 병합 로드
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
          schedules: x.schedules ?? [],
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
          schedules: s.schedules ?? [],
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

  // 거리 계산 함수 (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // 지구 반지름 (미터)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 미터 단위
  };

  // 요일 매핑 (한국어 -> 영어)
  const dayMap: { [key: string]: number } = {
    mon: 0, // 월요일
    tue: 1, // 화요일
    wed: 2, // 수요일
    thu: 3, // 목요일
    fri: 4, // 금요일
    sat: 5, // 토요일
    sun: 6, // 일요일
  };

  // 시간 필터링 함수
  const isSpaceAvailableAtTime = (space: Space, targetDate: Date): boolean => {
    if (!space.schedules || space.schedules.length === 0) {
      // 스케줄이 없으면 모든 시간에 이용 가능한 것으로 간주
      return true;
    }

    const targetDay = targetDate.getDay(); // 0(일요일) ~ 6(토요일)
    const targetHour = targetDate.getHours(); // 0 ~ 23

    // 스케줄에서 해당 요일과 시간이 일치하는지 확인
    return space.schedules.some((schedule) => {
      // 요일 확인
      const hasDay = schedule.days.some((day) => {
        const dayIndex = dayMap[day];
        return dayIndex === targetDay;
      });

      if (!hasDay) return false;

      // 시간 확인
      const startHour = parseInt(schedule.time.start, 10);
      const endHour = parseInt(schedule.time.end, 10);

      // endHour가 startHour보다 작으면 다음날까지인 경우 (예: 22시 ~ 02시)
      if (endHour > startHour) {
        return targetHour >= startHour && targetHour < endHour;
      } else {
        // 자정을 넘어가는 경우 (예: 22시 ~ 02시)
        return targetHour >= startHour || targetHour < endHour;
      }
    });
  };

  const filtered = useMemo(
    () =>
      spaces.filter((s) => {
        // 태그 필터
        if (selectedTags.length > 0) {
          const ok = selectedTags.every((t) => s.tags.includes(t));
          if (!ok) return false;
        }
        
        // 거리 필터
        if (selectedDistance !== null && currentLocation) {
          const distance = calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            s.coords.lat,
            s.coords.lng
          );
          if (distance > selectedDistance) return false;
        }
        
        // 가격 필터
        if (selectedMaxPrice !== null) {
          if (s.pricePerHour > selectedMaxPrice) return false;
        }
        
        // 보관가능물품 필터
        if (selectedCategories.length > 0) {
          // "모든물품"이 선택되면 모든 공간 통과
          if (!selectedCategories.includes("모든물품")) {
            // 선택된 카테고리 중 하나라도 공간의 태그에 포함되어야 함
            const hasCategory = selectedCategories.some((cat) => s.tags.includes(cat));
            if (!hasCategory) return false;
          }
        }
        
        // 시간 필터 (지금/오늘/내일)
        if (selectedTimeFilter) {
          const now = new Date();
          
          if (selectedTimeFilter === "지금") {
            // 현재 시간에 이용 가능한 공간만 표시
            if (!isSpaceAvailableAtTime(s, now)) return false;
          } else if (selectedTimeFilter === "오늘") {
            // 오늘 하루 종일 이용 가능한 공간 (오늘의 모든 시간대 확인)
            // 오늘 중 하나라도 이용 가능하면 통과
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            
            // 오늘 중 한 시간이라도 이용 가능하면 통과
            let isAvailableToday = false;
            for (let hour = 0; hour < 24; hour++) {
              const checkDate = new Date(today);
              checkDate.setHours(hour, 0, 0, 0);
              if (isSpaceAvailableAtTime(s, checkDate)) {
                isAvailableToday = true;
                break;
              }
            }
            if (!isAvailableToday) return false;
          } else if (selectedTimeFilter === "내일") {
            // 내일 하루 종일 이용 가능한 공간
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            
            // 내일 중 한 시간이라도 이용 가능하면 통과
            let isAvailableTomorrow = false;
            for (let hour = 0; hour < 24; hour++) {
              const checkDate = new Date(tomorrow);
              checkDate.setHours(hour, 0, 0, 0);
              if (isSpaceAvailableAtTime(s, checkDate)) {
                isAvailableTomorrow = true;
                break;
              }
            }
            if (!isAvailableTomorrow) return false;
          }
        }
        
        return true;
      }),
    [spaces, selectedTags, selectedDistance, selectedMaxPrice, selectedCategories, currentLocation, selectedTimeFilter]
  );

  const goDetail = (id: string) => router.push(`/space/${id}`);
  const moveTo = (lat: number, lng: number) =>
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      350
    );

  // AddressPicker 선택 시 지도 이동/마커 갱신
  const handlePicked = (p: {
    lat?: number;
    lng?: number;
    name?: string;
    formatted_address?: string;
  }) => {
    if (p.lat && p.lng) {
      setPicked({
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        formatted: p.formatted_address,
      });
      moveTo(p.lat, p.lng);
    } else {
      Alert.alert("위치 없음", "선택한 결과에 좌표가 없어요.");
    }
  };

  // 🔧 음성 인식 결과 처리(수정 포인트)
  const handleVoiceResult = async (finalText: string) => {
    if (!finalText?.trim()) return;
    const q = finalText.trim();

    // ✅ 추가된 부분: 입력창에도 음성결과 반영
    addrRef.current?.forceQueryUpdate?.(q);

    // 1) AddressPicker에게 위임 → 자동완성 첫 항목 선택 및 입력창 채우기
    try {
      await addrRef.current?.setQueryAndSearch?.(q);
      return; // ✅ 여기서 종료: 입력창이 채워지고 onPicked까지 호출됨
    } catch {
      // 아래 폴백으로 진행
    }

    // 2) 폴백: Geocoding API로 직접 이동(입력창은 유지)
    try {
      const key = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
      if (!key) {
        Alert.alert("API 키 누락", "Google Places API 키(.env)가 필요합니다.");
        return;
      }
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        q
      )}&key=${key}&language=ko&region=kr`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === "OK" && json.results?.length) {
        const loc = json.results[0].geometry.location;
        const formatted = json.results[0].formatted_address as string;
        setPicked({ lat: loc.lat, lng: loc.lng, name: q, formatted });
        moveTo(loc.lat, loc.lng);
      } else {
        Alert.alert("검색 결과 없음", `“${q}”에 해당하는 위치를 찾지 못했어요.`);
      }
    } catch (e) {
      console.warn("[STT] geocode fallback error:", e);
      Alert.alert("음성 검색 오류", "위치로 이동 중 문제가 발생했어요.");
    }
  };

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
        mapType="standard"
        // iOS에서 언어 설정을 위해 사용자 위치 기반 설정
        userInterfaceStyle="light"
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
          zIndex: 1000,
          elevation: 10,
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
            overflow: "visible",
          }}
        >
          <Pressable onPress={() => setMenuOpen(true)} style={{ padding: 6 }}>
            <Ionicons name="menu" size={20} color="#333" />
          </Pressable>

          <View style={{ flex: 1, marginHorizontal: 8, zIndex: 1 }}>
            <AddressPicker
              ref={addrRef}
              placeholder="목적지 또는 주소 검색"
              coordsBias={{
                lat: region.latitude,
                lng: region.longitude,
                radius: 30000,
              }}
              onPicked={handlePicked}
            />
          </View>

          {/* 🎤 음성검색 버튼 */}
          <View style={{ padding: 4, zIndex: 1 }}>
            <VoiceSearchButton onResult={handleVoiceResult} />
          </View>

          <Pressable
            onPress={() => {
              setFilterOpen(true);
            }}
            style={{
              marginLeft: 8,
              backgroundColor: "#2477ff",
              paddingHorizontal: 10,
              height: 36,
              borderRadius: 10,
              justifyContent: "center",
              alignItems: "center",
              zIndex: 10000,
              elevation: 100,
              minWidth: 50,
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>필터</Text>
          </Pressable>
        </View>
      </View>

      {/* 오른쪽 퀵버튼 */}
      <View style={{ position: "absolute", right: 14, top: 140, gap: 10 }}>
        {(["지금", "오늘", "내일"] as const).map((t) => {
          const isSelected = selectedTimeFilter === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                // 같은 버튼을 다시 누르면 필터 해제
                setSelectedTimeFilter(isSelected ? null : t);
              }}
              style={{
                backgroundColor: isSelected ? "#2477ff" : "white",
                paddingHorizontal: 10,
                height: 36,
                borderRadius: 10,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: isSelected ? 0 : 1,
                borderColor: "#E5E7EB",
                minWidth: 50,
              }}
            >
              <Text style={{ color: isSelected ? "white" : "#111827", fontWeight: "700", fontSize: 14 }}>
                {t}
              </Text>
            </Pressable>
          );
        })}
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

      {/* 하단 흰색 배경 (탭바 위치부터 화면 하단까지) */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Platform.OS === "ios" ? 60 : 36, // 탭바 + 광고배너 영역 (조정)
          backgroundColor: "#fff",
          zIndex: 0, // 가장 아래
        }}
      />
      
      {/* 탭바 배경 (투명한 탭바 위에 흰색 배경) */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Platform.OS === "ios" ? 52 : 28,
          height: Platform.OS === "ios" ? 88 : 64,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          zIndex: 1, // 광고배너보다 아래
          elevation: 1, // Android
        }}
      />

      {/* 내공간등록 버튼 (탭바 위, 여백) */}
      <Pressable
        onPress={() => {
          // 로그인 상태 확인
          if (!auth.currentUser) {
            setLoginModalVisible(true);
          } else {
            router.push("/space/new");
          }
        }}
        style={{
          position: "absolute",
          bottom: Platform.OS === "ios" ? 152 : 128, // 탭바가 내려간 만큼 따라 내려감
          alignSelf: "center",
          backgroundColor: "#2477ff",
          borderRadius: 26,
          paddingHorizontal: 22,
          paddingVertical: 12,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 4,
          zIndex: 10,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
          + 내 공간 등록
        </Text>
      </Pressable>

      {/* 광고배너 (탭바를 덮도록) */}
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: Platform.OS === "ios" ? 22 : 18, // 한 번 더 올림
          zIndex: 1000, // 탭바를 덮도록 매우 높은 zIndex
        }}
      >
        <View
          style={{
            backgroundColor: "#1E3A8A",
            borderRadius: 12,
            paddingVertical: 8, // 세로 높이 줄임
            paddingHorizontal: 11, // 좌우는 유지
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 20, // Android에서 매우 높게 (탭바를 덮도록)
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{
                color: "#fff",
                fontSize: 13, // 세로 높이 줄임
                fontWeight: "700",
                marginBottom: 1, // 간격 줄임
              }}
            >
              포켓스페이스로 편한 보관
            </Text>
            <Text style={{ color: "#E0E7FF", fontSize: 10 }}>
              언제 어디서나 안전한 보관 공간
            </Text>
          </View>
          <View
            style={{
              width: 38, // 세로 높이 줄임
              height: 38, // 세로 높이 줄임
              backgroundColor: "#3B82F6",
              borderRadius: 8,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="cube" size={22} color="#fff" />
          </View>
        </View>
      </View>

      {/* 로그인 필요 모달 */}
      <Modal
        visible={loginModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLoginModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 320,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: "#111827",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              로그인 필요
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: "#6B7280",
                marginBottom: 24,
                textAlign: "center",
              }}
            >
              로그인 후 이용해주세요.
            </Text>
            <Pressable
              onPress={() => {
                setLoginModalVisible(false);
                router.push("/(auth)/login");
              }}
              style={{
                backgroundColor: "#2477ff",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                회원가입 및 로그인하러가기
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>


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

      {/* 필터 패널 (오른쪽에서 왼쪽으로 슬라이드) */}
      <Modal transparent visible={filterOpen} animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable 
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} 
          onPress={() => setFilterOpen(false)} 
        />
        <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "85%", backgroundColor: "#fff" }}>
          <ScrollView style={{ flex: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
            {/* 헤더 */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#111827" }}>필터</Text>
              <Pressable onPress={() => setFilterOpen(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>

            {/* 위치 필터 */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 16 }}>거리</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[50, 100, 500, 1000].map((distance) => {
                  const isSelected = selectedDistance === distance;
                  const label = distance < 1000 ? `${distance}m` : `${distance / 1000}km`;
                  return (
                    <Pressable
                      key={distance}
                      onPress={() => setSelectedDistance(isSelected ? null : distance)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: isSelected ? "#2477ff" : "#F3F4F6",
                        borderWidth: 1,
                        borderColor: isSelected ? "#2477ff" : "#E5E7EB",
                      }}
                    >
                      <Text style={{ color: isSelected ? "#fff" : "#111827", fontWeight: "600" }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 가격 필터 */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 16 }}>가격</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[1000, 2000].map((price) => {
                  const isSelected = selectedMaxPrice === price;
                  return (
                    <Pressable
                      key={price}
                      onPress={() => setSelectedMaxPrice(isSelected ? null : price)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: isSelected ? "#2477ff" : "#F3F4F6",
                        borderWidth: 1,
                        borderColor: isSelected ? "#2477ff" : "#E5E7EB",
                      }}
                    >
                      <Text style={{ color: isSelected ? "#fff" : "#111827", fontWeight: "600" }}>
                        {price.toLocaleString()}원 이하
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 보관가능물품 필터 */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 16 }}>보관가능물품</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["모든물품", "옷/잡화", "20kg이내", "수하물캐리어 크기이하", "기내용캐리어 크기이하", "지저분한물품가능"].map((category) => {
                  const isSelected = selectedCategories.includes(category);
                  return (
                    <Pressable
                      key={category}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedCategories(selectedCategories.filter((c) => c !== category));
                        } else {
                          setSelectedCategories([...selectedCategories, category]);
                        }
                      }}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: isSelected ? "#2477ff" : "#F3F4F6",
                        borderWidth: 1,
                        borderColor: isSelected ? "#2477ff" : "#E5E7EB",
                      }}
                    >
                      <Text style={{ color: isSelected ? "#fff" : "#111827", fontWeight: "600" }}>
                        {category}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
