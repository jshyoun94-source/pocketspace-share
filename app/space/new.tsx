// app/space/new.tsx
import { Text, View } from '@/components/Themed';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native';

// ✅ Firestore
import { db } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function NewSpaceScreen() {
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const saveSpace = async () => {
    if (!title.trim() || !address.trim()) {
      Alert.alert('입력 확인', '공간 이름과 주소는 필수입니다.');
      return;
    }
    try {
      setSaving(true);
      // ✅ "spaces" 컬렉션에 문서 추가
      await addDoc(collection(db, 'spaces'), {
        title: title.trim(),
        address: address.trim(),
        desc: desc.trim(),
        createdAt: serverTimestamp(),
      });
      Alert.alert('완료', '공간이 임시 저장되었습니다!');
      router.back(); // 저장 후 이전 화면으로
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '저장 중 문제가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: '공간 등록하기' }} />

      <View style={styles.container}>
        <Text style={styles.title}>공간 등록</Text>

        <TextInput
          style={styles.input}
          placeholder="공간 이름 (예: 홍대입구 코인락커)"
          value={title}
          onChangeText={setTitle}
        />

        <TextInput
          style={styles.input}
          placeholder="주소"
          value={address}
          onChangeText={setAddress}
        />

        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="설명 (운영시간, 크기, 맡길 수 있는 물품 등)"
          value={desc}
          onChangeText={setDesc}
          multiline
          numberOfLines={4}
        />

        <Pressable style={[styles.primaryButton, saving && { opacity: 0.6 }]} disabled={saving} onPress={saveSpace}>
          {saving ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.primaryButtonText}>저장</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} disabled={saving} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>뒤로가기</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12, backgroundColor: '#F2F4F8' },
  title: { fontSize: 22, fontWeight: 'bold', marginVertical: 8, color: '#333' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  multiline: { height: 120, textAlignVertical: 'top' },
  primaryButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: { color: '#4F46E5', fontSize: 15, fontWeight: '600' },
});
