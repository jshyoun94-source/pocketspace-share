// app/space/[id]/chat.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { EMOJIS, STICKER_PREFIX, STICKER_SUFFIX } from "../../../constants/emojis";
import {
  applyMindSpaceDelta,
  calcMindSpaceDelta,
  MIND_SPACE,
} from "../../../constants/mindSpace";
import EvaluationModal from "../../../components/EvaluationModal";
import MindSpaceBadge from "../../../components/MindSpaceBadge";
import AppointmentRequestModal, {
  type AppointmentRequestData,
} from "../../../components/AppointmentRequestModal";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import type { Transaction } from "../../../types/transaction";
import { uploadBase64ToStorage } from "../../../utils/uploadImageToStorage";
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
  type?: "text" | "system" | "sticker" | "storageRequest" | "image";
  stickerId?: string;
  itemImageUri?: string;
  imageUri?: string;
  storageSchedule?: string;
  storageItem?: string;
  storageDate?: string;
  storageTime?: string;
  accepted?: boolean;
  transactionId?: string;
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
  leftByOwner?: boolean;
  leftByCustomer?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastMessageTime?: Timestamp;
};

export default function ChatScreen() {
  const { id: spaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [spaceData, setSpaceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [emojiPanelVisible, setEmojiPanelVisible] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [evalModalVisible, setEvalModalVisible] = useState(false);
  const [evalTarget, setEvalTarget] = useState<"owner" | "customer">("owner");
  const [otherUserMindSpace, setOtherUserMindSpace] = useState<number | null>(null);
  const [appointmentModalVisible, setAppointmentModalVisible] = useState(false);
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);
  const [scheduleChangeModalVisible, setScheduleChangeModalVisible] = useState(false);
  const [scheduleChangeText, setScheduleChangeText] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [imageZoomUri, setImageZoomUri] = useState<string | null>(null);

  const transaction = useMemo(() => {
    const notCompleted = transactions.filter((t) => t.status !== "보관종료");
    const completed = transactions.filter((t) => t.status === "보관종료");
    if (notCompleted.length > 0) {
      return notCompleted.sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      )[0];
    }
    if (completed.length > 0) {
      return completed.sort(
        (a, b) =>
          (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0)
      )[0];
    }
    return null;
  }, [transactions]);

  useEffect(() => {
    if (!spaceId) return;

    let unsubscribeMessages: (() => void) | null = null;
    let cancelled = false;

    const initializeChat = async () => {
      if (!auth.currentUser) return;
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

        // 채팅방 찾기: 본인이 참여한 채팅만 쿼리 (권한 규칙: isChatMember만 get 가능)
        const chatsRef = collection(db, "chats");
        const [ownerChatsSnap, customerChatsSnap] = await Promise.all([
          getDocs(
            query(
              chatsRef,
              where("spaceId", "==", String(spaceId)),
              where("ownerId", "==", currentUserId)
            )
          ),
          getDocs(
            query(
              chatsRef,
              where("spaceId", "==", String(spaceId)),
              where("customerId", "==", currentUserId)
            )
          ),
        ]);

        let existingChatRoom: any = null;
        const checkAndSet = (docSnap: any) => {
          const data = docSnap.data();
          if (data.ownerId === currentUserId && data.leftByOwner === true) return;
          if (data.customerId === currentUserId && data.leftByCustomer === true) return;
          existingChatRoom = { id: docSnap.id, ...data };
        };
        ownerChatsSnap.forEach(checkAndSet);
        if (!existingChatRoom) customerChatsSnap.forEach(checkAndSet);

        let finalChatId: string;

        if (existingChatRoom) {
          if (cancelled) return;
          console.log("✅ 기존 채팅방 사용:", existingChatRoom.id);
          setChatRoom(existingChatRoom as ChatRoom);
          finalChatId = existingChatRoom.id;
        } else {
          if (ownerId === currentUserId) {
            Alert.alert("알림", "자신의 공간에는 물건을 맡길 수 없습니다.");
            router.back();
            return;
          }

          const customerId = currentUserId;
          const ownerDoc = await getDoc(doc(db, "users", ownerId));
          const customerDoc = await getDoc(doc(db, "users", currentUserId));
          const ownerName =
            ownerDoc.data()?.nickname || ownerDoc.data()?.name || "사용자";
          const customerName =
            customerDoc.data()?.nickname || customerDoc.data()?.name || "사용자";

          const newChatRoomData = {
            spaceId: String(spaceId),
            spaceTitle: space.title || "공간",
            spaceAddress: space.address || "",
            spaceImages: space.images || [],
            ownerId,
            ownerName,
            customerId: currentUserId,
            customerName,
            leftByOwner: false,
            leftByCustomer: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessageTime: serverTimestamp(),
          };

          const chatRef = await addDoc(collection(db, "chats"), newChatRoomData);
          finalChatId = chatRef.id;
          console.log("✅ 채팅방 생성 완료:", finalChatId, { ownerId, customerId: currentUserId });

          if (cancelled) return;
          setChatRoom({ id: finalChatId, ...newChatRoomData } as ChatRoom);

          await setDoc(doc(db, "chats", finalChatId, "messages", "welcome"), {
            text: `${customerName}님이 채팅을 시작했습니다.`,
            senderId: currentUserId,
            type: "system",
            createdAt: serverTimestamp(),
          });

          const dayLabels: Record<string, string> = {
            mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
          };
          const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
          const scheduleParts: string[] = [];
          const spaceSchedules = space.schedules as Array<{ days?: string[]; time?: { start?: string; end?: string } }> | undefined;
          if (spaceSchedules && spaceSchedules.length > 0) {
            for (const dayKey of dayOrder) {
              const block = spaceSchedules.find(
                (b) => b.days && b.days.map((d: string) => d.toLowerCase()).includes(dayKey)
              );
              const label = dayLabels[dayKey] ?? dayKey;
              if (block?.time) {
                scheduleParts.push(
                  `${label}: ${block.time.start ?? "09"}~${block.time.end ?? "18"}시`
                );
              }
            }
          }
          const scheduleText =
            scheduleParts.length > 0
              ? `안녕하세요, 보관가능시간은 ${scheduleParts.join(" ")} 입니다.\n자세한 일정은 문의 부탁드립니다.`
              : "안녕하세요. 자세한 보관 일정은 문의 부탁드립니다.";
          await addDoc(collection(db, "chats", finalChatId, "messages"), {
            text: scheduleText,
            senderId: "system",
            type: "system",
            createdAt: serverTimestamp(),
          });
        }

        // 5) messages 구독 (chat 생성/존재 확인 후에만 구독)
        const messagesQuery = query(
          collection(db, "chats", finalChatId, "messages"),
          orderBy("createdAt", "asc")
        );

        unsubscribeMessages = onSnapshot(
          messagesQuery,
          (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((d) => {
              msgs.push({ id: d.id, ...(d.data() as any) } as Message);
            });
            setMessages(msgs);
          },
          (err) => {
            console.warn("메시지 구독 오류:", err?.code, err?.message);
            if (err?.code === "permission-denied") {
              setMessages([]);
            }
          }
        );

        if (cancelled) return;
        setLoading(false);
      } catch (error: any) {
        console.error("채팅 초기화 실패:", error);
        Alert.alert("오류", "채팅방을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.back();
        return;
      }
      initializeChat();
    });

    // ✅ cleanup: 화면 나가면 구독 해제
    return () => {
      cancelled = true;
      if (typeof unsubscribeAuth === "function") unsubscribeAuth();
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [spaceId, router]);

  // 채팅 진입 시 내 unread 카운트 0으로 초기화
  useEffect(() => {
    if (!chatRoom || !auth.currentUser) return;
    const isOwner = auth.currentUser.uid === chatRoom.ownerId;
    updateDoc(doc(db, "chats", chatRoom.id), {
      [isOwner ? "unreadByOwner" : "unreadByCustomer"]: 0,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }, [chatRoom?.id]);

  // 채팅 상대방 마음공간 로드
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

  // 거래(transaction) 로드 - chatRoom 로드 후
  useEffect(() => {
    if (!chatRoom) {
      setTransactions([]);
      return;
    }
    const txRef = collection(db, "transactions");
    const q = query(txRef, where("chatId", "==", chatRoom.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Transaction)
        );
        setTransactions(list);
      },
      (err) => {
        console.warn("트랜잭션 구독 오류:", err?.code, err?.message);
        setTransactions([]);
      }
    );
    return () => unsub();
  }, [chatRoom?.id]);

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

      // 채팅방 lastMessage, lastMessageTime, updatedAt, 수신자 unread 갱신
      const receiverIsOwner = auth.currentUser.uid === chatRoom.customerId;
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: message.trim(),
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(receiverIsOwner
          ? { unreadByOwner: increment(1) }
          : { unreadByCustomer: increment(1) }),
      });

      setMessage("");
    } catch (error: any) {
      console.error("메시지 전송 실패:", error);
      Alert.alert("오류", "메시지를 전송하는 중 오류가 발생했습니다.");
    }
  };

  // 스티커 전송
  const sendSticker = async (stickerId: string) => {
    if (!chatRoom || !auth.currentUser) return;
    try {
      const messageRef = doc(collection(db, "chats", chatRoom.id, "messages"));
      await setDoc(messageRef, {
        text: EMOJIS.find((e) => e.id === stickerId)?.label || stickerId,
        senderId: auth.currentUser.uid,
        senderName:
          auth.currentUser.uid === chatRoom.ownerId
            ? chatRoom.ownerName
            : chatRoom.customerName,
        type: "sticker",
        stickerId,
        createdAt: serverTimestamp(),
      });
      const receiverIsOwner = auth.currentUser.uid === chatRoom.customerId;
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: `${STICKER_PREFIX}${stickerId}${STICKER_SUFFIX}`,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(receiverIsOwner
          ? { unreadByOwner: increment(1) }
          : { unreadByCustomer: increment(1) }),
      });
      setEmojiPanelVisible(false);
    } catch (error: any) {
      console.error("스티커 전송 실패:", error);
      Alert.alert("오류", "스티커를 전송하는 중 오류가 발생했습니다.");
    }
  };

  // 사진 전송 (앨범/카메라에서 선택 후 업로드)
  const sendImageMessage = async (localUri: string) => {
    if (!chatRoom || !auth.currentUser) return;
    try {
      let base64: string;
      try {
        base64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: "base64",
        });
      } catch {
        Alert.alert("오류", "이미지를 읽을 수 없습니다.");
        return;
      }
      const filename = `chats/${chatRoom.id}/${auth.currentUser.uid}/${uuidv4()}.jpg`;
      const imageUri = await uploadBase64ToStorage(base64, filename, "image/jpeg");
      const messageRef = doc(collection(db, "chats", chatRoom.id, "messages"));
      await setDoc(messageRef, {
        text: "사진",
        senderId: auth.currentUser.uid,
        senderName:
          auth.currentUser.uid === chatRoom.ownerId
            ? chatRoom.ownerName
            : chatRoom.customerName,
        type: "image",
        imageUri,
        createdAt: serverTimestamp(),
      });
      const receiverIsOwner = auth.currentUser.uid === chatRoom.customerId;
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: "사진",
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(receiverIsOwner
          ? { unreadByOwner: increment(1) }
          : { unreadByCustomer: increment(1) }),
      });
    } catch (error: any) {
      console.error("사진 전송 실패:", error);
      Alert.alert("오류", "사진을 전송하는 중 오류가 발생했습니다.");
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
          if (!result.canceled && result.assets[0]?.uri) {
            await sendImageMessage(result.assets[0].uri);
          }
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
          if (!result.canceled && result.assets[0]?.uri) {
            await sendImageMessage(result.assets[0].uri);
          }
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  };

  const handleAppointmentSubmit = async (data: AppointmentRequestData) => {
    if (!chatRoom || !auth.currentUser || !isCustomer) return;
    const pendingTx = transactions.find((t) => t.status === "보관신청중");
    const isReRequest = !!pendingTx?.requestMessageId;

    try {
      let itemImageUri: string | undefined;
      let base64: string | null | undefined = data.itemImageBase64;
      if (!base64 && data.itemImageUri) {
        try {
          base64 = await FileSystem.readAsStringAsync(data.itemImageUri, {
            encoding: "base64",
          });
        } catch {
          base64 = undefined;
        }
      }
      if (base64) {
        const filename = `storage-requests/${auth.currentUser.uid}/${uuidv4()}.jpg`;
        itemImageUri = await uploadBase64ToStorage(base64, filename, "image/jpeg");
      }

      const msgRef = await addDoc(
        collection(db, "chats", chatRoom.id, "messages"),
        {
          text: `보관 요청: ${data.storageSchedule}`,
          senderId: auth.currentUser.uid,
          senderName: chatRoom.customerName,
          type: "storageRequest",
          itemImageUri: itemImageUri ?? null,
          storageSchedule: data.storageSchedule,
          storageItem: data.storageItem ?? null,
          createdAt: serverTimestamp(),
        }
      );

      if (isReRequest && pendingTx?.id) {
        await updateDoc(doc(db, "transactions", pendingTx.id), {
          requestMessageId: msgRef.id,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "transactions"), {
          spaceId: chatRoom.spaceId,
          spaceTitle: chatRoom.spaceTitle,
          spaceAddress: chatRoom.spaceAddress,
          spaceImages: chatRoom.spaceImages || [],
          ownerId: chatRoom.ownerId,
          ownerName: chatRoom.ownerName,
          customerId: chatRoom.customerId,
          customerName: chatRoom.customerName,
          chatId: chatRoom.id,
          status: "보관신청중",
          requestMessageId: msgRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: isReRequest ? "보관 재요청" : "보관 요청",
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadByOwner: increment(1),
        lastTxStatus: "보관신청중",
      });
      Alert.alert("완료", isReRequest ? "보관 재요청이 반영되었습니다." : "보관 요청이 전송되었습니다.");
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "보관 요청 전송에 실패했습니다.");
    }
  };

  const findTransactionByRequestMessageId = async (
    requestMessageId: string
  ): Promise<Transaction | null> => {
    const fromState = transactions.find(
      (t) => String(t.requestMessageId) === String(requestMessageId)
    );
    if (fromState) return fromState;
    if (!chatRoom) return null;
    const snap = await getDocs(
      query(
        collection(db, "transactions"),
        where("chatId", "==", chatRoom.id)
      )
    );
    const found = snap.docs.find(
      (d) => String(d.data().requestMessageId) === String(requestMessageId)
    );
    return found ? ({ id: found.id, ...found.data() } as Transaction) : null;
  };

  const acceptStorageRequest = async (
    requestMessageId: string,
    agreedSchedule?: string
  ) => {
    if (!chatRoom || !isOwner) return;
    const tx = await findTransactionByRequestMessageId(requestMessageId);
    if (!tx) {
      Alert.alert("안내", "요청 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    try {
      await updateDoc(doc(db, "transactions", tx.id), {
        status: "약속중",
        ...(agreedSchedule != null && agreedSchedule !== "" ? { agreedSchedule } : {}),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastTxStatus: "약속중",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "chats", chatRoom.id, "messages"), {
        text: "보관요청이 수락되었습니다.",
        senderId: "system",
        type: "system",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatRoom!.id), {
        lastMessage: "보관요청이 수락되었습니다.",
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadByCustomer: increment(1),
      });
      Alert.alert("완료", "보관요청이 수락되었습니다.");
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "수락 처리에 실패했습니다.");
    }
  };

  const rejectStorageRequest = async (requestMessageId: string) => {
    if (!chatRoom || !isOwner) return;
    const tx = await findTransactionByRequestMessageId(requestMessageId);
    if (!tx) {
      Alert.alert("안내", "요청 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    try {
      await updateDoc(doc(db, "transactions", tx.id), {
        status: "거절됨",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastTxStatus: "거절됨",
        updatedAt: serverTimestamp(),
      });
      const rejectMessage =
        "공간대여자가 요청을 거절하였습니다. 협의 후 다시 요청해 주세요.";
      await addDoc(collection(db, "chats", chatRoom.id, "messages"), {
        text: rejectMessage,
        senderId: "system",
        type: "system",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: rejectMessage,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadByCustomer: increment(1),
      });
      Alert.alert("완료", "요청을 거절했습니다.");
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "거절 처리에 실패했습니다.");
    }
  };

  const isOwner = auth.currentUser?.uid === chatRoom?.ownerId;
  const isCustomer = auth.currentUser?.uid === chatRoom?.customerId;

  const setStorageStatus = async (status: "보관중" | "보관종료") => {
    if (!transaction || !isOwner || !chatRoom) return;
    try {
      const payload: Record<string, any> = {
        status,
        updatedAt: serverTimestamp(),
      };
      if (status === "보관종료") {
        payload.completedAt = serverTimestamp();
      }
      await updateDoc(doc(db, "transactions", transaction.id), payload);
      await updateDoc(doc(db, "chats", chatRoom!.id), {
        lastTxStatus: status,
        updatedAt: serverTimestamp(),
      });
      const statusLabel = status === "보관중" ? "보관중으로" : "보관종료로";
      const statusMessage = `공간대여자가 보관상태를 ${statusLabel} 수정하였습니다.`;
      await addDoc(collection(db, "chats", chatRoom.id, "messages"), {
        text: statusMessage,
        senderId: "system",
        type: "system",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: statusMessage,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (status === "보관종료") {
        Alert.alert("완료", "보관이 종료되었습니다. 상호 평가를 진행해 주세요.", [
          { text: "확인", onPress: () => openEvaluateModal("customer") },
        ]);
      } else {
        Alert.alert("완료", "보관이 시작되었습니다.");
      }
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "상태 변경에 실패했습니다.");
    }
  };

  const completeStorage = () => {
    if (!transaction) return;
    Alert.alert(
      "보관 종료",
      "거래를 종료하시겠습니까? 이후 상태 변경은 불가합니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "종료", onPress: () => setStorageStatus("보관종료") },
      ]
    );
  };

  const agreedScheduleDisplay =
    transaction?.agreedSchedule ??
    messages.find((m) => m.id === transaction?.requestMessageId)?.storageSchedule ??
    "일정 없음";

  const handleScheduleChangeSubmit = async () => {
    const newSchedule = scheduleChangeText.trim();
    if (!newSchedule || !transaction || !chatRoom) return;
    try {
      await updateDoc(doc(db, "transactions", transaction.id), {
        agreedSchedule: newSchedule,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "chats", chatRoom.id, "messages"), {
        text: `보관일정이 변경되었습니다: ${newSchedule}`,
        senderId: "system",
        type: "system",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", chatRoom.id), {
        lastMessage: `보관일정 변경: ${newSchedule}`,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(auth.currentUser?.uid === chatRoom.ownerId
          ? { unreadByCustomer: increment(1) }
          : { unreadByOwner: increment(1) }),
      });
      setScheduleChangeModalVisible(false);
      setScheduleChangeText("");
      Alert.alert("완료", "보관일정이 변경되었습니다.");
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "일정 변경에 실패했습니다.");
    }
  };

  const openEvaluateModal = (target: "owner" | "customer") => {
    setEvalTarget(target);
    setEvalModalVisible(true);
  };

  const handleEvaluateSubmit = async (scores: Record<string, number>) => {
    if (!transaction || !auth.currentUser) return;
    const txRef = doc(db, "transactions", transaction.id);

    try {
      if (evalTarget === "owner") {
        await updateDoc(txRef, {
          status: transaction.status,
          customerEvaluatedOwner: true,
          customerEvaluation: {
            schedule: scores.schedule,
            storageCondition: scores.storageCondition,
            manners: scores.manners,
          },
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(txRef, {
          status: transaction.status,
          ownerEvaluatedCustomer: true,
          ownerEvaluation: {
            schedule: scores.schedule,
            manners: scores.manners,
          },
          updatedAt: serverTimestamp(),
        });
      }

      setEvalModalVisible(false);
      Alert.alert("완료", "평가가 반영되었습니다.");
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "평가 제출에 실패했습니다.");
      throw e;
    }
  };

  // 약속 확정(약속중/보관중) 후에만 통화 가능
  const canCall =
    !!transaction &&
    (transaction.status === "약속중" || transaction.status === "보관중");

  const handleCall = () => {
    if (!canCall) {
      Alert.alert(
        "통화 불가",
        "약속이 확정된 후에 통화할 수 있습니다.\n먼저 보관요청을 보내고 상대방이 수락해 주세요."
      );
      return;
    }
    Alert.alert(
      "안심번호 통화",
      "상대방에게 본인 번호가 노출되지 않습니다. 안심번호로 연결할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "통화하기",
          onPress: async () => {
            if (!chatRoom?.id || !auth.currentUser) return;
            setCallLoading(true);
            try {
              const idToken = await auth.currentUser.getIdToken();
              const endpoint =
                process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT?.replace(/\/$/, "") ??
                "";
              const res = await fetch(`${endpoint}/call/masked`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ chatId: chatRoom.id }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                if (res.status === 501 || data?.code === "NOT_CONFIGURED") {
                  Alert.alert(
                    "준비 중",
                    "안심번호 통화 서비스 연동 준비 중입니다. 잠시 후 이용해 주세요."
                  );
                  return;
                }
                if (res.status === 400) {
                  Alert.alert("통화 불가", data?.error ?? "전화번호 등록이 필요합니다.");
                  return;
                }
                throw new Error(data?.error ?? "연결에 실패했습니다.");
              }
              const numberToDial = data?.numberToDial;
              if (numberToDial && typeof numberToDial === "string") {
                await Linking.openURL(`tel:${numberToDial}`);
              } else {
                Alert.alert("오류", "연결 번호를 받지 못했습니다.");
              }
            } catch (e: any) {
              console.error("masked call error:", e);
              Alert.alert("오류", e?.message ?? "통화 연결에 실패했습니다.");
            } finally {
              setCallLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMenuAction = (action: string) => {
    setMenuVisible(false);
    switch (action) {
      case "rate":
        if (transaction?.status === "보관종료") {
          const needEvalOwner = isCustomer && !transaction.customerEvaluatedOwner;
          const needEvalCustomer = isOwner && !transaction.ownerEvaluatedCustomer;
          if (needEvalOwner) openEvaluateModal("owner");
          else if (needEvalCustomer) openEvaluateModal("customer");
          else Alert.alert("알림", "평가할 내역이 없습니다.");
        } else {
          Alert.alert("알림", "보관이 종료된 거래에서만 평가할 수 있습니다.");
        }
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
          headerTitle: () => (
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitleText} numberOfLines={1}>
                {otherUser.name}
              </Text>
              <MindSpaceBadge mindSpace={otherUserMindSpace} size="small" />
            </View>
          ),
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 0, padding: 4 }}>
              <Ionicons name="chevron-back" size={28} color="#000" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={handleCall}
                style={[styles.headerButton, !canCall && styles.headerButtonDisabled]}
                disabled={callLoading}
              >
                {callLoading ? (
                  <ActivityIndicator size="small" color="#111827" />
                ) : (
                  <Ionicons
                    name="call-outline"
                    size={24}
                    color={canCall ? "#111827" : "#9CA3AF"}
                  />
                )}
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
        {/* 공간 정보 카드 + 거래 상태 */}
        <View style={styles.spaceCard}>
          {chatRoom.spaceImages && chatRoom.spaceImages.length > 0 ? (
            <Image
              source={{ uri: chatRoom.spaceImages[0] }}
              style={styles.spaceImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.spaceImage, { justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="image-outline" size={24} color="#D1D5DB" />
            </View>
          )}
          <View style={styles.spaceInfo}>
            <View style={styles.spaceTitleRow}>
              <Text style={styles.spaceTitle} numberOfLines={1}>
                {chatRoom.spaceTitle}
              </Text>
              {spaceData?.availableForRent === false && (
                <View style={styles.unavailableBadge}>
                  <Text style={styles.unavailableBadgeText}>대여불가</Text>
                </View>
              )}
            </View>
            <View style={styles.spaceAddressRow}>
              <Text style={styles.spaceAddress} numberOfLines={1}>
                {chatRoom.spaceAddress}
              </Text>
              {transaction && (
                <>
                  {isOwner &&
                  (transaction.status === "약속중" ||
                    transaction.status === "보관중" ||
                    transaction.status === "보관종료") ? (
                    <Pressable
                      style={styles.statusDropdown}
                      onPress={() =>
                        (transaction.status === "약속중" ||
                          transaction.status === "보관중") &&
                        setStatusDropdownVisible(true)
                      }
                    >
                      <Text style={styles.statusDropdownText}>
                        {transaction.status === "약속중"
                          ? "약속중"
                          : transaction.status === "보관중"
                            ? "보관중"
                            : "보관종료"}
                      </Text>
                      {(transaction.status === "약속중" ||
                        transaction.status === "보관중") && (
                        <Ionicons name="chevron-down" size={16} color="#6B7280" />
                      )}
                    </Pressable>
                  ) : (
                    <Text style={styles.statusText}>
                      {transaction.status === "보관신청중" && "보관 요청 중"}
                      {transaction.status === "약속중" && "약속중"}
                      {transaction.status === "보관중" && "보관중"}
                      {transaction.status === "보관종료" && "보관종료"}
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </View>

        {/* 거래 상태 변경 드롭다운 모달 (공간대여자용) */}
        <Modal
          visible={statusDropdownVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setStatusDropdownVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setStatusDropdownVisible(false)}>
            <View style={styles.statusDropdownMenu} onStartShouldSetResponder={() => true}>
              {transaction?.status === "약속중" && (
                <>
                  <Pressable
                    style={styles.statusDropdownItem}
                    onPress={() => {
                      setStorageStatus("보관중");
                      setStatusDropdownVisible(false);
                    }}
                  >
                    <Text style={styles.statusDropdownItemText}>보관중</Text>
                  </Pressable>
                  <Pressable
                    style={styles.statusDropdownItem}
                    onPress={() => {
                      completeStorage();
                      setStatusDropdownVisible(false);
                    }}
                  >
                    <Text style={styles.statusDropdownItemText}>보관종료</Text>
                  </Pressable>
                </>
              )}
              {transaction?.status === "보관중" && (
                <Pressable
                  style={styles.statusDropdownItem}
                  onPress={() => {
                    completeStorage();
                    setStatusDropdownVisible(false);
                  }}
                >
                  <Text style={styles.statusDropdownItemText}>보관종료</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.statusDropdownItem, { borderTopWidth: 1, borderTopColor: "#E5E7EB" }]}
                onPress={() => setStatusDropdownVisible(false)}
              >
                <Text style={[styles.statusDropdownItemText, { color: "#6B7280" }]}>취소</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* 보관종료 시 평가 버튼 */}
        {transaction?.status === "보관종료" &&
          ((isCustomer && !transaction.customerEvaluatedOwner) ||
            (isOwner && !transaction.ownerEvaluatedCustomer)) && (
          <View style={styles.transactionCard}>
            {isCustomer && !transaction.customerEvaluatedOwner && (
              <Pressable
                style={styles.txActionBtn}
                onPress={() => openEvaluateModal("owner")}
              >
                <Text style={styles.txActionBtnText}>공간대여자 평가하기</Text>
              </Pressable>
            )}
            {isOwner && !transaction.ownerEvaluatedCustomer && (
              <Pressable
                style={styles.txActionBtn}
                onPress={() => openEvaluateModal("customer")}
              >
                <Text style={styles.txActionBtnText}>사용자 평가하기</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* 액션: 판매자 안내 / 구매자 보관요청하기 / 수락 후 보관일정 + 일정변경하기 */}
        {transaction?.status === "약속중" || transaction?.status === "보관중" ? (
          <View style={styles.actionButtons}>
            <View style={styles.scheduleBlock}>
              <Text style={styles.scheduleLabel}>보관일정</Text>
              <Text style={styles.scheduleValue} numberOfLines={2}>
                {agreedScheduleDisplay}
              </Text>
              <Pressable
                style={[styles.actionButton, styles.actionButtonSingle, { marginTop: 8 }]}
                onPress={() => {
                  setScheduleChangeText(agreedScheduleDisplay);
                  setScheduleChangeModalVisible(true);
                }}
              >
                <Ionicons name="calendar-outline" size={20} color="#111827" />
                <Text style={styles.actionButtonText}>일정변경하기</Text>
              </Pressable>
            </View>
          </View>
        ) : isCustomer ? (
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.actionButton, styles.actionButtonSingle]}
              onPress={() => setAppointmentModalVisible(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#111827" />
              <Text style={styles.actionButtonText}>
                {transaction?.status === "보관종료" ? "보관 재이용하기" : "보관요청하기"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <View style={styles.scheduleInfoBlock}>
              <Text style={styles.scheduleInfoText}>
                보관요청은 공간이용자가 신청할 수 있습니다.
              </Text>
            </View>
          </View>
        )}

        {/* 일정변경 모달 */}
        <Modal
          visible={scheduleChangeModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setScheduleChangeModalVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setScheduleChangeModalVisible(false)}
          >
            <View style={styles.scheduleChangeModalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.scheduleChangeModalTitle}>보관일정 변경</Text>
              <TextInput
                style={styles.scheduleChangeInput}
                placeholder="변경할 보관일정을 입력하세요"
                value={scheduleChangeText}
                onChangeText={setScheduleChangeText}
                multiline
              />
              <View style={styles.scheduleChangeModalButtons}>
                <Pressable
                  style={[styles.scheduleChangeModalBtn, styles.scheduleChangeModalBtnCancel]}
                  onPress={() => setScheduleChangeModalVisible(false)}
                >
                  <Text style={styles.scheduleChangeModalBtnTextCancel}>취소</Text>
                </Pressable>
                <Pressable
                  style={[styles.scheduleChangeModalBtn, styles.scheduleChangeModalBtnSubmit]}
                  onPress={handleScheduleChangeSubmit}
                >
                  <Text style={styles.scheduleChangeModalBtnTextSubmit}>변경</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>

        {/* 메시지 리스트 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const isMyMessage = item.senderId === auth.currentUser?.uid;
            const isSystem = item.type === "system";
            const nextItem = messages[index + 1];
            // 같은 분 안에서는 가장 마지막 메시지에만 시간 표시 (다음 메시지가 없거나, 다음 메시지가 다른 분이면 표시)
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

            const isStorageRequestMsg =
              item.type === "storageRequest" ||
              (typeof item.text === "string" && item.text.startsWith("보관 요청:"));
            if (isStorageRequestMsg) {
              const tx = transactions.find(
                (t) => String(t.requestMessageId) === String(item.id)
              );
              const isAccepted = tx && tx.status !== "보관신청중";
              const isRejected = tx && tx.status === "거절됨";
              // 수락 대기 중일 때만 버튼 표시 (tx 없어도 표시 → 탭 시 Firestore에서 조회)
              const showAcceptBtn =
                isOwner && !isAccepted;
              const showRejectBtn =
                isOwner && !isAccepted;
              const showWaiting = isMyMessage && !isAccepted;
              const cardImageUri =
                item.itemImageUri ||
                (chatRoom?.spaceImages && chatRoom.spaceImages[0]);
              return (
                <View
                  style={[
                    styles.messageWrapper,
                    isMyMessage && styles.myMessageWrapper,
                  ]}
                >
                  <View style={styles.storageRequestCard}>
                    <View style={styles.storageRequestCardRowLayout}>
                      <View style={styles.storageRequestCardLeft}>
                        <Text style={styles.storageRequestCardTitle}>
                          보관요청하기
                        </Text>
                        <Text style={styles.storageRequestCardRow}>
                          보관물품 : {item.storageItem || "-"}
                        </Text>
                        <Text style={styles.storageRequestCardRow}>
                          보관일정 : {item.storageSchedule || "-"}
                        </Text>
                        {showWaiting && !showAcceptBtn && (
                          <Text style={styles.storageRequestStatusText}>
                            수락대기중
                          </Text>
                        )}
                        {isAccepted && !isRejected && !showAcceptBtn && (
                          <Text style={styles.storageRequestStatusText}>
                            수락됨
                          </Text>
                        )}
                        {isRejected && !showAcceptBtn && (
                          <Text style={styles.storageRequestStatusText}>
                            거절됨
                          </Text>
                        )}
                        {(showAcceptBtn || showRejectBtn) && (
                          <View style={styles.storageRequestButtonRow}>
                            <TouchableOpacity
                              style={styles.storageRequestAcceptBtn}
                              onPress={() => acceptStorageRequest(item.id, item.storageSchedule)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.storageRequestAcceptBtnText}>
                                수락하기
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.storageRequestRejectBtn}
                              onPress={() => rejectStorageRequest(item.id)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.storageRequestRejectBtnText}>
                                거절하기
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      <View style={styles.storageRequestCardRight}>
                        {cardImageUri ? (
                          <Pressable
                            onPress={() => setImageZoomUri(cardImageUri)}
                            style={styles.storageRequestCardImageWrap}
                          >
                            <Image
                              source={{ uri: cardImageUri }}
                              style={styles.storageRequestCardImage}
                              resizeMode="cover"
                            />
                          </Pressable>
                        ) : (
                          <View
                            style={[
                              styles.storageRequestCardImage,
                              styles.storageRequestCardImagePlaceholder,
                            ]}
                          >
                            <Ionicons
                              name="image-outline"
                              size={28}
                              color="#9CA3AF"
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  {showTime && (
                    <Text
                      style={[
                        styles.messageTime,
                        isMyMessage && styles.messageTimeRight,
                      ]}
                    >
                      {formatMessageTime(item.createdAt)}
                    </Text>
                  )}
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
                    <Text
                      style={[
                        styles.messageTime,
                        isMyMessage && styles.messageTimeRight,
                      ]}
                    >
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
                    style={[
                      styles.imageMessageBubble,
                      isMyMessage ? styles.myMessage : styles.otherMessage,
                    ]}
                  >
                    <Image
                      source={{ uri: item.imageUri }}
                      style={styles.imageMessageImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                  {showTime && (
                    <Text
                      style={[
                        styles.messageTime,
                        isMyMessage && styles.messageTimeRight,
                      ]}
                    >
                      {formatMessageTime(item.createdAt)}
                    </Text>
                  )}
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
                {showTime && (
                  <Text
                    style={[
                      styles.messageTime,
                      isMyMessage && styles.messageTimeRight,
                    ]}
                  >
                    {formatMessageTime(item.createdAt)}
                  </Text>
                )}
              </View>
            );
          }}
        />

        {/* 입력 영역 */}
        {!blocked && (
          <>
            {/* 이모티콘 패널 (미리보기) */}
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
          </>
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

        <AppointmentRequestModal
          visible={appointmentModalVisible}
          onClose={() => setAppointmentModalVisible(false)}
          onSubmit={handleAppointmentSubmit}
          isReRequest={
            !!transaction && transaction.status === "보관신청중"
          }
        />

        <EvaluationModal
          visible={evalModalVisible}
          onClose={() => setEvalModalVisible(false)}
          onSubmit={handleEvaluateSubmit}
          target={evalTarget}
          targetName={
            evalTarget === "owner"
              ? chatRoom?.ownerName || "공간대여자"
              : chatRoom?.customerName || "사용자"
          }
        />

        {/* 보관요청 카드 사진 확대 모달 */}
        <Modal
          visible={!!imageZoomUri}
          transparent
          animationType="fade"
          onRequestClose={() => setImageZoomUri(null)}
        >
          <Pressable
            style={styles.imageZoomOverlay}
            onPress={() => setImageZoomUri(null)}
          >
            {imageZoomUri ? (
              <Image
                source={{ uri: imageZoomUri }}
                style={styles.imageZoomImage}
                resizeMode="contain"
              />
            ) : null}
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
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 220,
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  headerRight: {
    flexDirection: "row",
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  headerButtonDisabled: {
    opacity: 0.7,
  },
  spaceCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  spaceImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    marginRight: 12,
  },
  spaceInfo: {
    flex: 1,
    justifyContent: "center",
  },
  spaceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unavailableBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unavailableBadgeText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
  spaceTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  spaceAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  spaceAddress: {
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
  },
  statusText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  statusDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
  },
  statusDropdownText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600",
  },
  statusDropdownMenu: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
  },
  statusDropdownItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  statusDropdownItemText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 12,
  },
  txStatus: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  txActionBtn: {
    backgroundColor: "#2477ff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  txActionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
  actionButtonSingle: {
    flex: 1,
  },
  scheduleBlock: {
    width: "100%",
    paddingVertical: 4,
  },
  scheduleLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
    fontWeight: "600",
  },
  scheduleValue: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  scheduleInfoBlock: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  scheduleInfoText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  scheduleChangeModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 24,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  scheduleChangeModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  scheduleChangeInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
  },
  scheduleChangeModalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  scheduleChangeModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  scheduleChangeModalBtnCancel: {
    backgroundColor: "#F3F4F6",
  },
  scheduleChangeModalBtnSubmit: {
    backgroundColor: "#2477ff",
  },
  scheduleChangeModalBtnTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  scheduleChangeModalBtnTextSubmit: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  storageRequestCard: {
    maxWidth: SCREEN_WIDTH * 0.88,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  storageRequestCardRowLayout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  storageRequestCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  storageRequestCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  storageRequestCardRow: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 4,
  },
  storageRequestStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginTop: 10,
    marginBottom: 4,
  },
  storageRequestButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    width: "100%",
    alignSelf: "stretch",
  },
  storageRequestAcceptBtn: {
    flex: 1,
    backgroundColor: "#FEE500",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  storageRequestAcceptBtnText: {
    color: "#191919",
    fontSize: 15,
    fontWeight: "700",
  },
  storageRequestRejectBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  storageRequestRejectBtnText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "600",
  },
  storageRequestCardRight: {
    width: 72,
    minWidth: 72,
  },
  storageRequestCardImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
  },
  storageRequestCardImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  storageRequestCardImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  imageZoomOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageZoomImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  acceptBtn: {
    backgroundColor: "#2477ff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  acceptedText: {
    fontSize: 13,
    color: "#6B7280",
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
  messageTime: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 2,
    marginBottom: 2,
  },
  messageTimeRight: {
    alignSelf: "flex-end",
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
    minHeight: 52,
  },
  inputIcon: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
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
  emojiButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
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
    justifyContent: "flex-start",
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
  emojiPreview: {
    width: 64,
    height: 64,
  },
  stickerBubble: {
    padding: 4,
    borderRadius: 12,
  },
  stickerImage: {
    width: 80,
    height: 80,
  },
  stickerFallback: {
    fontSize: 14,
    color: "#111827",
  },
  sendButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  imageMessageBubble: {
    borderRadius: 12,
    overflow: "hidden",
    maxWidth: 240,
    maxHeight: 240,
  },
  imageMessageImage: {
    width: 200,
    height: 200,
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
