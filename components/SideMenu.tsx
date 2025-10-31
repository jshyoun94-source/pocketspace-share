// components/SideMenu.tsx
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  bannerUri: string; // 기존 배너 이미지를 그대로 사용
};

export default function SideMenu({ visible, onClose, bannerUri }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* 어두운 배경 */}
      <Pressable style={s.dim} onPress={onClose} />

      {/* 왼쪽 슬라이드 패널 */}
      <View style={s.panelWrap} pointerEvents="box-none">
        <View style={s.panel}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* 상단 프로필 영역 */}
            <View style={s.profileRow}>
              <View style={s.avatarDot} />
              <Text style={s.userName}>정승현</Text>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              <View style={{ flex: 1 }} />
              <Ionicons name="notifications-outline" size={22} color="#6B7280" />
            </View>

            {/* (요청) 대표 차량 설정하기 제거 → 여백만 정돈 */}

            {/* (요청) 내 공유주차장 → 내 공간 */}
            <Pressable style={s.primaryBtn}>
              <Text style={s.primaryBtnText}>내 공간</Text>
            </Pressable>

            {/* 배너 (크기 동일 유지) */}
            <Image source={{ uri: bannerUri }} style={s.banner} />

            {/* 리스트 카드 */}
            <View style={s.card}>
              {/* (요청) 아이콘/문구/단위 변경: 주차권 → 예약내역 / 0건 */}
              <Row
                left={
                  <>
                    <FontAwesome5 name="suitcase" size={16} color="#374151" />
                    <Text style={s.rowText}>예약내역</Text>
                  </>
                }
                right={<Count text="0건" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <MaterialCommunityIcons
                      name="ticket-percent-outline"
                      size={18}
                      color="#374151"
                    />
                    <Text style={s.rowText}>쿠폰함</Text>
                  </>
                }
                right={<Count text="0매" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <MaterialCommunityIcons
                      name="currency-krw"
                      size={18}
                      color="#374151"
                    />
                    <Text style={s.rowText}>충전금</Text>
                  </>
                }
                right={<Count text="0 P" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <Ionicons name="ellipse-outline" size={16} color="#374151" />
                    <Text style={s.rowText}>적립금</Text>
                  </>
                }
                right={<Count text="0 P" />}
              />
            </View>

            {/* 하단 메뉴들 (텍스트만 유지, 스타일 동일) */}
            <View style={{ marginTop: 18, gap: 16 }}>
              <SectionTitle>공지사항</SectionTitle>
              <SectionTitle>결제, 충전, 적립</SectionTitle>
              <SectionTitle>
                마이 제보내역
                <View style={s.badge}>
                  <Text style={s.badgeText}>이벤트 진행 중</Text>
                </View>
              </SectionTitle>
              <SectionTitle>제휴 문의</SectionTitle>
              <SectionTitle>환경설정</SectionTitle>
            </View>

            <Pressable style={s.footerHelp}>
              <Ionicons name="help-circle-outline" size={18} color="#94A3B8" />
              <Text style={s.footerHelpText}>이용안내 및 문의하기</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* 작은 프리미티브들 */
function Row({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Pressable style={s.row}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {left}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {right}
        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
      </View>
    </Pressable>
  );
}
function Divider() {
  return <View style={s.divider} />;
}
function Count({ text }: { text: string }) {
  return <Text style={s.count}>{text}</Text>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

/* styles */
const s = StyleSheet.create({
  dim: {
    position: "absolute",
    inset: 0 as any,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panelWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  panel: {
    width: "82%",
    height: "100%",
    backgroundColor: "#fff",
    paddingTop: 52,
    paddingHorizontal: 18,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  avatarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFD600",
  },
  userName: { fontSize: 20, fontWeight: "700", color: "#111827" },

  primaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#60A5FA",
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: { color: "#2563EB", fontWeight: "700", fontSize: 16 },

  banner: {
    width: "100%",
    height: 92, // 참고 스샷 비율에 맞춘 고정 높이
    borderRadius: 10,
    marginTop: 16,
  },

  card: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowText: { fontSize: 16, color: "#111827" },
  count: { color: "#2563EB", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#E5E7EB" },

  section: { fontSize: 16, color: "#111827", paddingVertical: 2 },
  badge: {
    marginLeft: 8,
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 12 },

  footerHelp: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerHelpText: { color: "#94A3B8", fontSize: 15 },
});
