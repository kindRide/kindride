import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type SosRequest = {
  id: string;
  user_id: string;
  location: { latitude: number; longitude: number } | null;
  message: string | null;
  status: 'initial' | 'acknowledged' | 'resolved';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export default function AdminScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sosList, setSosList] = useState<SosRequest[]>([]);
  const router = useRouter();

  const checkAdminAccess = useCallback(async () => {
    if (!supabase) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAdmin(false);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
        
      if (error || !data || data.role !== 'admin') {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
        fetchSosRequests();
      }
    } catch (e) {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSosRequests = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('sos_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSosList((data as SosRequest[]) || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load SOS requests.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSosRequests();
    setRefreshing(false);
  };

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  const updateSosStatus = async (id: string, newStatus: 'acknowledged' | 'resolved') => {
    if (!supabase) return;
    try {
      const updates: Partial<SosRequest> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('sos_requests')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      // Update local state to reflect change immediately
      setSosList(prev => prev.map(item => item.id === id ? { ...item, ...updates } as SosRequest : item));
    } catch (error) {
      Alert.alert('Error', 'Failed to update SOS status.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (isAdmin === false) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Access Denied</Text>
        <Text style={styles.errorBody}>You do not have administrator privileges.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const renderSosItem = ({ item }: { item: SosRequest }) => {
    const isInitial = item.status === 'initial';
    const isAck = item.status === 'acknowledged';
    const isResolved = item.status === 'resolved';

    return (
      <View style={[styles.card, isInitial && styles.cardUrgent]}>
        <View style={styles.cardHeader}>
          <Text style={styles.dateText}>{new Date(item.created_at).toLocaleString()}</Text>
          <View style={[styles.badge, isInitial ? styles.badgeRed : isAck ? styles.badgeYellow : styles.badgeGreen]}>
            <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        
        <Text style={styles.messageText}>{item.message || 'No message provided.'}</Text>
        
        {item.location ? (
          <Text style={styles.locationText}>
            Location: {item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.locationText}>Location unavailable</Text>
        )}
        <Text style={styles.userText}>User ID: {item.user_id}</Text>

        <View style={styles.actionRow}>
          {isInitial && (
            <Pressable style={[styles.actionBtn, styles.btnAck]} onPress={() => updateSosStatus(item.id, 'acknowledged')}>
              <Text style={styles.actionBtnText}>Acknowledge</Text>
            </Pressable>
          )}
          {(isInitial || isAck) && (
            <Pressable style={[styles.actionBtn, styles.btnResolve]} onPress={() => updateSosStatus(item.id, 'resolved')}>
              <Text style={styles.actionBtnText}>Mark Resolved</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
        <Text style={styles.title}>Admin & Moderation</Text>
        <View style={{ width: 50 }} />
      </View>
      
      <Text style={styles.sectionTitle}>SOS Requests Queue</Text>
      
      <FlatList
        data={sosList}
        keyExtractor={(item) => item.id}
        renderItem={renderSosItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No SOS requests found.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: '#991b1b', marginBottom: 8 },
  errorBody: { fontSize: 16, color: '#475569', textAlign: 'center', marginBottom: 20 },
  backBtn: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  backBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  closeBtn: { padding: 8 },
  closeBtnText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  list: { padding: 16, gap: 12 },
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 40, fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0' },
  cardUrgent: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeRed: { backgroundColor: '#fee2e2' },
  badgeYellow: { backgroundColor: '#fef9c3' },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#0f172a' },
  messageText: { fontSize: 15, color: '#0f172a', fontWeight: '500', marginBottom: 8 },
  locationText: { fontSize: 13, color: '#475569', marginBottom: 4 },
  userText: { fontSize: 12, color: '#94a3b8', marginBottom: 16 },
  actionRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center' },
  btnAck: { backgroundColor: '#eab308' },
  btnResolve: { backgroundColor: '#10b981' },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 }
});