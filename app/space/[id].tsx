// app/space/[id].tsx
import { Text } from '@/components/Themed';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { db } from '@/firebase';
import { deleteDoc, doc, onSnapshot } from 'firebase/firestore';

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, 'spaces', String(id));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() });
        } else {
          setData(null);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'spaces', String(id)));
      Alert.alert('삭제 완료', '공간이 삭제되었습니다.');
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '삭제 중 문제가 발생했습니다.');
    }
  };

  const goEdit = () => {
    if (!data?.id) return;
    router.push(`/space/${data.id}/edit`);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.title ? `상세 • ${data.title}` : '상세 보기',
          headerRight: () =>
            data ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text onPress={goEdit} style={styles.editBtn}>수정</Text>
                <Text onPress={handleDelete} style={styles.deleteBtn}>삭제</Text>
              </View>
            ) : null,
        }}
      />

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : !data ? (
          <Text style={styles.empty}>존재하지 않는 공간입니다.</Text>
        ) : (
          <>
            <Text style={styles.title}>{data.title}</Text>

            <Text style={styles.label}>주소</Text>
            <Text style={styles.text}>{data.address}</Text>

            {data.desc ? (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>설명</Text>
                <Text style={styles.text}>{data.desc}</Text>
              </>
            ) : null}

            {data.createdAt?.toDate ? (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>등록일</Text>
                <Text style={styles.muted}>
                  {data.createdAt.toDate().toLocaleString()}
                </Text>
              </>
            ) : null}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F9FAFB' },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: '#111' },
  label: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  text: { fontSize: 16, color: '#1f2937' },
  muted: { fontSize: 13, color: '#9ca3af' },
  editBtn: { color: '#2563eb', fontWeight: '700', paddingHorizontal: 10 },
  deleteBtn: { color: '#ef4444', fontWeight: '700', paddingHorizontal: 10 },
});
