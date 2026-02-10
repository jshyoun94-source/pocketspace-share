// app/chat/[id].tsx - 동네부탁 등 채팅 (채팅 ID로 진입, 메시지/이모티콘/사진만)
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { EMOJIS } from "../../constants/emojis";
import MindSpaceBadge from "../../components/MindSpaceBadge";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { uploadBase64ToStorage } from "../../utils/uploadImageToStorage";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getMinuteKey(ts?: Timestamp): string {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
}

function formatMessageTime(ts?: Timestamp): string {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${hour}:${m.toString().padStart(2, "0")}`;
}

type Message = {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  createdAt?: Timestamp;
  type?: "text" | "system" | "sticker" | "image";
  stickerId?: string;
  imageUri?: string;
};

type ChatRoom = {
  id: string;
  spaceTitle: string;
  ownerId: string;
  ownerName?: string;
  customerId: string;
  customerName?: string;
};

export default function ChatByIdScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [emojiPanelVisible, setEmojiPanelVisible] = useState(false);
  const [imageZoomUri, setImageZoomUri] = useState<string | null>(null);
  const [otherUserMindSpace, setOtherUserMindSpace] = useState<number | null>(null);

  useEffect(() => {
    if (!chatId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.back();
        return;
      }
      try {
        const chatSnap = await getDoc(doc(db, "chats", chatId));
        if (!chatSnap.exists()) {
          if (!cancelled) {
            Alert.alert("오류", "채팅방을 찾을 수 없습니다.");
            router.back();
          }
          return;
        }
        const data = chatSnap.data();
        const uid = auth.currentUser?.uid;
        if (!uid || (data.ownerId !== uid && data.customerId !== uid)) {
          if (!cancelled) {
            Alert.alert("오류", "참여할 수 없는 채팅입니다.");
            router.back();
          }
          return;
        }
        if (!cancelled) {
          setChatRoom({
            id: chatSnap.id,
            spaceTitle: data.spaceTitle || "동네부탁",
            ownerId: data.ownerId,
            ownerName: data.ownerName,
            customerId: data.customerId,
            customerName: data.customerName,
          });
        }
        await updateDoc(doc(db, "chats", chatId), {
          [uid === data.ownerId ? "unreadByOwner" : "unreadByCustomer"]: 0,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } catch (e) {
        if (!cancelled) Alert.alert("오류", "채팅을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [chatId, router]);

  useEffect(() => {
    if (!chatRoom?.id || !auth.currentUser) return;
    const unsub = onSnapshot(
      query(
        collection(db, "chats", chatRoom.id, "messages"),
        orderBy("createdAt", "asc")
      ),
      (snap) => {
        const list: Message[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Message));
        setMessages(list);
      },
      (err) => {
        if (err?.code === "permission-denied") setMessages([]);
      }
    );
    return () => unsub();
  }, [chatRoom?.id]);

  // 상대방 마음공간 로드
  useEffect(() => {
    if (!chatRoom || !auth.currentUser) {
      setOtherUserMindSpace(null);
      return;
    }
    const otherId =
      auth.currentUser.uid === chatRoom.ownerId
        ? chatRoom.customerId
        : chatRoom.ownerId;
    getDoc(doc(db, "users", otherId))
      .then((snap) => setOtherUserMindSpace(snap.data()?.mindSpace ?? null))
      .catch(() => setOtherUserMindSpace(null));
  }, [chatRoom?.ownerId, chatRoom?.customerId]);

  const sendMessage = async () => {
    if (!message.trim() || !chatRoom || !auth.currentUser) return;
    try {
      await setDoc(doc(collection(db, "chats", chatRoom.id, "messages")), {
        text: message.trim(),
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.uid === chatRoom.ownerId ? chatRoom.ownerName : chatRoom.customerName,
        type: "text",
        createdAt: serverTimestamp(),
      });
      const receiverIsOwner = auth.currentUser.uid === chatRoom.customerId;
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: message.trim(),
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(receiverIsOwner ? { unreadByOwner: increment(1) } : { unreadByCustomer: increment(1) }),
      });
      setMessage("");
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "메시지 전송에 실패했습니다.");
    }
  };

  const sendSticker = async (stickerId: string) => {
    if (!chatRoom || !auth.currentUser) return;
    try {
      const label = EMOJIS.find((e) => e.id === stickerId)?.label || stickerId;
      await setDoc(doc(collection(db, "chats", chatRoom.id, "messages")), {
        text: label,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.uid === chatRoom.ownerId ? chatRoom.ownerName : chatRoom.customerName,
        type: "sticker",
        stickerId,
        createdAt: serverTimestamp(),
      });
      const receiverIsOwner = auth.currentUser.uid === chatRoom.customerId;
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: `[스티커]`,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(receiverIsOwner ? { unreadByOwner: increment(1) } : { unreadByCustomer: increment(1) }),
      });
      setEmojiPanelVisible(false);
    } catch (e: any) {
      Alert.alert("오류", "스티커 전송에 실패했습니다.");
    }
  };

  const sendImageMessage = async (localUri: string) => {
    if (!chatRoom || !auth.currentUser) return;
    try {
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" });
      const filename = `chats/${chatRoom.id}/${auth.currentUser.uid}/${uuidv4()}.jpg`;
      const imageUri = await uploadBase64ToStorage(base64, filename, "image/jpeg");
      await setDoc(doc(collection(db, "chats", chatRoom.id, "messages")), {
        text: "사진",
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.uid === chatRoom.ownerId ? chatRoom.ownerName : chatRoom.customerName,
        type: "image",
        imageUri,
        createdAt: serverTimestamp(),
      });
      const receiverIsOwner = auth.currentUser.uid === chatRoom.customerId;
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: "사진",
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(receiverIsOwner ? { unreadByOwner: increment(1) } : { unreadByCustomer: increment(1) }),
      });
    } catch (e: any) {
      Alert.alert("오류", "사진 전송에 실패했습니다.");
    }
  };

  const handleAttachmentPress = () => {
    Alert.alert("사진 보내기", "", [
      {
        text: "앨범",
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("권한 필요", "앨범 접근 권한이 필요합니다.");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]?.uri) await sendImageMessage(result.assets[0].uri);
        },
      },
      {
        text: "카메라",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("권한 필요", "카메라 권한이 필요합니다.");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]?.uri) await sendImageMessage(result.assets[0].uri);
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  };

  const otherName =
    chatRoom && auth.currentUser
      ? auth.currentUser.uid === chatRoom.ownerId
        ? chatRoom.customerName
        : chatRoom.ownerName
      : "";

  if (loading || !chatRoom) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "채팅",
            headerBackVisible: false,
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={{ marginLeft: 0, padding: 4 }}>
                <Ionicons name="chevron-back" size={28} color="#000" />
              </Pressable>
            ),
          }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>채팅 불러오는 중...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                {otherName || chatRoom.spaceTitle}
              </Text>
              <MindSpaceBadge mindSpace={otherUserMindSpace} size="small" />
            </View>
          ),
          headerStyle: { backgroundColor: "#fff" },
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 0, padding: 4 }}>
              <Ionicons name="chevron-back" size={28} color="#000" />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messagesContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const isMyMessage = item.senderId === auth.currentUser?.uid;
            const isSystem = item.type === "system";
            const nextItem = messages[index + 1];
            const showTime =
              !isSystem &&
              (index === messages.length - 1 ||
                !nextItem?.createdAt ||
                getMinuteKey(item.createdAt) !== getMinuteKey(nextItem.createdAt));

            if (isSystem) {
              return (
                <View style={styles.systemMessage}>
                  <Text style={styles.systemMessageText}>{item.text}</Text>
                </View>
              );
            }
            if (item.type === "sticker" && item.stickerId) {
              const emoji = EMOJIS.find((e) => e.id === item.stickerId);
              return (
                <View style={[styles.messageWrapper, isMyMessage && styles.myMessageWrapper]}>
                  <View style={styles.stickerBubble}>
                    {emoji ? (
                      <Image source={emoji.source} style={styles.stickerImage} resizeMode="contain" />
                    ) : (
                      <Text style={styles.stickerFallback}>{item.text}</Text>
                    )}
                  </View>
                  {showTime && (
                    <Text style={[styles.messageTime, isMyMessage && styles.messageTimeRight]}>
                      {formatMessageTime(item.createdAt)}
                    </Text>
                  )}
                </View>
              );
            }
            if (item.type === "image" && item.imageUri) {
              return (
                <View style={[styles.messageWrapper, isMyMessage && styles.myMessageWrapper]}>
                  <Pressable
                    onPress={() => setImageZoomUri(item.imageUri!)}
                    style={[styles.imageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}
                  >
                    <Image
                      source={{ uri: item.imageUri }}
                      style={styles.imageMessageImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                  {showTime && (
                    <Text style={[styles.messageTime, isMyMessage && styles.messageTimeRight]}>
                      {formatMessageTime(item.createdAt)}
                    </Text>
                  )}
                </View>
              );
            }
            return (
              <View style={[styles.messageWrapper, isMyMessage && styles.myMessageWrapper]}>
                <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}>
                  <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.otherMessageText]}>
                    {item.text}
                  </Text>
                </View>
                {showTime && (
                  <Text style={[styles.messageTime, isMyMessage && styles.messageTimeRight]}>
                    {formatMessageTime(item.createdAt)}
                  </Text>
                )}
              </View>
            );
          }}
        />
        {emojiPanelVisible && (
          <View style={styles.emojiPanel}>
            <ScrollView
              contentContainerStyle={styles.emojiPanelContent}
              showsVerticalScrollIndicator={false}
            >
              {EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji.id}
                  style={styles.emojiItem}
                  onPress={() => sendSticker(emoji.id)}
                >
                  <Image source={emoji.source} style={styles.emojiPreview} resizeMode="contain" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Pressable style={styles.inputIcon} onPress={handleAttachmentPress}>
            <Ionicons name="add-circle-outline" size={24} color="#6B7280" />
          </Pressable>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="메시지 보내기"
              value={message}
              onChangeText={setMessage}
              multiline
              onSubmitEditing={sendMessage}
              onFocus={() => setEmojiPanelVisible(false)}
            />
            <Pressable
              style={styles.emojiButton}
              onPress={() => {
                Keyboard.dismiss();
                setEmojiPanelVisible((v) => !v);
              }}
            >
              <Ionicons
                name="happy-outline"
                size={24}
                color={emojiPanelVisible ? "#2477ff" : "#6B7280"}
              />
            </Pressable>
          </View>
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
      </KeyboardAvoidingView>

      <Modal visible={!!imageZoomUri} transparent animationType="fade">
        <Pressable style={styles.imageZoomOverlay} onPress={() => setImageZoomUri(null)}>
          {imageZoomUri ? (
            <Image source={{ uri: imageZoomUri }} style={styles.imageZoomImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: 16, color: "#6B7280" },
  messagesContainer: { padding: 16, paddingBottom: 24 },
  systemMessage: { alignItems: "center", marginVertical: 8 },
  systemMessageText: { fontSize: 13, color: "#9CA3AF" },
  messageWrapper: { marginBottom: 8 },
  myMessageWrapper: { alignItems: "flex-end" },
  messageBubble: { maxWidth: "80%", padding: 12, borderRadius: 16 },
  myMessage: { backgroundColor: "#2477ff", borderBottomRightRadius: 4 },
  otherMessage: { backgroundColor: "#E5E7EB", borderBottomLeftRadius: 4, alignSelf: "flex-start" },
  messageText: { fontSize: 15 },
  myMessageText: { color: "#fff" },
  otherMessageText: { color: "#111827" },
  messageTime: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  messageTimeRight: { textAlign: "right" },
  stickerBubble: { padding: 4, borderRadius: 12 },
  stickerImage: { width: 80, height: 80 },
  stickerFallback: { fontSize: 14, color: "#111827" },
  imageBubble: { borderRadius: 12, overflow: "hidden", maxWidth: 240 },
  imageMessageImage: { width: 200, height: 200 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    minHeight: 52,
  },
  inputIcon: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    marginHorizontal: 8,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  emojiButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  sendButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  emojiPanel: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    maxHeight: 200,
    paddingVertical: 12,
  },
  emojiPanelContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 12,
  },
  emojiItem: {
    width: (SCREEN_WIDTH - 24 - 30) / 4,
    height: (SCREEN_WIDTH - 24 - 30) / 4,
    maxWidth: 88,
    maxHeight: 88,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiPreview: { width: 64, height: 64 },
  imageZoomOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageZoomImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
});
