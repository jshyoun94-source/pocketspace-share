// app/space/[id]/map.tsx - 보관 희망 장소 지도
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, Dimensions, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { auth } from "@/firebase";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function SpaceMapScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const params = useLocalSearchParams<{
    lat: string;
    lng: string;
    address?: string;
    title?: string;
  }>();

  const lat = parseFloat(String(params.lat || "37.5665"));
  const lng = parseFloat(String(params.lng || "126.978"));
  const address = String(params.address || "");
  const title = String(params.title || address || "보관 장소");

  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "거래 희망 장소",
          headerBackTitle: "",
          headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        }}
      />
      <View style={styles.container}>
        <MapView
          style={styles.map}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          mapType="standard"
          showsUserLocation
          userInterfaceStyle="light"
        >
          <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            title={title || "보관 장소"}
            description={address}
          />
        </MapView>
        <Pressable
          style={styles.recenterBtn}
          onPress={() => {}}
        >
          <Ionicons name="locate" size={24} color="#111827" />
        </Pressable>
        <Pressable
          style={styles.applyBtn}
          onPress={() => {
            if (!auth.currentUser) {
              Alert.alert("로그인 필요", "거래 신청을 하려면 로그인이 필요합니다.", [
                { text: "취소", style: "cancel" },
                { text: "로그인", onPress: () => router.push("/(auth)/login") },
              ]);
              return;
            }
            router.push(`/space/${id}/chat` as any);
          }}
        >
          <Text style={styles.applyBtnText}>거래 신청하기</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  map: { flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  recenterBtn: {
    position: "absolute",
    right: 16,
    bottom: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  applyBtn: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 34,
    backgroundColor: "#2477ff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
