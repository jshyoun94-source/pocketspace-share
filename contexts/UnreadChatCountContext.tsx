import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

const UnreadChatCountContext = createContext<number>(0);

export function UnreadChatCountProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const unsubListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // 로그아웃 시 기존 Firestore 리스너 먼저 해제 (permission-denied 방지)
      if (unsubListenersRef.current) {
        unsubListenersRef.current();
        unsubListenersRef.current = null;
      }
      if (!user) {
        setCount(0);
        return;
      }

      const chatsRef = collection(db, "chats");
      const ownerQ = query(chatsRef, where("ownerId", "==", user.uid));
      const customerQ = query(chatsRef, where("customerId", "==", user.uid));

      const ownerUnread = new Map<string, number>();
      const customerUnread = new Map<string, number>();

      const updateTotal = () => {
        let total = 0;
        ownerUnread.forEach((u) => { total += u; });
        customerUnread.forEach((u) => { total += u; });
        setCount(total);
      };

      const unsubOwner = onSnapshot(
        ownerQ,
        (snap) => {
          ownerUnread.clear();
          snap.forEach((d) => {
            const data = d.data();
            ownerUnread.set(d.id, data.unreadByOwner ?? data.unreadCount ?? 0);
          });
          updateTotal();
        },
        (err) => {
          if (err?.code === "permission-denied") setCount(0);
        }
      );

      const unsubCustomer = onSnapshot(
        customerQ,
        (snap) => {
          customerUnread.clear();
          snap.forEach((d) => {
            const data = d.data();
            customerUnread.set(d.id, data.unreadByCustomer ?? data.unreadCount ?? 0);
          });
          updateTotal();
        },
        (err) => {
          if (err?.code === "permission-denied") setCount(0);
        }
      );

      unsubListenersRef.current = () => {
        unsubOwner();
        unsubCustomer();
      };
    });

    return () => {
      unsubListenersRef.current?.();
      unsubscribeAuth();
    };
  }, []);

  return (
    <UnreadChatCountContext.Provider value={count}>
      {children}
    </UnreadChatCountContext.Provider>
  );
}

export function useUnreadChatCount() {
  return useContext(UnreadChatCountContext);
}
