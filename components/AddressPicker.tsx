// components/AddressPicker.tsx
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

type Bias = { lat: number; lng: number; radius?: number };

type PickedResult = {
  name?: string;
  formatted_address?: string; // 전체 도로명주소로 전달
  lat?: number;
  lng?: number;
  source?: "google";
};

type Props = {
  placeholder?: string;
  coordsBias?: Bias;
  onPicked: (picked: PickedResult) => void;
  onQueryChange?: (q: string) => void;
  hideCountrySuffix?: string; // "대한민국"
  minChars?: number; // default 2
  maxResults?: number; // default 15
  defaultQuery?: string;
  componentsFilter?: string; // default "country:kr"
  language?: string; // default "ko"
  region?: string; // default "kr"
};

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";
const AHEADERS = { Accept: "application/json" } as const;

/** 앞쪽의 "대한민국 " 접두만 제거 (뒤쪽 제거 아님) */
function stripLeadingCountry(s?: string, country = "대한민국") {
  if (!s) return "";
  return s.replace(new RegExp(`^\\s*${country}\\s*`), "").trim();
}

/** adr_address에서 "… 349" 같은 street number를 추출 */
function extractAdrStreet(adr?: string): string | undefined {
  if (!adr) return undefined;
  // adr_address 예: <span class="street-address">목동서로 349</span>
  const m = adr.match(/class="street-address">([^<]+)</i);
  return m?.[1]?.trim();
}

/** address_components로 한국식 도로명주소 구성 (보조 용도) */
function composeKoreanRoadAddress(components: any[], fallback?: string) {
  if (!Array.isArray(components)) return fallback ?? "";

  const get = (type: string) =>
    components.find((c: any) => c.types?.includes(type))?.long_name;

  const lvl1 = get("administrative_area_level_1"); // 서울특별시/경기도
  const lvl2 = get("administrative_area_level_2") || get("sublocality_level_1"); // 강서구/양천구
  const route = get("route"); // 목동서로
  const num = get("street_number"); // 349
  const floor = get("floor"); // 1층
  const subpremise = get("subpremise"); // 101호
  const premise = get("premise"); // 건물명

  const parts = [lvl1, lvl2, [route, num].filter(Boolean).join(" ")].filter(Boolean);
  const tail = [premise, floor, subpremise].filter(Boolean).join(" ");
  if (tail) parts.push(tail);

  const s = parts.join(" ").trim();
  return s || (fallback ?? "");
}

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function AddressPicker({
  placeholder = "상호 또는 도로명주소 입력",
  coordsBias,
  onPicked,
  onQueryChange,
  hideCountrySuffix = "대한민국",
  minChars = 2,
  maxResults = 15,
  defaultQuery = "",
  componentsFilter = "country:kr",
  language = "ko",
  region = "kr",
}: Props) {
  const [q, setQ] = useState(defaultQuery);
  const dq = useDebounced(q, 300);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  type Row = { id: string; main: string; secondary?: string; place_id: string; score?: number };
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  const mounted = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionTokenRef = useRef<string>(uuidv4()); // 입력 세션 토큰
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setQ(defaultQuery || "");
    setOpen(false);
  }, [defaultQuery]);

  useEffect(() => {
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    onQueryChange?.(q);
  }, [q, onQueryChange]);

  useEffect(() => {
    if (!PLACES_KEY) {
      setErrorMsg("Google Places API Key가 필요합니다. EXPO_PUBLIC_GOOGLE_PLACES_API_KEY를 설정하세요.");
      setItems([]);
      setOpen(false);
      return;
    }

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
        // 1) Autocomplete
        const params = new URLSearchParams({
          input: dq.trim(),
          key: PLACES_KEY,
          language,
          region,
          sessiontoken: sessionTokenRef.current,
        });
        if (componentsFilter) params.set("components", componentsFilter);
        if (coordsBias?.lat && coordsBias?.lng) {
          params.set("locationbias", `point:${coordsBias.lat},${coordsBias.lng}`);
        }

        const autoUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
        const autoRes = await fetch(autoUrl, { headers: AHEADERS, signal: ctl.signal });
        if (!autoRes.ok) {
          setErrorMsg(`Autocomplete 오류(${autoRes.status})`);
          setItems([]);
          setOpen(false);
          return;
        }
        const autoJson = await autoRes.json();
        if (autoJson.status !== "OK" && autoJson.status !== "ZERO_RESULTS") {
          setErrorMsg(`Autocomplete 실패: ${autoJson.status}`);
          setItems([]);
          setOpen(false);
          return;
        }

        const acc: Row[] = [];
        const preds: any[] = Array.isArray(autoJson?.predictions) ? autoJson.predictions : [];
        for (const p of preds.slice(0, 25)) {
          const main = p.structured_formatting?.main_text ?? p.description ?? "";
          const secondary = p.structured_formatting?.secondary_text ?? undefined;
          acc.push({ id: p.place_id, main, secondary, place_id: p.place_id });
        }

        const limited = acc.slice(0, maxResults);

        if (!cancelled && mounted.current) {
          setItems(limited);
          setOpen(limited.length > 0);
          if (limited.length === 0) setErrorMsg("검색 결과가 없습니다.");
        }

        // 1.5) 상위 N개 Details 프리페치 → 리스트에서도 '전체 도로명주소(건물번호 포함)' 표기
        const DETAILS_PREVIEW_COUNT = 5;
        const heads = limited.slice(0, DETAILS_PREVIEW_COUNT);

        await Promise.all(
          heads.map(async (row) => {
            try {
              const dp = new URLSearchParams({
                key: PLACES_KEY,
                place_id: row.place_id,
                sessiontoken: sessionTokenRef.current,
                language,
                region,
                fields: ["formatted_address", "address_components", "adr_address"].join(","),
              });
              const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?${dp.toString()}`;
              const detRes = await fetch(detailUrl, { headers: AHEADERS, signal: ctl.signal });
              const detJson = await detRes.json();
              if (detJson.status === "OK") {
                const r = detJson.result ?? {};
                // ✅ 1순위: formatted_address (선두의 '대한민국'만 제거)
                let full = stripLeadingCountry(r.formatted_address, hideCountrySuffix);
                // 숫자(건물번호)가 없으면 보조 조합
                if (!/\d/.test(full)) {
                  const composed = composeKoreanRoadAddress(r.address_components ?? [], full);
                  full = stripLeadingCountry(composed, hideCountrySuffix);
                }
                // 그래도 숫자가 없다면 adr_address에서 추출 보강
                if (!/\d/.test(full)) {
                  const adrStreet = extractAdrStreet(r.adr_address);
                  if (adrStreet && !full.includes(adrStreet)) {
                    full = full.replace(/(서로|로|길)(?!\s*\d)/, `$1 ${adrStreet.split(" ").pop()}`);
                  }
                }

                const finalSec = full || row.secondary || "";
                if (!cancelled && mounted.current) {
                  setItems((prev) =>
                    prev.map((it) => (it.id === row.id ? { ...it, secondary: finalSec } : it))
                  );
                }
              }
            } catch {
              /* ignore */
            }
          })
        );
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
  }, [dq, minChars, maxResults, componentsFilter, language, region, coordsBias?.lat, coordsBias?.lng]);

  const showOverlay = open && items.length > 0;

  const handlePick = async (row: { id: string; main: string; place_id: string; secondary?: string }) => {
    try {
      setLoading(true);
      // 2) Place Details
      const dp = new URLSearchParams({
        key: PLACES_KEY,
        place_id: row.place_id,
        sessiontoken: sessionTokenRef.current,
        language,
        region,
        fields: ["name", "formatted_address", "address_components", "adr_address", "geometry/location"].join(","),
      });
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?${dp.toString()}`;
      const detRes = await fetch(detailUrl, { headers: AHEADERS });
      const detJson = await detRes.json();

      let finalName = row.main;
      let finalAddr = stripLeadingCountry(row.secondary, hideCountrySuffix);
      let lat: number | undefined;
      let lng: number | undefined;

      if (detJson.status === "OK") {
        const r = detJson.result ?? {};
        finalName = r?.name ?? row.main;
        lat = r?.geometry?.location?.lat;
        lng = r?.geometry?.location?.lng;

        // ✅ 1순위: formatted_address 그대로(선두 국가만 제거)
        let full = stripLeadingCountry(r.formatted_address, hideCountrySuffix);

        // 숫자가 없으면 보조 조합 사용
        if (!/\d/.test(full)) {
          full = stripLeadingCountry(
            composeKoreanRoadAddress(r.address_components ?? [], r.formatted_address),
            hideCountrySuffix
          );
        }

        // 그래도 없으면 adr_address(HTML)에서 마지막 숫자 보강
        if (!/\d/.test(full)) {
          const adrStreet = extractAdrStreet(r.adr_address);
          if (adrStreet && !full.includes(adrStreet)) {
            full = full.replace(/(서로|로|길)(?!\s*\d)/, `$1 ${adrStreet.split(" ").pop()}`);
          }
        }

        finalAddr = full || finalAddr;
      }

      // 입력창엔 장소명 유지
      setQ(stripLeadingCountry(finalName, hideCountrySuffix));
      onPicked({
        name: finalName,
        formatted_address: finalAddr,
        lat,
        lng,
        source: "google",
      });
    } catch {
      setQ(row.main);
      onPicked({
        name: row.main,
        formatted_address: stripLeadingCountry(row.secondary, hideCountrySuffix),
        source: "google",
      });
    } finally {
      sessionTokenRef.current = uuidv4();
      setOpen(false);
      setLoading(false);
      inputRef.current?.blur();
      Keyboard.dismiss();
    }
  };

  return (
    <View style={s.container}>
      {!PLACES_KEY && (
        <View style={s.warn}>
          <Text style={s.warnText}>
            EXPO_PUBLIC_GOOGLE_PLACES_API_KEY를 .env에 설정한 뒤 npx expo start -c로 재시작하세요.
          </Text>
        </View>
      )}

      <TextInput
        ref={inputRef}
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
                  <Pressable style={s.row} onPress={() => handlePick(item)}>
                    <Text style={s.main} numberOfLines={1}>
                      {stripLeadingCountry(item.main, hideCountrySuffix)}
                    </Text>
                    {!!item.secondary && (
                      <Text style={s.sub} numberOfLines={1}>
                        {item.secondary}
                      </Text>
                    )}
                  </Pressable>
                )}
                style={{ maxHeight: 280 }}
              />
              <View style={s.powered}>
                <Text style={s.poweredText}>Powered by Google</Text>
              </View>
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
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  warnText: { color: "#1D4ED8", fontSize: 12 },
  errorWrap: { marginTop: 6 },
  errorText: { color: "#DC2626", fontSize: 12 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
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
  powered: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    alignItems: "flex-end",
  },
  poweredText: { fontSize: 11, color: "#9CA3AF" },
  emptyText: { fontSize: 13, color: "#6B7280" },
});
