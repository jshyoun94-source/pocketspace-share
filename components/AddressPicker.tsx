import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
  formatted_address?: string;
  lat?: number;
  lng?: number;
  source?: "google";
};

type Props = {
  placeholder?: string;
  coordsBias?: Bias;
  onPicked: (picked: PickedResult) => void;
  onQueryChange?: (q: string) => void;
  hideCountrySuffix?: string;
  minChars?: number;
  maxResults?: number;
  defaultQuery?: string;
  componentsFilter?: string;
  language?: string;
  region?: string;
};

/** ✅ 외부에서 음성 텍스트를 넣고 즉시 검색·선택까지 진행할 때 사용할 핸들 */
export type AddressPickerHandle = {
  setQueryAndSearch: (q: string) => Promise<boolean>;
  forceQueryUpdate: (q: string) => void; // ✅ 추가됨
};

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";
const AHEADERS = { Accept: "application/json" } as const;

/** "대한민국" 접두 제거 */
function stripLeadingCountry(s?: string, country = "대한민국") {
  if (!s) return "";
  return s.replace(new RegExp(`^\\s*${country}\\s*`), "").trim();
}

/** adr_address에서 street number 추출 */
function extractAdrStreet(adr?: string): string | undefined {
  if (!adr) return undefined;
  const m = adr.match(/class="street-address">([^<]+)</i);
  return m?.[1]?.trim();
}

/** address_components로 한국식 도로명주소 구성 */
function composeKoreanRoadAddress(components: any[], fallback?: string) {
  if (!Array.isArray(components)) return fallback ?? "";

  const get = (type: string) =>
    components.find((c: any) => c.types?.includes(type))?.long_name;

  const lvl1 = get("administrative_area_level_1");
  const lvl2 = get("administrative_area_level_2") || get("sublocality_level_1");
  const route = get("route");
  const num = get("street_number");
  const floor = get("floor");
  const subpremise = get("subpremise");
  const premise = get("premise");

  const parts = [lvl1, lvl2, [route, num].filter(Boolean).join(" ")].filter(Boolean);
  const tail = [premise, floor, subpremise].filter(Boolean).join(" ");
  if (tail) parts.push(tail);

  return parts.join(" ").trim() || fallback || "";
}

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

type Row = { id: string; main: string; secondary?: string; place_id: string; score?: number };

const AddressPicker = forwardRef<AddressPickerHandle, Props>(function AddressPicker(
  {
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
  },
  ref
) {
  const [q, setQ] = useState(defaultQuery);
  const dq = useDebounced(q, 300);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  const mounted = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionTokenRef = useRef<string>(uuidv4());
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

  /** 공통 fetch 함수들 */
  const fetchAutocomplete = async (query: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      input: query.trim(),
      key: PLACES_KEY,
      language,
      region,
      sessiontoken: sessionTokenRef.current,
    });
    if (componentsFilter) params.set("components", componentsFilter);
    if (coordsBias?.lat && coordsBias?.lng)
      params.set("locationbias", `point:${coordsBias.lat},${coordsBias.lng}`);

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
      { headers: AHEADERS, signal }
    );
    const json = await res.json();
    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") throw new Error(json.status);
    const preds: any[] = Array.isArray(json?.predictions) ? json.predictions : [];
    return preds.slice(0, maxResults).map((p) => ({
      id: p.place_id,
      main: p.structured_formatting?.main_text ?? p.description ?? "",
      secondary: p.structured_formatting?.secondary_text ?? undefined,
      place_id: p.place_id,
    })) as Row[];
  };

  const fetchDetails = async (placeId: string, signal?: AbortSignal) => {
    const dp = new URLSearchParams({
      key: PLACES_KEY,
      place_id: placeId,
      sessiontoken: sessionTokenRef.current,
      language,
      region,
      fields: [
        "name",
        "formatted_address",
        "address_components",
        "adr_address",
        "geometry/location",
      ].join(","),
    });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${dp.toString()}`,
      { headers: AHEADERS, signal }
    );
    return res.json();
  };

  /** 자동완성 */
  useEffect(() => {
    if (!PLACES_KEY) {
      setErrorMsg("Google Places API Key가 필요합니다.");
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
    const ctl = new AbortController();
    controllerRef.current = ctl;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchAutocomplete(dq, ctl.signal);
        if (!cancelled && mounted.current) {
          setItems(list);
          setOpen(list.length > 0);
        }
      } catch (e: any) {
        if (!cancelled && mounted.current)
          setErrorMsg(e?.message ?? "검색 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [dq, coordsBias?.lat, coordsBias?.lng]);

  /** 항목 선택 시 처리 */
  const handlePick = async (row: Row) => {
    try {
      setLoading(true);
      const detJson = await fetchDetails(row.place_id);
      let finalName = row.main;
      let finalAddr = stripLeadingCountry(row.secondary, hideCountrySuffix);
      let lat: number | undefined;
      let lng: number | undefined;

      if (detJson.status === "OK") {
        const r = detJson.result ?? {};
        finalName = r.name ?? row.main;
        lat = r.geometry?.location?.lat;
        lng = r.geometry?.location?.lng;

        let full = stripLeadingCountry(r.formatted_address, hideCountrySuffix);
        if (!/\d/.test(full))
          full = stripLeadingCountry(
            composeKoreanRoadAddress(r.address_components ?? [], r.formatted_address),
            hideCountrySuffix
          );
        if (!/\d/.test(full)) {
          const adrStreet = extractAdrStreet(r.adr_address);
          if (adrStreet && !full.includes(adrStreet))
            full = full.replace(/(서로|로|길)(?!\s*\d)/, `$1 ${adrStreet.split(" ").pop()}`);
        }
        finalAddr = full || finalAddr;
      }

      setQ(stripLeadingCountry(finalName, hideCountrySuffix));
      onPicked({ name: finalName, formatted_address: finalAddr, lat, lng, source: "google" });
    } catch {
      onPicked({
        name: row.main,
        formatted_address: stripLeadingCountry(row.secondary, hideCountrySuffix),
        source: "google",
      });
    } finally {
      sessionTokenRef.current = uuidv4();
      setOpen(false);
      setLoading(false);
      Keyboard.dismiss();
    }
  };

  /** ✅ 외부 음성 입력 → 텍스트 반영 + 최상위 자동 선택 */
  useImperativeHandle(ref, () => ({
    setQueryAndSearch: async (text: string) => {
      const value = text.trim();
      setQ(value);
      if (!PLACES_KEY || value.length < Math.max(1, minChars)) return false;
      try {
        const rows = await fetchAutocomplete(value);
        if (rows.length > 0) {
          await handlePick(rows[0]);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    /** 👇 추가: 입력창에 텍스트만 강제로 반영 */
    forceQueryUpdate: (text: string) => {
      setQ(text.trim());
    },
  }));

  const showOverlay = open && items.length > 0;

  return (
    <View style={s.container}>
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
});

export default AddressPicker;

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
