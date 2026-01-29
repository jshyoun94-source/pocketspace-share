// app/space/[id]/chat.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth, db } from "../../../firebase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Message = {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  createdAt?: Timestamp; // serverTimestamp()는 처음엔 null/미정일 수 있어서 optional
  type?: "text" | "system";
};

type ChatRoom = {
  id: string;
  spaceId: string;
  spaceTitle: string;
  spaceAddress: string;
  spaceImages: string[];
  ownerId: string;
  ownerName?: string;
  customerId: string;
  customerName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export default function ChatScreen() {
  const { id: spaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [spaceData, setSpaceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!auth.currentUser || !spaceId) {
      router.back();
      return;
    }

    let unsubscribeMessages: (() => void) | null = null;
    let cancelled = false;

    const initializeChat = async () => {
      try {
        setLoading(true);

        // 1) 공간 정보
        const spaceRef = doc(db, "spaces", String(spaceId));
        const spaceDoc = await getDoc(spaceRef);

        if (!spaceDoc.exists()) {
          Alert.alert("오류", "공간을 찾을 수 없습니다.");
          router.back();
          return;
        }

        const space = spaceDoc.data();
        if (cancelled) return;
        setSpaceData(space);

        const ownerId: string = space.ownerId;
        const currentUserId: string = auth.currentUser!.uid;

        // 채팅방 찾기: 현재 사용자가 owner 또는 customer인 모든 채팅방 검색
        // spaceId로 필터링하여 해당 공간의 채팅방만 찾기
        const chatsRef = collection(db, "chats");
        const existingChatsQuery = query(
          chatsRef,
          where("spaceId", "==", String(spaceId))
        );
        const existingChatsSnapshot = await getDocs(existingChatsQuery);
        
        let existingChatRoom: any = null;
        existingChatsSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // 현재 사용자가 owner 또는 customer인 채팅방 찾기
          if (data.ownerId === currentUserId || data.customerId === currentUserId) {
            existingChatRoom = { id: docSnap.id, ...data };
          }
        });

        let finalChatId: string;

        // 기존 채팅방이 있는 경우: 바로 사용 (owner여도 채팅 가능)
        if (existingChatRoom) {
          if (cancelled) return;
          console.log("✅ 기존 채팅방 사용:", existingChatRoom.id);
          setChatRoom(existingChatRoom as ChatRoom);
          finalChatId = existingChatRoom.id;
        } else {
          // 채팅방이 없는 경우: owner는 새 채팅방 생성 불가
          if (ownerId === currentUserId) {
            Alert.alert("알림", "자신의 공간에는 물건을 맡길 수 없습니다.");
            router.back();
            return;
          }

          // 새 채팅방 생성 (customer만 가능)
          const customerId = currentUserId;
          finalChatId = [ownerId, customerId].sort().join("_") + "_" + String(spaceId);
          const chatRoomRef = doc(db, "chats", finalChatId);
          
          // 3) 상대/내 이름 가져오기 (users read가 signedIn()이어야 함)
          const ownerDoc = await getDoc(doc(db, "users", ownerId));
          const customerDoc = await getDoc(doc(db, "users", currentUserId));

          const ownerName =
            ownerDoc.data()?.nickname ||
            ownerDoc.data()?.name ||
            "사용자";

          const customerName =
            customerDoc.data()?.nickname ||
            customerDoc.data()?.name ||
            "사용자";

          const newChatRoom: Omit<ChatRoom, "id"> = {
            spaceId: String(spaceId),
            spaceTitle: space.title || "공간",
            spaceAddress: space.address || "",
            spaceImages: space.images || [],
            ownerId,
            ownerName,
            customerId: currentUserId,
            customerName,
            createdAt: serverTimestamp() as any,
            updatedAt: serverTimestamp() as any,
            lastMessageTime: serverTimestamp() as any, // 초기값 설정
          };

          await setDoc(chatRoomRef, newChatRoom, { merge: false });
          console.log("✅ 채팅방 생성 완료:", finalChatId, { ownerId, customerId: currentUserId });

          if (cancelled) return;
          setChatRoom({ id: finalChatId, ...newChatRoom } as ChatRoom);

          // 4) 환영 메시지 (중요: senderId는 문자열 "customerId"가 아니라 변수 currentUserId)
          // rules에서 senderId==auth.uid 또는 "system"을 허용하고 있으므로 아래는 auth.uid로 통과
          await setDoc(doc(db, "chats", finalChatId, "messages", "welcome"), {
            text: `${customerName}님이 채팅을 시작했습니다.`,
            senderId: currentUserId,
            type: "system",
            createdAt: serverTimestamp(),
          });
        }

        // 5) messages 구독 (chat 생성/존재 확인 후에만 구독)
        const messagesQuery = query(
          collection(db, "chats", finalChatId, "messages"),
          orderBy("createdAt", "asc")
        );

        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
          const msgs: Message[] = [];
          snapshot.forEach((d) => {
            msgs.push({ id: d.id, ...(d.data() as any) } as Message);
          });
          setMessages(msgs);
        });

        if (cancelled) return;
        setLoading(false);
      } catch (error: any) {
        console.error("채팅 초기화 실패:", error);
        Alert.alert("오류", "채팅방을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };

    initializeChat();

    // ✅ cleanup: 화면 나가면 구독 해제
    return () => {
      cancelled = true;
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [spaceId, router]);

  // 메시지 전송
  const sendMessage = async () => {
    if (!message.trim() || !chatRoom || !auth.currentUser) return;

    try {
      const messageRef = doc(collection(db, "chats", chatRoom.id, "messages"));

      await setDoc(messageRef, {
        text: message.trim(),
        senderId: auth.currentUser.uid,
        senderName:
          auth.currentUser.uid === chatRoom.ownerId
            ? chatRoom.ownerName
            : chatRoom.customerName,
        type: "text",
        createdAt: serverTimestamp(),
      });

      // 채팅방 lastMessage, lastMessageTime, updatedAt 갱신
      await setDoc(
        doc(db, "chats", chatRoom.id),
        {
          lastMessage: message.trim(),
          lastMessageTime: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage("");
    } catch (error: any) {
      console.error("메시지 전송 실패:", error);
      Alert.alert("오류", "메시지를 전송하는 중 오류가 발생했습니다.");
    }
  };

  const handleAppointment = () => {
    Alert.alert("약속잡기", "약속잡기 기능은 추후 구현 예정입니다.");
  };

  const handlePosPay = () => {
    Alert.alert("포스페이", "포스페이 결제 기능은 추후 구현 예정입니다.");
  };

  const handleCall = () => {
    Alert.alert("통화", "통화 기능은 추후 구현 예정입니다.");
  };

  const handleMenuAction = (action: string) => {
    setMenuVisible(false);
    switch (action) {
      case "rate":
        Alert.alert("매너 평가하기", "매너 평가 기능은 추후 구현 예정입니다.");
        break;
      case "block":
        Alert.alert("차단하기", "이 사용자를 차단하시겠습니까?", [
          { text: "취소", style: "cancel" },
          {
            text: "차단",
            style: "destructive",
            onPress: () => {
              setBlocked(true);
              Alert.alert("차단 완료", "사용자가 차단되었습니다.");
            },
          },
        ]);
        break;
      case "report":
        Alert.alert("신고하기", "신고 기능은 추후 구현 예정입니다.");
        break;
      case "fraud":
        Alert.alert("사기 이력 조회하기", "사기 이력 조회 기능은 추후 구현 예정입니다.");
        break;
      case "search":
        Alert.alert("검색하기", "검색 기능은 추후 구현 예정입니다.");
        break;
      case "notifications":
        Alert.alert("알림끄기", "알림 설정 기능은 추후 구현 예정입니다.");
        break;
      case "leave":
        Alert.alert("채팅방 나가기", "채팅방을 나가시겠습니까?", [
          { text: "취소", style: "cancel" },
          {
            text: "나가기",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]);
        break;
    }
  };

  if (loading || !chatRoom || !spaceData) {
    return (
      <>
        <Stack.Screen options={{ title: "채팅" }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  const otherUser =
    auth.currentUser!.uid === chatRoom.ownerId
      ? { name: chatRoom.customerName || "사용자", id: chatRoom.customerId }
      : { name: chatRoom.ownerName || "사용자", id: chatRoom.ownerId };

  return (
    <>
      <Stack.Screen
        options={{
          title: otherUser.name,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable onPress={handleCall} style={styles.headerButton}>
                <Ionicons name="call-outline" size={24} color="#111827" />
              </Pressable>
              <Pressable onPress={() => setMenuVisible(true)} style={styles.headerButton}>
                <Ionicons name="ellipsis-vertical" size={24} color="#111827" />
              </Pressable>
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* 공간 정보 카드 */}
        <View style={styles.spaceCard}>
          {chatRoom.spaceImages && chatRoom.spaceImages.length > 0 && (
            <Image
              source={{ uri: chatRoom.spaceImages[0] }}
              style={styles.spaceImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.spaceInfo}>
            <Text style={styles.spaceTitle} numberOfLines={1}>
              {chatRoom.spaceTitle}
            </Text>
            <Text style={styles.spaceAddress} numberOfLines={1}>
              {chatRoom.spaceAddress}
            </Text>
          </View>
        </View>

        {/* 액션 버튼 */}
        <View style={styles.actionButtons}>
          <Pressable style={styles.actionButton} onPress={handleAppointment}>
            <Ionicons name="calendar-outline" size={20} color="#111827" />
            <Text style={styles.actionButtonText}>약속잡기</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={handlePosPay}>
            <Ionicons name="wallet-outline" size={20} color="#111827" />
            <Text style={styles.actionButtonText}>포스페이</Text>
          </Pressable>
        </View>

        {/* 메시지 리스트 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          renderItem={({ item }) => {
            const isMyMessage = item.senderId === auth.currentUser?.uid;
            const isSystem = item.type === "system";

            if (isSystem) {
              return (
                <View style={styles.systemMessage}>
                  <Text style={styles.systemMessageText}>{item.text}</Text>
                </View>
              );
            }

            return (
              <View style={[styles.messageWrapper, isMyMessage && styles.myMessageWrapper]}>
                <View
                  style={[
                    styles.messageBubble,
                    isMyMessage ? styles.myMessage : styles.otherMessage,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isMyMessage ? styles.myMessageText : styles.otherMessageText,
                    ]}
                  >
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {/* 입력 영역 */}
        {!blocked && (
          <View style={styles.inputContainer}>
            <Pressable style={styles.inputIcon}>
              <Ionicons name="add-circle-outline" size={24} color="#6B7280" />
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="메시지 보내기"
              value={message}
              onChangeText={setMessage}
              multiline
              onSubmitEditing={sendMessage}
            />
            <Pressable
              style={styles.sendButton}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <Ionicons
                name="send"
                size={20}
                color={message.trim() ? "#2477ff" : "#D1D5DB"}
              />
            </Pressable>
          </View>
        )}

        {/* 메뉴 모달 */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
            <View style={styles.menuContainer}>
              <Pressable style={styles.menuItem} onPress={() => handleMenuAction("rate")}>
                <Ionicons name="happy-outline" size={24} color="#111827" />
                <Text style={styles.menuItemText}>매너 평가하기</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => handleMenuAction("block")}>
                <Ionicons name="ban-outline" size={24} color="#111827" />
                <Text style={styles.menuItemText}>차단하기</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => handleMenuAction("report")}>
                <Ionicons name="flag-outline" size={24} color="#111827" />
                <Text style={styles.menuItemText}>신고하기</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => handleMenuAction("fraud")}>
                <Ionicons name="shield-checkmark-outline" size={24} color="#111827" />
                <Text style={styles.menuItemText}>사기 이력 조회하기</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => handleMenuAction("search")}>
                <Ionicons name="search-outline" size={24} color="#111827" />
                <Text style={styles.menuItemText}>검색하기</Text>
              </Pressable>

              <Pressable
                style={styles.menuItem}
                onPress={() => handleMenuAction("notifications")}
              >
                <Ionicons name="notifications-off-outline" size={24} color="#111827" />
                <Text style={styles.menuItemText}>알림끄기</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => handleMenuAction("leave")}>
                <Ionicons name="exit-outline" size={24} color="#EF4444" />
                <Text style={[styles.menuItemText, { color: "#EF4444" }]}>
                  채팅방 나가기
                </Text>
              </Pressable>

              <Pressable style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
                <Text style={styles.menuCancelText}>취소</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  spaceCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  spaceImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    marginRight: 12,
  },
  spaceInfo: {
    flex: 1,
    justifyContent: "center",
  },
  spaceTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  spaceAddress: {
    fontSize: 13,
    color: "#6B7280",
  },
  actionButtons: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionButtonText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  messagesContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  messageWrapper: {
    marginBottom: 12,
    alignItems: "flex-start",
  },
  myMessageWrapper: {
    alignItems: "flex-end",
  },
  messageBubble: {
    maxWidth: SCREEN_WIDTH * 0.7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  myMessage: {
    backgroundColor: "#2477ff",
    borderTopRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: "#fff",
  },
  otherMessageText: {
    color: "#111827",
  },
  systemMessage: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemMessageText: {
    fontSize: 12,
    color: "#9CA3AF",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  inputIcon: {
    padding: 4,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: "#111827",
  },
  sendButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuItemText: {
    fontSize: 16,
    color: "#111827",
  },
  menuCancel: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  menuCancelText: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
  },
});
