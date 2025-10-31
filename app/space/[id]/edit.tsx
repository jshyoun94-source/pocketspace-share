import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import { Button, Image, Pressable, ScrollView, Text, TextInput } from "react-native";
import Toast from "react-native-toast-message";
import { db, firebaseApp } from "../../../firebase";

const storage = getStorage(firebaseApp);

export default function EditSpace() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 기존 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, "spaces", id as string);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setTitle(data.title || "");
          setContent(data.content || "");
          setImage(data.image || null);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, [id]);

  // 이미지 선택 및 업로드
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      try {
        setLoading(true);
        const uri = result.assets[0].uri;
        const blob = await (await fetch(uri)).blob();
        const storageRef = ref(storage, `images/${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        setImage(url);
        Toast.show({
          type: "success",
          text1: "이미지가 업로드되었습니다 ✅",
          position: "bottom",
        });
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "이미지 업로드 실패 😢",
          position: "bottom",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  // 수정 저장
  const handleUpdate = async () => {
    if (!title.trim() || !content.trim()) {
      Toast.show({
        type: "error",
        text1: "제목과 내용을 모두 입력해주세요!",
        position: "bottom",
      });
      return;
    }

    try {
      setLoading(true);
      const docRef = doc(db, "spaces", id as string);
      await updateDoc(docRef, {
        title,
        content,
        image: image || null,
        updatedAt: new Date(),
      });

      Toast.show({
        type: "success",
        text1: "게시글이 수정되었습니다 🎉",
        position: "bottom",
      });

      setTimeout(() => router.back(), 1000);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "수정 중 오류가 발생했습니다 😢",
        position: "bottom",
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>게시글 수정</Text>

      <TextInput
        placeholder="제목을 입력하세요"
        value={title}
        onChangeText={setTitle}
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          padding: 10,
          borderRadius: 8,
          marginBottom: 10,
        }}
      />

      <TextInput
        placeholder="내용을 입력하세요"
        value={content}
        onChangeText={setContent}
        multiline
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          padding: 10,
          borderRadius: 8,
          height: 150,
          textAlignVertical: "top",
        }}
      />

      {image && (
        <Image
          source={{ uri: image }}
          style={{ width: "100%", height: 200, marginVertical: 10, borderRadius: 10 }}
        />
      )}

      <Pressable
        onPress={pickImage}
        style={{
          backgroundColor: "#efefef",
          padding: 10,
          borderRadius: 8,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Text>{loading ? "업로드 중..." : "이미지 변경하기"}</Text>
      </Pressable>

      <Button title="수정 완료" onPress={handleUpdate} disabled={loading} />
    </ScrollView>
  );
}
