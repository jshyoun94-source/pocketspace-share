// components/AddressPicker.tsx
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type Bias = { lat: number; lng: number; radius?: number };

type PickedResult = {
  name?: string;
  formatted_address?: string;
  lat?: number;
  lng?: number;
  source?: "geocode";
};

type Props = {
  placeholder?: string;
  /** (그대로 둠) 지도 중심 등으로 근방 우선 추천 – Geocode만으로도 UX 유지 */
  coordsBias?: Bias;
  /** 후보 클릭 시 호출 */
  onPicked: (picked: PickedResult) => void;
  /** 상단 “더보기” 같은 곳에서 쿼리 공유하려면 */
  onQueryChange?: (q: string) => void;
  /** 표시에서만 국가 접미사 제거 */
  hideCountrySuffix?: string; // ex) "대한민국"
  /** 최소 입력 글자 수 (기본 2) */
  minChars?: number;
  /** 표시 최대 개수 (기본 15) */
  maxResults?: number;
  /** 초기 값 */
  defaultQuery?: string;
};

const CID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "";
const CSEC = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? "";
const H =
  CID && CSEC
    ? {
        "X-NCP-APIGW-API-KEY-ID": CID,
        "X-NCP-APIGW-API-KEY": CSEC,
        Accept: "application/json",
      }
    : undefined;

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function AddressPicker({
  placeholder = "상호 또는 도로명주소로 검색",
  coordsBias,
  onPicked,
  onQueryChange,
  hideCountrySuffix = "대한민국",
  minChars = 2,
  maxResults = 15,
  defaultQuery = "",
}: Props) {
  const [q, setQ] = useState(defaultQuery);
  const dq = useDebounced(q, 300);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<
    { id: string; name: string; address?: string; lat?: number; lng?: number; src: "geocode"; score?: number }[]
  >([]);
  const [open, setOpen] = useState(false);
  const mounted = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const trimCountry = (s?: string) =>
    s ? s.replace(new RegExp(`,?\\s*${hideCountrySuffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : s;

  useEffect(() => {
    onQueryChange?.(q);
  }, [q, onQueryChange]);

  useEffect(() => {
    // 키 누락 시 네트워크 호출을 하지 않음
    if (!H) {
      setErrorMsg("네이버 지도 API 키가 설정되어 있지 않습니다.");
      setItems([]);
      setOpen(false);
      return;
    }

    // 최소 글자 미만이면 초기화
    if (!dq?.trim() || dq.trim().length < minChars) {
      controllerRef.current?.abort();
      setItems([]);
      setOpen(false);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    let cancelled = false;
    controllerRef.current?.abort();
    const ctl = new AbortController();
    controllerRef.current = ctl;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const acc: typeof items = [];

        // ---- Geocode 전용 자동완성 ----
        // 기본 엔드포인트
        const params = new URLSearchParams({ query: dq.trim() });
        // 참고: Geocode는 공식적으로 반경 bias 파라미터가 없지만,
        //     UX 상 '근방 키워드'일 때 점수 가중치용 내부 score 계산만 해둔다.
        const geoUrl = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?${params.toString()}`;
        const geoRes = await fetch(geoUrl, { headers: H, signal: ctl.signal });
        if (geoRes.ok) {
          const geoJson = await geoRes.json();
          if (Array.isArray(geoJson?.addresses)) {
            for (const a of geoJson.addresses.slice(0, 30)) {
              const lat = a.y ? parseFloat(a.y) : undefined;
              const lng = a.x ? parseFloat(a.x) : undefined;
              const addr =
                a.roadAddress || a.address || a.jibunAddress || a.englishAddress;

              // 간단한 근접도 점수(있을 때만)
              let score = 0;
              if (coordsBias?.lat && coordsBias?.lng && lat && lng) {
                const dlat = Math.abs(coordsBias.lat - lat);
                const dlng = Math.abs(coordsBias.lng - lng);
                // 매우 단순한 맨해튼 거리 기반 감점(정렬 용도)
                score = -(dlat + dlng);
              }

              const id = `${addr}-${lng}-${lat}`;
              if (!acc.find((x) => `${x.address}-${x.lng}-${x.lat}` === id)) {
                acc.push({
                  id,
                  name: addr,
                  address: addr,
                  lat,
                  lng,
                  src: "geocode",
                  score,
                });
              }
            }
          }
        } else {
          // 401/403/5xx 등도 여기서 처리
          console.log("geocode http", geoRes.status);
          setErrorMsg(`주소 검색 오류(${geoRes.status})`);
        }

        // 정렬: 근접 점수 높은 순(= score 큰 순) → 그 외는 그대로
        const sorted = acc.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        const limited = sorted.slice(0, maxResults);

        if (!cancelled && mounted.current) {
          setItems(limited);
          setOpen(limited.length > 0);
          if (limited.length === 0 && !loading) {
            setErrorMsg("검색 결과가 없습니다.");
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (!cancelled && mounted.current) {
          setItems([]);
          setOpen(false);
          setErrorMsg(e?.message ?? "검색 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [dq, coordsBias?.lat, coordsBias?.lng, minChars, maxResults]);

  const showOverlay = open && items.length > 0;

  return (
    <View style={s.container}>
      {!H && (
        <View style={s.warn}>
          <Text style={s.warnText}>ENV에 EXPO_PUBLIC_NAVER_CLIENT_ID / SECRET을 설정하세요.</Text>
        </View>
      )}

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        style={s.input}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        placeholderTextColor="#9CA3AF"
        onFocus={() => items.length > 0 && setOpen(true)}
      />

      {loading && (
        <View style={s.loading}>
          <ActivityIndicator />
        </View>
      )}

      {!!errorMsg && !loading && (
        <View style={s.errorWrap}>
          <Text style={s.errorText}>{errorMsg}</Text>
        </View>
      )}

      {showOverlay && (
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <View />
        </Pressable>
      )}

      {open && (
        <View style={s.dropdownWrap} pointerEvents="box-none">
          {items.length > 0 ? (
            <View style={s.dropdown}>
              <FlatList
                data={items}
                keyExtractor={(it) => it.id}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={s.sep} />}
                renderItem={({ item }) => (
                  <Pressable
                    style={s.row}
                    onPress={() => {
                      setOpen(false);
                      onPicked({
                        name: item.name,
                        formatted_address: item.address,
                        lat: item.lat,
                        lng: item.lng,
                        source: "geocode",
                      });
                    }}
                  >
                    <Text style={s.main} numberOfLines={1}>
                      {trimCountry(item.name)}
                    </Text>
                    {!!item.address && (
                      <Text style={s.sub} numberOfLines={1}>
                        {trimCountry(item.address)}
                      </Text>
                    )}
                  </Pressable>
                )}
                style={{ maxHeight: 280 }}
              />
            </View>
          ) : (
            !loading && (
              <View style={s.dropdownEmpty}>
                <Text style={s.emptyText}>검색 결과가 없습니다.</Text>
              </View>
            )
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { position: "relative" },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  loading: { position: "absolute", right: 10, top: 10 },
  warn: {
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  warnText: { color: "#9A3412", fontSize: 12 },
  errorWrap: { marginTop: 6 },
  errorText: { color: "#DC2626", fontSize: 12 },
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },
  dropdownWrap: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    zIndex: 1000,
    ...(Platform.OS === "android" ? { elevation: 1000 } : {}),
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginTop: 6,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  dropdownEmpty: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginTop: 6,
    backgroundColor: "#fff",
    paddingVertical: 14,
    alignItems: "center",
  },
  row: { paddingVertical: 10, paddingHorizontal: 12 },
  main: { fontSize: 15, color: "#111827", fontWeight: "600" },
  sub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  sep: { height: 1, backgroundColor: "#F3F4F6" },
  emptyText: { fontSize: 13, color: "#6B7280" },
});
